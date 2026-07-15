use axum::{extract::{State, Path}, http::StatusCode, response::IntoResponse, Json};
use std::fs;
use crate::state::{AppState, Workspace};

async fn save_workspaces(state: &AppState) {
    let w = state.workspaces.lock().await;
    let list: Vec<Workspace> = w.values().cloned().collect();
    if let Ok(json) = serde_json::to_string(&list) { let _ = fs::write("workspaces.json", json); }
}

pub async fn get_workspaces(State(state): State<AppState>) -> Json<Vec<Workspace>> {
    let w = state.workspaces.lock().await;
    let mut list: Vec<Workspace> = w.values().cloned().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Json(list)
}

pub async fn add_workspace(State(state): State<AppState>, Json(mut req): Json<Workspace>) -> Result<impl IntoResponse, (StatusCode, String)> {
    if req.id.is_empty() {
        req.id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis().to_string();
    }
    {
        state.workspaces.lock().await.insert(req.id.clone(), req.clone());
    }
    save_workspaces(&state).await;
    Ok(StatusCode::CREATED)
}

pub async fn remove_workspace(State(state): State<AppState>, Path(id): Path<String>) -> Result<impl IntoResponse, (StatusCode, String)> {
    { state.workspaces.lock().await.remove(&id); }
    save_workspaces(&state).await;
    Ok(StatusCode::OK)
}
