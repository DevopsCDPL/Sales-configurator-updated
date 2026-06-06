// ────────────────────────────────────────────────────────────
// Schneider Electric – Masterpact NT / NW  Part-Number Decoder
// Source: Reference.csv  (positions 1-25)
// ────────────────────────────────────────────────────────────

export type CodeOption = { code: string; label: string };

/* ═══════════════════ Standards ═══════════════════ */
export const DECODER_STANDARDS = [
  "UL AC",
  "UL DC",
  "ANSI AC",
  "ANSI DC",
  "IEC AC",
  "IEC DC",
] as const;

export type DecoderStandard = (typeof DECODER_STANDARDS)[number];

/* ═══════════════════ Position 1 – Frame ═══════════════════ */
const ALL_POS1: CodeOption[] = [
  { code: "A", label: "4-Pole, NT (70 mm), 800/1200/1600" },
  { code: "B", label: "4-Pole, NW (115 mm), 3200/3000/4000" },
  { code: "C", label: "4-Pole, NW (230 mm), 6000/6000/6300" },
  { code: "E", label: "3/4-Pole, NW DC (115 mm), 4000/4000/4000" },
  { code: "G", label: "3-Pole, NW ArcBlok (115 mm), 3200/3000/4000" },
  { code: "H", label: "3-Pole, NW ArcBlok (230 mm), 6000/6000/6300" },
  { code: "T", label: "3-Pole, NT (70 mm), 800/1200/1600" },
  { code: "W", label: "3-Pole, NW (115 mm), 3200/3000/4000" },
  { code: "Y", label: "3-Pole, NW (230 mm), 6000/6000/6300" },
];

export function getPos1Options(std: string): CodeOption[] {
  // DC standards → only the DC frame (code E)
  if (std.includes("DC")) return ALL_POS1.filter((o) => o.code === "E");
  return ALL_POS1.filter((o) => o.code !== "E");
}

/* ═══════════════════ Position 2 – Branding ═══════════════════ */
const ALL_POS2: CodeOption[] = [
  { code: "A", label: "Square D / ANSI" },
  { code: "C", label: "Square D / IEC 947-2" },
  { code: "G", label: "Schneider Electric / UL-CSA-NOM" },
  { code: "L", label: "Square D / UL-CSA-NOM" },
  { code: "M", label: "Schneider Electric / IEC 947-2" },
  { code: "N", label: "Schneider Electric / ANSI" },
];

export function getPos2Options(std: string): CodeOption[] {
  if (std.startsWith("UL")) return ALL_POS2.filter((o) => o.code === "G" || o.code === "L");
  if (std.startsWith("ANSI")) return ALL_POS2.filter((o) => o.code === "A" || o.code === "N");
  if (std.startsWith("IEC")) return ALL_POS2.filter((o) => o.code === "C" || o.code === "M");
  return ALL_POS2;
}

