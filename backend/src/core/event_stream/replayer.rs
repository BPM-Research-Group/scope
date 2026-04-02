use crate::models::ocel::OCEL;
use std::time::Duration as StdDuration;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;

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

    pub async fn start(self, txs: Vec<mpsc::Sender<serde_json::Value>>, cancel_token: CancellationToken) {
        let mut events = self.ocel.events.clone();
        
        events.sort_by(|a, b| a.id.cmp(&b.id));
        events.sort_by(|a, b| a.time.cmp(&b.time));

        if events.is_empty() {
            return;
        }

        log::info!("Replayer: Starting with {} events", events.len());

        let first_time = events.first().unwrap().time;
        let last_time = events.last().unwrap().time;
        let total_log_duration = (last_time - first_time).num_milliseconds() as f64;

        let speed_factor = if total_log_duration <= 0.0 {
            0.0
        } else {
            (self.replay_speed_seconds as f64 * 1000.0) / total_log_duration
        };

        let mut last_event_time = first_time;

        for event in events {
            if cancel_token.is_cancelled() {
                log::info!("Replayer: Cancellation received, stopping.");
                return;
            }

            if speed_factor > 0.0 {
                let time_diff = (event.time - last_event_time).num_milliseconds() as f64;
                let wait_ms = (time_diff * speed_factor) as u64;
                if wait_ms > 0 {
                    tokio::select! {
                        _ = sleep(StdDuration::from_millis(wait_ms)) => {}
                        _ = cancel_token.cancelled() => {
                            log::info!("Replayer: Cancellation received during sleep, stopping.");
                            return;
                        }
                    }
                }
            }

            let event_json = serde_json::to_value(&event).unwrap();
            for tx in &txs {
                let _ = tx.send(event_json.clone()).await;
            }
            last_event_time = event.time;
        }
        
        // Signal End of Stream
        let end_msg = serde_json::json!({ "control": "end" });
        for tx in &txs {
            let _ = tx.send(end_msg.clone()).await;
        }
        log::info!("Replayer: Finished emission.");
    }
}
