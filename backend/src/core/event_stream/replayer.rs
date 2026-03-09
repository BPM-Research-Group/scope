use crate::models::ocel::OCEL;
use std::time::Duration as StdDuration;
use tokio::sync::mpsc;
use tokio::time::sleep;

pub struct Replayer {
    ocel: OCEL,
    replay_speed_seconds: u64, // total time to replay the full log
}

impl Replayer {
    pub fn new(ocel: OCEL, replay_speed_seconds: u64) -> Self {
        Self {
            ocel,
            replay_speed_seconds,
        }
    }

    pub async fn start(self, tx: mpsc::Sender<serde_json::Value>) {
        let mut events = self.ocel.events.clone();
        
        // Exact Offline Sorting Match:
        // 1. Sort by ID (unstable is fine for first pass)
        events.sort_by(|a, b| a.id.cmp(&b.id));
        // 2. Stable sort by Timestamp (standard sort() in Rust is stable)
        events.sort_by(|a, b| a.time.cmp(&b.time));

        if events.is_empty() {
            return;
        }

        log::info!("Replayer: Starting with {} events", events.len());

        let first_time = events.first().unwrap().time;
        let last_time = events.last().unwrap().time;
        let total_log_duration = (last_time - first_time).num_milliseconds() as f64;

        if total_log_duration <= 0.0 {
            for event in events {
                let _ = tx.send(serde_json::to_value(&event).unwrap()).await;
            }
            return;
        }

        let speed_factor = (self.replay_speed_seconds as f64 * 1000.0) / total_log_duration;
        let mut last_event_time = first_time;

        for event in events {
            let time_diff = (event.time - last_event_time).num_milliseconds() as f64;
            let wait_ms = (time_diff * speed_factor) as u64;

            if wait_ms > 0 {
                sleep(StdDuration::from_millis(wait_ms)).await;
            }

            if let Err(_) = tx.send(serde_json::to_value(&event).unwrap()).await {
                break;
            }
            last_event_time = event.time;
        }
        
        log::info!("Replayer: Finished emission");
    }
}
