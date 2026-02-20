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

struct RuntimeHandle {
    port_name: String,
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
    SetPolling {
        enabled: bool,
        interval_ms: u64,
        frame: Vec<u8>,
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
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialTxChunk {
    pub port_name: String,
    pub bytes: Vec<u8>,
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

fn crc8_load_bank(frame: &[u8]) -> u8 {
    let mut crc: u8 = 0;
    for i in 0..LB_FRAME_LEN - 1 {
        crc = CRC8_TABLE[(crc ^ frame[i]) as usize];
    }
    crc
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
    /*
    if frame.len() != LB_FRAME_LEN {
        // check if this guard is intended, might prevent debug, might be necessary for prod
        return None;
    }*/
    if frame[LB_FRAME_LEN - 1] != crc8_load_bank(frame) {
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
    })
}

fn find_first_valid_status(
    buf: &[u8], //buf: &mut Vec<u8>,
    port_name: &str,
) -> Option<(usize, LoadBankStatus)> {
    //Option<(Vec<u8>, LoadBankStatus)> {
    //Option<LoadBankStatus> {

    if buf.len() < LB_FRAME_LEN {
        return None;
    }

    /*
    let mut i = 0usize;
    while i + LB_FRAME_LEN <= buf.len() {
        let slice = &buf[i..i + LB_FRAME_LEN];
        if let Some(status) = parse_frame(slice, port_name) {
            //buf.drain(0..i + LB_FRAME_LEN);
            return Some((i, status)); //Some(status);
        }
        i += 1;
    } */

    let max_i = buf.len() - LB_FRAME_LEN;
    for i in 0..=max_i {
        let slice = &buf[i..i + LB_FRAME_LEN];
        /*
        if let Some(status) = parse_frame(slice, port_name) {
            let frame = slice.to_vec();
            // "buffer draining" = discard everything we've consumed so far.
            buf.drain(0..i + LB_FRAME_LEN);
            return Some((frame, status));
        }
        */
        if let Some(status) = parse_frame(slice, port_name) {
            return Some((i, status));
        }
    }

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

#[tauri::command]
pub fn lb_start_polling(
    app: AppHandle,
    state: State<LoadBankRuntimeState>,
    port_name: String,
    baud: u32,
) -> Result<(), String> {
    // --- idempotent: if already running on same port+baud, do nothing ---
    {
        let guard = state.inner.lock().unwrap();
        if let Some(h) = guard.as_ref() {
            if h.port_name == port_name && h.baud == baud {
                return Ok(());
            }
        }
    }

    // --- if running but on different port/baud, stop and restart ---
    if let Some(old) = state.inner.lock().unwrap().take() {
        stop_handle(old);
    }
    /*
    let old = state.inner.lock().unwrap().take();
    if let Some(h) = old {
        stop_handle(h);
    }*/

    let (tx, rx) = mpsc::channel::<RuntimeCmd>();
    let app2 = app.clone();
    let port_name2 = port_name.clone();

    let join = thread::spawn(move || {
        // open port INSIDE worker so it owns it
        let mut port = match serialport::new(&port_name2, baud)
            .timeout(Duration::from_millis(20))
            .open()
        {
            Ok(p) => p,
            Err(e) => {
                let _ = app2.emit(
                    "lb/health",
                    LoadBankHealth {
                        port_name: port_name2.clone(),
                        online: false,
                        last_seen_ms: 0,
                        reason: Some(format!("open failed: {e}")),
                    },
                );
                return;
            }
        };

        eprintln!("[LB/RUNTIME] opened {} @ {}", &port_name2, baud);

        let offline_after = Duration::from_millis(800);
        let mut online = false;
        let mut last_seen = Instant::now();

        let mut buf: Vec<u8> = Vec::with_capacity(2048); //(4096); - ?
        let mut tmp = [0u8; 512]; //[0u8; 256];

        // optional polling (off by default)
        let mut poll_enabled = false;
        let mut poll_interval = Duration::from_millis(200);
        let mut poll_frame: Vec<u8> = vec![];
        let mut last_poll = Instant::now();

        // throttle raw rx emission - (so we don’t spam UI -- will probably just be deleted later)
        let mut rx_batch: Vec<u8> = Vec::with_capacity(1024);
        let mut last_rx_emit = Instant::now();

        loop {
            // process queued commands (writes / stop)
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    RuntimeCmd::Write(bytes) => {
                        //let _ = port.write_all(&bytes);

                        eprintln!("[LB/TX] {}", to_hex(&bytes));
                        let _ = app2.emit(
                            "lb/tx",
                            SerialTxChunk {
                                port_name: port_name2.clone(),
                                bytes: bytes.clone(),
                            },
                        );
                        if let Err(e) = port.write_all(&bytes) {
                            eprintln!("[LB/RUNTIME] write error: {e}");
                        }
                        let _ = port.flush();
                    }
                    RuntimeCmd::SetPolling {
                        enabled,
                        interval_ms,
                        frame,
                    } => {
                        poll_enabled = enabled;
                        poll_interval = Duration::from_millis(interval_ms.max(10));
                        poll_frame = frame;
                        last_poll = Instant::now();
                        eprintln!(
                            "[LB/RUNTIME] polling {} interval={}ms frame_len={}",
                            if poll_enabled { "ON" } else { "OFF" },
                            poll_interval.as_millis(),
                            poll_frame.len()
                        );
                    }
                    RuntimeCmd::Stop => {
                        eprintln!("[LB/RUNTIME] stopping {}", &port_name2);
                        return;
                    }
                }
            }

            // periodic poll (optional)
            if poll_enabled && last_poll.elapsed() >= poll_interval {
                last_poll = Instant::now();
                if !poll_frame.is_empty() {
                    eprintln!("[LB/TX/POLL] {}", to_hex(&poll_frame));
                    let _ = app2.emit(
                        "lb/tx",
                        SerialTxChunk {
                            port_name: port_name2.clone(),
                            bytes: poll_frame.clone(),
                        },
                    );
                    let _ = port.write_all(&poll_frame);
                    let _ = port.flush();
                }
            }

            // read
            match port.read(&mut tmp) {
                Ok(n) if n > 0 => {
                    buf.extend_from_slice(&tmp[..n]);
                    rx_batch.extend_from_slice(&tmp[..n]);
                } // buf.extend_from_slice(&tmp[..n]),
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    let _ = app2.emit(
                        "lb/health",
                        LoadBankHealth {
                            port_name: port_name2.clone(),
                            online: false,
                            last_seen_ms: last_seen.elapsed().as_millis(),
                            reason: Some(format!("read error: {e}")),
                        },
                    );
                    return;
                }
            }

            // raw rx chunk emission (optional; useful for “terminal” later)
            if !rx_batch.is_empty() && last_rx_emit.elapsed() >= Duration::from_millis(50) {
                let chunk = std::mem::take(&mut rx_batch);
                eprintln!("[LB/RX] {}", to_hex(&chunk));
                let _ = app2.emit(
                    "lb/rx",
                    SerialRxChunk {
                        port_name: port_name2.clone(),
                        bytes: chunk,
                    },
                );
                last_rx_emit = Instant::now();
            }

            // emit all valid frames found
            while let Some((offset, status)) = find_first_valid_status(&buf, &port_name2) {
                //while let Some((frame, status)) = find_first_valid_status(&buf, &port_name2) {
                //find_first_valid_status(&mut buf, &port_name2) {
                /* // drop any leading garbage (later: treat as debug text if you want) // Too much garbage collection, I assume?
                    if offset > 0 {
                        buf.drain(0..offset);
                    }
                    // now frame starts at 0
                    let frame: Vec<u8> = buf.drain(0..LB_FRAME_LEN).collect();
                */
                let end = offset + LB_FRAME_LEN;
                if end > buf.len() {
                    break;
                }

                let frame: Vec<u8> = buf[offset..end].to_vec();
                buf.drain(0..end);

                last_seen = Instant::now();
                if !online {
                    online = true;
                    let _ = app2.emit(
                        "lb/health",
                        LoadBankHealth {
                            port_name: port_name2.clone(),
                            online: true,
                            last_seen_ms: 0,
                            reason: None,
                        },
                    );
                }
                // log + emit status
                eprintln!("[LB/RUNTIME] status frame: {}", to_hex(&frame));
                let _ = app2.emit("lb/status", status);
            }

            // offline detection
            if online && last_seen.elapsed() > offline_after {
                online = false;
                let _ = app2.emit(
                    "lb/health",
                    LoadBankHealth {
                        port_name: port_name2.clone(),
                        online: false,
                        last_seen_ms: last_seen.elapsed().as_millis(),
                        reason: Some("no valid frames".into()),
                    },
                );
            }

            // prevent unbounded growth if garbage arrives
            /*
            if buf.len() > 8192 {
                //8192
                buf.drain(0..(buf.len() - 2048)); //2048
            } */
            const BUF_KEEP: usize = 2048;
            if buf.len() > BUF_KEEP * 4 {
                let drop = buf.len().saturating_sub(BUF_KEEP);
                if drop > 0 {
                    buf.drain(0..drop);
                }
            }
        }
    });

    *state.inner.lock().unwrap() = Some(RuntimeHandle {
        port_name,
        baud,
        tx,
        join,
    });
    Ok(())
}

#[tauri::command]
pub fn lb_stop_polling(state: State<LoadBankRuntimeState>) -> Result<(), String> {
    let old = state.inner.lock().unwrap().take();
    if let Some(h) = old {
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
    enabled: bool,
    interval_ms: u64,
    frame: Vec<u8>,
) -> Result<(), String> {
    let guard = state.inner.lock().unwrap();
    let h = guard.as_ref().ok_or("Load bank polling not running")?;
    h.tx.send(RuntimeCmd::SetPolling {
        enabled,
        interval_ms,
        frame,
    })
    .map_err(|_| "runtime channel closed".to_string())
}
