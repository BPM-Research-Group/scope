use std::fs::File;
use std::io::Write;

pub fn save_json_to_file(json: &str, path: &str) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(json.as_bytes())?;
    Ok(())
}
