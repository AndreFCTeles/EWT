//does this thing even talk lmao

use serde::Serialize;
use std::{
    io::{Read, Write},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;

pub struct SerialState {
    pub port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
}

#[derive(Serialize)]
pub struct Roundtrip {
    sent_bytes: Vec<u8>,
    recv_bytes: Vec<u8>,
    sent_hex: String,
    recv_hex: String,
    sent_ascii: String,
    recv_ascii: String,
}

#[tauri::command]
pub fn list_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|v| v.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn connect(state: State<SerialState>, port_name: String, baud: u32) -> Result<(), String> {
    eprintln!(
        "[TAURI/COMM] connect requested: port={}, baud={}",
        port_name, baud
    );
    let port = serialport::new(&port_name, baud)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| {
            eprintln!("[TAURI/COMM] failed to open {}: {}", &port_name, e);
            e.to_string()
        })?;
    *state.port.lock().unwrap() = Some(port);
    eprintln!("[TAURI/COMM] port {} opened", &port_name);
    Ok(())
}

#[tauri::command]
pub fn close(state: State<SerialState>) {
    *state.port.lock().unwrap() = None;
}

// Send TEXT (UTF-8) and listen
#[tauri::command]
pub fn test_roundtrip_text(
    state: State<SerialState>,
    text: Vec<u8>,
    duration_ms: Option<u64>,
) -> Result<Roundtrip, String> {
    //let bytes = text.into_bytes();
    test_roundtrip_bytes(state, text, duration_ms)
}

// Send raw BYTES and listen
#[tauri::command]
pub fn test_roundtrip_bytes(
    state: State<SerialState>,
    data: Vec<u8>,
    duration_ms: Option<u64>,
) -> Result<Roundtrip, String> {
    let listen_for = Duration::from_millis(duration_ms.unwrap_or(500));
    eprintln!(
        "[TAURI/COMM] roundtrip_bytes: len={}, window={}ms",
        data.len(),
        listen_for.as_millis()
    );
    let mut guard = state.port.lock().unwrap();
    let port = guard.as_mut().ok_or("Port not open")?;

    // Drain leftovers
    let mut junk = [0u8; 256];
    while let Ok(n) = port.read(&mut junk) {
        if n == 0 {
            break;
        }
    }

    // Write
    port.write_all(&data).map_err(|e| e.to_string())?;
    let _ = port.flush();

    // Read window
    let start = Instant::now();
    let mut buf: Vec<u8> = Vec::new();
    let mut tmp = [0u8; 512];
    while start.elapsed() < listen_for {
        match port.read(&mut tmp) {
            Ok(n) if n > 0 => buf.extend_from_slice(&tmp[..n]),
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(e.to_string()),
        }
    }

    eprintln!(
        "[TAURI/COMM] roundtrip_bytes done: sent={:?} recv={:?}",
        data, buf
    );
    Ok(Roundtrip {
        sent_bytes: data.clone(),
        recv_bytes: buf.clone(),
        sent_hex: to_hex(&data),
        recv_hex: to_hex(&buf),
        sent_ascii: to_ascii_pretty(&data),
        recv_ascii: to_ascii_pretty(&buf),
    })
}

fn to_hex(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn to_ascii_pretty(data: &[u8]) -> String {
    data.iter()
        .map(|&b| match b {
            0x20..=0x7E => b as char, // printable
            b'\r' => '␍',
            b'\n' => '␊',
            _ => '·', // non-printables as dots
        })
        .collect()
}
