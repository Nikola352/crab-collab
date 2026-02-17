mod protocol;
mod state;
mod websocket;
mod handler;

use axum::Router;
use axum::routing::get;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use notebook::conflict_resolver::naive_resolver::NaiveStateHolder;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let notebook_state_holder = NaiveStateHolder::new();
    let app_state = state::AppState::new(notebook_state_holder);

    let app = Router::new()
        .route("/ws", get(websocket::handler::websocket_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
