use axum::{extract::{State, Path}, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use std::{collections::VecDeque, fs};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use crate::{state::{AppState, FavoriteProject, ProjectState}, platform};

#[derive(Deserialize)]
pub struct ActionRequest { pub action: String }

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
            for sys_port in system_ports.iter() {
                if let Some(exe) = &sys_port.exe_path {
                    if proj.config.command.contains(exe) || exe.contains(&proj.config.command) {
                        is_running_externally = true;
                        break;
                    }
                }
                // avoid false positives on short commands like "java" or "node" matching randomly
                if sys_port.command.len() > 3 && proj.config.command.contains(&sys_port.command) && proj.config.command.starts_with(&sys_port.command) {
                    is_running_externally = true;
                    break;
                }
            }
            if is_running_externally {
                p["status"] = serde_json::json!("running_externally");
            }
        }
        result.push(p);
    }
    Json(result)
}

pub async fn get_project_logs(State(state): State<AppState>, Path(id): Path<String>) -> Json<Vec<String>> {
    let logs_map = state.project_logs.lock().await;
    Json(logs_map.get(&id).map_or(vec![], |dq| dq.iter().cloned().collect()))
}

pub async fn add_favorite(State(state): State<AppState>, Json(mut req): Json<FavoriteProject>) -> Result<impl IntoResponse, (StatusCode, String)> {
    req.id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis().to_string();
    {
        state.favorites.lock().await.insert(req.id.clone(), req.clone());
        state.project_status.lock().await.insert(req.id.clone(), ProjectState { config: req, status: "stopped".to_string(), pid: None });
    }
    save_favorites(&state).await;
    Ok(StatusCode::CREATED)
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
            "run" => {
                if proj.status == "stopped" {
                    let mut child = platform::build_command(&proj.config.command)
                        .current_dir(&proj.config.cwd)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                        
                    proj.status = "running".to_string();
                    proj.pid = child.id();
                    
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
                                if dq.len() > 500 { dq.pop_front(); } dq.push_back(line);
                            }
                        }
                    });
                    tokio::spawn(async move {
                        let mut reader = BufReader::new(stderr).lines();
                        while let Ok(Some(line)) = reader.next_line().await {
                            if let Some(dq) = logs_state_err.lock().await.get_mut(&id_stderr) {
                                if dq.len() > 500 { dq.pop_front(); } dq.push_back(format!("[ERROR] {}", line));
                            }
                        }
                    });
                    
                    let state_clone = state.clone();
                    tokio::spawn(async move {
                        let _ = child.wait().await;
                        if let Some(p) = state_clone.project_status.lock().await.get_mut(&id) {
                            p.status = "stopped".to_string(); p.pid = None;
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
