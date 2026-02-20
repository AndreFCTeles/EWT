//does this thing even talk lmao

//use encoding_rs::WINDOWS_1252;
use serde::Serialize;
use std::{
    borrow::Cow,
    io::{Read, Write},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;

pub struct SerialState {
    pub port: Mutex<Option<Box<dyn serialport::SerialPort>>>,
}

const FRAME_LEN: usize = 15;

#[derive(Serialize)]
pub struct Roundtrip {
    sent_bytes: Vec<u8>,
    recv_bytes: Vec<u8>,

    // Full-stream
    sent_hex: String,
    recv_hex: String,

    /*
    sent_ascii: String,
    recv_ascii: String,
    */
    // Protocol-shaped views
    sent_frame_hex: String,
    recv_frame_hex: String,

    sent_debug_utf8: String,
    recv_debug_utf8: String,

    sent_debug_utf8_valid: bool,
    recv_debug_utf8_valid: bool,
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

    let (sent_frame, sent_tail) = split_frame_and_tail(&data);
    let (recv_frame, recv_tail) = split_frame_and_tail(&buf);

    let (sent_debug_utf8, sent_debug_utf8_valid) = decode_utf8_with_validity(sent_tail);
    let (recv_debug_utf8, recv_debug_utf8_valid) = decode_utf8_with_validity(recv_tail);

    eprintln!(
        "[TAURI/COMM] roundtrip_bytes done: sent={:?} recv={:?}",
        data, buf
    );
    eprintln!(
        "[TAURI/COMM] [TEST] roundtrip_bytes UTF: sent={:?} recv={:?}",
        sent_debug_utf8, recv_debug_utf8
    );
    Ok(Roundtrip {
        sent_bytes: data.clone(),
        recv_bytes: buf.clone(),
        sent_hex: to_hex(&data),
        recv_hex: to_hex(&buf),
        /*
        sent_ascii: to_ascii_pretty(&data), //to_ascii_pretty(&data),
        recv_ascii: to_ascii_pretty(&buf),  //to_ascii_pretty(&buf),
        sent_debug_utf8: to_text_pretty_crlf(&data),
        recv_debug_utf8: to_text_pretty_crlf(&buf),
        */
        sent_frame_hex: to_hex(sent_frame),
        recv_frame_hex: to_hex(recv_frame),

        sent_debug_utf8,
        recv_debug_utf8,

        sent_debug_utf8_valid,
        recv_debug_utf8_valid,
    })
}

fn to_hex(data: &[u8]) -> String {
    data.iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn split_frame_and_tail(data: &[u8]) -> (&[u8], &[u8]) {
    let n = FRAME_LEN.min(data.len());
    (&data[..n], &data[n..])
}

fn decode_utf8_with_validity(bytes: &[u8]) -> (String, bool) {
    match std::str::from_utf8(bytes) {
        Ok(s) => (normalize_to_crlf(s).into_owned(), true),
        Err(_) => {
            let s: Cow<str> = String::from_utf8_lossy(bytes);
            (normalize_to_crlf(&s).into_owned(), false)
        }
    }
}

fn normalize_to_crlf(s: &str) -> Cow<'_, str> {
    if !s.contains('\n') && !s.contains('\r') {
        return Cow::Borrowed(s);
    }

    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();

    while let Some(ch) = it.next() {
        match ch {
            '\r' => {
                if matches!(it.peek(), Some('\n')) {
                    it.next();
                }
                out.push_str("\r\n");
            }
            '\n' => out.push_str("\r\n"),
            _ => out.push(ch),
        }
    }

    Cow::Owned(out)
}
