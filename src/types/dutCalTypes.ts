

export type CalibrationSetpoint = {
   id: number;          // 1..4
   currentA: number;    // target current
   // future: targetVoltage, wireSpeed, etc.
};

// One possible combination for a given target current
export type ContactorOption = {
   mask: number;        // 16-bit mask, C1..C16
   label: string;       // e.g. "R1+R3+R6" or "≈175 A @ 44 V"
   errorPercent: number;// |I_actual - I_target| / I_target * 100
};

// One setpoint with all its valid combinations (best first)
export type SetpointConfig = CalibrationSetpoint & {
   options: ContactorOption[];
};

