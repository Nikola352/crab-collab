mod handler;
mod protocol;
mod state;
mod websocket;

use axum::Router;
use axum::routing::get;
use execution_queue::execution_queue::ExecutionQueue;
use notebook::conflict_resolver::naive_resolver::NaiveStateHolder;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let notebook_state_holder = NaiveStateHolder::new();
    let (execution_queue, mut execution_output_rx) = ExecutionQueue::new().await?;

    let app_state = state::AppState::new(notebook_state_holder, execution_queue);

    let state_for_output = app_state.clone();
    tokio::spawn(async move {
        while let Some(output) = execution_output_rx.recv().await {
            if let Err(e) = handler::execution::handle_output(output, &state_for_output).await {
                tracing::error!("Failed to handle execution output: {}", e);
            }
        }
    });

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
