
#[derive(Serialize, Deserialize, Debug, Clone)]
    pub let lab_codigo = "Código interno :";
    pub let lab_design = "Designação :";
    pub let lab_modelo = "Modelo :";
    pub let lab_fab    = "Fabricante :";
    pub let lab_serial = "Nº de Série :";
    pub let lab_cert   = "Referente ao Certificado n°";
    pub let lab_local  = "Local :";
    pub let lab_temp   = "Temperatura :";
    pub let lab_hum    = "Humidade :";
    pub let lab_resp_ver = "Responsável da verificação :";
    pub let lab_resp_val = "Responsável da validação :";
    pub let lab_data_ver = "Data da verificação :";
    pub let lab_data_val = "Data de validação :";
    pub let lab_obs      = "Observações :";

    pub let cod_hits = collect_label_right(lab_codigo, &get_s, nrows as usize, ncols as usize);
    pub let des_hits = collect_label_right(lab_design, &get_s, nrows as usize, ncols as usize);
    pub let fab_hits = collect_label_right(lab_fab,    &get_s, nrows as usize, ncols as usize);
    pub let mod_hits = collect_label_right(lab_modelo, &get_s, nrows as usize, ncols as usize);
    pub let ser_hits = collect_label_right(lab_serial, &get_s, nrows as usize, ncols as usize);
    pub let cer_hits = collect_label_right(lab_cert,   &get_s, nrows as usize, ncols as usize);