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

// tool calibration - simple
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SimpleTest {
    pub kind: String,
    pub setpoint: f64,
    pub unit: String,
    pub wave: String,

    pub std_readings: [f64; 3],
    pub dut_readings: [f64; 3],
    pub std_mean: f64,
    pub dut_mean: f64,

    pub std_error: f64,
    pub true_value: f64,
    pub dut_error: f64,

    pub rule_percent: f64,
    pub rule_lsd_factor: f64,
    #[serde(default)]
    pub lsd: Option<f64>,

    pub ema_allowed: f64,
    pub delta: f64,
    pub pass: bool,
    pub ok: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SimpleCalibration {
    pub source_path: String,
    #[serde(default)]
    pub file_hash: Option<String>,
    pub instrument: InstrumentMini,
    #[serde(default)]
    pub verified_at: Option<String>,
    #[serde(default)]
    pub validated_at: Option<String>,
    pub tests: Vec<SimpleTest>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstrumentMini {
    pub code: String,
    #[serde(default)]
    pub name: Option<String>,
}
