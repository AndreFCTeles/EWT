use std::path::PathBuf; //Path,

use calamine::{open_workbook_auto, Data, DataType as CalDataType, Range, Reader};
use chrono::{Datelike, NaiveDate, NaiveDateTime, NaiveTime, Timelike};
use rust_xlsxwriter::{ExcelDateTime, Format, Workbook}; //, Worksheet, XlsxError};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

// ===== DTOs sent to / received from the UI =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkbookDto {
    pub path: Option<String>,
    pub sheets: Vec<SheetDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetDto {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<CellValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", content = "v")]
pub enum CellValue {
    Int(i64),
    Float(f64),
    Bool(bool),
    String(String),
    Date(String),     // ISO "YYYY-MM-DD"
    Time(String),     // ISO "HH:MM:SS[.xxx]"
    DateTime(String), // ISO "YYYY-MM-DD HH:MM:SS[.xxx]"
    Empty,
}

impl CellValue {
    pub fn from_calamine<T: CalDataType>(cell: &T) -> Self {
        // Prefer temporal interpretations before raw numbers/strings.
        if let Some(dt) = cell.as_datetime() {
            return CellValue::DateTime(dt.format("%Y-%m-%d %H:%M:%S").to_string());
        }
        if let Some(d) = cell.as_date() {
            return CellValue::Date(d.format("%Y-%m-%d").to_string());
        }
        if let Some(t) = cell.as_time() {
            return CellValue::Time(t.format("%H:%M:%S").to_string());
        }
        if let Some(b) = cell.get_bool() {
            return CellValue::Bool(b);
        }
        if let Some(i) = cell.get_int() {
            return CellValue::Int(i);
        }
        if let Some(f) = cell.get_float() {
            return CellValue::Float(f);
        }
        if let Some(s) = cell.get_string() {
            return CellValue::String(s.to_string());
        }
        if let Some(s) = cell.as_string() {
            return CellValue::String(s);
        }
        CellValue::Empty
    }
}

// Helper enum to write values with rust_xlsxwriter, keeping formatting decisions localized.
/*
enum CellWrite<'a> {
    Str(&'a str),
    Num(f64),
    Bool(bool),
    Date(&'a str),
    DateTime(&'a str),
    Time(&'a str),
    Empty,
}
*/

// ===== Commands — 1) open dialog (optional), 2) parse, 3) export =====

/// 1) Let the user pick an .xlsx file.
#[tauri::command]
pub fn pick_xlsx_path(app: AppHandle) -> Result<Option<String>, String> {
    let picked: Option<FilePath> = app
        .dialog()
        .file()
        .add_filter("Excel files", &["xlsx", "xlsm", "xls"]) // extend as needed
        .blocking_pick_file();

    if let Some(fp) = picked {
        // Convert FilePath → PathBuf → String
        let pb: PathBuf = fp.into_path().map_err(|e| e.to_string())?;
        Ok(Some(pb.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

/// 2a) Open dialog then parse
#[tauri::command]
pub fn parse_xlsx_from_dialog(app: AppHandle) -> Result<WorkbookDto, String> {
    let Some(fp) = app
        .dialog()
        .file()
        .add_filter("Excel files", &["xlsx", "xlsm", "xls"])
        .blocking_pick_file()
    else {
        return Err("User canceled".into());
    };
    let path: PathBuf = fp.into_path().map_err(|e| e.to_string())?;
    parse_xlsx_path(path.to_string_lossy().as_ref())
}

/// 2b) Parse spreadsheet into a neutral DTO (one table per sheet).
#[tauri::command]
pub fn parse_xlsx_path(file_path: &str) -> Result<WorkbookDto, String> {
    let mut wb = open_workbook_auto(file_path).map_err(|e| format!("Failed to open: {e}"))?;

    // Easiest: fetch all sheets eagerly.
    let sheets: Vec<(String, Range<Data>)> = wb.worksheets();

    let mut out_sheets = Vec::with_capacity(sheets.len());
    for (name, range) in sheets.into_iter() {
        if range.is_empty() {
            out_sheets.push(SheetDto {
                name,
                headers: vec![],
                rows: vec![],
            });
            continue;
        }

        // Find the first non-empty row to use as headers.
        let mut header_row_idx: Option<usize> = None;
        for (ri, row) in range.rows().enumerate() {
            let non_empty = row
                .iter()
                .any(|c| !matches!(CellValue::from_calamine(c), CellValue::Empty));
            if non_empty {
                header_row_idx = Some(ri);
                break;
            }
        }
        let header_row_idx = header_row_idx.unwrap_or(0);

        // Collect headers (or synthesize if empty)
        let headers: Vec<String> = (0..range.width())
            .map(|c| range.get((header_row_idx, c)))
            .map(|opt| {
                opt.map(CellValue::from_calamine)
                    .unwrap_or(CellValue::Empty)
            })
            .map(|cv| match cv {
                CellValue::String(s) if !s.trim().is_empty() => s.trim().to_string(),
                CellValue::Int(i) => i.to_string(),
                CellValue::Float(f) => {
                    if (f.fract()).abs() < f64::EPSILON {
                        (f as i64).to_string()
                    } else {
                        f.to_string()
                    }
                }
                CellValue::Bool(b) => {
                    if b {
                        "TRUE".to_string()
                    } else {
                        "FALSE".to_string()
                    }
                }
                CellValue::Date(s) | CellValue::Time(s) | CellValue::DateTime(s) => s,
                _ => String::new(),
            })
            .collect();

        /*
        let headers: Vec<String> = range
            .row(header_row_idx)
            .iter()
            .map(|c| match CellValue::from_calamine(c) {
                CellValue::String(s) if !s.trim().is_empty() => s.trim().to_string(),
                CellValue::Int(i) => i.to_string(),
                CellValue::Float(f) => {
                    // avoid trailing .0 for integers
                    if (f.fract()).abs() < f64::EPSILON {
                        (f as i64).to_string()
                    } else {
                        f.to_string()
                    }
                }
                CellValue::Bool(b) => {
                    if b {
                        "TRUE".to_string()
                    } else {
                        "FALSE".to_string()
                    }
                }
                CellValue::Date(s) | CellValue::Time(s) | CellValue::DateTime(s) => s,
                _ => String::new(),
            })
            .collect();
        */

        let width = range.width();

        // Body rows: from next row onward; skip fully empty rows
        let mut body_rows: Vec<Vec<CellValue>> = Vec::new();
        for r in (header_row_idx + 1)..range.height() {
            let mut row_vals = Vec::with_capacity(width);
            for c in 0..width {
                let v = match range.get((r, c)) {
                    Some(cell) => CellValue::from_calamine(cell),
                    None => CellValue::Empty,
                };
                row_vals.push(v);
            }
            let all_empty = row_vals.iter().all(|v| matches!(v, CellValue::Empty));
            if !all_empty {
                body_rows.push(row_vals);
            }
        }

        // If the header row was empty, synthesize names.
        let headers = if headers.iter().all(|h| h.is_empty()) {
            (0..width).map(|i| format!("col_{}", i + 1)).collect()
        } else {
            headers
        };

        out_sheets.push(SheetDto {
            name,
            headers,
            rows: body_rows,
        });
    }

    Ok(WorkbookDto {
        path: Some(file_path.to_string()),
        sheets: out_sheets,
    })
}

/// 3) Create a brand new .xlsx from UI-exported data (inverse of parse).
#[tauri::command]
pub fn export_xlsx(dest_path: &str, data: WorkbookDto) -> Result<(), String> {
    let mut workbook = Workbook::new();
    // Formats
    let header_fmt = Format::new().set_bold();
    let date_fmt = Format::new().set_num_format("yyyy-mm-dd");
    let time_fmt = Format::new().set_num_format("hh:mm:ss");
    let dt_fmt = Format::new().set_num_format("yyyy-mm-dd hh:mm:ss");
    let empty_fmt = Format::new().set_background_color(rust_xlsxwriter::Color::White);

    for sheet in data.sheets.iter() {
        let ws = workbook.add_worksheet();
        // If the name is invalid/duplicate, set_name will error; fall back gracefully.
        if let Err(_e) = ws.set_name(&sheet.name) { /* keep default name */ }

        // Write headers
        for (c, h) in sheet.headers.iter().enumerate() {
            ws.write_with_format(0, c as u16, h.as_str(), &header_fmt)
                .map_err(|e| e.to_string())?;
        }

        // Write rows
        for (r, row) in sheet.rows.iter().enumerate() {
            let rr = (r as u32) + 1; // +1 header
            for (c, cell) in row.iter().enumerate() {
                let cc = c as u16;
                match cell {
                    CellValue::String(s) => ws.write_string(rr, cc, s),
                    CellValue::Int(i) => ws.write_number(rr, cc, *i as f64),
                    CellValue::Float(f) => ws.write_number(rr, cc, *f),
                    CellValue::Bool(b) => ws.write_boolean(rr, cc, *b),
                    CellValue::Date(s) => {
                        let d = parse_naive_date(s).ok_or_else(|| format!("Invalid date: {s}"))?;
                        let dt = ExcelDateTime::from_ymd(
                            d.year() as u16,
                            d.month() as u8,
                            d.day() as u8,
                        )
                        .map_err(|e| e.to_string())?;
                        ws.write_with_format(rr, cc, &dt, &date_fmt)
                    }
                    CellValue::Time(s) => {
                        let t = parse_naive_time(s).ok_or_else(|| format!("Invalid time: {s}"))?;
                        let dt = ExcelDateTime::from_hms(
                            t.hour() as u16,
                            t.minute() as u8,
                            t.second() as f64 + (t.nanosecond() as f64) / 1_000_000_000.0,
                        )
                        .map_err(|e| e.to_string())?;
                        ws.write_with_format(rr, cc, &dt, &time_fmt)
                    }
                    CellValue::DateTime(s) => {
                        let dtv = parse_naive_datetime(s)
                            .ok_or_else(|| format!("Invalid datetime: {s}"))?;
                        let mut dt = ExcelDateTime::from_ymd(
                            dtv.date().year() as u16,
                            dtv.date().month() as u8,
                            dtv.date().day() as u8,
                        )
                        .map_err(|e| e.to_string())?;
                        dt = dt
                            .and_hms(
                                dtv.time().hour() as u16,
                                dtv.time().minute() as u8,
                                dtv.time().second() as f64
                                    + (dtv.time().nanosecond() as f64) / 1_000_000_000.0,
                            )
                            .map_err(|e| e.to_string())?;
                        ws.write_with_format(rr, cc, &dt, &dt_fmt)
                    }
                    CellValue::Empty => ws.write_blank(rr, cc, &empty_fmt),
                }
                .map_err(|e| e.to_string())?;
            }
        }

        // If you want a basic filter over the whole used range:
        if !sheet.headers.is_empty() && !sheet.rows.is_empty() {
            let last_row = sheet.rows.len() as u32; // includes header at 0
            let last_col = (sheet.headers.len().saturating_sub(1)) as u16;
            let _ = ws.autofilter(0, 0, last_row, last_col); // ignore filter errors (e.g., empty ranges)
        }
    }

    workbook.save(dest_path).map_err(|e| e.to_string())
}

// ===== Parsing helpers =====

fn parse_naive_date(s: &str) -> Option<NaiveDate> {
    // Accept strictly YYYY-MM-DD
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn parse_naive_time(s: &str) -> Option<NaiveTime> {
    // Accept HH:MM[:SS[.frac]] — try a few common patterns
    NaiveTime::parse_from_str(s, "%H:%M:%S%.f")
        .or_else(|_| NaiveTime::parse_from_str(s, "%H:%M:%S"))
        .or_else(|_| NaiveTime::parse_from_str(s, "%H:%M"))
        .ok()
}

fn parse_naive_datetime(s: &str) -> Option<NaiveDateTime> {
    // Accept "YYYY-MM-DD HH:MM[:SS[.frac]]" or ISO with 'T'
    NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M"))
        .or_else(|_| NaiveDateTime::parse_from_str(&s.replace('T', " "), "%Y-%m-%d %H:%M:%S%.f"))
        .ok()
}