/* ═══════════════════ Position 3 – Air Code  (std-dependent) ═══════════════════ */
export const POS3_BY_STD: Record<string, CodeOption[]> = {
  "UL DC": [
    { code: "1", label: "AIR code N (NW-type C) 35 kA @ 500 Vdc" },
    { code: "3", label: "AIR code H (NW-type C) 85 kA @ 500 Vdc" },
    { code: "5", label: "AIR code N (NW-type C1 series) 35 kA @ 500 Vdc" },
    { code: "6", label: "AIR code H (NW-type C1 series) 85 kA @ 500 Vdc" },
    { code: "7", label: "AIR code N (NW-type C1 series split) 35 kA @ 500 Vdc" },
    { code: "8", label: "AIR code H (NW-type C1 series split) 85 kA @ 500 Vdc" },
  ],
  "ANSI DC": [
    { code: "1", label: "AIR code N/NA (NW-type C) @300 Vdc, 800-3000A=25 kA" },
    { code: "2", label: "AIR code N/NA 75 kA @300 Vdc @3000A" },
    { code: "3", label: "AIR code N/NA 100 kA @300 Vdc @4000A" },
  ],
  "IEC DC": [
    { code: "1", label: "AIR code N (NW-type C) 85/35/25 kA @ 500 Vdc" },
    { code: "2", label: "AIR code H/HA (NW-type C) 100/85/50 kA @ 500 Vdc" },
    { code: "3", label: "AIR code H/HA (NW-type D) 100/85/50 @500 Vdc" },
    { code: "4", label: "AIR code H/HA (NW-type E) 100/85/50 @500 Vdc" },
  ],
  "UL AC": [
    { code: "1", label: "AIR code N (NT:50/50/35, NW:65/65/50)" },
    { code: "3", label: "AIR code H/HF (NT:65/50/50, NW:100/100/85)" },
    { code: "7", label: "AIR code L/HB (NT:200/100/NA, NW:200/150/100)" },
    { code: "8", label: "AIR code L1 (NT:100/65/NA)" },
    { code: "9", label: "AIR code LF (NT:200/100/NA, NW:200/150/100)" },
    { code: "A", label: "AIR code HXT (NW: –/100/25 e)" },
  ],
  "ANSI AC": [
    { code: "2", label: "AIR code N1/NA (NT:42/42/NA, NW:42/42/42)" },
    { code: "4", label: "AIR code H1/HF (NT:65/65/NA) or H1/HA (NW:65/65/65)" },
    { code: "5", label: "AIR code H2/HA (NW:85/85/85)" },
    { code: "6", label: "AIR code H3/HF (NW:100/100/85)" },
    { code: "8", label: "AIR code L1/HC (NW:200/200/130)" },
    { code: "9", label: "AIR code L1F (NW:200/200/130)" },
  ],
  "IEC AC": [
    { code: "1", label: "AIR code N1/NA (NW:42/42/42)" },
    { code: "2", label: "AIR code HA (NT:42/42/42, NW:50/50/50)" },
    { code: "3", label: "AIR code HF (NW:85/85/85)" },
    { code: "4", label: "AIR code H1 (NT:42/42/42, NW:65/65/65)" },
    { code: "5", label: "AIR code H2 (NT:50/50/42, NW:100/100/85)" },
    { code: "6", label: "AIR code H3 (NW:150/150/100)" },
    { code: "7", label: "AIR code L1 (NT:150/130/25, NW:150/150/100)" },
    { code: "8", label: "AIR code H10 (NW:50 @1150 Vac)" },
    { code: "9", label: "AIR code HA10 (NW:50 @1150 Vac)" },
    { code: "A", label: "AIR code H1T (NW:na/65/25)" },
  ],
};

export const getPos3Options = (std: string): CodeOption[] => POS3_BY_STD[std] ?? [];

