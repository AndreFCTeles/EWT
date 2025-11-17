use crate::data_structures::{InstrumentMini, SimpleCalibration, SimpleTest};
use calamine::{open_workbook, Data, Reader, Xlsx, XlsxError};
use regex::Regex;
use sha2::{Digest, Sha256};
use std::fs;

// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;| HELPERS |;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

fn to_wave_unit(unit_col: &str) -> (String, String) {
    // e.g., "A DC" -> ("dc","A"); "V AC" -> ("ac","V"); fallback "other"
    let t = unit_col.trim().to_ascii_uppercase();
    let wave = if t.contains("DC") {
        "dc"
    } else if t.contains("AC") {
        "ac"
    } else {
        "dc"
    };
    let unit = if t.contains('A') { "A" } else { "V" }; // your sheets use A/V
    (wave.into(), unit.into())
}

fn readings3(a: Option<f64>, b: Option<f64>, c: Option<f64>, fallback: f64) -> [f64; 3] {
    [
        a.unwrap_or(fallback),
        b.unwrap_or(fallback),
        c.unwrap_or(fallback),
    ]
}

fn mean3(v: &[f64]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<f64>() / (v.len() as f64)
    }
}

// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;| WORKSHEET BUILDING |;;;;;;;;;;;;;;;;;
// ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
#[tauri::command]
pub fn parse_tool_calibration(path: String) -> Result<SimpleCalibration, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(&bytes);
    let file_hash = Some(format!("{:x}", h.finalize()));

    let mut wb: Xlsx<_> = open_workbook(&path).map_err(|e: XlsxError| e.to_string())?;
    let sheet_name = wb
        .sheet_names()
        .into_iter()
        .find(|s| s.starts_with("Verif"))
        .ok_or("Folha 'Verificação' não encontrada")?
        .to_string();
    let range = wb.worksheet_range(&sheet_name).map_err(|e| e.to_string())?;
    let (nrows, ncols) = range.get_size();

    let get_s = |r: usize, c: usize| -> Option<String> {
        range.get_value((r as u32, c as u32)).and_then(|d| match d {
            Data::String(s) => Some(s.trim().to_string()),
            Data::Float(v) => Some(v.to_string()),
            Data::Int(v) => Some(v.to_string()),
            Data::Bool(b) => Some(b.to_string()),
            Data::DateTime(dt) => Some(dt.to_string()),
            _ => None,
        })
    };
    let get_f = |r: usize, c: usize| -> Option<f64> {
        range.get_value((r as u32, c as u32)).and_then(|d| match d {
            Data::Float(v) => Some(*v),
            Data::Int(v) => Some(*v as f64),
            _ => None,
        })
    };
    let find_label_right = |label: &str| -> Option<String> {
        for r in 0..(nrows as usize) {
            for c in 0..(ncols as usize) {
                if get_s(r, c).as_deref() == Some(label) {
                    return get_s(r, c + 1);
                }
            }
        }
        None
    };

    let code = find_label_right("Código interno :").unwrap_or_default();
    let name = find_label_right("Designação :").unwrap_or_default();
    let verified_at = find_label_right("Data da verificação:");
    let validated_at = find_label_right("Data de validação:");

    let classify = |title: &str| -> &str {
        let t = title.to_ascii_lowercase();
        if t.contains("(v dc)") {
            "voltage_dc"
        } else if t.contains("(v ac)") {
            "voltage_ac"
        } else if t.contains("(a dc)") {
            "current_dc"
        } else if t.contains("(a ac)") {
            "current_ac"
        } else {
            "other"
        }
    };

    let mut starts: Vec<(usize, String)> = vec![];
    for r in 0..(nrows as usize) {
        if let Some(s) = get_s(r, 1) {
            if s.starts_with("Verificação da Tensão") || s.starts_with("Verificação da Corrente")
            {
                starts.push((r, s));
            }
        }
    }

    let rule_re =
        Regex::new(r#"(?i)\|EMA\|\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s*.*?(\d+)\s*[x×]\s*LSD"#)
            .map_err(|e| e.to_string())?;

    let mut tests: Vec<SimpleTest> = vec![];

    for (start_r, title) in starts {
        let kind = classify(&title).to_string();
        let rule_line = get_s(start_r + 1, 1).unwrap_or_default();
        let (p, k) = if let Some(cap) = rule_re.captures(&rule_line) {
            let p = cap
                .get(1)
                .unwrap()
                .as_str()
                .replace(',', ".")
                .parse::<f64>()
                .unwrap_or(0.0)
                / 100.0;
            let k = cap.get(2).unwrap().as_str().parse::<f64>().unwrap_or(0.0);
            (p, k)
        } else {
            (0.0, 0.0)
        };
        let mut r = start_r + 1;

        // Seek forward to the first "Referência" row for this section
        let is_referencia = |s: &str| {
            let sl = s.to_ascii_lowercase();
            sl.starts_with("referência") || sl.starts_with("referencia") // handle missing accent
        };

        while r < (nrows as usize) {
            if let Some(s) = get_s(r, 1) {
                if is_referencia(&s) {
                    break;
                }
                // stop if we bumped into next section or global appreciation
                if s.starts_with("Verificação da ") || s == "APRECIAÇÃO GLOBAL" {
                    break;
                }
            }
            r += 1;
        }

        // rule line near section title already parsed as (p, k)
        while r + 3 < (nrows as usize) {
            let tag = get_s(r, 1).unwrap_or_default();
            if !tag.starts_with("Referência") {
                break;
            }

            // --- identity / labels
            let setpoint = get_f(r, 2)
                .or_else(|| {
                    tag.split(':')
                        .nth(1)
                        .and_then(|v| v.trim().replace(',', ".").parse::<f64>().ok())
                })
                .unwrap_or(0.0);
            let unit_col = get_s(r, 3).unwrap_or_default();
            let (wave, unit) = to_wave_unit(&unit_col);

            // --- raw readings
            let std1 = get_f(r + 1, 1);
            let std2 = get_f(r + 2, 1);
            let std3 = get_f(r + 3, 1);
            let dut1 = get_f(r + 1, 3);
            let dut2 = get_f(r + 2, 3);
            let dut3 = get_f(r + 3, 3);

            // means: prefer sheet mean (col 2/4), else from available readings
            let std_mean_sheet = get_f(r + 1, 2);
            let dut_mean_sheet = get_f(r + 1, 4);

            let std_mean_fallback = mean3(
                &[
                    std1.unwrap_or(0.0),
                    std2.unwrap_or(0.0),
                    std3.unwrap_or(0.0),
                ]
                .into_iter()
                .filter(|x| *x != 0.0)
                .collect::<Vec<_>>(),
            );
            let dut_mean_fallback = mean3(
                &[
                    dut1.unwrap_or(0.0),
                    dut2.unwrap_or(0.0),
                    dut3.unwrap_or(0.0),
                ]
                .into_iter()
                .filter(|x| *x != 0.0)
                .collect::<Vec<_>>(),
            );

            let std_mean = std_mean_sheet.unwrap_or(std_mean_fallback);
            let dut_mean = dut_mean_sheet.unwrap_or(dut_mean_fallback);

            // readings arrays (always 3; fill with mean if missing)
            let std_readings = readings3(std1, std2, std3, std_mean);
            let dut_readings = readings3(dut1, dut2, dut3, dut_mean);

            // sheet auxiliaries (optional in sheet; we force final numbers)
            let lsd = get_f(r + 1, 5).unwrap_or(0.0);
            let valor_real = get_f(r + 1, 7);
            let erro_rmm = get_f(r + 1, 8);

            // sheet “APTO/NAO APTO” → ok
            let mut ok = false;
            'scan: for rr in r..=r + 3 {
                for cc in 0..(ncols as usize) {
                    if let Some(s) = get_s(rr, cc) {
                        let sl = s.to_ascii_lowercase();
                        if sl.contains("não apto") || sl.contains("nao apto") {
                            ok = false;
                            break 'scan;
                        }
                        if sl.contains("apto") {
                            ok = true;
                            break 'scan;
                        }
                    }
                }
            }

            // standard error: prefer sheet `erro_rmm`, else std_mean - valor_real
            let std_error = if let Some(e) = erro_rmm {
                e
            } else if let Some(vr) = valor_real {
                std_mean - vr
            } else {
                0.0
            };

            // true value: prefer sheet `valor_real`, else std_mean - std_error
            let true_value = if let Some(vr) = valor_real {
                vr
            } else {
                std_mean - std_error
            };

            // DUT error (signed), delta & EMA
            let dut_error = dut_mean - true_value;
            let ema_allowed = (p * dut_mean) + (k * lsd);
            let delta = (dut_mean - true_value).abs();
            let pass = delta <= ema_allowed;

            // if sheet didn’t mark ok, align it to pass (so we always have a boolean)
            if !ok {
                ok = pass;
            }

            tests.push(SimpleTest {
                kind: kind.clone(),
                setpoint,
                unit,
                wave,

                std_readings,
                dut_readings,
                std_mean,
                dut_mean,

                std_error,
                true_value,
                dut_error,

                rule_percent: p,
                rule_lsd_factor: k,
                lsd: Some(lsd),
                ema_allowed,
                delta,
                pass,
                ok,
            });

            r += 4;
            if let Some(s) = get_s(r, 1) {
                if s.starts_with("Verificação da ") || s == "APRECIAÇÃO GLOBAL" {
                    break;
                }
            }
        }
    }

    Ok(SimpleCalibration {
        source_path: path,
        file_hash,
        instrument: InstrumentMini {
            code,
            name: Some(name),
        },
        verified_at,
        validated_at,
        tests,
    })
}
