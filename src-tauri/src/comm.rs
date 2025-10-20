use crate::comm_config::FrameConfig;
use serialport;

enum ParseState {
    SeekStart,
    InFrame(Vec<u8>),
}

// Escape helpers
fn unescape_bytes(mut it: impl Iterator<Item = u8>, cfg: &FrameConfig) -> Vec<u8> {
    let mut out = Vec::new();
    while let Some(b) = it.next() {
        if b == cfg.esc {
            if let Some(n) = it.next() {
                out.push(n ^ cfg.esc_xor);
            }
        } else {
            out.push(b);
        }
    }
    out
}

fn escape_byte(b: u8, cfg: &FrameConfig, out: &mut Vec<u8>) {
    if b == cfg.start || b == cfg.stop || b == cfg.esc {
        out.push(cfg.esc);
        out.push(b ^ cfg.esc_xor);
    } else {
        out.push(b);
    }
}

//CRC Config
fn crc8_atm(bytes: &[u8]) -> u8 {
    // poly 0x07, init 0x00, no reflect, xorout 0x00
    let mut crc: u8 = 0x00;
    for &b in bytes {
        crc ^= b;
        for _ in 0..8 {
            crc = if (crc & 0x80) != 0 {
                (crc << 1) ^ 0x07
            } else {
                crc << 1
            };
        }
    }
    crc
}

//Parser state (Read)
fn feed_bytes(
    state: &mut ParseState,
    chunk: &[u8],
    cfg: &FrameConfig,
    on_frame: &mut dyn FnMut(Vec<u8>),
) {
    let mut i = 0;
    while i < chunk.len() {
        match state {
            ParseState::SeekStart => {
                if chunk[i] == cfg.start {
                    *state = ParseState::InFrame(Vec::new());
                }
                i += 1;
            }
            ParseState::InFrame(buf) => {
                let b = chunk[i];
                i += 1;
                if b == cfg.stop {
                    // Finish: unescape, split CRC, verify, deliver
                    let data = unescape_bytes(buf.clone().into_iter(), cfg);
                    if data.len() < 1 {
                        *state = ParseState::SeekStart;
                        continue;
                    }
                    let (payload, crc) = data.split_at(data.len() - 1);
                    let calc = crc8_atm(payload); // replace with your confirmed CRC variant
                    if crc[0] == calc {
                        on_frame(payload.to_vec());
                    }
                    *state = ParseState::SeekStart;
                } else {
                    buf.push(b);
                }
            }
        }
    }
}

//Encode (Send)
fn build_and_escape(payload: &[u8], cfg: &FrameConfig) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 4);
    out.push(cfg.start);
    let crc = crc8_atm(payload); // replace when you confirm
                                 // escape payload and CRC
    for &b in payload {
        escape_byte(b, cfg, &mut out);
    }
    escape_byte(crc, cfg, &mut out);
    out.push(cfg.stop);
    out
}

// Port discovery & handshake
#[tauri::command]
pub fn list_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|v| v.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn open_and_handshake(port_name: String) -> Result<(), String> {
    let mut port = serialport::new(port_name, 115_200)
        .timeout(std::time::Duration::from_millis(200))
        .open()
        .map_err(|e| e.to_string())?;

    // Example “HELLO” payload (replace with your real command)
    let payload: Vec<u8> = vec![0x01, 0x00 /* ... your fields ... */]; // ← your spec here
    let cfg = FrameConfig {
        start: 0x01,
        stop: 0x00,
        esc: 0x02,
        esc_xor: 0x20,
        crc8_poly: 0x07,
        crc_init: 0x00,
        crc_final_xor: 0x00,
    };
    let frame = build_and_escape(&payload, &cfg);
    port.write_all(&frame).map_err(|e| e.to_string())?;

    // Read a little and feed the parser
    let mut state = ParseState::SeekStart;
    let mut buf = [0u8; 512];
    let mut on_frame = |payload: Vec<u8>| {
        // Validate it’s the device we expect (e.g., version/product code in fields)
    };
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_millis(500) {
        if let Ok(n) = port.read(&mut buf) {
            feed_bytes(&mut state, &buf[..n], &cfg, &mut on_frame);
        }
    }
    Ok(())
}
