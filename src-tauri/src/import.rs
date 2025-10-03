use std::fs;

#[tauri::command]
pub fn read_file_to_string(path: String) -> tauri::Result<String> {
    // Optional: validate/whitelist paths here, check file size, etc.
    let data = fs::read_to_string(&path).map_err(|e| tauri::Error::from(anyhow::anyhow!(e)))?;
    Ok(data)
}
