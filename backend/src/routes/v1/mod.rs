pub mod abstractions;
pub mod case_notion;
pub mod kpi;
pub mod conformance;
pub mod df2;
pub mod event_object_frequencies;
pub mod extended_ocpt;
pub mod log_graphs;
pub mod objects;
pub mod ocim;
pub mod ocpn;
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
        .nest("/case_notion", case_notion::router())
        .nest("/log_graphs", log_graphs::router())
        .nest("/ocpn", ocpn::router())
        .nest("/ocpt", df2::router())
        .nest("/ocpt", ocim::router())
        .nest("/ocpt", extended_ocpt::router())
        .nest("/resource_miner", resource_miner::router())
        .nest("/kpi", kpi::router())
}
