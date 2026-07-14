use axum::{extract::{State, Path}, http::StatusCode, response::IntoResponse, Json};
use serde::Serialize;
use crate::state::AppState;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemStats {
    pub total_memory: u64,
    pub used_memory: u64,
    pub cpu_usage: f32,
}

pub async fn get_system_stats(State(state): State<AppState>) -> Json<SystemStats> {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    Json(SystemStats {
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        cpu_usage: sys.global_cpu_usage(),
    })
}

pub async fn get_all_ports(State(state): State<AppState>) -> Json<Vec<crate::state::SystemPortInfo>> {
    let ports = state.system_ports.lock().unwrap().clone();
    Json(ports)
}

pub async fn kill_system_process(Path(pid): Path<u32>) -> Result<impl IntoResponse, (StatusCode, String)> {
    crate::platform::kill_process(pid);
    Ok(StatusCode::OK)
}
