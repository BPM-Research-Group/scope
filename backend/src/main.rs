mod routes;
mod handlers;
mod models;
mod core;

#[tokio::main]
pub async fn main() {
    let app = routes::create_routes();
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
