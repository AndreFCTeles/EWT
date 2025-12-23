use business::{list_process, max_memory, max_runtime};
use clock::start_clock;
use does_it_talk::{
    close, connect, list_ports, test_roundtrip_bytes, test_roundtrip_text, SerialState,
};
use export_xlsx::{export_xlsx, parse_xlsx_from_dialog, parse_xlsx_path, pick_xlsx_path};
use import::read_file_to_string;
use import_tool_cal_files::parse_tool_calibration;
use lb_runtime::{lb_start_polling, lb_stop_polling, lb_write_bytes, LoadBankRuntimeState};
use std::sync::Mutex;
use upload_tool_cal_files::upload_calibration_file;

mod business;
mod clock;
mod data_structures;
mod does_it_talk;
mod export_xlsx;
mod import;
mod import_tool_cal_files;
mod lb_runtime;
mod upload_tool_cal_files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SerialState {
            port: Mutex::new(None),
        })
        .manage(LoadBankRuntimeState::default())
        .setup(|app| {
            start_clock(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // basic background processes
            max_runtime,
            max_memory,
            list_process,
            start_clock,
            // comm debug
            list_ports,
            close,
            connect,
            test_roundtrip_text,
            test_roundtrip_bytes,
            // UART comms & calibration
            lb_start_polling,
            lb_stop_polling,
            lb_write_bytes,
            // import/export files
            read_file_to_string,
            pick_xlsx_path,
            parse_xlsx_path,
            parse_xlsx_from_dialog,
            export_xlsx,
            // tool calibration files
            parse_tool_calibration,
            upload_calibration_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
