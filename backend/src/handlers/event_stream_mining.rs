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
use tokio_util::sync::CancellationToken;
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
    pub use_heuristics: Option<bool>,
    pub cleanup_interval: Option<usize>,
    pub max_inactive_events: Option<usize>,
    pub end_hint_timeout: Option<usize>,
    pub min_end_histogram_samples: Option<usize>,
    pub end_probability_threshold: Option<f64>,
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
    ws.on_upgrade(move |socket| handle_socket(socket, file_id, params))
}

pub async fn save_ocpt(
    Json(ocpt): Json<crate::models::ocpt::OcptFE>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use crate::traits::import_export::ExportableToPath;
    let file_id = ocpt.export_to_path().await?;
    Ok(Json(serde_json::json!({ "file_id": file_id })))
}

async fn handle_socket(mut socket: WebSocket, file_id: String, params: WsParams) {
    let replay_speed = params.replay_speed.unwrap_or(60);
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

    let cancel_token = CancellationToken::new();
    let (tx_event, rx_event) = mpsc::channel(100);
    let (tx_model, mut rx_model) = mpsc::channel::<StreamUpdate>(10);

    let replayer = Replayer::new(ocel, replay_speed);
    tokio::spawn(replayer.start(tx_event, cancel_token.clone()));

    let enable_heuristics = params.use_heuristics.unwrap_or(false);
    let defaults = crate::core::event_stream::miner::HeuristicsConfig::default();
    let heuristics_config = crate::core::event_stream::miner::HeuristicsConfig {
        cleanup_interval: params.cleanup_interval.unwrap_or(defaults.cleanup_interval),
        max_inactive_events: params.max_inactive_events.unwrap_or(defaults.max_inactive_events),
        end_hint_timeout: params.end_hint_timeout.unwrap_or(defaults.end_hint_timeout),
        min_end_histogram_samples: params.min_end_histogram_samples.unwrap_or(defaults.min_end_histogram_samples),
        end_probability_threshold: params.end_probability_threshold.unwrap_or(defaults.end_probability_threshold),
    };

    let miner = IncrementalMiner::new(object_to_type, true, enable_heuristics, heuristics_config);
    tokio::spawn(miner.run(rx_event, tx_model, cancel_token.clone()));

    while let Some(model) = rx_model.recv().await {
        let json = serde_json::to_string(&model).unwrap();
        if let Err(_) = socket.send(Message::Text(json.into())).await {
            // socket closed
            cancel_token.cancel();
            break;
        }
    }
}
