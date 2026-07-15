mod api;
mod platform;
mod state;

use axum::{routing::{delete, get, post}, Router};
use std::{collections::HashMap, net::SocketAddr, sync::{Arc, Mutex as StdMutex}};
use sysinfo::System;
use tokio::sync::Mutex as TokioMutex;
use tower_http::{cors::CorsLayer, services::ServeDir};
use std::fs;
use state::{AppState, FavoriteProject, ProjectState};

#[tokio::main]
async fn main() {
    let mut sys = System::new_all();
    sys.refresh_all(); 

    let system_ports = Arc::new(StdMutex::new(Vec::new()));
    let favorites = Arc::new(TokioMutex::new(HashMap::new()));
    let project_status = Arc::new(TokioMutex::new(HashMap::new()));

    if let Ok(data) = fs::read_to_string("favorites.json") {
        if let Ok(favs) = serde_json::from_str::<Vec<FavoriteProject>>(&data) {
            let mut fav_map = favorites.lock().await;
            let mut status_map = project_status.lock().await;
            for fav in favs {
                fav_map.insert(fav.id.clone(), fav.clone());
                status_map.insert(fav.id.clone(), ProjectState {
                    config: fav,
                    status: "stopped".to_string(),
                    pid: None,
                });
            }
        }
    }
    
    let state = AppState {
        servers: Arc::new(StdMutex::new(HashMap::new())),
        sys: Arc::new(StdMutex::new(sys)),
        system_ports: system_ports.clone(),
        favorites,
        project_status,
        project_logs: Arc::new(TokioMutex::new(HashMap::new())),
    };

    let system_ports_clone = system_ports.clone();
    tokio::spawn(async move {
        let mut local_sys = sysinfo::System::new_all();
        loop {
            local_sys.refresh_cpu_usage();
            local_sys.refresh_processes_specifics(
                sysinfo::ProcessesToUpdate::All,
                true,
                sysinfo::ProcessRefreshKind::everything(),
            );
            let mut list = platform::scan_ports(&mut local_sys).await;
            
            {
                let prev_list = system_ports_clone.lock().unwrap();
                for p in list.iter_mut() {
                    if let Some(prev) = prev_list.iter().find(|x| x.pid == p.pid && x.port == p.port) {
                        p.min_memory_mb = prev.min_memory_mb.min(p.memory_mb);
                        p.max_memory_mb = prev.max_memory_mb.max(p.memory_mb);
                    }
                }
            }
            
            *system_ports_clone.lock().unwrap() = list;
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });

    let app = Router::new()
        .route("/api/system", get(api::system::get_system_stats))
        .route("/api/services", get(api::services::get_services))
        .route("/api/all-ports", get(api::system::get_all_ports))
        .route("/api/system/process/{pid}", delete(api::system::kill_system_process))
        .route("/api/host", post(api::services::host_folder))
        .route("/api/host/{port}", delete(api::services::stop_folder))
        .route("/api/dialog/folder", get(api::dialog::pick_folder))
        .route("/api/favorites", get(api::favorites::get_favorites).post(api::favorites::add_favorite))
        .route("/api/favorites/{id}", delete(api::favorites::remove_favorite))
        .route("/api/favorites/{id}/action", post(api::favorites::project_action))
        .route("/api/favorites/{id}/logs", get(api::favorites::get_project_logs))
        .fallback_service(ServeDir::new("static"))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3080));
    println!("Web Dashboard running at http://localhost:3080");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
