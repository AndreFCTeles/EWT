use serde::Serialize;
use std::{
    io::{Read, Write},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};

// -----------------------------------------------------------------------------
// Public state (single owner)
// -----------------------------------------------------------------------------

#[derive(Default)]
pub struct LoadBankRuntimeState {
    inner: Mutex<Option<RuntimeHandle>>,
}

struct RuntimeHandle {
    baud: u32,
    mode: RuntimeMode,
    tx: mpsc::Sender<RuntimeCmd>,
    join: thread::JoinHandle<()>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum RuntimeMode {
    Auto,
    Fixed { port_name: String },
}

impl RuntimeMode {
    fn from_port_name(port_name: &str) -> Self {
        if port_name.trim().is_empty() {
            RuntimeMode::Auto
        } else {
            RuntimeMode::Fixed {
                port_name: port_name.trim().to_string(),
            }
        }
    }

    fn key(&self) -> String {
        match self {
            RuntimeMode::Auto => "auto".to_string(),
            RuntimeMode::Fixed { port_name } => format!("fixed:{port_name}"),
        }
    }
}

enum RuntimeCmd {
    Stop,
    SetMode(RuntimeMode),
    SetPolling {
        enabled: bool,
        interval_ms: u64,
    },
    /// Sends raw bytes as-is (used by DevEchoPcbTest).
    WriteRaw(Vec<u8>),
    /// Production command: set contactors mask, backend builds frame.
    SetContactors(u16),
}

// -----------------------------------------------------------------------------
// Payloads (events + query)
// -----------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PortsEvent {
    pub ports: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadBankStatus {
    pub port_name: String,
    pub version: u8,
    pub bank_power: u16,
    pub bank_no: u8,
    pub handshake: u8,
    pub contactors_mask: u16,
    pub err_contactors: u16,
    pub err_fans: u16,
    pub err_thermals: u16,
    pub other_errors: u8,
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

// -----------------------------------------------------------------------------
// Protocol constants + helpers
// -----------------------------------------------------------------------------

// 15 bytes total:
// [0..13] payload (14 bytes), [14] CRC
const LB_FRAME_LEN: usize = 15;

// OLD Handshake rules:
// - send a byte frame where a specific byte is 0x00
// - device replies with same frame but that byte becomes 0xFF
// NEW Handshake rules:
// - Device sends HELLO repeatedly until it receives ACK.
// - After ACK, device replies with CONFIRM and then becomes mostly silent.
const HANDSHAKE_BYTE_INDEX: usize = 4; // default = handshake
                                       //const HANDSHAKE_REQ_VALUE: u8 = 0x00;
                                       //const HANDSHAKE_RESP_VALUE: u8 = 0x00; // 0xFF - OLD
const HANDSHAKE_HELLO_VALUE: u8 = 0xFF; // device -> app (hello / not paired)
const HANDSHAKE_ACK_VALUE: u8 = 0x00; // app -> device (ack / pair)
const HANDSHAKE_CONFIRM_VALUE: u8 = 0x00; // device -> app (confirm / paired)

// offline_after kept for future keepalive-based offline detection (currently unused)
const DEFAULT_SCAN_EVERY_MS: u64 = 600;
//const DEFAULT_OFFLINE_AFTER_MS: u64 = 900;
const DEFAULT_READ_TIMEOUT_MS: u64 = 30;

// Dallas/Maxim CRC8
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

fn crc8_load_bank(frame: &[u8]) -> u8 {
    let mut crc: u8 = 0;
    for i in 0..(LB_FRAME_LEN - 1) {
        crc = CRC8_TABLE[(crc ^ frame[i]) as usize];
    }
    crc
}

fn to_hex(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn u16_from_be(hi: u8, lo: u8) -> u16 {
    ((hi as u16) << 8) | (lo as u16)
}

fn u16_to_be(v: u16) -> (u8, u8) {
    ((v >> 8) as u8, (v & 0xFF) as u8)
}

#[derive(Clone, Debug, Default)]
struct FrameFields {
    version: u8,
    bank_power: u16,
    bank_no: u8,
    handshake: u8,
    contactors_mask: u16,
    err_contactors: u16,
    err_fans: u16,
    err_thermals: u16,
    other_errors: u8,
}

fn build_frame(f: &FrameFields) -> [u8; LB_FRAME_LEN] {
    let mut out = [0u8; LB_FRAME_LEN];
    out[0] = f.version;
    let (p_hi, p_lo) = u16_to_be(f.bank_power);
    out[1] = p_hi;
    out[2] = p_lo;
    out[3] = f.bank_no;
    out[4] = f.handshake;
    let (c_hi, c_lo) = u16_to_be(f.contactors_mask);
    out[5] = c_hi;
    out[6] = c_lo;
    let (ec_hi, ec_lo) = u16_to_be(f.err_contactors);
    out[7] = ec_hi;
    out[8] = ec_lo;
    let (ef_hi, ef_lo) = u16_to_be(f.err_fans);
    out[9] = ef_hi;
    out[10] = ef_lo;
    let (et_hi, et_lo) = u16_to_be(f.err_thermals);
    out[11] = et_hi;
    out[12] = et_lo;
    out[13] = f.other_errors;
    out[14] = crc8_load_bank(&out);
    out
}

fn parse_frame(frame: &[u8], port_name: &str) -> Option<LoadBankStatus> {
    if frame.len() != LB_FRAME_LEN {
        return None;
    }
    if frame[LB_FRAME_LEN - 1] != crc8_load_bank(frame) {
        return None;
    }
    Some(LoadBankStatus {
        port_name: port_name.to_string(),
        version: frame[0],
        bank_power: u16_from_be(frame[1], frame[2]),
        bank_no: frame[3],
        handshake: frame[4],
        contactors_mask: u16_from_be(frame[5], frame[6]),
        err_contactors: u16_from_be(frame[7], frame[8]),
        err_fans: u16_from_be(frame[9], frame[10]),
        err_thermals: u16_from_be(frame[11], frame[12]),
        other_errors: frame[13],
        raw_frame_hex: to_hex(frame),
    })
}

fn find_first_valid_frame(buf: &[u8]) -> Option<(usize, [u8; LB_FRAME_LEN])> {
    if buf.len() < LB_FRAME_LEN {
        return None;
    }
    let max_i = buf.len() - LB_FRAME_LEN;
    for i in 0..=max_i {
        let slice = &buf[i..i + LB_FRAME_LEN];
        if slice[LB_FRAME_LEN - 1] == crc8_load_bank(slice) {
            let mut arr = [0u8; LB_FRAME_LEN];
            arr.copy_from_slice(slice);
            return Some((i, arr));
        }
    }
    None
}

fn list_port_names_sorted() -> Vec<String> {
    let mut out = serialport::available_ports()
        .map(|v| v.into_iter().map(|p| p.port_name).collect::<Vec<_>>())
        .unwrap_or_default();
    out.sort();
    out
}

// -----------------------------------------------------------------------------
// Worker
// -----------------------------------------------------------------------------

struct Worker {
    app: AppHandle,
    baud: u32,

    mode: RuntimeMode,
    active_port: Option<String>,
    port: Option<Box<dyn serialport::SerialPort>>,

    // RX parsing
    buf: Vec<u8>,
    tmp: [u8; 512],

    // health
    online: bool,
    last_seen: Instant,

    // scan / retry
    last_scan: Instant,
    last_ports: Vec<String>,
    scan_every: Duration,
    //offline_after: Duration, // offline_after kept for future keepalive-based offline detection (currently unused)

    // handshake
    //handshake_req: [u8; LB_FRAME_LEN],
    //handshake_resp: [u8; LB_FRAME_LEN],
    handshake_ack_template: [u8; LB_FRAME_LEN], // generic ACK frame (byte4=0x00); we often derive ACK from a hello frame though

    // polling
    poll_enabled: bool,
    poll_interval: Duration,
    last_poll: Instant,

    // last known status (for building commands)
    last_status_fields: Option<FrameFields>,
}

impl Worker {
    fn new(app: AppHandle, baud: u32, mode: RuntimeMode) -> Self {
        let mut req_fields = FrameFields::default();
        req_fields.version = 1;
        //let mut handshake_req = build_frame(&req_fields);
        let mut handshake_ack_template = build_frame(&req_fields);
        // Apply handshake byte at the configured index (then recompute CRC)
        if HANDSHAKE_BYTE_INDEX < LB_FRAME_LEN - 1 {
            //handshake_req[HANDSHAKE_BYTE_INDEX] = HANDSHAKE_REQ_VALUE;
            //handshake_req[LB_FRAME_LEN - 1] = crc8_load_bank(&handshake_req);
            handshake_ack_template[HANDSHAKE_BYTE_INDEX] = HANDSHAKE_ACK_VALUE;
            handshake_ack_template[LB_FRAME_LEN - 1] = crc8_load_bank(&handshake_ack_template);
        }

        /*
        let mut handshake_resp = handshake_req;
        if HANDSHAKE_BYTE_INDEX < LB_FRAME_LEN - 1 {
            handshake_resp[HANDSHAKE_BYTE_INDEX] = HANDSHAKE_RESP_VALUE;
            handshake_resp[LB_FRAME_LEN - 1] = crc8_load_bank(&handshake_resp);
        }
        */

        Self {
            app,
            baud,
            mode,
            active_port: None,
            port: None,
            buf: Vec::with_capacity(4096),
            tmp: [0u8; 512],
            online: false,
            last_seen: Instant::now(),
            last_scan: Instant::now() - Duration::from_millis(DEFAULT_SCAN_EVERY_MS),
            last_ports: vec![],
            scan_every: Duration::from_millis(DEFAULT_SCAN_EVERY_MS),
            //offline_after: Duration::from_millis(DEFAULT_OFFLINE_AFTER_MS),
            //handshake_req,
            //handshake_resp,
            handshake_ack_template,
            poll_enabled: false, //true,
            poll_interval: Duration::from_millis(400),
            last_poll: Instant::now(),
            last_status_fields: None,
        }
    }

    fn emit_health(&self, online: bool, reason: Option<String>) {
        let port_name = self.active_port.clone().unwrap_or_default();
        let _ = self.app.emit(
            "lb/health",
            LoadBankHealth {
                port_name,
                online,
                last_seen_ms: self.last_seen.elapsed().as_millis(),
                reason,
            },
        );
    }

    fn emit_ports_if_changed(&mut self) {
        let ports = list_port_names_sorted();
        if ports != self.last_ports {
            self.last_ports = ports.clone();
            eprintln!("[LB] ports: {:?}", ports);
            let _ = self.app.emit("lb/ports", PortsEvent { ports });
        }
    }

    fn set_mode(&mut self, mode: RuntimeMode) {
        if self.mode == mode {
            return;
        }
        eprintln!("[LB] mode change: {} -> {}", self.mode.key(), mode.key());
        self.mode = mode;
        self.drop_port(Some("mode changed".into()));
    }

    fn set_polling(&mut self, enabled: bool, interval_ms: u64) {
        self.poll_enabled = enabled;
        self.poll_interval = Duration::from_millis(interval_ms.max(50));
        self.last_poll = Instant::now();
    }

    fn drop_port(&mut self, reason: Option<String>) {
        if self.online {
            self.emit_health(false, reason.or(Some("disconnected".into())));
        }
        self.port = None;
        self.active_port = None;
        self.online = false;
        self.buf.clear();
        self.last_status_fields = None;
    }

    fn send_tx(&mut self, bytes: &[u8]) {
        let Some(p) = self.port.as_mut() else { return };
        let port_name = self.active_port.clone().unwrap_or_default();

        let _ = p.write_all(bytes);
        let _ = p.flush();

        let _ = self.app.emit(
            "lb/tx",
            SerialTxChunk {
                port_name: port_name.clone(),
                bytes: bytes.to_vec(),
                hex: to_hex(bytes),
            },
        );
        eprintln!("[LB/TX] {} {}", port_name, to_hex(bytes));
    }

    fn emit_rx(&self, port_name: &str, bytes: &[u8]) {
        let _ = self.app.emit(
            "lb/rx",
            SerialRxChunk {
                port_name: port_name.to_string(),
                bytes: bytes.to_vec(),
                hex: to_hex(bytes),
            },
        );
        eprintln!("[LB/RX] {} {}", port_name, to_hex(bytes));
    }

    fn open_port(&self, port_name: &str) -> Result<Box<dyn serialport::SerialPort>, String> {
        serialport::new(port_name, self.baud)
            .timeout(Duration::from_millis(DEFAULT_READ_TIMEOUT_MS))
            .open()
            .map_err(|e| e.to_string())
    }

    /*
    fn handshake_on_opened_port(
        &mut self,
        port_name: &str,
        p: &mut Box<dyn serialport::SerialPort>,
    ) -> bool {
        // send handshake request
        let req = self.handshake_req;
        let resp = self.handshake_resp;

        let _ = p.write_all(&req);
        let _ = p.flush();

        // read window
        let deadline = Instant::now() + Duration::from_millis(250);
        let mut probe_buf: Vec<u8> = Vec::with_capacity(1024);
        let mut tmp = [0u8; 256];

        while Instant::now() < deadline {
            match p.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    let chunk = &tmp[..n];
                    probe_buf.extend_from_slice(chunk);
                    self.emit_rx(port_name, chunk);

                    // scan for any valid frames; accept when we see the exact handshake response
                    loop {
                        let Some((off, frame)) = find_first_valid_frame(&probe_buf) else {
                            break;
                        };
                        let end = off + LB_FRAME_LEN;
                        if end > probe_buf.len() {
                            break;
                        }

                        // consume up to end so we can keep scanning in the same window
                        probe_buf.drain(0..end);

                        if frame == resp {
                            return true;
                        }
                    }

                    if probe_buf.len() > 4096 {
                        let keep = 1024usize;
                        let drop_n = probe_buf.len().saturating_sub(keep);
                        if drop_n > 0 {
                            probe_buf.drain(0..drop_n);
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }

        false
    }
    */
    // device-first handshake:
    // 1) listen briefly for HELLO (byte4=0xFF) OR CONFIRM (byte4=0x00)
    // 2) send ACK (byte4=0x00)
    // 3) wait for CONFIRM (byte4=0x00)
    /*
    fn handshake_on_opened_port(
        &mut self,
        port_name: &str,
        p: &mut Box<dyn serialport::SerialPort>,
    ) -> Option<LoadBankStatus> {
        let hello_window = Duration::from_millis(250);
        let confirm_window = Duration::from_millis(250);

        let mut probe_buf: Vec<u8> = Vec::with_capacity(1024);
        let mut tmp = [0u8; 256];

        // --- Step 1: listen for HELLO/CONFIRM briefly (read-only) ---
        let t0 = Instant::now();
        let mut hello_frame: Option<[u8; LB_FRAME_LEN]> = None;
        let mut confirm_frame: Option<[u8; LB_FRAME_LEN]> = None;

        while t0.elapsed() < hello_window {
            match p.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    let chunk = &tmp[..n];
                    probe_buf.extend_from_slice(chunk);
                    self.emit_rx(port_name, chunk);

                    while let Some((off, frame)) = find_first_valid_frame(&probe_buf) {
                        let end = off + LB_FRAME_LEN;
                        if end > probe_buf.len() {
                            break;
                        }
                        probe_buf.drain(0..end);

                        // Inspect handshake byte
                        match frame[HANDSHAKE_BYTE_INDEX] {
                            HANDSHAKE_HELLO_VALUE => {
                                hello_frame = Some(frame);
                                // We can stop early; we have hello.
                                break;
                            }
                            HANDSHAKE_CONFIRM_VALUE => {
                                // Device already paired (or already confirming). This is sufficient evidence too.
                                confirm_frame = Some(frame);
                                break;
                            }
                            _ => {
                                // ignore other frames during handshake
                            }
                        }
                    }

                    if hello_frame.is_some() || confirm_frame.is_some() {
                        break;
                    }

                    if probe_buf.len() > 4096 {
                        let keep = 1024usize;
                        let drop_n = probe_buf.len().saturating_sub(keep);
                        if drop_n > 0 {
                            probe_buf.drain(0..drop_n);
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }

        // --- Step 2: send ACK (0x00). Prefer deriving ACK from hello/confirm frame. ---
        let ack = if let Some(f) = hello_frame {
            Self::ack_from_frame(f)
        } else if let Some(f) = confirm_frame {
            Self::ack_from_frame(f)
        } else {
            // fallback: generic ack template
            self.handshake_ack_template
        };

        let _ = p.write_all(&ack);
        let _ = p.flush();
        eprintln!("[LB] handshake ACK -> {} {}", port_name, to_hex(&ack));

        // --- Step 3: wait for CONFIRM (0x00) ---
        let t1 = Instant::now();
        while t1.elapsed() < confirm_window {
            match p.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    let chunk = &tmp[..n];
                    probe_buf.extend_from_slice(chunk);
                    self.emit_rx(port_name, chunk);

                    while let Some((off, frame)) = find_first_valid_frame(&probe_buf) {
                        let end = off + LB_FRAME_LEN;
                        if end > probe_buf.len() {
                            break;
                        }
                        probe_buf.drain(0..end);

                        if frame[HANDSHAKE_BYTE_INDEX] == HANDSHAKE_CONFIRM_VALUE {
                            // Great: handshake confirmed.
                            // Parse this frame as a status snapshot to seed UI.
                            if let Some(status) = parse_frame(&frame, port_name) {
                                return Some(status);
                            } else {
                                // CRC valid already; parse_frame should not fail, but keep safe
                                return Some(LoadBankStatus {
                                    port_name: port_name.to_string(),
                                    version: frame[0],
                                    bank_power: u16_from_be(frame[1], frame[2]),
                                    bank_no: frame[3],
                                    handshake: frame[4],
                                    contactors_mask: u16_from_be(frame[5], frame[6]),
                                    err_contactors: u16_from_be(frame[7], frame[8]),
                                    err_fans: u16_from_be(frame[9], frame[10]),
                                    err_thermals: u16_from_be(frame[11], frame[12]),
                                    other_errors: frame[13],
                                    raw_frame_hex: to_hex(&frame),
                                });
                            }
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }

        None
    }*/
    fn handshake_on_opened_port(
        &mut self,
        port_name: &str,
        p: &mut Box<dyn serialport::SerialPort>,
    ) -> Option<LoadBankStatus> {
        let hello_window = Duration::from_millis(300);
        let confirm_window = Duration::from_millis(300);

        let mut probe_buf: Vec<u8> = Vec::with_capacity(1024);
        let mut tmp = [0u8; 256];

        // 1) WAIT FOR HELLO (0xFF at byte 4). READ-ONLY.
        let t0 = Instant::now();
        let mut hello_frame: Option<[u8; LB_FRAME_LEN]> = None;

        while t0.elapsed() < hello_window {
            match p.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    let chunk = &tmp[..n];
                    probe_buf.extend_from_slice(chunk);
                    self.emit_rx(port_name, chunk);

                    while let Some((off, frame)) = find_first_valid_frame(&probe_buf) {
                        let end = off + LB_FRAME_LEN;
                        if end > probe_buf.len() {
                            break;
                        }
                        probe_buf.drain(0..end);

                        if frame[HANDSHAKE_BYTE_INDEX] == HANDSHAKE_HELLO_VALUE {
                            hello_frame = Some(frame);
                            break;
                        }
                    }

                    if hello_frame.is_some() {
                        break;
                    }

                    // cap growth during probe
                    if probe_buf.len() > 4096 {
                        let keep = 1024usize;
                        let drop_n = probe_buf.len().saturating_sub(keep);
                        if drop_n > 0 {
                            probe_buf.drain(0..drop_n);
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }

        // STRICT: if we didn't see HELLO, do NOT send anything.
        let hello = hello_frame?;

        // 2) SEND ACK derived from HELLO (0x00 at byte 4).
        let ack = Self::ack_from_frame(hello);
        let _ = p.write_all(&ack);
        let _ = p.flush();
        eprintln!("[LB] handshake ACK -> {} {}", port_name, to_hex(&ack));

        // Clear buffer so leftover HELLO spam doesn't drown confirm scanning.
        probe_buf.clear();

        // 3) WAIT FOR CONFIRM (0x00 at byte 4).
        let t1 = Instant::now();
        while t1.elapsed() < confirm_window {
            match p.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    let chunk = &tmp[..n];
                    probe_buf.extend_from_slice(chunk);
                    self.emit_rx(port_name, chunk);

                    while let Some((off, frame)) = find_first_valid_frame(&probe_buf) {
                        let end = off + LB_FRAME_LEN;
                        if end > probe_buf.len() {
                            break;
                        }
                        probe_buf.drain(0..end);

                        if frame[HANDSHAKE_BYTE_INDEX] == HANDSHAKE_CONFIRM_VALUE {
                            // Seed UI with this frame as status
                            return parse_frame(&frame, port_name).or_else(|| {
                                Some(LoadBankStatus {
                                    port_name: port_name.to_string(),
                                    version: frame[0],
                                    bank_power: u16_from_be(frame[1], frame[2]),
                                    bank_no: frame[3],
                                    handshake: frame[4],
                                    contactors_mask: u16_from_be(frame[5], frame[6]),
                                    err_contactors: u16_from_be(frame[7], frame[8]),
                                    err_fans: u16_from_be(frame[9], frame[10]),
                                    err_thermals: u16_from_be(frame[11], frame[12]),
                                    other_errors: frame[13],
                                    raw_frame_hex: to_hex(&frame),
                                })
                            });
                        }
                    }
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }

        None
    }

    fn ensure_connected(&mut self) {
        if self.port.is_some() {
            return;
        }

        // throttle scanning
        if self.last_scan.elapsed() < self.scan_every {
            return;
        }
        self.last_scan = Instant::now();

        self.emit_ports_if_changed();

        //match &self.mode {
        let mode = self.mode.clone();
        match mode {
            //RuntimeMode::Fixed { port_name } => match self.open_port(port_name) {
            RuntimeMode::Fixed { port_name } => match self.open_port(&port_name) {
                Ok(mut p) => {
                    eprintln!("[LB] opened fixed {} @ {}", port_name, self.baud);
                    /*if self.handshake_on_opened_port(&port_name, &mut p) {
                        eprintln!("[LB] handshake OK on {}", port_name);
                        self.active_port = Some(port_name.clone());
                        self.port = Some(p);
                        self.online = true;
                        self.last_seen = Instant::now();
                        self.emit_health(true, Some("handshake ok".into()));
                    } else {
                        eprintln!("[LB] handshake FAILED on {}", port_name);
                        self.emit_health(false, Some("handshake failed".into()));
                    }*/
                    if let Some(status) = self.handshake_on_opened_port(&port_name, &mut p) {
                        eprintln!("[LB] handshake OK on {}", port_name);
                        self.active_port = Some(port_name.clone());
                        self.port = Some(p);
                        self.online = true;
                        self.last_seen = Instant::now();
                        self.emit_health(true, Some("handshake ok".into()));

                        // Seed status immediately (important if device goes silent after handshake)
                        self.last_status_fields = Some(FrameFields {
                            version: status.version,
                            bank_power: status.bank_power,
                            bank_no: status.bank_no,
                            handshake: status.handshake,
                            contactors_mask: status.contactors_mask,
                            err_contactors: status.err_contactors,
                            err_fans: status.err_fans,
                            err_thermals: status.err_thermals,
                            other_errors: status.other_errors,
                        });

                        let _ = self.app.emit("lb/status", status);
                    } else {
                        eprintln!("[LB] handshake FAILED on {}", port_name);
                        self.emit_health(false, Some("handshake failed".into()));
                    }
                }
                Err(e) => {
                    self.emit_health(false, Some(format!("open failed: {e}")));
                }
            },
            RuntimeMode::Auto => {
                let ports = self.last_ports.clone();
                for cand in ports {
                    let Ok(mut p) = self.open_port(&cand) else {
                        continue;
                    };
                    if let Some(status) = self.handshake_on_opened_port(&cand, &mut p) {
                        //if self.handshake_on_opened_port(&cand, &mut p) {
                        eprintln!("[LB] adopted {}", cand);
                        self.active_port = Some(cand);
                        self.port = Some(p);
                        self.online = true;
                        self.last_seen = Instant::now();
                        self.emit_health(true, Some("handshake ok".into()));

                        // Seed status immediately (important if device goes silent after handshake)
                        self.last_status_fields = Some(FrameFields {
                            version: status.version,
                            bank_power: status.bank_power,
                            bank_no: status.bank_no,
                            handshake: status.handshake,
                            contactors_mask: status.contactors_mask,
                            err_contactors: status.err_contactors,
                            err_fans: status.err_fans,
                            err_thermals: status.err_thermals,
                            other_errors: status.other_errors,
                        });

                        let _ = self.app.emit("lb/status", status);
                        break;
                    }
                }
            }
        }
    }

    fn poll_if_due(&mut self) {
        if !self.poll_enabled {
            return;
        }
        if self.port.is_none() {
            return;
        }
        if self.last_poll.elapsed() < self.poll_interval {
            return;
        }
        // Keepalive = handshake request // NEW Keepalive = send ACK (0x00) as a ping
        //self.send_tx(&self.handshake_req);
        //let req = self.handshake_ack_template; //handshake_req;
        //self.send_tx(&req);

        let ack = self.handshake_ack_template;
        self.send_tx(&ack);
        self.last_poll = Instant::now();
    }

    fn read_once(&mut self) {
        let Some(p) = self.port.as_mut() else { return };
        let Some(port_name) = self.active_port.clone() else {
            return;
        };

        match p.read(&mut self.tmp) {
            Ok(n) if n > 0 => {
                let chunk = &self.tmp[..n];
                self.buf.extend_from_slice(chunk);
                self.emit_rx(&port_name, chunk);
            }
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                eprintln!("[LB] read error on {}: {}", port_name, e);
                self.drop_port(Some(format!("read error: {e}")));
            }
        }
    }

    fn parse_frames(&mut self) {
        let Some(port_name) = self.active_port.clone() else {
            return;
        };

        while let Some((offset, frame)) = find_first_valid_frame(&self.buf) {
            let end = offset + LB_FRAME_LEN;
            if end > self.buf.len() {
                break;
            }

            // consume bytes up to end of frame
            self.buf.drain(0..end);

            // ignore handshake response frames
            /*if frame == self.handshake_ack_template {
                //handshake_resp {
                self.last_seen = Instant::now();
                continue;
            } */
            // If device starts sending HELLO again while connected, it likely reset.
            // Re-ACK it and keep the port.
            if frame[HANDSHAKE_BYTE_INDEX] == HANDSHAKE_HELLO_VALUE {
                eprintln!(
                    "[LB] hello detected while connected on {} -> re-ack",
                    port_name
                );

                // derive ack from hello frame and send
                let ack = Self::ack_from_frame(frame);
                self.send_tx(&ack);

                self.last_seen = Instant::now();
                continue;
            }

            let Some(status) = parse_frame(&frame, &port_name) else {
                continue;
            };

            self.last_seen = Instant::now();
            if !self.online {
                self.online = true;
                self.emit_health(true, None);
            }

            self.last_status_fields = Some(FrameFields {
                version: status.version,
                bank_power: status.bank_power,
                bank_no: status.bank_no,
                handshake: status.handshake,
                contactors_mask: status.contactors_mask,
                err_contactors: status.err_contactors,
                err_fans: status.err_fans,
                err_thermals: status.err_thermals,
                other_errors: status.other_errors,
            });

            let _ = self.app.emit("lb/status", status);
        }

        // cap buffer growth
        if self.buf.len() > 8192 {
            let keep = 2048usize;
            let drop_n = self.buf.len().saturating_sub(keep);
            if drop_n > 0 {
                self.buf.drain(0..drop_n);
            }
        }
    }

    /*
    fn is_valid_frame(frame: &[u8]) -> bool {
        frame.len() == LB_FRAME_LEN && frame[LB_FRAME_LEN - 1] == crc8_load_bank(frame)
    }
    */

    fn ack_from_frame(mut frame: [u8; LB_FRAME_LEN]) -> [u8; LB_FRAME_LEN] {
        // Convert any valid frame into an ACK by forcing byte4=0x00 and recomputing CRC.
        if HANDSHAKE_BYTE_INDEX < LB_FRAME_LEN - 1 {
            frame[HANDSHAKE_BYTE_INDEX] = HANDSHAKE_ACK_VALUE;
            frame[LB_FRAME_LEN - 1] = crc8_load_bank(&frame);
        }
        frame
    }

    /*
    fn handshake_byte(frame: &[u8]) -> Option<u8> {
        if frame.len() != LB_FRAME_LEN {
            return None;
        }
        Some(frame[HANDSHAKE_BYTE_INDEX])
    }
    */

    fn offline_check(&mut self) {
        /*
        if self.port.is_none() {
            return;
        }
        if self.last_seen.elapsed() > self.offline_after {
            eprintln!("[LB] offline: no frames on {:?}", self.active_port);
            self.drop_port(Some("no frames".into()));
        }
        */
        // Device may be silent after handshake. "No frames" is NOT a disconnect signal.
        // We only drop the port on read/write errors (handled elsewhere),
        // or on explicit keepalive failure if you enable it.

        // ---------------- KEEPALIVE (optional) ----------------
        // If you later implement keepalive, do NOT use last_seen alone.
        // Track keepalive misses instead:
        //
        // if self.keepalive_enabled && self.awaiting_keepalive && Instant::now() > self.keepalive_deadline {
        //     self.keepalive_misses += 1;
        //     self.awaiting_keepalive = false;
        //     if self.keepalive_misses >= self.keepalive_miss_limit {
        //         self.drop_port(Some("keepalive failed".into()));
        //     }
        // }
    }

    fn cmd_set_contactors(&mut self, mask: u16) {
        // build from last known status if available, else from defaults
        let mut f = self.last_status_fields.clone().unwrap_or_else(|| {
            let mut d = FrameFields::default();
            d.version = 1;
            d
        });

        // Ensure command frames are in "paired" mode
        f.handshake = HANDSHAKE_ACK_VALUE; // 0x00

        f.contactors_mask = mask;
        f.err_contactors = 0;
        f.err_fans = 0;
        f.err_thermals = 0;
        f.other_errors = 0;

        let frame = build_frame(&f);
        self.send_tx(&frame);
    }
}

// -----------------------------------------------------------------------------
// Commands
// -----------------------------------------------------------------------------

#[tauri::command]
pub fn list_ports_detailed() -> Vec<SerialPortInfo> {
    let ports = match serialport::available_ports() {
        Ok(p) => p,
        Err(_) => return vec![],
    };

    ports
        .into_iter()
        .map(|p| match p.port_type {
            serialport::SerialPortType::UsbPort(info) => SerialPortInfo {
                port_name: p.port_name,
                port_type: "usb".into(),
                vid: Some(info.vid),
                pid: Some(info.pid),
                serial_number: info.serial_number,
                manufacturer: info.manufacturer,
                product: info.product,
            },
            serialport::SerialPortType::BluetoothPort => SerialPortInfo {
                port_name: p.port_name,
                port_type: "bluetooth".into(),
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
            },
            serialport::SerialPortType::PciPort => SerialPortInfo {
                port_name: p.port_name,
                port_type: "pci".into(),
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
            },
            serialport::SerialPortType::Unknown => SerialPortInfo {
                port_name: p.port_name,
                port_type: "unknown".into(),
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
            },
        })
        .collect()
}

/// Start the backend supervisor.
/// - `port_name` empty => AUTO scan + adopt.
/// - `port_name` non-empty => FIXED.
#[tauri::command]
pub fn lb_start_polling(
    app: AppHandle,
    state: State<LoadBankRuntimeState>,
    port_name: String,
    baud: u32,
) -> Result<(), String> {
    let requested_mode = RuntimeMode::from_port_name(&port_name);

    // If running with same baud, just switch mode. | idempotent
    {
        let guard = state.inner.lock().unwrap();
        if let Some(h) = guard.as_ref() {
            if h.baud == baud && h.mode == requested_mode {
                let _ = h.tx.send(RuntimeCmd::SetMode(requested_mode.clone()));
                return Ok(());
            }
        }
    }

    // Different baud / not running => stop old and start new
    if let Some(old) = state.inner.lock().unwrap().take() {
        let _ = old.tx.send(RuntimeCmd::Stop);
        let _ = old.join.join();
    }

    let (tx, rx) = mpsc::channel::<RuntimeCmd>();
    let app2 = app.clone();
    let mode2 = requested_mode.clone();

    let join = thread::spawn(move || {
        let mut w = Worker::new(app2, baud, mode2);

        loop {
            // commands
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    RuntimeCmd::Stop => return,
                    RuntimeCmd::SetMode(m) => w.set_mode(m),
                    RuntimeCmd::SetPolling {
                        enabled,
                        interval_ms,
                    } => w.set_polling(enabled, interval_ms),
                    RuntimeCmd::WriteRaw(bytes) => w.send_tx(&bytes),
                    RuntimeCmd::SetContactors(mask) => w.cmd_set_contactors(mask),
                }
            }

            // supervisor tick
            w.ensure_connected();
            w.poll_if_due();
            w.read_once();
            w.parse_frames();
            w.offline_check();

            // avoid busy loop
            thread::sleep(Duration::from_millis(8));
        }
    });

    *state.inner.lock().unwrap() = Some(RuntimeHandle {
        baud,
        mode: requested_mode,
        tx,
        join,
    });

    Ok(())
}

#[tauri::command]
pub fn lb_stop_polling(state: State<LoadBankRuntimeState>) -> Result<(), String> {
    if let Some(old) = state.inner.lock().unwrap().take() {
        let _ = old.tx.send(RuntimeCmd::Stop);
        let _ = old.join.join();
    }
    Ok(())
}

#[tauri::command]
pub fn lb_set_polling(
    state: State<LoadBankRuntimeState>,
    enabled: bool,
    interval_ms: u64,
) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank runtime not running")?;
    h.tx.send(RuntimeCmd::SetPolling {
        enabled,
        interval_ms,
    })
    .map_err(|_| "runtime channel closed".to_string())
}

/// Raw send (DevEchoPcbTest).
#[tauri::command]
pub fn lb_write_bytes(state: State<LoadBankRuntimeState>, data: Vec<u8>) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank runtime not running")?;
    h.tx.send(RuntimeCmd::WriteRaw(data))
        .map_err(|_| "runtime channel closed".to_string())
}

/// Production command: backend builds the proper frame.
#[tauri::command]
pub fn lb_set_contactors(state: State<LoadBankRuntimeState>, mask: u16) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank runtime not running")?;
    h.tx.send(RuntimeCmd::SetContactors(mask))
        .map_err(|_| "runtime channel closed".to_string())
}
