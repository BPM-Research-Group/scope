use crate::handlers::clustering::{
    agglomerative_cluster_case_ocels, cluster_case_ocels, cut_agglomerative_clustering,
    get_materialized_clustered_cases, materialize_clustered_case_ocels,
};
use axum::{
    Router,
    routing::{get, post},
};

pub fn router() -> Router {
    Router::new()
        .route(
            "/agglomerative/{agglomerative_file_id}/cut",
            get(cut_agglomerative_clustering),
        )
        .route(
            "/agglomerative/{case_ocels_file_id}",
            get(agglomerative_cluster_case_ocels),
        )
        .route("/cluster/{case_ocels_file_id}", get(cluster_case_ocels))
        .route(
            "/materialize/{case_ocels_file_id}",
            post(materialize_clustered_case_ocels),
        )
        .route(
            "/materialized/{clustered_cases_id}",
            get(get_materialized_clustered_cases),
        )
}
