use crate::data_structures::AppInfo;
use sysinfo::{Process, ProcessStatus, System};

#[cfg(target_os = "macos")]
const APPLICATION_DIRS: &[&str] = &["/Applications", "/Users/*/Applications"];

#[cfg(target_os = "windows")]
const APPLICATION_DIRS: &[&str] = &["C:\\Program Files", "C:\\Program Files (x86)"];

#[cfg(target_os = "linux")]
const APPLICATION_DIRS: &[&str] = &["/usr/bin", "/usr/local/bin", "/opt"];

// -- privates

fn is_valid(process: &Process) -> bool {
    let helper_keywords = vec!["helper", "service", "daemon", "agent", "."];

    if let Some(exe_path) = process.exe().unwrap().to_str() {
        let is_in_app_dir = APPLICATION_DIRS.iter().any(|dir| exe_path.starts_with(dir));

        let is_helper = helper_keywords.iter().any(|keyword| {
            process
                .name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .contains(keyword)
        });

        process.status() == ProcessStatus::Run && is_in_app_dir && is_helper
    } else {
        false
    }
}

fn format_running_time(seconds: u64) -> String {
    //let days = seconds / 86400;
    let hours = (seconds % 86400) / 3600;
    let minutes = (seconds % 3600) / 60;
    let seconds = seconds % 60;

    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

// -- public command

#[tauri::command]
pub fn max_runtime() -> Option<AppInfo> {
    let mut sys = System::new_all();

    sys.refresh_all();
    sys.processes()
        .iter()
        .filter(|(_, process)| is_valid(process))
        .max_by_key(|(_, process)| process.run_time())
        .map(|(id, process)| AppInfo {
            id: id.to_string(),
            name: process.name().to_string_lossy().into_owned(),
            running_time_formatted: format_running_time(process.run_time()),
            memory_in_bytes: process.memory(),
        })
}

#[tauri::command]
pub fn max_memory() -> Option<AppInfo> {
    let mut sys = System::new_all();

    sys.refresh_all();
    sys.processes()
        .iter()
        .filter(|(_, process)| is_valid(process))
        .max_by_key(|(_, process)| process.memory())
        .map(|(id, process)| AppInfo {
            id: id.to_string(),
            name: process.name().to_string_lossy().into_owned(),
            running_time_formatted: format_running_time(process.run_time()),
            memory_in_bytes: process.memory(),
        })
}

#[tauri::command]
pub fn list_process() -> Vec<AppInfo> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut processes: Vec<AppInfo> = sys
        .processes()
        .iter()
        .filter(|(_, process)| is_valid(process))
        .map(|(id, process)| AppInfo {
            id: id.to_string(),
            name: process.name().to_string_lossy().into_owned(),
            running_time_formatted: format_running_time(process.run_time()),
            memory_in_bytes: process.memory(),
        })
        .collect();

    processes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    processes
}
