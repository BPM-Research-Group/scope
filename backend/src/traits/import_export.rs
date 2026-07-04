use async_trait::async_trait;
use axum::http::StatusCode;
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::io;

/// A trait that defines asynchronous import functionality for types that can be
/// deserialized from JSON files stored on disk. It provides:
///
/// - A reusable helper method [`from_json_file`] for reading and deserializing
///   any JSON file into a type implementing [`DeserializeOwned`].
/// - A high-level [`import_from_path`] function that can be customized per type
///   (e.g., by constructing file paths or applying pre/post-processing).
///
/// # Example
///
/// ```rust,ignore
/// let ocel = OCEL::import_from_path("example_id").await?;
/// ```
/// # Implementation Notes
///
/// - Implementations should typically call [`from_json_file`] inside their
///   [`import_from_path`] method to handle I/O and deserialization.
/// - This trait requires `Sized` and `DeserializeOwned` bounds, so it can
///   construct owned instances of `Self` directly from the file.
#[async_trait]
pub trait ImportableFromPath: Sized + DeserializeOwned {
    /// Reads and deserializes a JSON file asynchronously into the implementing type.
    ///
    /// This function uses Tokio’s asynchronous file I/O to load the file contents
    /// and then attempts to parse the data using [`serde_json`].
    ///
    /// # Arguments
    /// * `path` – The filesystem path to the JSON file.
    ///
    /// # Returns
    /// - `Ok(Self)` if the file was successfully read and parsed.
    /// - `Err((StatusCode, String))` if reading or parsing fails.
    async fn from_json_file(path: &str) -> Result<Self, (StatusCode, String)> {
        let content = tokio::fs::read_to_string(path).await.map_err(|err| {
            log::error!("Failed to read file {}: {}", path, err);
            if err.kind() == io::ErrorKind::NotFound {
                (StatusCode::NOT_FOUND, format!("File not found: {}", path))
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to read stored file".to_string(),
                )
            }
        })?;

        let mut deserializer = serde_json::Deserializer::from_str(&content);
        deserializer.disable_recursion_limit();
        serde::Deserialize::deserialize(&mut deserializer).map_err(|err| {
            log::error!("Failed to parse JSON file {}: {}", path, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid JSON structure".to_string(),
            )
        })
    }

    /// Imports an instance from a file path derived from a logical identifier.
    ///
    /// This higher-level function defines how to locate and import files based
    /// on an external identifier (e.g., `file_id`). Implementations can apply
    /// custom logic to build the appropriate path before calling
    /// [`from_json_file`].
    ///
    /// # Arguments
    /// * `file_id` – The logical identifier for the file.
    ///
    /// # Returns
    /// A deserialized instance of the implementing type, or an error tuple if
    /// reading/parsing fails.
    async fn import_from_path(file_id: &str) -> Result<Self, (StatusCode, String)>;
}

#[async_trait]
pub trait ExportableToPath: Sized + Serialize + Send + Sync {
    /// Exports an instance to a file path and returns a file identifier.
    ///
    /// Implementations of this function are responsible for:
    /// 1. Generating a unique `file_id` (e.g., using UUIDs).
    /// 2. Constructing the full file path where the object will be stored.
    ///    The path logic can be specific to the type being exported.
    /// 3. Serializing the instance to a format like JSON.
    /// 4. Asynchronously writing the serialized content to the file.
    /// 5. Returning the generated `file_id` on success.
    ///
    /// # Returns
    /// - `Ok(String)` containing the `file_id` if the export is successful.
    /// - `Err((StatusCode, String))` if serialization or file I/O fails.
    async fn export_to_path(&self) -> Result<String, (StatusCode, String)>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::OCEL;
    use crate::models::ocpt::OCPT;
    use tokio;

    #[tokio::test]
    async fn test_ocel_import_export() {
        let original_file_id = "ef34153a-ffff-401d-8a16-138b5733e63a";
        let ocel = OCEL::import_from_path(original_file_id).await.unwrap();
        let new_file_id = ocel.export_to_path().await.unwrap();

        let original_path = format!("./temp/ocel_v2_{}.json", original_file_id);
        let new_path = format!("./temp/ocel_v2_{}.json", new_file_id);

        let original_metadata = tokio::fs::metadata(original_path).await.unwrap();
        let new_metadata = tokio::fs::metadata(new_path).await.unwrap();

        assert_eq!(original_metadata.len(), new_metadata.len());
    }

    #[tokio::test]
    async fn test_ocpt_import_export() {
        let original_file_id = "c34fd390-39c9-4dd1-b48c-c2376014619c";
        let ocpt = OCPT::import_from_path(original_file_id).await.unwrap();
        let new_file_id = ocpt.export_to_path().await.unwrap();

        let original_path = format!("./temp/ocpt_{}.json", original_file_id);
        let new_path = format!("./temp/ocpt_{}.json", new_file_id);

        let original_metadata = tokio::fs::metadata(original_path).await.unwrap();
        let new_metadata = tokio::fs::metadata(new_path).await.unwrap();

        assert_eq!(original_metadata.len(), new_metadata.len());
    }
}
