use crate::models::ocel::OCEL;
use crate::traits::import_export::ImportableFromPath;
use crate::core::event_stream::replayer::Replayer;
use crate::core::event_stream::miner::IncrementalMiner;
use crate::models::streaming::StreamUpdate;
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
use std::collections::HashMap;

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

pub async fn save_ocpt(
    Json(ocpt): Json<crate::models::ocpt::OcptFE>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use crate::traits::import_export::ExportableToPath;
    let file_id = ocpt.export_to_path().await?;
    Ok(Json(serde_json::json!({ "file_id": file_id })))
}

async fn handle_socket(mut socket: WebSocket, file_id: String, replay_speed: u64) {
    let ocel = match OCEL::import_from_path(&file_id).await {
        Ok(o) => o,
        Err(_) => {
            let _ = socket.send(Message::Text("Error: Failed to load OCEL".into())).await;
            return;
        }
    };

    let mut object_to_type = HashMap::new();
    for obj in &ocel.objects {
        object_to_type.insert(obj.id.clone(), obj.object_type.clone());
    }

    let (tx_event, rx_event) = mpsc::channel(100);
    let (tx_model, mut rx_model) = mpsc::channel::<StreamUpdate>(10);

    let replayer = Replayer::new(ocel, replay_speed);
    tokio::spawn(replayer.start(tx_event));

    let miner = IncrementalMiner::new(object_to_type);
    tokio::spawn(miner.run(rx_event, tx_model));

    while let Some(model) = rx_model.recv().await {
        let json = serde_json::to_string(&model).unwrap();
        if let Err(_) = socket.send(Message::Text(json.into())).await {
            break;
        }
    }
}
