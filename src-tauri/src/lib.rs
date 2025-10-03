// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use business::{list_process, max_memory, max_runtime};
use clock::start_clock; //{clock_now, start_clock};
use export_xlsx::{export_xlsx, parse_xlsx_from_dialog, parse_xlsx_path, pick_xlsx_path};
use import::read_file_to_string;

mod business;
mod clock;
mod data_structures;
mod export_xlsx;
mod import;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            start_clock(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_to_string,
            pick_xlsx_path,
            parse_xlsx_path,
            parse_xlsx_from_dialog,
            export_xlsx,
            max_runtime,
            max_memory,
            list_process,
            //clock_now,
            start_clock
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
