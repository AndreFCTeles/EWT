//use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter; //{Emitter, Manager};
use tokio::time::{interval_at, Instant};

use crate::data_structures::ClockTick;

fn align_next_second() -> Instant {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let ms = now.as_millis();
    let next_ms = ((ms / 1000) + 1) * 1000;
    let delay = (next_ms - ms) as u64;
    Instant::now() + Duration::from_millis(delay)
}

#[tauri::command]
pub fn start_clock(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval_at(align_next_second(), Duration::from_secs(1));
        loop {
            ticker.tick().await;
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis();

            #[cfg(debug_assertions)]
            //println!("clock:tick {}", now);

            // Emit to all webviews/windows
            let _ = app.emit("clock:tick", ClockTick { epoch_ms: now });
        }
    });
}
