use reqwest::blocking::{
    multipart::{Form, Part},
    Client,
};
//use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;| TYPES |;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResponse {
    pub ok: bool,
    pub file_path: String,
    #[serde(default)]
    pub media_dir: Option<String>,
    #[serde(default)]
    pub media: Option<Vec<serde_json::Value>>,
}
/*
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExistsResponse {
    pub exists: bool,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub identical: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpsertResponse {
    pub ok: bool,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub created: Option<bool>,
    #[serde(default)]
    pub updated: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UploadArgs {
    pub path: String,
    #[serde(default)]
    pub api_base: String,
    #[serde(default)]
    pub instrument_code: String,
    #[serde(default)]
    pub verified_at: String,
}
*/

// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;| HELPERS |;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
/*
fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("EWT-CalibClient/1.0")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn auth_header(bearer_opt: &Option<String>) -> Option<String> {
    bearer_opt.as_ref().map(|t| format!("Bearer {}", t))
}
 */
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;| FILE UPLOAD |;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

// Stream file to API multipart, return API JSON
#[tauri::command]
pub fn upload_calibration_file(
    path: String,
    api_base: String,
    instrument_code: String,
    verified_at: String,
) -> Result<UploadResponse, String> {
    let url = format!("{}/qa/calibrations/upload", api_base.trim_end_matches('/'));
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let fname = Path::new(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file.xlsx");

    let part = Part::bytes(bytes)
        .file_name(fname.to_string())
        .mime_str("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .map_err(|e| e.to_string())?;

    let form = Form::new()
        .text("instrumentCode", instrument_code)
        .text("verifiedAt", verified_at)
        .part("file", part);

    let client = Client::builder().build().map_err(|e| e.to_string())?;
    let resp = client
        .post(url)
        .multipart(form)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Upload failed: {}", resp.status()));
    }
    resp.json::<UploadResponse>().map_err(|e| e.to_string())
}
