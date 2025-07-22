use axum::{routing::get, routing::post, Router};
use crate::models::ocel::{OcelJson};
use crate::handlers::ocel_post;

#[tokio::main]
pub async fn main() {
    let router = Router::new().route("/upload", post(ocel_post));

    let addr = "0.0.0.0:3000";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, router).await.unwrap();
    
}