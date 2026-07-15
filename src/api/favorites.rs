use axum::{extract::{State, Path}, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use std::{collections::VecDeque, fs};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use chrono::Local;
use crate::{state::{AppState, FavoriteProject, ProjectState}, platform};

#[derive(Deserialize)]
pub struct ActionRequest {
    pub action: String,
    pub command_override: Option<String>,
}

#[derive(Deserialize)]
pub struct InputRequest {
    pub input: String,
}

async fn save_favorites(state: &AppState) {
    let favs = state.favorites.lock().await;
    let list: Vec<FavoriteProject> = favs.values().cloned().collect();
    if let Ok(json) = serde_json::to_string(&list) { let _ = fs::write("favorites.json", json); }
}

pub async fn get_favorites(State(state): State<AppState>) -> Json<Vec<serde_json::Value>> {
    let status_map = state.project_status.lock().await;
    let system_ports = state.system_ports.lock().unwrap();
    
    let mut result = Vec::new();
    for proj in status_map.values() {
        let mut p = serde_json::to_value(proj).unwrap();
        
        if proj.status == "stopped" {
            let mut is_running_externally = false;
            let mut ext_pid = None;
            for sys_port in system_ports.iter() {
                let mut matched = false;
                if let Some(exe) = &sys_port.exe_path {
                    if proj.config.command.contains(exe) || exe.contains(&proj.config.command) {
                        matched = true;
                    }
                }
                // avoid false positives on short commands like "java" or "node" matching randomly
                if !matched && sys_port.command.len() > 3 && proj.config.command.contains(&sys_port.command) && proj.config.command.starts_with(&sys_port.command) {
                    matched = true;
                }
                if matched {
                    is_running_externally = true;
                    ext_pid = Some(sys_port.pid.clone());
                    break;
                }
            }
            if is_running_externally {
                p["status"] = serde_json::json!("running_externally");
                if let Some(pid) = ext_pid {
                    p["ext_pid"] = serde_json::json!(pid);
                }
            }
        }
        result.push(p);
    }
    Json(result)
}

pub async fn get_project_logs(Path(id): Path<String>, State(state): State<AppState>) -> impl IntoResponse {
    let logs = state.project_logs.lock().await;
    if let Some(proj_logs) = logs.get(&id) {
        let mut status_map = state.project_status.lock().await;
        if let Some(proj) = status_map.get_mut(&id) {
            proj.has_error = false;
        }
        Json(proj_logs.iter().cloned().collect::<Vec<String>>()).into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

pub async fn add_favorite(State(state): State<AppState>, Json(mut req): Json<FavoriteProject>) -> Result<impl IntoResponse, (StatusCode, String)> {
    if req.id.is_empty() {
        req.id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis().to_string();
    }
    let cloned_req = req.clone();
    {
        state.favorites.lock().await.insert(req.id.clone(), req.clone());
        let mut statuses = state.project_status.lock().await;
        if let Some(existing) = statuses.get_mut(&req.id) {
            existing.config = req.clone();
        } else {
            statuses.insert(req.id.clone(), ProjectState { config: req, status: "stopped".to_string(), pid: None, has_error: false, restart_count: 0 });
        }
    }
    save_favorites(&state).await;
    Ok((StatusCode::CREATED, Json(cloned_req)))
}

pub async fn remove_favorite(State(state): State<AppState>, Path(id): Path<String>) -> Result<impl IntoResponse, (StatusCode, String)> {
    { state.favorites.lock().await.remove(&id); state.project_status.lock().await.remove(&id); }
    save_favorites(&state).await;
    Ok(StatusCode::OK)
}

pub async fn project_action(State(state): State<AppState>, Path(id): Path<String>, Json(req): Json<ActionRequest>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut status_map = state.project_status.lock().await;
    if let Some(proj) = status_map.get_mut(&id) {
        match req.action.as_str() {
            "update" => {
                if let Some(over) = &req.command_override {
                    proj.config.command = over.clone();
                    if let Some(fav) = state.favorites.lock().await.get_mut(&id) {
                        fav.command = over.clone();
                    }
                    save_favorites(&state).await;
                }
            }
            "run" => {
                if proj.status == "stopped" {
                    let cmd_to_run = req.command_override.as_deref().unwrap_or(&proj.config.command);
                    let mut cmd = platform::build_command(cmd_to_run);
                    cmd.current_dir(&proj.config.cwd);
                    
                    if let Some(port_override) = &proj.config.port {
                        if !port_override.is_empty() {
                            cmd.env("PORT", port_override);
                        }
                    }

                    // Save the override if provided, so the UI keeps it
                    if let Some(over) = &req.command_override {
                        proj.config.command = over.clone();
                        if let Some(fav) = state.favorites.lock().await.get_mut(&id) {
                            fav.command = over.clone();
                        }
                        save_favorites(&state).await;
                    }

                    let mut tokio_cmd = tokio::process::Command::from(cmd);
                    let mut child = tokio_cmd
                        .stdin(Stdio::piped())
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                        
                    proj.status = "running".to_string();
                    proj.pid = child.id();
                    proj.has_error = false;
                    
                    let stdin = child.stdin.take().unwrap();
                    state.project_stdin.lock().await.insert(id.clone(), std::sync::Arc::new(tokio::sync::Mutex::new(stdin)));
                    
                    let stdout = child.stdout.take().unwrap();
                    let stderr = child.stderr.take().unwrap();
                    let logs_state = state.project_logs.clone();
                    let logs_state_err = state.project_logs.clone();
                    let id_stdout = id.clone();
                    let id_stderr = id.clone();
                    
                    { state.project_logs.lock().await.insert(id.clone(), VecDeque::new()); }
                    tokio::spawn(async move {
                        let mut reader = BufReader::new(stdout).lines();
                        while let Ok(Some(line)) = reader.next_line().await {
                            if let Some(dq) = logs_state.lock().await.get_mut(&id_stdout) {
                                if dq.len() > 500 { dq.pop_front(); } 
                                let ts = Local::now().format("%H:%M:%S").to_string();
                                dq.push_back(format!("[{}] {}", ts, line));
                            }
                        }
                    });
                    tokio::spawn(async move {
                        let mut reader = BufReader::new(stderr).lines();
                        while let Ok(Some(line)) = reader.next_line().await {
                            if let Some(dq) = logs_state_err.lock().await.get_mut(&id_stderr) {
                                if dq.len() > 500 { dq.pop_front(); } 
                                let ts = Local::now().format("%H:%M:%S").to_string();
                                dq.push_back(format!("[{}] {}", ts, line));
                            }
                        }
                    });

                    let state_clone = state.clone();
                    let id_for_wait = id.to_string();
                    tokio::spawn(async move {
                        let mut current_child = child;
                        loop {
                            let status = current_child.wait().await;
                            let mut should_restart = false;
                            let mut restart_cmd = String::new();
                            let mut restart_cwd = String::new();
                            
                            if let Ok(exit_status) = status {
                                if !exit_status.success() {
                                    let mut status_map = state_clone.project_status.lock().await;
                                    if let Some(p) = status_map.get_mut(&id_for_wait) {
                                        if p.config.auto_restart && p.restart_count < 3 && p.status == "running" {
                                            should_restart = true;
                                            p.restart_count += 1;
                                            p.has_error = true;
                                            restart_cmd = p.config.command.clone();
                                            restart_cwd = p.config.cwd.clone();
                                        }
                                    }
                                }
                            }
                            
                            if should_restart {
                                if let Some(dq) = state_clone.project_logs.lock().await.get_mut(&id_for_wait) {
                                    let status_map = state_clone.project_status.lock().await;
                                    let count = status_map.get(&id_for_wait).map(|p| p.restart_count).unwrap_or(1);
                                    dq.push_back(format!("[{}] [WARNING] Process crashed! Auto-restarting in 1s (Attempt {}/3)...", Local::now().format("%H:%M:%S"), count));
                                }
                                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                                
                                let mut cmd = platform::build_command(&restart_cmd);
                                cmd.current_dir(&restart_cwd);
                                if let Ok(mut new_child) = tokio::process::Command::from(cmd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
                                    if let Some(p) = state_clone.project_status.lock().await.get_mut(&id_for_wait) {
                                        p.pid = new_child.id();
                                        p.status = "running".to_string();
                                    }
                                    let new_stdin = new_child.stdin.take().unwrap();
                                    state_clone.project_stdin.lock().await.insert(id_for_wait.clone(), std::sync::Arc::new(tokio::sync::Mutex::new(new_stdin)));
                                    
                                    let stdout = new_child.stdout.take().unwrap();
                                    let stderr = new_child.stderr.take().unwrap();
                                    spawn_log_readers(&state_clone, &id_for_wait, stdout, stderr);
                                    current_child = new_child;
                                    continue;
                                }
                            }
                            
                            if let Some(p) = state_clone.project_status.lock().await.get_mut(&id_for_wait) {
                                p.status = "stopped".to_string(); p.pid = None; p.restart_count = 0;
                            }
                            break;
                        }
                    });
                }
            },
            "stop" => { if let Some(pid) = proj.pid { platform::kill_process(pid); proj.status = "stopped".to_string(); proj.pid = None; } },
            "pause" => { if let Some(pid) = proj.pid { platform::pause_process(pid); proj.status = "paused".to_string(); } },
            "resume" => { if let Some(pid) = proj.pid { platform::resume_process(pid); proj.status = "running".to_string(); } },
            _ => return Err((StatusCode::BAD_REQUEST, "Invalid action".to_string())),
        }
        Ok(StatusCode::OK)
    } else {
        Err((StatusCode::NOT_FOUND, "Project not found".to_string()))
    }
}

pub async fn project_input(State(state): State<AppState>, Path(id): Path<String>, Json(req): Json<InputRequest>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let map = state.project_stdin.lock().await;
    if let Some(stdin_mutex) = map.get(&id) {
        use tokio::io::AsyncWriteExt;
        let mut stdin = stdin_mutex.lock().await;
        if let Err(e) = stdin.write_all(format!("{}\n", req.input).as_bytes()).await {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
        }
        Ok(StatusCode::OK)
    } else {
        Err((StatusCode::NOT_FOUND, "Process not running or stdin unavailable".to_string()))
    }
}

pub fn spawn_log_readers(state: &AppState, id: &str, stdout: tokio::process::ChildStdout, stderr: tokio::process::ChildStderr) {
    let logs_state = state.project_logs.clone();
    let logs_state_err = state.project_logs.clone();
    let state_clone_for_err = state.clone();
    
    let id_stdout = id.to_string();
    let id_stderr = id.to_string();
    
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Some(dq) = logs_state.lock().await.get_mut(&id_stdout) {
                if dq.len() > 500 { dq.pop_front(); } 
                let ts = chrono::Local::now().format("%H:%M:%S").to_string();
                dq.push_back(format!("[{}] {}", ts, line));
            }
        }
    });

    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Some(dq) = logs_state_err.lock().await.get_mut(&id_stderr) {
                if dq.len() > 500 { dq.pop_front(); } 
                let ts = chrono::Local::now().format("%H:%M:%S").to_string();
                dq.push_back(format!("[{}] {}", ts, line));
            }
        }
    });
}
