import type { Submission, Unit } from "@/types/checklistTypes";

export type TflCapture =
  | { type: "none" }
  | { type: "number"; field: string; unit?: Unit; hint?: string };

export type TflGroupDef = {
  key: string;
  title: string;
  ops: string[];
  capture?: TflCapture;

  /**
   * Optional visibility rule.
   * Keep it simple: based on dut/vars.
   */
  when?: (sub: Submission) => boolean;
};

export type TflProcedureDef = {
  procedureId: string; // e.g. L7.002
  title: string;
  /** optional tag(s) used to infer defaults */
  families?: string[];
  groups: TflGroupDef[];
};

// -----------------------------------------------------------------------------
// Procedure skeletons (group-based, not 60+ ops)
// -----------------------------------------------------------------------------

export const TFL_L7_002_TP_S4: TflProcedureDef = {
  procedureId: "L7.002",
  title: "TP S4",
  families: ["TP_S4", "TP"],
  groups: [
    {
      key: "op",
      title: "Descrição da Operação",
      ops: [
        "Inspeção visual geral (cabos, conectores, chassis, apertos).",
        "Verificar displays, botões e LEDs.",
        "Rodar o encoder e confirmar alteração no Display A.",
      ],
      capture: { type: "none" },
    },
    {
      key: "u2",
      title: "Medição da Tensão de Vazio (U2)",
      ops: [
        "Colocar o equipamento em modo MMA.",
        "Medir U2 (tensão de vazio) com multímetro nos bornes + e -.",
        "Confirmar que corresponde ao valor da tabela do procedimento.",
      ],
      capture: { type: "number", field: "tfl.u2.measuredV", unit: "V" },
    },
    {
      key: "cooling",
      title: "Deteção da Refrigeração",
      ops: [
        "Verificar que a luz de deteção de refrigeração está ligada.",
        "Durante soldadura, confirmar que o refrigerador opera convenientemente.",
      ],
      when: (sub) => {
        const model = (sub.dut?.series ?? sub.dut?.prodName ?? "").toUpperCase();
        return !(model.includes("TP 164") || model.includes("TP 204"));
      },
      capture: { type: "none" },
    },
    {
      key: "currentCal",
      title: "Calibração de Corrente",
      ops: [
        "Selecionar processo conforme o procedimento (ex.: TIG HF).",
        "Selecionar set-point (Tabela do procedimento).",
        "Executar soldadura/ensaio e ajustar conforme instruções.",
      ],
      capture: { type: "none" },
    },
    {
      key: "final",
      title: "Finalização",
      ops: [
        "Realizar reset de fábrica (se aplicável).",
        "Desligar o equipamento e fechar o chassis.",
      ],
      capture: { type: "none" },
    },
  ],
};

export const TFL_L7_001_DC_S4: TflProcedureDef = {
  procedureId: "L7.001",
  title: "DC S4",
  families: ["DC_S4", "DC"],
  groups: [
    {
      key: "pre",
      title: "Pré-verificações e alimentação",
      ops: [
        "Inspeção visual geral.",
        "Confirmar interruptor OFF e cabo de alimentação desligado.",
        "Medir continuidade terra (<= 2Ω).",
        "Ligar à alimentação conforme tabela (230V mono / 400V tri, conforme modelo).",
      ],
      capture: { type: "number", field: "tfl.earthOhm", unit: "Ω", hint: "<= 2Ω" },
    },
    {
      key: "ui",
      title: "Verificações UI",
      ops: [
        "Confirmar displays OK.",
        "Rodar o encoder e confirmar alteração no Display A.",
      ],
      capture: { type: "none" },
    },
    {
      key: "u2",
      title: "Medição da Tensão de Vazio (U2)",
      ops: [
        "Colocar o equipamento em modo MMA.",
        "Medir U2 com multímetro nos bornes + e -.",
        "Confirmar que corresponde ao valor da tabela do procedimento.",
      ],
      capture: { type: "number", field: "tfl.u2.measuredV", unit: "V" },
    },
    {
      key: "final",
      title: "Finalização",
      ops: ["Desligar e finalizar conforme instruções do procedimento."],
      capture: { type: "none" },
    },
  ],
};

export const TFL_L6_002_MIG_BASIC_S4: TflProcedureDef = {
  procedureId: "L6.002",
  title: "MIG BASIC S4",
  families: ["MIG_BASIC_S4", "MIG"],
  groups: [
    {
      key: "op",
      title: "Descrição da Operação",
      ops: [
        "Inspeção visual geral.",
        "Verificar displays, botões e LEDs.",
        "Verificar encoder e seleção.",
      ],
      capture: { type: "none" },
    },
    {
      key: "u2",
      title: "Medição da Tensão de Vazio (U2)",
      ops: [
        "Colocar o equipamento em modo MMA.",
        "Medir U2 com multímetro nos bornes + e -.",
        "Confirmar que corresponde ao valor da tabela do procedimento.",
      ],
      capture: { type: "number", field: "tfl.u2.measuredV", unit: "V" },
    },
    {
      key: "currentCal",
      title: "Calibração de Corrente",
      ops: [
        "Selecionar set-point conforme procedimento.",
        "Executar soldadura/ensaio e ajustar (trimmer) conforme instruções.",
      ],
      capture: { type: "none" },
    },
    {
      key: "wire",
      title: "Calibração da Velocidade de Fio",
      ops: [
        "Seguir instruções do procedimento para calibração MIN/MAX do motor.",
        "Confirmar tensões alvo nos pontos de teste conforme procedimento.",
      ],
      capture: { type: "none" },
    },
    {
      key: "vset",
      title: "Calibração de Tensão - Set Point",
      ops: [
        "Ajustar set-point de tensão e confirmar dentro da tolerância da tabela.",
        "Repetir soldadura até valores aceitáveis.",
      ],
      capture: { type: "none" },
    },
    {
      key: "final",
      title: "Finalização",
      ops: [
        "Verificar modo operatório (ex.: LIFTIG) se aplicável.",
        "Reset de fábrica (se aplicável) e desligar.",
      ],
      capture: { type: "none" },
    },
  ],
};

export const TFL_PROCEDURES: TflProcedureDef[] = [
  TFL_L7_002_TP_S4,
  TFL_L7_001_DC_S4,
  TFL_L6_002_MIG_BASIC_S4,
];

export function resolveTflProcedure(sub: Submission): TflProcedureDef {
  // explicit selection
  const explicit = sub.vars?.tflProcedureId;
  if (explicit) {
    const found = TFL_PROCEDURES.find((p) => p.procedureId === explicit);
    if (found) return found;
  }

  // try infer from a family tag
  const family = (sub.vars?.tflProductFamily ?? "").toUpperCase();
  if (family) {
    const found = TFL_PROCEDURES.find((p) => (p.families ?? []).some((f) => family.includes(f.toUpperCase())));
    if (found) return found;
  }

  // weak inference from selected process
  const proc = sub.vars?.selectedProcess;
  if (proc && proc.startsWith("MIG")) return TFL_L6_002_MIG_BASIC_S4;

  // fallback
  return TFL_L7_001_DC_S4;
}