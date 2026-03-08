use crate::models::ocel::OCEL;
use crate::traits::import_export::ImportableFromPath;
use axum::{Json, extract::Path, http::StatusCode, response::IntoResponse};
use serde::Serialize;
use chrono::{DateTime, FixedOffset};

#[derive(Serialize)]
pub struct EventStreamInitResponse {
    pub first_event: Option<DateTime<FixedOffset>>,
    pub last_event: Option<DateTime<FixedOffset>>,
    pub event_count: usize,
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
