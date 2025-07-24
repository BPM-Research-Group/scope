use axum::extract::Json;
use serde_json;
use std::path::Path;
use tokio::fs;
use chrono::Utc;
use crate::models::ocel::OcelJson;


pub async fn post_ocel(Json(ocel): Json<OcelJson>) {
    // Serialize JSON back to string
    let json_str = match serde_json::to_string_pretty(&ocel) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to serialize: {:?}", e);
            return;
        }
    };

    // Make sure the target folder exists
    let folder_path = Path::new("backend/temp/");
    if let Err(e) = fs::create_dir_all(&folder_path).await {
        eprintln!("Failed to create folder: {:?}", e);
        return;
    }

    // Generate a unique filename using UTC timestamp
    let filename = format!("ocel_{}.json", Utc::now().format("%Y%m%d_%H%M%S"));
    let file_path = folder_path.join(filename);

    // Write to file
    if let Err(e) = fs::write(&file_path, json_str).await {
        eprintln!("Failed to write file: {:?}", e);
        return;
    }

    println!("✅ Ocel JSON saved to {:?}", file_path);
}

pub async fn get_ocel(){
    
}
