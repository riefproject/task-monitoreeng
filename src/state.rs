use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex as StdMutex},
};
use sysinfo::System;
use tokio::sync::{oneshot, Mutex as TokioMutex};

#[derive(Serialize, Clone)]
pub struct SystemPortInfo {
    pub command: String,
    pub pid: String,
    pub user: String,
    pub port: String,
    pub exe_path: Option<String>,
    pub cwd: Option<String>,
    pub cpu_usage: f32,
    pub memory_mb: f32,
    pub min_memory_mb: f32,
    pub max_memory_mb: f32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FavoriteProject {
    pub id: String,
    pub name: String,
    pub command: String,
    pub cwd: String,
}

#[derive(Serialize, Clone)]
pub struct ProjectState {
    pub config: FavoriteProject,
    pub status: String,
    pub pid: Option<u32>,
}

pub struct ServerInfo {
    pub path: String,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
pub struct AppState {
    pub servers: Arc<StdMutex<HashMap<u16, ServerInfo>>>,
    pub sys: Arc<StdMutex<System>>,
    pub system_ports: Arc<StdMutex<Vec<SystemPortInfo>>>,
    pub favorites: Arc<TokioMutex<HashMap<String, FavoriteProject>>>,
    pub project_status: Arc<TokioMutex<HashMap<String, ProjectState>>>,
    pub project_logs: Arc<TokioMutex<HashMap<String, VecDeque<String>>>>,
}
