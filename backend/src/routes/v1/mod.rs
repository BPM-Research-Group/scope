pub mod abstractions;
pub mod case_notion;
pub mod clustering;
pub mod conformance;
pub mod df2;
pub mod event_object_frequencies;
pub mod event_stream_mining;
pub mod export;
pub mod extended_ocpt;
pub mod kpi;
pub mod log_graphs;
pub mod objects;
pub mod ocim;
pub mod ocpn;
pub mod process_forest;
pub mod resource_miner;
pub mod upload;
use axum::Router;

pub fn router() -> Router {
    Router::new()
        .nest("/upload", upload::router())
        .nest("/objects", objects::router())
        .nest("/abstractions", abstractions::router())
        .nest("/conformance", conformance::router())
        .nest(
            "/event_object_frequencies",
            event_object_frequencies::router(),
        )
        .nest("/export", export::router())
        .nest("/case_notion", case_notion::router())
        .nest("/clustering", clustering::router())
        .nest("/log_graphs", log_graphs::router())
        .nest("/ocpn", ocpn::router())
        .nest("/ocpt", df2::router())
        .nest("/ocpt", ocim::router())
        .nest("/ocpt", extended_ocpt::router())
        .nest("/process_forest", process_forest::router())
        .nest("/event_stream", event_stream_mining::router())
        .nest("/resource_miner", resource_miner::router())
        .nest("/kpi", kpi::router())
}
