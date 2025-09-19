// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

//mod data_structures;
mod xlsx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            xlsx::pick_xlsx_path,
            xlsx::parse_xlsx_path,
            xlsx::parse_xlsx_from_dialog,
            xlsx::export_xlsx,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