/* ═══════════════════ Position 4 – Frame Rating  (std-dependent) ═══════════════════ */
export const POS4_BY_STD: Record<string, CodeOption[]> = {
  "UL AC": [
    { code: "A", label: "800 A frame" },
    { code: "C", label: "1200 A frame" },
    { code: "E", label: "1600 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "G", label: "2500 A frame" },
    { code: "H", label: "3000 A frame" },
    { code: "K", label: "4000 A frame" },
    { code: "L", label: "5000 A frame" },
    { code: "M", label: "6000 A frame" },
    { code: "P", label: "800 A frame (250 A max sensor)" },
  ],
  "ANSI AC": [
    { code: "A", label: "800 A frame" },
    { code: "E", label: "1600 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "J", label: "3200 A frame" },
    { code: "K", label: "4000 A frame" },
    { code: "L", label: "5000 A frame" },
    { code: "M", label: "6000 A frame" },
    { code: "P", label: "800 A frame (250 A max sensor)" },
  ],
  "IEC AC": [
    { code: "A", label: "800 A frame" },
    { code: "B", label: "1000 A frame" },
    { code: "D", label: "1250 A frame" },
    { code: "E", label: "1600 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "G", label: "2500 A frame" },
    { code: "J", label: "3200 A frame" },
    { code: "K", label: "4000 A frame" },
    { code: "L", label: "5000 A frame" },
    { code: "N", label: "6300 A frame" },
    { code: "P", label: "800 A frame (250 A max sensor)" },
  ],
  "UL DC": [
    { code: "A", label: "800 A frame" },
    { code: "B", label: "1000 A frame" },
    { code: "C", label: "1200 A frame" },
    { code: "E", label: "1600 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "G", label: "2500 A frame" },
    { code: "H", label: "3000 A frame" },
    { code: "J", label: "3200 A frame" },
    { code: "K", label: "4000 A frame" },
    { code: "R", label: "1400 A frame" },
  ],
  "ANSI DC": [
    { code: "A", label: "800 A frame" },
    { code: "E", label: "1600 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "H", label: "3000 A frame" },
    { code: "K", label: "4000 A frame" },
  ],
  "IEC DC": [
    { code: "B", label: "1000 A frame" },
    { code: "F", label: "2000 A frame" },
    { code: "K", label: "4000 A frame" },
  ],
};

export const getPos4Options = (std: string): CodeOption[] => POS4_BY_STD[std] ?? [];

/* ═══════════════════ Position 5 – Ampacity ═══════════════════ */
export const POS5_AMPACITY: CodeOption[] = [
  { code: "A", label: "800 A sensor" },
  { code: "B", label: "1000 A sensor / DC IEC Switch" },
  { code: "C", label: "1200 A sensor" },
  { code: "D", label: "1250 A sensor (IEC only)" },
  { code: "E", label: "1600 A sensor" },
  { code: "F", label: "2000 A sensor / DC IEC Switch" },
  { code: "G", label: "2500 A sensor / DC 2500-5400" },
  { code: "H", label: "3000 A sensor" },
  { code: "J", label: "3200 A sensor" },
  { code: "K", label: "4000 A sensor / DC IEC Switch" },
  { code: "L", label: "5000 A sensor / DC 5000-11000" },
  { code: "M", label: "6000 A sensor" },
  { code: "N", label: "6300 A sensor (IEC only)" },
  { code: "P", label: "250 A sensor" },
  { code: "R", label: "3600 A sensor" },
  { code: "S", label: "400 A sensor" },
  { code: "T", label: "600 A sensor" },
  { code: "U", label: "630 A sensor (IEC only)" },
  { code: "W", label: "100 A sensor" },
];

/* ═══════════════════ Position 6 – Termination  (std-dependent) ═══════════════════ */
const POS6_UL_ANSI_AC: CodeOption[] = [
  { code: "A", label: "4-hole RCTH 6P / 4-hole RCTH 6P" },
  { code: "B", label: "4-hole RCTV / 4-hole RCTV" },
  { code: "C", label: "4-hole RCTV w/ heat sink 6P 6000 A" },
  { code: "D", label: "2-hole FCF / 2-hole RCTH" },
  { code: "E", label: "4-hole RCT w/ heat sink 6P 5000 A" },
  { code: "F", label: "2-hole FCF / 2-hole FCF" },
  { code: "G", label: "Orion 9.7-in FCT / Orion 9.7-in FCT" },
  { code: "H", label: "2-hole RCTH / 2-hole RCTH" },
  { code: "J", label: "4-hole RCTH / 4-hole RCTH" },
  { code: "K", label: "2-hole FCF / 2-hole RCTV" },
  { code: "L", label: "2-hole RCTV / 2-hole FCF" },
  { code: "M", label: "4-hole RCTV 6P / 4-hole RCTV 6P" },
  { code: "N", label: "4-hole RCTH / 4-hole RCTV" },
  { code: "P", label: "4-hole RCTH 6P / 4-hole RCTV 6P" },
  { code: "Q", label: "4-hole RCTV / 4-hole RCTH" },
  { code: "R", label: "Drawout Breaker" },
  { code: "S", label: "4-hole RCTV 6P / 4-hole RCTH 6P" },
  { code: "T", label: "11.75-in FCT / 9.7-in FCT" },
  { code: "U", label: "8-inch RCOV 3200 A / 5-inch RCOV 3200 A" },
  { code: "V", label: "2-hole RCTV / 2-hole RCTV" },
  { code: "W", label: "2-hole RCTH / 2-hole RCTV" },
  { code: "X", label: "No terminations" },
  { code: "Y", label: "2-hole RCTV / 2-hole RCTH" },
  { code: "Z", label: "RCOV (4000 A ANSI 3P)" },
];

const POS6_IEC_AC: CodeOption[] = [
  { code: "A", label: "5000 A RCTH / 5000 A RCTH" },
  { code: "B", label: "4000 A RCTV / 4000 A RCTV" },
  { code: "C", label: "6300 A RCTV / 6300 A RCTV" },
  { code: "D", label: "NW: 800-3200 A FCF long / RCTH; NT: FCF / RCTH" },
  { code: "F", label: "NW: 800-3200 A FCF long / FCF short; NT: FCF / FCF" },
  { code: "H", label: "NW: 800-3200 A RCTH / RCTH; NT: RCTH / RCTH" },
  { code: "J", label: "4000 A RCTH / 4000 A RCTH" },
  { code: "K", label: "NW: 800-3200 A FCF long / RCTV; NT: FCF / RCTV" },
  { code: "L", label: "NW: 800-3200 A RCTV / FCF short; NT: RCTV / FCF" },
  { code: "M", label: "5000 A RCTV / 5000 A RCTV" },
  { code: "N", label: "4000 A RCTH / 4000 A RCTV" },
  { code: "P", label: "5000 A RCTH / 5000 A RCTV" },
  { code: "Q", label: "4000 A RCTV / 4000 A RCTH" },
  { code: "R", label: "Drawout Breaker" },
  { code: "S", label: "5000 A RCTV / 5000 A RCTH" },
  { code: "V", label: "NW: 800-3200 A RCTV / RCTV; NT: RCTV / RCTV" },
  { code: "W", label: "NW: 800-3200 A RCTH / RCTV; NT: RCTH / RCTV" },
  { code: "X", label: "No terminations" },
  { code: "Y", label: "NW: 800-3200 A RCTV / RCTH; NT: RCTV / RCTH" },
];

const POS6_UL_ANSI_DC: CodeOption[] = [
  { code: "B", label: "4-hole RCTV / 4-hole RCTV" },
  { code: "H", label: "2-hole RCTH / 2-hole RCTH" },
  { code: "J", label: "4-hole RCTH / 4-hole RCTH" },
  { code: "R", label: "Drawout Breaker" },
  { code: "V", label: "2-hole RCTV / 2-hole RCTV" },
  { code: "X", label: "No terminations" },
];

const POS6_IEC_DC: CodeOption[] = [
  { code: "B", label: "5-hole RCTV / 5-hole RCTV" },
  { code: "H", label: "3-hole RCTH / 3-hole RCTH" },
  { code: "R", label: "Drawout Breaker" },
  { code: "V", label: "3-hole RCTV / 3-hole RCTV" },
  { code: "X", label: "No terminations" },
];

export function getPos6Options(std: string): CodeOption[] {
  if (std === "UL AC" || std === "ANSI AC") return POS6_UL_ANSI_AC;
  if (std === "UL DC" || std === "ANSI DC") return POS6_UL_ANSI_DC;
  if (std === "IEC AC") return POS6_IEC_AC;
  if (std === "IEC DC") return POS6_IEC_DC;
  return [];
}

/* ═══════════════════ Position 7 & 8 – Trip Unit Type ═══════════════════ */
export const POS78_TRIP_UNIT: CodeOption[] = [
  { code: "10", label: "DC Trip Unit – variable 1.0 (inst. only)" },
  { code: "11", label: "DC Trip Unit – fixed 1.0 (inst. only)" },
  { code: "31", label: "ELS 3.0 LI" },
  { code: "32", label: "ELS 2.0 LSO (=LI for IEC)" },
  { code: "33", label: "ELS 5.0 LSI" },
  { code: "41", label: "ELA 3.0A LI" },
  { code: "42", label: "ELA 2.0A LSO (=LI for IEC)" },
  { code: "43", label: "ELA 5.0A LSI" },
  { code: "44", label: "ELA 6.0A LSIG" },
  { code: "45", label: "ELA 7.0A LSIV" },
  { code: "63", label: "ELU 5.0P LSI" },
  { code: "64", label: "ELU 6.0P LSIG" },
  { code: "65", label: "ELU 7.0P LSIV" },
  { code: "73", label: "ELH 5.0H LSI" },
  { code: "74", label: "ELH 6.0H LSIG" },
  { code: "75", label: "ELH 7.0H LSIV" },
  { code: "NN", label: "Non-automatic Switch" },
  { code: "SS", label: "Automatic Switch (inst. Override)" },
  { code: "XX", label: "Without trip unit" },
];

/* ═══════════════════ Position 9 – Rating Plug ═══════════════════ */
export const POS9_RATING_PLUG: CodeOption[] = [
  { code: "A", label: 'UL Plug "A"' },
  { code: "B", label: 'UL Plug "B"' },
  { code: "C", label: 'UL Plug "C"' },
  { code: "D", label: 'UL Plug "D"' },
  { code: "E", label: 'UL Plug "E"' },
  { code: "F", label: 'UL Plug "F"' },
  { code: "G", label: 'UL Plug "G"' },
  { code: "H", label: 'UL Plug "H"' },
  { code: "P", label: '"OFF" Plug (IEC)' },
  { code: "R", label: "IEC Standard Plug" },
  { code: "S", label: "IEC Lower Range Plug" },
  { code: "T", label: "IEC Upper Range Plug" },
  { code: "X", label: "No Rating Plug" },
];

/* ═══════════════════ Position 10 – Communication ═══════════════════ */
export const POS10_COMMUNICATION: CodeOption[] = [
  { code: "2", label: "(future use)" },
  { code: "3", label: "Modbus communication" },
  { code: "4", label: "DeviceNet communication" },
  { code: "5", label: "CAN communication" },
  { code: "6", label: "Profibus DP communication" },
  { code: "7", label: "Batbus communication" },
  { code: "8", label: "(future use)" },
  { code: "9", label: "No communication" },
];

/* ═══════════════════ Position 11 – Form C Contacts ═══════════════════ */
export const POS11_FORM_C: CodeOption[] = [
  { code: "A", label: "4 form C low-level / No PCM" },
  { code: "B", label: "4 form C low-level / 2 PCM" },
  { code: "C", label: "8 form C / No PCM" },
  { code: "D", label: "12 form C / No PCM" },
  { code: "E", label: "4 form C low-level / 6 PCM" },
  { code: "F", label: "4 form C / 2 PCM" },
  { code: "G", label: "8 form C / 2 PCM" },
  { code: "H", label: "12 form C / 2 PCM" },
  { code: "K", label: "4 form C / 6 PCM" },
  { code: "L", label: "8 form C / 6 PCM" },
  { code: "M", label: "12 form C / 6 PCM" },
  { code: "S", label: "4 form C / No PCM" },
];

/* ═══════════════════ Position 12 – Spring Charging Motor Voltage ═══════════════════ */
export const POS12_MOTOR_VOLTAGE: CodeOption[] = [
  { code: "C", label: "24-30 Vdc" },
  { code: "D", label: "48-60 Vac/Vdc" },
  { code: "F", label: "100-130 Vac" },
  { code: "G", label: "100-130 Vdc" },
  { code: "H", label: "200-240 Vac" },
  { code: "J", label: "200-240 Vdc" },
  { code: "K", label: "277 Vac" },
  { code: "L", label: "380-415 Vac" },
  { code: "P", label: "440-480 Vac" },
  { code: "X", label: "No spring charging motor" },
];

/* ═══════════════════ Position 13 – Shunt Trip ═══════════════════ */
export const POS13_SHUNT_TRIP: CodeOption[] = [
  { code: "A", label: "12 Vdc MX shunt trip" },
  { code: "B", label: "24-30 Vac/dc MX shunt trip" },
  { code: "C", label: "24-30 Vac/dc shunt trip – Comm" },
  { code: "D", label: "48-60 Vac/Vdc MX shunt trip" },
  { code: "E", label: "48-60 Vac/Vdc shunt trip – Comm" },
  { code: "F", label: "100-130 Vac/dc MX shunt trip" },
  { code: "G", label: "100-130 Vac/dc shunt trip – Comm" },
  { code: "H", label: "200-240 Vac/dc MX shunt trip" },
  { code: "J", label: "200-240 Vac/dc shunt trip – Comm" },
  { code: "K", label: "277 Vac MX shunt trip" },
  { code: "M", label: "380-480 Vac MX shunt trip" },
  { code: "R", label: "277 Vac shunt trip – Comm" },
  { code: "S", label: "380-480 Vac shunt trip – Comm" },
  { code: "V", label: "12 Vdc shunt trip – Comm" },
  { code: "X", label: "No shunt trip" },
];

/* ═══════════════════ Position 14 – Closing Coil ═══════════════════ */
export const POS14_CLOSING_COIL: CodeOption[] = [
  { code: "A", label: "12 Vdc Closing Coil" },
  { code: "B", label: "24-30 Vac/dc Closing Coil" },
  { code: "C", label: "24-30 Vac/dc Closing Coil – Comm" },
  { code: "D", label: "48-60 Vac/Vdc Closing Coil" },
  { code: "E", label: "48-60 Vac/Vdc Closing Coil – Comm" },
  { code: "F", label: "100-130 Vac/dc Closing Coil" },
  { code: "G", label: "100-130 Vac/dc Closing Coil – Comm" },
  { code: "H", label: "200-240 Vac/dc Closing Coil" },
  { code: "J", label: "200-240 Vac/dc Closing Coil – Comm" },
  { code: "K", label: "277 Vac Closing Coil" },
  { code: "M", label: "380-480 Vac Closing Coil" },
  { code: "R", label: "277 Vac Closing Coil – Comm" },
  { code: "S", label: "380-480 Vac Closing Coil – Comm" },
  { code: "V", label: "12 Vdc Closing Coil – Comm" },
  { code: "X", label: "No closing coil" },
];

/* ═══════════════════ Position 15 – Electric Reset ═══════════════════ */
export const POS15_ELECTRIC_RESET: CodeOption[] = [
  { code: "F", label: "100-130 Vac electric reset" },
  { code: "H", label: "200-240 Vac electric reset" },
  { code: "W", label: "2nd OC trip switch" },
  { code: "X", label: "No electric reset or 2nd OC trip switch" },
  { code: "Y", label: "2nd OC trip switch (low level)" },
];

/* ═══════════════════ Position 16 – Other Trips ═══════════════════ */
export const POS16_OTHER_TRIPS: CodeOption[] = [
  { code: "A", label: "Instant. UV trip; 24-30 Vac/dc" },
  { code: "B", label: "Instant. UV trip; 48-60 Vac/dc" },
  { code: "C", label: "Instant. UV trip; 100-130 Vac/dc" },
  { code: "D", label: "Instant. UV trip; 200-240 Vac/dc" },
  { code: "E", label: "Instant. UV trip; 380-480 Vac" },
  { code: "G", label: "Adj. time-delay UV; 48-60 Vac/dc" },
  { code: "H", label: "Adj. time-delay UV; 100-130 Vac/dc" },
  { code: "J", label: "Adj. time-delay UV; 200-240 Vac/dc" },
  { code: "K", label: "Adj. time-delay UV; 380-480 Vac" },
  { code: "L", label: "Fixed time-delay UV; 100-130 Vac/dc" },
  { code: "M", label: "Fixed time-delay UV; 200-240 Vac/dc" },
  { code: "N", label: "2nd Shunt Trip; 12 Vdc" },
  { code: "P", label: "2nd Shunt Trip; 24-30 Vac/dc" },
  { code: "R", label: "2nd Shunt Trip; 48-60 Vac/dc" },
  { code: "S", label: "2nd Shunt Trip; 100-130 Vac/dc" },
  { code: "T", label: "2nd Shunt Trip; 200-240 Vac/dc" },
  { code: "U", label: "2nd Shunt Trip; 277 Vac" },
  { code: "W", label: "2nd Shunt Trip; 380-480 Vac" },
  { code: "X", label: "No UV trip or 2nd shunt trip" },
];

/* ═══════════════════ Position 17 – Operation Accessories ═══════════════════ */
export const POS17_OPERATION_ACC: CodeOption[] = [
  { code: "A", label: "Ready-to-Close switch" },
  { code: "B", label: "Low-level Ready-to-Close switch" },
  { code: "C", label: "Padlockable push button cover" },
  { code: "D", label: "Mechanical operation counter" },
  { code: "E", label: "RtC switch & Padlockable push button cover" },
  { code: "F", label: "RtC switch & Mechanical operation counter" },
  { code: "G", label: "Low-level RtC & Padlockable push button cover" },
  { code: "H", label: "Low-level RtC & Mechanical operation counter" },
  { code: "J", label: "Padlockable push button cover & Mech. op. counter" },
  { code: "K", label: "RtC & Padlockable push button & Mech. op. counter" },
  { code: "L", label: "Low-level RtC & Padlockable & Mech. op. counter" },
  { code: "X", label: "No operation accessories" },
];

/* ═══════════════════ Position 18 – Locks ═══════════════════ */
export const POS18_LOCKS: CodeOption[] = [
  { code: "A", label: "Padlock" },
  { code: "B", label: "1 Kirk lock" },
  { code: "C", label: "1 Ronis lock" },
  { code: "D", label: "1 Fed. Pioneer lock" },
  { code: "E", label: "1 Profalux lock" },
  { code: "F", label: "1 Castell lock" },
  { code: "M", label: "Padlock & 1 Kirk lock" },
  { code: "P", label: "Padlock & 2 Kirk locks" },
  { code: "Q", label: "Padlock & 1 Ronis lock" },
  { code: "R", label: "Padlock & 2 Ronis locks" },
  { code: "S", label: "Padlock & 1 Fed. Pioneer lock" },
  { code: "T", label: "Padlock & 2 Fed. Pioneer locks" },
  { code: "U", label: "Padlock & 1 Profalux lock" },
  { code: "V", label: "Padlock & 2 Profalux locks" },
  { code: "W", label: "Padlock & 1 Castell lock" },
  { code: "Y", label: "Padlock & 2 Castell locks" },
  { code: "X", label: "No locks" },
];

/* ═══════════════════ Positions 19-25 – Special Accessories ═══════════════════ */
export const POS19_25_SPECIAL: CodeOption[] = [
  { code: "A", label: "ABS-NVR rated" },
  { code: "B", label: "4P w/ right-hand side neutral" },
  { code: "C", label: "CT characterization" },
  { code: "D", label: "Dual rated Aggreko breakers" },
  { code: "E", label: "Push button electrical close" },
  { code: "F", label: "2 keylocks keyed differently" },
  { code: "G", label: "OFF push button – crank interlock" },
  { code: "H", label: "Automatic spring discharge interlock" },
  { code: "K", label: "2 keylocks keyed alike" },
  { code: "N", label: "Additional 12 auxiliary switches" },
  { code: "R", label: "Automatic reset" },
  { code: "T", label: "Test Report" },
  { code: "V", label: "External voltage sensing wiring" },
  { code: "Y", label: "Customer Special" },
  { code: "Z", label: "No instruction manual" },
];

/* ═══════════════════ Master position list ═══════════════════ */
export interface DecoderPositionDef {
  key: string;
  posLabel: string;
  name: string;
  getOptions: (std: string) => CodeOption[];
  isStdDependent?: boolean;
}

export const DECODER_POSITIONS: DecoderPositionDef[] = [
  { key: "1", posLabel: "Pos 1", name: "Frame", getOptions: () => ALL_POS1 },
  { key: "2", posLabel: "Pos 2", name: "Branding", getOptions: () => ALL_POS2 },
  { key: "3", posLabel: "Pos 3", name: "Air Code", getOptions: getPos3Options, isStdDependent: true },
  { key: "4", posLabel: "Pos 4", name: "Frame Rating", getOptions: getPos4Options, isStdDependent: true },
  { key: "5", posLabel: "Pos 5", name: "Ampacity", getOptions: () => POS5_AMPACITY },
  { key: "6", posLabel: "Pos 6", name: "Termination", getOptions: getPos6Options, isStdDependent: true },
  { key: "7_8", posLabel: "Pos 7-8", name: "Trip Unit Type", getOptions: () => POS78_TRIP_UNIT },
  { key: "9", posLabel: "Pos 9", name: "Rating Plug", getOptions: () => POS9_RATING_PLUG },
  { key: "10", posLabel: "Pos 10", name: "Communication", getOptions: () => POS10_COMMUNICATION },
  { key: "11", posLabel: "Pos 11", name: "Form C Contacts", getOptions: () => POS11_FORM_C },
  { key: "12", posLabel: "Pos 12", name: "Motor Voltage", getOptions: () => POS12_MOTOR_VOLTAGE },
  { key: "13", posLabel: "Pos 13", name: "Shunt Trip", getOptions: () => POS13_SHUNT_TRIP },
  { key: "14", posLabel: "Pos 14", name: "Closing Coil", getOptions: () => POS14_CLOSING_COIL },
  { key: "15", posLabel: "Pos 15", name: "Electric Reset", getOptions: () => POS15_ELECTRIC_RESET },
  { key: "16", posLabel: "Pos 16", name: "Other Trips", getOptions: () => POS16_OTHER_TRIPS },
  { key: "17", posLabel: "Pos 17", name: "Operation Acc.", getOptions: () => POS17_OPERATION_ACC },
  { key: "18", posLabel: "Pos 18", name: "Locks", getOptions: () => POS18_LOCKS },
];

export const DECODER_SPECIAL_POSITIONS = [19, 20, 21, 22, 23, 24, 25] as const;

/* ═══════════════════ Build catalog number ═══════════════════ */
export function buildCatalogNumber(selections: Record<string, string>): string {
  const base = [
    selections["1"] ?? "",
    selections["2"] ?? "",
    selections["3"] ?? "",
    selections["4"] ?? "",
    selections["5"] ?? "",
    selections["6"] ?? "",
    selections["7_8"] ?? "",
    selections["9"] ?? "",
    selections["10"] ?? "",
    selections["11"] ?? "",
    selections["12"] ?? "",
    selections["13"] ?? "",
    selections["14"] ?? "",
    selections["15"] ?? "",
    selections["16"] ?? "",
    selections["17"] ?? "",
    selections["18"] ?? "",
  ].join("");

  const special = DECODER_SPECIAL_POSITIONS
    .map((n) => selections[String(n)] ?? "")
    .filter((c) => c && c !== "__NONE__")
    .join("");

  return base + special;
}
