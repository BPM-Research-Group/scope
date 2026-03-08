use crate::models::ocel::OCEL;
use crate::traits::import_export::ImportableFromPath;
use crate::core::event_stream::replayer::Replayer;
use crate::core::event_stream::miner::IncrementalMiner;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, FixedOffset};
use tokio::sync::mpsc;

#[derive(Serialize)]
pub struct EventStreamInitResponse {
    pub first_event: Option<DateTime<FixedOffset>>,
    pub last_event: Option<DateTime<FixedOffset>>,
    pub event_count: usize,
}

#[derive(Deserialize)]
pub struct WsParams {
    pub replay_speed: Option<u64>,
}

pub async fn event_stream_init(
    Path(file_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ocel = OCEL::import_from_path(&file_id).await.map_err(|(status, message)| {
        (
            status,
            format!("Failed to load OCEL for event stream init: {message}"),
        )
    })?;

    let mut timestamps: Vec<_> = ocel.events.iter().map(|e| e.time).collect();
    timestamps.sort();

    let first_event = timestamps.first().cloned();
    let last_event = timestamps.last().cloned();
    let event_count = timestamps.len();

    let response = EventStreamInitResponse {
        first_event,
        last_event,
        event_count,
    };

    Ok(Json(response))
}

pub async fn event_stream_ws(
    ws: WebSocketUpgrade,
    Path(file_id): Path<String>,
    Query(params): Query<WsParams>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, file_id, params.replay_speed.unwrap_or(60)))
}

async fn handle_socket(mut socket: WebSocket, file_id: String, replay_speed: u64) {
    // 1. Load OCEL
    let ocel = match OCEL::import_from_path(&file_id).await {
        Ok(o) => o,
        Err(_) => {
            let _ = socket.send(Message::Text("Error: Failed to load OCEL".into())).await;
            return;
        }
    };

    // 2. Setup channels
    // Events from Replayer -> Miner
    let (tx_event, rx_event) = mpsc::channel(100);
    // Model updates from Miner -> This WebSocket handler
    let (tx_model, mut rx_model) = mpsc::channel(10);

    // 3. Spawn Replayer
    let replayer = Replayer::new(ocel, replay_speed);
    tokio::spawn(replayer.start(tx_event));

    // 4. Spawn Miner
    let miner = IncrementalMiner::new();
    tokio::spawn(miner.run(rx_event, tx_model));

    // 5. Forward miner updates to the WebSocket
    while let Some(model) = rx_model.recv().await {
        let json = serde_json::to_string(&model).unwrap();
        if let Err(_) = socket.send(Message::Text(json.into())).await {
            // Client disconnected
            break;
        }
    }
}
