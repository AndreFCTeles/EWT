use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub running_time_formatted: String,
    pub memory_in_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClockTick {
    pub epoch_ms: u128,
}
