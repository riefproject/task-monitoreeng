use axum::http::StatusCode;
use crate::platform;

pub async fn pick_folder() -> Result<String, StatusCode> {
    platform::pick_folder().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
