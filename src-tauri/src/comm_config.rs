// FrameConfig: tweak here if your spec changes
pub struct FrameConfig {
    pub start: u8,     // 0x01
    pub stop: u8,      // 0x00
    pub esc: u8,       // 0x02
    pub esc_xor: u8,   // 0x20
    pub crc8_poly: u8, // e.g., 0x07 (CRC-8/ATM) — confirm with electronics!
    pub crc_init: u8,  // e.g., 0x00
    pub crc_final_xor: u8, // e.g., 0x00
                       // which bytes are covered by CRC: typically payload (exclude start/stop & CRC)
}
