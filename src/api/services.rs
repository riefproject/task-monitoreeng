use axum::{extract::{State, Path}, http::StatusCode, response::IntoResponse, Json, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::oneshot;
use tower_http::services::ServeDir;
use crate::state::{AppState, ServerInfo};

#[derive(Deserialize)]
pub struct HostRequest { pub port: u16, pub path: String }
#[derive(Serialize)]
pub struct HostedService { pub port: u16, pub path: String }

pub async fn get_services(State(state): State<AppState>) -> Json<Vec<HostedService>> {
    let servers = state.servers.lock().unwrap();
    let list = servers.iter().map(|(&port, info)| HostedService { port, path: info.path.clone() }).collect();
    Json(list)
}

pub async fn host_folder(State(state): State<AppState>, Json(req): Json<HostRequest>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut servers = state.servers.lock().unwrap();
    if servers.contains_key(&req.port) { return Err((StatusCode::BAD_REQUEST, "Port in use".to_string())); }
    
    let (tx, rx) = oneshot::channel::<()>();
    let path_clone = req.path.clone();
    let port = req.port;
    
    tokio::spawn(async move {
        let app = Router::new().fallback_service(ServeDir::new(path_clone));
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
            let _ = axum::serve(listener, app).with_graceful_shutdown(async { rx.await.ok(); }).await;
        }
    });

    servers.insert(req.port, ServerInfo { path: req.path.clone(), shutdown_tx: Some(tx) });
    Ok(StatusCode::CREATED)
}

pub async fn stop_folder(State(state): State<AppState>, Path(port): Path<u16>) -> Result<impl IntoResponse, (StatusCode, String)> {
    if let Some(mut info) = state.servers.lock().unwrap().remove(&port) {
        if let Some(tx) = info.shutdown_tx.take() { let _ = tx.send(()); }
        Ok(StatusCode::OK)
    } else {
        Err((StatusCode::NOT_FOUND, "Not found".to_string()))
    }
}
