use serde::Serialize;
use std::{
    io::{Read, Write},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};

// -------------------- Runtime State --------------------

#[derive(Default)]
pub struct LoadBankRuntimeState {
    inner: Mutex<Option<RuntimeHandle>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum RunMode {
    /// Keep trying to open a specific port (and recover if it disappears).
    Fixed(String),
    /// Periodically scan ports, adopt the first one that yields a valid frame.
    Auto,
}

impl RunMode {
    fn from_port_name(port_name: &str) -> Self {
        if port_name.trim().is_empty() {
            RunMode::Auto
        } else {
            RunMode::Fixed(port_name.trim().to_string())
        }
    }

    fn key(&self) -> String {
        match self {
            RunMode::Auto => "auto".to_string(),
            RunMode::Fixed(p) => format!("fixed:{p}"),
        }
    }

    fn fixed_port(&self) -> Option<&str> {
        match self {
            RunMode::Fixed(p) => Some(p.as_str()),
            RunMode::Auto => None,
        }
    }
}

struct RuntimeHandle {
    //port_name: String,
    mode_key: String,
    baud: u32,
    tx: mpsc::Sender<RuntimeCmd>,
    join: thread::JoinHandle<()>,
}
/*
enum RuntimeCmd {
    Write(Vec<u8>),
    Stop,
}
*/

enum RuntimeCmd {
    Write(Vec<u8>),
    /// Configure polling:
    /// - every_ms == 0 disables interval
    /// - frame == None disables polling write (can still be used for AUTO probe if needed)
    SetPolling {
        //enabled: bool,
        every_ms: u64,          // interval_ms: u64,
        frame: Option<Vec<u8>>, //frame: Vec<u8>,
    },
    Stop,
}

// -------------------- Payloads --------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String, // "usb" | "pci" | "bluetooth" | "unknown"
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadBankStatus {
    pub port_name: String,
    pub version: u8,
    pub bank_power: u16,
    pub bank_no: u8,
    pub bank_health: u8,
    pub contactors_mask: u16,
    pub err_contactors: u16,
    pub err_fans: u16,
    pub err_thermals: u16,
    pub other_errors: u8,
    /// Optional: raw frame bytes as hex for debugging.
    pub raw_frame_hex: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadBankHealth {
    pub port_name: String,
    pub online: bool,
    pub last_seen_ms: u128,
    pub reason: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialRxChunk {
    pub port_name: String,
    pub bytes: Vec<u8>,
    pub hex: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialTxChunk {
    pub port_name: String,
    pub bytes: Vec<u8>,
    pub hex: String,
}

// -------------------- Protocol constants --------------------

const LB_FRAME_LEN: usize = 15;

// Copy of your TS CRC8_TABLE
const CRC8_TABLE: [u8; 256] = [
    0, 94, 188, 226, 97, 63, 221, 131, 194, 156, 126, 32, 163, 253, 31, 65, 157, 195, 33, 127, 252,
    162, 64, 30, 95, 1, 227, 189, 62, 96, 130, 220, 35, 125, 159, 193, 66, 28, 254, 160, 225, 191,
    93, 3, 128, 222, 60, 98, 190, 224, 2, 92, 223, 129, 99, 61, 124, 34, 192, 158, 29, 67, 161,
    255, 70, 24, 250, 164, 39, 121, 155, 197, 132, 218, 56, 102, 229, 187, 89, 7, 219, 133, 103,
    57, 186, 228, 6, 88, 25, 71, 165, 251, 120, 38, 196, 154, 101, 59, 217, 135, 4, 90, 184, 230,
    167, 249, 27, 69, 198, 152, 122, 36, 248, 166, 68, 26, 153, 199, 37, 123, 58, 100, 134, 216,
    91, 5, 231, 185, 140, 210, 48, 110, 237, 179, 81, 15, 78, 16, 242, 172, 47, 113, 147, 205, 17,
    79, 173, 243, 112, 46, 204, 146, 211, 141, 111, 49, 178, 236, 14, 80, 175, 241, 19, 77, 206,
    144, 114, 44, 109, 51, 209, 143, 12, 82, 176, 238, 50, 108, 142, 208, 83, 13, 239, 177, 240,
    174, 76, 18, 145, 207, 45, 115, 202, 148, 118, 40, 171, 245, 23, 73, 8, 86, 180, 234, 105, 55,
    213, 139, 87, 9, 235, 181, 54, 104, 138, 212, 149, 203, 41, 119, 244, 170, 72, 22, 233, 183,
    85, 11, 136, 214, 52, 106, 43, 117, 151, 201, 74, 20, 246, 168, 116, 42, 200, 150, 21, 75, 169,
    247, 182, 232, 10, 84, 215, 137, 107, 53,
];

fn crc8_load_bank(frame: &[u8]) -> Option<u8> {
    //u8 { <- if not frame.len() check
    // may remove check for dev
    if frame.len() < LB_FRAME_LEN {
        return None;
    }
    let mut crc: u8 = 0;
    for i in 0..LB_FRAME_LEN - 1 {
        crc = CRC8_TABLE[(crc ^ frame[i]) as usize];
    }
    Some(crc) // return only "crc" if return "u8" instead of option
}
fn u16_to_bytes(hi: u8, lo: u8) -> u16 {
    let encoded = ((hi as u16) << 8) | (lo as u16);
    encoded
}

// hex converter helper
fn to_hex(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_frame(frame: &[u8], port_name: &str) -> Option<LoadBankStatus> {
    // check if this guard is intended, might prevent debug, might be necessary for prod
    if frame.len() != LB_FRAME_LEN {
        return None;
    }
    /*
    if frame[LB_FRAME_LEN - 1] != crc8_load_bank(frame) {
        return None;
    } */
    let expected = crc8_load_bank(frame)?;
    if frame[LB_FRAME_LEN - 1] != expected {
        return None;
    }

    Some(LoadBankStatus {
        port_name: port_name.to_string(),
        version: frame[0],
        bank_power: u16_to_bytes(frame[1], frame[2]),
        bank_no: frame[3],
        bank_health: frame[4],
        contactors_mask: u16_to_bytes(frame[5], frame[6]),
        err_contactors: u16_to_bytes(frame[7], frame[8]),
        err_fans: u16_to_bytes(frame[9], frame[10]),
        err_thermals: u16_to_bytes(frame[11], frame[12]),
        other_errors: frame[13],
        // OPTIONAL FULL RAW
        raw_frame_hex: to_hex(frame),
    })
}

fn find_first_valid_status(
    buf: &[u8], //buf: &mut Vec<u8>,
    port_name: &str,
) -> Option<(usize, LoadBankStatus)> {
    //Option<(Vec<u8>, LoadBankStatus)> {
    //Option<LoadBankStatus> {

    /*
    if buf.len() < LB_FRAME_LEN {
        return None;
    }
    */

    let mut i = 0usize;
    while i + LB_FRAME_LEN <= buf.len() {
        let slice = &buf[i..i + LB_FRAME_LEN];
        if let Some(status) = parse_frame(slice, port_name) {
            //buf.drain(0..i + LB_FRAME_LEN);
            return Some((i, status)); //Some(status);
        }
        i += 1;
    }
    /*
    let max_i = buf.len() - LB_FRAME_LEN;
    for i in 0..=max_i {
        let slice = &buf[i..i + LB_FRAME_LEN];
        if let Some(status) = parse_frame(slice, port_name) {
            return Some((i, status));
        }
    }
    */

    // prevent infinite growth if garbage is arriving
    /*
    if buf.len() > 4096 {
        buf.drain(0..(buf.len() - 1024));
    }
    */
    None
}

fn stop_handle(h: RuntimeHandle) {
    let _ = h.tx.send(RuntimeCmd::Stop);
    let _ = h.join.join();
}

// -------------------- Commands --------------------

#[tauri::command]
pub fn list_ports_detailed() -> Vec<SerialPortInfo> {
    let ports = match serialport::available_ports() {
        Ok(p) => p,
        Err(_) => return vec![],
    };

    ports
        .into_iter()
        //.map(|p| match p.port_type {
        .map(|p| {
            let port_name = p.port_name;
            match p.port_type {
                serialport::SerialPortType::UsbPort(info) => SerialPortInfo {
                    port_name, //: p.port_name,
                    port_type: "usb".into(),
                    vid: Some(info.vid),
                    pid: Some(info.pid),
                    serial_number: info.serial_number,
                    manufacturer: info.manufacturer,
                    product: info.product,
                },
                serialport::SerialPortType::BluetoothPort => SerialPortInfo {
                    port_name, //: p.port_name,
                    port_type: "bluetooth".into(),
                    vid: None,
                    pid: None,
                    serial_number: None,
                    manufacturer: None,
                    product: None,
                },
                serialport::SerialPortType::PciPort => SerialPortInfo {
                    port_name, //: p.port_name,
                    port_type: "pci".into(),
                    vid: None,
                    pid: None,
                    serial_number: None,
                    manufacturer: None,
                    product: None,
                },
                serialport::SerialPortType::Unknown => SerialPortInfo {
                    port_name, //: p.port_name,
                    port_type: "unknown".into(),
                    vid: None,
                    pid: None,
                    serial_number: None,
                    manufacturer: None,
                    product: None,
                },
            }
        })
        .collect()
}

// -------------------- Worker --------------------

struct Worker {
    app: AppHandle,
    baud: u32,
    mode: RunMode,

    offline_after: Duration,
    scan_every: Duration,
    probe_window: Duration,

    online: bool,
    last_seen: Instant,
    last_scan: Instant,

    active_port_name: String,
    port: Option<Box<dyn serialport::SerialPort>>,

    buf: Vec<u8>,
    tmp: [u8; 512],

    poll_every: Duration,
    poll_frame: Option<Vec<u8>>,
    last_poll: Instant,
}

impl Worker {
    fn health_port_name(&self) -> &str {
        if !self.active_port_name.is_empty() {
            &self.active_port_name
        } else if let Some(p) = self.mode.fixed_port() {
            p
        } else {
            "(auto)"
        }
    }

    fn emit_health(&self, online: bool, reason: Option<String>) {
        let _ = self.app.emit(
            "lb/health",
            LoadBankHealth {
                port_name: self.health_port_name().to_string(),
                online,
                last_seen_ms: self.last_seen.elapsed().as_millis(),
                reason,
            },
        );
    }

    fn drop_port(&mut self, reason: &str) {
        if self.port.is_some() || self.online {
            self.emit_health(false, Some(reason.to_string()));
        }
        self.online = false;
        self.port = None;
        self.active_port_name.clear();
        self.buf.clear();
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        let Some(p) = self.port.as_mut() else { return };

        if p.write_all(bytes).is_ok() {
            let _ = p.flush();
            let _ = self.app.emit(
                "lb/tx",
                SerialTxChunk {
                    port_name: self.health_port_name().to_string(),
                    bytes: bytes.to_vec(),
                    hex: to_hex(bytes),
                },
            );
            eprintln!(
                "[LB/RUNTIME] TX({}) {}",
                self.health_port_name(),
                to_hex(bytes)
            );
        }
    }

    fn ensure_port_open(&mut self) {
        if self.port.is_some() {
            return;
        }

        match self.mode.clone() {
            RunMode::Auto => {
                let _ = self.try_adopt_auto_port();
            }
            RunMode::Fixed(p) => {
                let _ = self.try_open_fixed_port(&p);
            }
        }
    }

    fn try_open_fixed_port(&mut self, fixed_port: &str) -> bool {
        if self.last_scan.elapsed() < self.scan_every {
            return false;
        }
        self.last_scan = Instant::now();

        match serialport::new(fixed_port, self.baud)
            .timeout(Duration::from_millis(20))
            .open()
        {
            Ok(p) => {
                self.active_port_name = fixed_port.to_string();
                self.port = Some(p);
                self.last_seen = Instant::now();
                self.emit_health(false, Some("connected (awaiting frames)".into()));
                eprintln!(
                    "[LB/RUNTIME] opened fixed port {} @ {}",
                    fixed_port, self.baud
                );
                true
            }
            Err(e) => {
                self.emit_health(false, Some(format!("open failed: {e}")));
                false
            }
        }
    }

    fn try_adopt_auto_port(&mut self) -> bool {
        if self.last_scan.elapsed() < self.scan_every {
            return false;
        }
        self.last_scan = Instant::now();

        let probe_frame = self.poll_frame.clone();

        let ports = match serialport::available_ports() {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[LB/RUNTIME] available_ports failed: {e}");
                return false;
            }
        };

        for pinfo in ports {
            let candidate = pinfo.port_name;

            let mut p = match serialport::new(&candidate, self.baud)
                .timeout(Duration::from_millis(20))
                .open()
            {
                Ok(p) => p,
                Err(_) => continue,
            };

            // Optional: send one poll to encourage a reply (if configured)
            if let Some(frame) = probe_frame.as_deref() {
                let _ = p.write_all(frame);
                let _ = p.flush();
                eprintln!("[LB/RUNTIME] TX(PROBE:{}) {}", candidate, to_hex(frame));
            }

            let start = Instant::now();
            let mut probe_buf: Vec<u8> = Vec::with_capacity(1024);
            let mut probe_tmp = [0u8; 256];

            while start.elapsed() < self.probe_window {
                match p.read(&mut probe_tmp) {
                    Ok(n) if n > 0 => {
                        probe_buf.extend_from_slice(&probe_tmp[..n]);

                        if let Some((offset, status)) =
                            find_first_valid_status(&probe_buf, &candidate)
                        {
                            self.active_port_name = candidate.clone();
                            self.port = Some(p);

                            // Keep leftovers after the consumed frame
                            let consume_to = offset + LB_FRAME_LEN;
                            if consume_to < probe_buf.len() {
                                self.buf.extend_from_slice(&probe_buf[consume_to..]);
                            }

                            self.last_seen = Instant::now();
                            self.online = true;
                            self.emit_health(true, None);
                            let _ = self.app.emit("lb/status", status);

                            eprintln!("[LB/RUNTIME] adopted port {}", candidate);
                            return true;
                        }

                        if probe_buf.len() > 4096 {
                            let keep = 1024.min(probe_buf.len());
                            probe_buf.drain(0..(probe_buf.len() - keep));
                        }
                    }
                    Ok(_) => {}
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                    Err(_) => break,
                }
            }
        }

        false
    }

    fn poll_if_due(&mut self) {
        if self.poll_every.as_millis() == 0 {
            return;
        }
        /*
        if self.last_poll.elapsed() >= self.poll_every {
            if let Some(frame) = self.poll_frame.as_deref() {
                self.write_bytes(frame);
            }
            self.last_poll = Instant::now();
        } */
        if self.last_poll.elapsed() < self.poll_every {
            return;
        }

        // Copy out of self so we can call &mut self methods safely
        let frame = self.poll_frame.clone(); // Option<Vec<u8>>
        if let Some(f) = frame {
            self.write_bytes(&f);
        }
    }

    fn read_once(&mut self) {
        let Some(p) = self.port.as_mut() else { return };

        match p.read(&mut self.tmp) {
            Ok(n) if n > 0 => {
                let chunk = &self.tmp[..n];
                self.buf.extend_from_slice(chunk);

                let _ = self.app.emit(
                    "lb/rx",
                    SerialRxChunk {
                        port_name: self.health_port_name().to_string(),
                        bytes: chunk.to_vec(),
                        hex: to_hex(chunk),
                    },
                );
                eprintln!(
                    "[LB/RUNTIME] RX({}) {}",
                    self.health_port_name(),
                    to_hex(chunk)
                );
            }
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                eprintln!(
                    "[LB/RUNTIME] read error on {}: {e}",
                    self.health_port_name()
                );
                self.drop_port(&format!("read error: {e}"));
            }
        }
    }

    fn parse_frames(&mut self) {
        // IMPORTANT: parse using the ACTIVE port name (not the command argument)
        while !self.active_port_name.is_empty() {
            let Some((offset, status)) = find_first_valid_status(&self.buf, &self.active_port_name)
            else {
                break;
            };

            let consume_to = offset + LB_FRAME_LEN;
            if consume_to <= self.buf.len() {
                self.buf.drain(0..consume_to);
            } else {
                // should never happen, but never panic
                self.buf.clear();
                break;
            }

            self.last_seen = Instant::now();
            if !self.online {
                self.online = true;
                self.emit_health(true, None);
            }
            let _ = self.app.emit("lb/status", status);
        }

        // prevent unbounded growth if garbage arrives
        const BUF_KEEP: usize = 2048;
        if self.buf.len() > BUF_KEEP * 4 {
            let drop = self.buf.len().saturating_sub(BUF_KEEP);
            if drop > 0 {
                self.buf.drain(0..drop);
            }
        }
    }

    fn offline_check(&mut self) {
        if self.online && self.last_seen.elapsed() > self.offline_after {
            // Policy: drop and re-open/re-scan depending on mode
            self.drop_port("no valid frames");
        }
    }
}

// -------------------- Commands --------------------
#[tauri::command]
pub fn lb_start_polling(
    app: AppHandle,
    state: State<LoadBankRuntimeState>,
    port_name: String,
    baud: u32,
) -> Result<(), String> {
    let requested_mode = RunMode::from_port_name(&port_name);
    let requested_key = requested_mode.key();

    // idempotent: already running same mode + baud
    {
        let guard = state.inner.lock().unwrap();
        if let Some(h) = guard.as_ref() {
            if h.mode_key == requested_key && h.baud == baud {
                return Ok(());
            }
        }
    }

    // stop old if different
    if let Some(old) = state.inner.lock().unwrap().take() {
        stop_handle(old);
    }

    let (tx, rx) = mpsc::channel::<RuntimeCmd>();
    let app2 = app.clone();
    let mode2 = requested_mode.clone();

    let join = thread::spawn(move || {
        let mut w = Worker {
            app: app2,
            baud,
            mode: mode2,

            offline_after: Duration::from_millis(800),
            scan_every: Duration::from_millis(500),
            probe_window: Duration::from_millis(250),

            online: false,
            last_seen: Instant::now(),
            last_scan: Instant::now() - Duration::from_millis(500),

            active_port_name: String::new(),
            port: None,

            buf: Vec::with_capacity(2048),
            tmp: [0u8; 512],

            poll_every: Duration::from_millis(0),
            poll_frame: None,
            last_poll: Instant::now(),
        };

        loop {
            // commands
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    RuntimeCmd::Write(bytes) => w.write_bytes(&bytes),
                    RuntimeCmd::SetPolling { every_ms, frame } => {
                        w.poll_frame = frame;
                        w.poll_every = Duration::from_millis(every_ms);
                        w.last_poll = Instant::now();
                    }
                    RuntimeCmd::Stop => {
                        eprintln!("[LB/RUNTIME] stop requested");
                        return;
                    }
                }
            }

            // ensure open (auto/fixed)
            w.ensure_port_open();
            if w.port.is_none() {
                // avoid busy-looping
                thread::sleep(Duration::from_millis(50));
                continue;
            }

            // poll + read + parse + offline check
            w.poll_if_due();
            w.read_once();
            w.parse_frames();
            w.offline_check();
        }
    });

    *state.inner.lock().unwrap() = Some(RuntimeHandle {
        mode_key: requested_key.clone(),
        baud,
        tx,
        join,
    });

    eprintln!("[LB/RUNTIME] started mode={} baud={}", requested_key, baud);
    Ok(())
}

#[tauri::command]
pub fn lb_stop_polling(state: State<LoadBankRuntimeState>) -> Result<(), String> {
    /*let old = state.inner.lock().unwrap().take();
    if let Some(h) = old {
        stop_handle(h);
    }*/
    if let Some(h) = state.inner.lock().unwrap().take() {
        stop_handle(h);
    }
    Ok(())
}

#[tauri::command]
pub fn lb_write_bytes(state: State<LoadBankRuntimeState>, data: Vec<u8>) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank polling not running")?;
    h.tx.send(RuntimeCmd::Write(data))
        .map_err(|_| "runtime channel closed".to_string())
}

#[tauri::command]
pub fn lb_set_polling(
    state: State<LoadBankRuntimeState>,
    //enabled: bool,
    every_ms: u64,          //interval_ms: u64,
    frame: Option<Vec<u8>>, //frame: Vec<u8>,
) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank polling not running")?;
    h.tx.send(RuntimeCmd::SetPolling {
        //enabled,
        //interval_ms,
        every_ms,
        frame,
    })
    .map_err(|_| "runtime channel closed".to_string())
}
