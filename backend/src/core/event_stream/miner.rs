use crate::models::streaming::StreamingModel;
use crate::models::ocel::OCELEvent;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use std::collections::HashMap;

pub struct IncrementalMiner {
    state: StreamingModel,
    // (object_id) -> (last_activity_name, last_timestamp)
    last_event_per_object: HashMap<String, (String, String)>,
}

impl IncrementalMiner {
    pub fn new() -> Self {
        Self {
            state: StreamingModel::default(),
            last_event_per_object: HashMap::new(),
        }
    }

    pub async fn run(
        mut self,
        mut rx: mpsc::Receiver<serde_json::Value>,
        tx_ws: mpsc::Sender<StreamingModel>,
    ) {
        let mut update_interval = interval(Duration::from_millis(100));
        let mut dirty = false;

        loop {
            tokio::select! {
                Some(event_val) = rx.recv() => {
                    if let Ok(event) = serde_json::from_value::<OCELEvent>(event_val) {
                        self.process_event(event);
                        dirty = true;
                    }
                }
                _ = update_interval.tick() => {
                    if dirty {
                        if let Err(_) = tx_ws.send(self.state.clone()).await {
                            // WS closed, stop mining
                            break;
                        }
                        dirty = false;
                    }
                }
            }
        }
    }

    fn process_event(&mut self, event: OCELEvent) {
        let activity = event.event_type.clone();
        
        // Update activity counts
        *self.state.activity_counts.entry(activity.clone()).or_insert(0) += 1;
        self.state.last_timestamp = Some(event.time.to_rfc3339());
        self.state.processed_count += 1;

        // Update OC-DFG
        for rel in &event.relationships {
            let object_id = rel.object_id.clone();
            let object_type = rel.qualifier.clone();

            if let Some((prev_activity, _)) = self.last_event_per_object.get(&object_id) {
                // Directly-follows relation
                let key = format!("{}|{}|{}", prev_activity, activity, object_type);
                *self.state.ocdfg.entry(key).or_insert(0) += 1;
            } else {
                // This is the first time we see this object -> Start activity
                let key = format!("{}|{}", activity, object_type);
                *self.state.start_activities.entry(key).or_insert(0) += 1;
            }
            
            // Update last event for this object
            self.last_event_per_object.insert(object_id, (activity.clone(), event.time.to_rfc3339()));
        }
    }
}
