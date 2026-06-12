# Catalog Scrape Plan — UL 891 Switchboard Configurator
*Generated: 2026-06-13 | Context: US/Canada UL 891 dead-front switchboard manufacturer*

---

## Scope
Categories excluded from scraping (internal-only): **LABOR**, **STANDARD PRODUCT**, **UNKNOWN PARTS**

Scrape-target categories: CIRCUIT BREAKER, CB ACCESSORIES, ENCLOSURE, BUSSING, CU, GLASTIC, CAMLOCK, SPD, ATS, CONTROLS, CURRENT TRANSFORMER, VOLTAGE TRANSFORMER / CPT, CT / VT / CPT, POWER SUPPLY, LUGS, TERMINALS, WIRE CABLE, CONDUIT, HARDWARE, SWITCH, LIGHT

---

## Wave Plan (Priority Order by BOM Impact)

| Wave | Category | Reason for Priority | Target SKU Count |
|------|----------|---------------------|-----------------|
| 1 | CIRCUIT BREAKER | Highest $ value, every board has them; 3-5 CB lines per board | 50 |
| 2 | BUSSING / CU | Main bus + neutral + ground; 2nd highest $ per board | 30 |
| 3 | LUGS | On every breaker, main lug, neutral; large variety | 50 |
| 4 | ENCLOSURE | Bought or fabricated; when purchased sets board cost | 20 |
| 5 | SPD | Near-universal spec requirement; high $ item | 25 |
| 6 | ATS | High $ when included; limited model universe | 20 |
| 7 | CURRENT TRANSFORMER / CT | Metering on most boards; moderate part count | 30 |
| 8 | VOLTAGE TRANSFORMER / CPT | CPT on most boards; VT less frequent | 20 |
| 9 | CAMLOCK | Service-entrance/temporary power panels; color-coded | 25 |
| 10 | TERMINALS | Every board has DIN rail terminal strips | 30 |
| 11 | POWER SUPPLY | 24VDC controls power; few models cover most cases | 15 |
| 12 | CONTROLS | Pilot devices, selector switches, push buttons | 30 |
| 13 | SWITCH | Disconnect / load-break switches | 20 |
| 14 | LIGHT | Pilot lights (often counted in CONTROLS) | 15 |
| 15 | GLASTIC | Bus supports, phase barriers; commodity | 20 |
| 16 | CB ACCESSORIES | Shunt trips, UVR, aux contacts, lugs for CBs | 30 |
| 17 | WIRE CABLE | THHN/THWN control wiring; standard sizes | 20 |
| 18 | CONDUIT | EMT, rigid; commodity, size-driven | 15 |
| 19 | HARDWARE | Mounting hardware, standoffs, screws | 20 |

**Total target SKUs across waves: ~480**

---

## Distributor Pricing Visibility

| Distributor | Base URL | Price Visible Without Login | Notes |
|-------------|----------|-----------------------------|-------|
| AutomationDirect | automationdirect.com | **YES** | Full prices shown publicly; best for controls, terminals, CBs they carry |
| Grainger | grainger.com | **YES (list price)** | List/non-contract price visible as guest; significantly above contractor price |
| Zoro | zoro.com | **YES** | Grainger subsidiary; often lower list than Grainger; no login to browse |
| Amazon Business | amazon.com | **YES (list)** | Useful for commodity parts (hardware, wire); verified pricing publicly visible |
| Galco Industrial | galco.com | **YES** | Shows prices without account for many products |
| HomElectrical | homelectrical.com | **YES** | Niche industrial; prices visible; useful for camlocks |
| State Electric | stateelectric.com | **NO** | Requires login / quote for pricing |
| Platt Electric (Rexel) | platt.com | **NO** | Account required; part of Rexel USA |
| Rexel USA | rexelusa.com | **NO** | Account required for pricing |
| Gordon Electric | gordonelectric.com | **NO** | Wholesale; pricing behind account |
| Gexpro | gexpro.com | **NO** | GE supply house; account required |
| City Electric | cityelectricsupply.com | **NO** | Account required |
| Graybar | graybar.com | **PARTIAL** | Some list prices shown; many require login |
| Newark Electronics | newark.com | **YES** | Good for controls, CTs, transformers; prices publicly visible |
| RS Components | rsdelivers.com | **YES** | Good for Phoenix Contact, ABB terminal blocks |

**Scrape-first sources (public pricing): AutomationDirect, Zoro, Grainger, Newark, Galco, HomElectrical**

---

## Category Detail

---

### CIRCUIT BREAKER

**Required Specification Fields:**
- `manufacturer` — Eaton, Square D (Schneider), Siemens, ABB, GE (currently Eaton-rebranded)
- `series` — e.g. Eaton BR/BJ/BAB, Square D QO/QOB/HGL/KAL, Siemens QP/BQD
- `frameModel` — e.g. NZM, EGB, HGB, F-Frame, G-Frame (maps existing key)
- `poles` — 1, 2, 3 (maps existing key)
- `ratedCurrentA` — 15–2500 A (maps existing key)
- `interruptingKA` — 10, 14, 18, 22, 25, 35, 42, 65, 100, 150, 200 kA (maps existing key)
- `voltageRating` — 120V, 240V, 277V, 480V, 600V AC (maps existing key)
- `tripUnitType` — Thermal-magnetic, Electronic (LSI, LSIG), Fixed thermal (maps existing key)
- `protectionFunctions` — L (long-time), S (short-time), I (instantaneous), G (ground-fault) (maps existing key)
- `mounting` — Plug-in, Bolt-on, Fixed (maps existing key)
- `applicationType` — Main, Feeder, Branch, Main-Lug-Only (maps existing key)
- `ulListing` — UL 489 listed
- `sccr` — Switchboard SCCR contribution (kA)
- `catalogNumber` — Manufacturer catalog # (maps existing key)

**Top US/CA Manufacturers for UL 891 Switchboard:**
1. Eaton (Cutler-Hammer / PowerDefense / Series C) — dominant
2. Square D / Schneider Electric (QO, KAL, MAL, PGL series)
3. Siemens (BQD, QP, NQNF, WL series)
4. ABB (Tmax, Formula series) — less common in US switchboards
5. GE (TQL, THQL — now Eaton-distributed)

**Data Sources (ranked by scrapeability):**
1. Eaton product pages + eaton.com catalog — prices NOT shown; use for specs
2. AutomationDirect — carries Eaton and generic MCBs; **prices visible**
3. Grainger — wide selection; **list prices visible as guest**
4. Zoro — Grainger subsidiary; **list prices visible**
5. Galco — industrial focus; **prices visible for many SKUs**
6. Square D / se.com — specs only, no pricing

**Price Reality:** List prices available via Grainger/Zoro; typical contractor discount 40–60% off list on high-volume breakers. Electronic trip units command premium. Pricing most stable for commodity frame sizes (100A–400A) and volatile for large frame (800A+).

---

### CB ACCESSORIES

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`
- `accessoryType` — Shunt Trip (ST), Under-Voltage Release (UVR), Auxiliary Contact, Alarm Contact, Key Lock, Handle Tie, Lug Kit, Motor Operator
- `frameCompatibility` — Which breaker frame(s) the accessory fits
- `voltageRating` — For coil accessories: 24V, 120V, 240V AC/DC
- `contactConfiguration` — For aux contacts: 1NO, 1NC, 2NO+2NC
- `ampRating` — For lug kits: conductor range

**Top Manufacturers:** Eaton, Siemens, Square D (same as parent breaker — accessories are manufacturer-specific)

**Data Sources:** Same as CIRCUIT BREAKER. Grainger/Zoro show prices.

**Price Reality:** Shunt trips typically $30–$120; aux contacts $15–$80. Always manufacturer-matched to breaker.

---

### ENCLOSURE

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `nemaRating` — NEMA 1, 3R, 4, 4X, 12 (maps existing key)
- `material` — Steel (14ga, 12ga, 11ga), 304SS, 316SS, Aluminum (maps existing key)
- `finish` — ANSI 61 gray powder coat, white, natural
- `widthIn`, `heightIn`, `depthIn` — enclosure dimensions
- `knockoutPattern` — Top, bottom, sides
- `mounting` — Floor-mount, wall-mount, sub-panel
- `ulListed` — UL 508A, UL 50

**Top US/CA Manufacturers:**
1. nVent Hoffman — market leader for commercial/industrial
2. Saginaw Control & Engineering (SCE) — popular US alternative
3. Rittal — common in industrial; strong for large switchboard enclosures
4. Wiegmann (nVent) — value tier
5. Hammond — Canadian strength

**Data Sources:**
1. nVent/Hoffman product pages (nvent.com) — specs; no public pricing
2. Zoro — **prices visible**; good Hoffman selection
3. Grainger — **list prices visible**
4. RSP Supply (rspsupply.com) — **prices visible** for Hoffman
5. Amazon — **prices visible** for smaller enclosures

**Price Reality:** List prices publicly available; enclosures are commodity-priced. Typical distribution discount 30–50%.

---

### BUSSING

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`
- `material` — Copper (C110), Aluminum (6101) (maps existing `material`)
- `conductorType` — Hard-drawn, Soft-drawn, Tin-plated (maps existing `wireType`)
- `crossSectionIn2` — e.g. 0.5"×4", 0.25"×3" — width × thickness
- `ratedCurrentA` — continuous amp rating per NEC Table 310.15
- `busBarLengthFt` — standard lengths (10ft, 12ft, 20ft)
- `holePattern` — standard punch pattern, spacing
- `ulRecognized` — UL 857 or UL 891 recognized

**Top US/CA Manufacturers/Suppliers:**
1. Storm Power Components — custom fabrication, UL 891 context
2. nVent ERIFLEX — Flexibar flexible bus, tinned copper 125A–2800A
3. Swarco (unverified) — bus bar stock
4. Local copper distributors (Metals Depot, Online Metals) — stock shapes
5. Fabrication in-house — very common for main bus

**Data Sources:**
1. Storm Power (stormpowercomponents.com) — RFQ basis, no public pricing
2. nVent ERIFLEX (nvent.com) — specs + distributor list, no direct pricing
3. Online Metals (onlinemetals.com) — **prices visible** for stock shapes
4. Grainger — limited bus bar stock; **list prices visible**

**Price Reality:** Custom bus bar is RFQ/fabrication. Stock copper bar available with public pricing from metals distributors. Typical cost driver is copper spot price (approx $3.50–$4.50/lb in 2026).

---

### CU (Copper Bus — Raw Material / In-Panel Bus)

*Note: In the DB, CU often refers specifically to copper bus stock used for grounding bar, neutral bar, and tap bus — distinct from BUSSING (main distribution bus).*

**Required Specification Fields:**
- `material` — Copper C110 (maps existing)
- `awgSize` — Or "bar" with dimensions (maps existing `awgSize`)
- `crossSectionMM2` — For bar stock
- `ratedCurrentA`
- `lengthFt`
- `finish` — Bare, tin-plated
- `form` — Bar, rod, strip, custom punch

**Top Suppliers:** Same as BUSSING above. Also: Burndy/Panduit for ground bars.

**Data Sources:** Same as BUSSING. nVent ERICO for grounding busbars (prices via distributors).

**Price Reality:** Commodity; priced to copper spot. Ground bus bars (nVent ERICO) have public pricing via Grainger/Zoro ~$15–$80.

---

### GLASTIC

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`
- `material` — GPO-3 (glass mat thermoset polyester) (maps existing `material`)
- `grade` — UTR-1494, UTR-1495, UTR-1497 (Rochling/Glastic grades)
- `thicknessIn` — 1/16" to 2"
- `widthIn`, `lengthIn` — sheet dimensions OR molded part dimensions
- `color` — Red, Black, White
- `dielectricStrengthVperMil`
- `flameRating` — UL 94 V-0
- `ulRecognized` — Yes/No
- `form` — Sheet, rod, tube, molded part (bus support, phase barrier)
- `temperatureIndexC` — 120°C electrical, 140°C mechanical

**Top US/CA Manufacturers:**
1. Rochling (formerly Glastic Corp, Cleveland OH) — original brand; dominant
2. Curbell Plastics — distributes GPO-3 sheet; **prices visible online**
3. Piedmont Plastics — distributor; **prices visible**
4. Mar-Bal Inc — molded thermoset parts (unverified for switchboard bus supports)
5. FPI Industries — fabricated GPO-3 bus supports
6. Switcher Electric — switchboard-specific GPO-3 parts

**Data Sources:**
1. Rochling/Glastic (rochling.com) — specs; RFQ pricing
2. Curbell Plastics (curbellplastics.com) — **prices visible** for sheet stock
3. Piedmont Plastics (piedmontplastics.com) — **prices visible**
4. Switcher Electric (switcherelectric.com) — switchboard-specific; check for pricing

**Price Reality:** Sheet stock publicly priced; molded bus supports typically RFQ from specialty fabricators.

---

### CAMLOCK

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series` — Series 16 is dominant for switchboards (maps existing)
- `gender` — Male (plug), Female (connector/cap) (maps existing)
- `style` — Inline (cable-end), Panel-mount (feed-through)
- `ampRating` — 100A, 190A, 300A, 400A (maps existing `ratedCurrentA`)
- `wireRange` — AWG/kcmil: e.g. #6–#2 AWG, 2/0–4/0 AWG (maps existing `wireRange`)
- `voltageRating` — 600V AC / 250V DC (maps existing)
- `color` — Black (A), White/Gray (B), Red (C phase), Blue (Neutral), Green (Ground), Orange (unverified) — phase identification (maps existing `color`)
- `material` — Body: neoprene/thermoplastic; Contact: silver-plated copper
- `ulListed` — UL 1682 or UL listed
- `csaListed` — Yes/No
- `nemaRating` — NEMA 3R (weatherproof while mated)

**Phase Color Convention (NFPA 70):**
- Series 16 standard: Black=A phase, Red=B phase, Blue=C phase, White=Neutral, Green=Ground

**Top US/CA Manufacturers:**
1. Eaton Crouse-Hinds (Cam-Lok™ E1016 series) — industry standard
2. Marinco (Marinco Series 16) — fully intermateable with Crouse-Hinds
3. Leviton (Series 16) — intermateable
4. Hubbell (Series 16) — intermateable
5. Ericson Manufacturing — intermateable

*All Series 16 products from all manufacturers are intermateable per UL 1682.*

**Data Sources:**
1. Eaton Crouse-Hinds catalog PDF (eaton.com) — specs; no public pricing
2. HomElectrical (homelectrical.com) — **prices visible**; good camlock selection
3. ATI Electrical (atielectrical.com) — **prices visible**; Marinco focus
4. Wire & Supply (wireandsupply.com) — **prices visible**; Hubbell/Marinco
5. Temporary Power Supply (temporarypowersupply.com) — **prices visible**
6. Zoro — **prices visible**; mixed selection

**Price Reality:** Series 16 inline connectors publicly priced $25–$120 depending on amp rating and wire size. Panel-mount feed-through versions higher ($60–$200).

---

### SPD (Surge Protective Device)

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `spdType` — Type 1, Type 2, Type 1+2 (UL 1449 4th edition)
- `voltageSystem` — 120/240V, 120/208V 3ph, 277/480V 3ph (maps existing `voltageRating`)
- `maxContinuousVoltage` — MCOV (V)
- `nominalDischargeCurrentKA` — In (kA) per mode, 8×20µs waveform
- `maxSurgeCurrentKA` — Imax (kA) per mode (maps existing `interruptingKA` concept)
- `protectionModes` — L-N, L-G, N-G, L-L (maps existing `protectionFunctions`)
- `sccr` — Short-circuit current rating (kA) (maps existing `sccr`)
- `mounting` — Panel-mount, DIN rail, integrated switchboard
- `nemaRating` — NEMA 1, 4, 4X (maps existing)
- `indicatorType` — LED status, display, remote monitoring
- `ulListed` — UL 1449 4th edition
- `responseLevelCategory` — Category C1, C2 per UL 1449

**Top US/CA Manufacturers:**
1. Eaton (SPD series, PureWave) — dominant; integrated switchboard versions
2. Siemens (TSPD, QSPD series)
3. ABB (OVR series) — less common in US switchboards
4. Mersen (formerly Ferraz Shawmut) — (unverified for UL 891 integral)
5. Citel (Citel US) — growing presence; good for switchboard integral
6. LEA (unverified for UL 891)
7. Hubbell (TVSS/SPD line) — present in commercial

**Data Sources:**
1. Eaton product pages (eaton.com) — specs; no public pricing
2. Siemens SPD catalog PDF — specs; no direct pricing
3. Grainger — **list prices visible** for Eaton/Siemens SPD
4. Zoro — **list prices visible**
5. Newark — **prices visible**; good for ABB/Citel

**Price Reality:** Type 2 200kA SPDs commonly $300–$800 list; significant variation by modes protected and monitoring features.

---

### ATS (Automatic Transfer Switch)

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `ratedCurrentA` — 100A, 200A, 400A, 600A, 800A, 1000A, 1200A, 1600A, 2000A, 3000A (maps existing)
- `poles` — 2P, 3P, 4P (maps existing)
- `voltageRating` — 120/240V, 208Y/120V, 480Y/277V (maps existing)
- `transferType` — Open transition, Closed transition, Soft-load
- `controllerType` — Basic, programmable, communication-ready
- `serviceEntrance` — Yes/No (UL 891 listed for SE)
- `bypassIsolation` — Yes/No
- `mechanicalInterlockType` — Mechanically interlocked CBs, motorized
- `ulListing` — UL 1008 (ATS standard)
- `nemaRating` — NEMA 1, 3R (maps existing)
- `mounting` — Standalone, switchboard-integral (maps existing)
- `transferTimeMs` — Typical transfer time in ms

**Top US/CA Manufacturers:**
1. ASCO Power Technologies (Emerson) — market leader; ASCO 300, 7000 series
2. Eaton (TS series, contactor-type) — strong switchboard integration
3. Russelectric (Russ Electric) — high-end, switchboard integral
4. GE Zenith (now ABB) — widely specified
5. Cummins PowerCommand — used with Cummins gensets
6. Kohler Power Systems — paired with Kohler generators

**Data Sources:**
1. ASCO product pages (ascopower.com) — specs; no public pricing
2. Pioneer Critical Power (pioneercriticalpower.com) — **prices visible** for used/surplus
3. Eaton ats pages — specs; RFQ / distributor
4. Grainger — **list prices visible** for smaller ATSs
5. Zoro — limited ATS selection; **prices visible** where stocked

**Price Reality:** ATS is high-$ item; 400A 3ph list price $3,000–$15,000. Prices NOT typically public for large ATSs; distributor quote required. Small residential/light commercial (< 200A) visible on Grainger/Zoro.

---

### CONTROLS

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `controlType` — Pushbutton (momentary), Selector switch, Key switch, Mushroom head E-stop
- `operatorSize` — 22mm (standard), 30mm
- `mounting` — Panel cutout (22mm round), DIN rail (maps existing `mounting`)
- `poles` — 1NO, 1NC, 2NO, 2NO+2NC — contact configuration
- `currentRatingA` — Contact rating (typically 6A or 10A at 600VAC)
- `voltageRating` — 600V AC max
- `ipRating` — IP66, IP67, IP69K
- `color` — Black, Red, Green, Yellow, Blue (maps existing `color`)
- `illuminated` — Yes/No; if yes: LED voltage
- `ulListed` — UL 508

**Top US/CA Manufacturers:**
1. Schneider Electric Harmony (XB7, ZB5 series) — widely used
2. Eaton M22 series — common US alternative
3. IDEC HW series — quality; push-in terminals
4. Allen-Bradley / Rockwell Automation (800T/800F) — common in AB shops
5. Siemens (3SB series)
6. AutomationDirect GCX series — value tier; **prices visible on ADC**

**Data Sources:**
1. AutomationDirect (automationdirect.com) — **prices visible**; GCX and compatible
2. Grainger — **list prices visible**; all major brands
3. Newark — **prices visible**; Schneider, IDEC, Eaton
4. RS Components — **prices visible**; full Schneider/Eaton range

**Price Reality:** 22mm pushbuttons $10–$50 each; selector switches $15–$60; contact blocks $5–$25. Publicly priced on multiple sources.

---

### CURRENT TRANSFORMER (CT)

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `ctRatio` — Primary:Secondary, e.g. 100:5, 200:5, 400:5, 600:5, 800:5, 1000:5, 1200:5, 2000:5
- `accuracyClass` — 0.3, 0.6, 1.2 (metering); 2.5, 10 (relaying) — per IEEE C57.13
- `burden` — B-0.1, B-0.2, B-0.5, B-1.0, B-2.0 — secondary burden rating
- `windowType` — Solid core (donut), Split-core, Bushing-type (maps existing `style`)
- `windowSizeIn` — Inner aperture diameter/size (maps existing `awgSize` concept → rename `windowSizeIn`)
- `currentRatingA` — Continuous primary current (= numerator of ratio)
- `ratingFactor` — RF: 1.0, 1.5, 2.0, 3.0, 4.0
- `polarity` — Subtractive (standard)
- `primaryConductorType` — Bar, cable
- `mounting` — Panel, switchboard bus-mount, din (maps existing `mounting`)
- `ulListed` — UL listed / IEEE C57.13 rated

**Top US/CA Manufacturers:**
1. Flex-Core (Columbus OH) — dominant for switchboard metering CTs
2. CR Magnetics (St. Louis MO) — solid and split core; good range
3. Eaton — 5A solid core; standard switchboard use
4. Crompton (ABB) — metering grade
5. Midwest Current Transformer — (unverified)
6. GE / Grid Solutions — utility grade

**Data Sources:**
1. Flex-Core (flex-core.com) — specs + distributor links; pricing via distributors
2. CR Magnetics (crmagnetics.com) — **some prices visible online**
3. Galco (galco.com) — **prices visible** for Eaton CTs
4. Automation Systems Interconnect (asi-ez.com) — **prices visible**
5. Newark — **prices visible** for CR Magnetics, some Eaton

**Price Reality:** Standard switchboard CTs (solid core, 0.6 class, B-1 burden) $20–$80 each. Split-core premium 2–3×. Publicly priced on multiple sources.

---

### VOLTAGE TRANSFORMER / CPT (Control Power Transformer)

*Covers both metering-grade VTs and panel CPTs (step-down isolating transformers)*

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `transformerType` — CPT (Control Power), VT (Potential/Voltage Transformer for metering)
- `primaryVoltage` — 120V, 240V, 480V, 600V (maps existing `voltageRating`)
- `secondaryVoltage` — 24V, 120V, 240V; or for VT: 120V secondary (nominal)
- `kvaRating` — For CPTs: 0.1, 0.25, 0.5, 1, 1.5, 2, 5, 10 kVA (maps existing `ratedCurrentA` → use `kvaRating`)
- `vaRating` — For small CPTs/VTs: 50VA, 100VA, 250VA
- `ptRatio` — For VTs: e.g. 4:1 (480:120), 5:1 (600:120)
- `accuracyClass` — For metering VTs: 0.3, 0.6 (IEEE C57.13)
- `phases` — 1-phase, 3-phase
- `mounting` — Panel, DIN rail, bolt-mount (maps existing)
- `enclosureType` — Open frame, enclosed, potted
- `primaryFusing` — Integral fuse, external fuse required
- `ulListed` — UL 506, UL 1561

**Top US/CA Manufacturers:**
1. Square D (Schneider Electric) — 9070 series CPT; dominant
2. Eaton — Type CPT series; common
3. Acme Electric (Hubbell) — 1-phase CPT
4. Hammond Power Solutions — Canadian-strong; common in US
5. GE / ABB — VT/PT metering grade
6. Larson Electronics — CPT range; prices online (larsonelectronics.com)

**Data Sources:**
1. Grainger — **list prices visible**; Square D/Eaton CPT
2. Zoro — **list prices visible**
3. AutomationDirect — **prices visible**; carries some CPT types
4. Larson Electronics (larsonelectronics.com) — **prices visible**; CPT focus
5. Newark — **prices visible**; some VTs

**Price Reality:** Small CPTs (100VA–500VA) $30–$120 list; 1kVA+ CPTs $100–$400. Metering VTs higher. Publicly priced widely.

---

### CT / VT / CPT (Combined Category)

*This DB key appears to be a catch-all. Spec fields are the union of CURRENT TRANSFORMER and VOLTAGE TRANSFORMER / CPT above. Key discriminator:*
- `instrumentType` — "CT", "VT", "CPT"

Use the same fields as the individual categories; apply `instrumentType` to filter.

---

### POWER SUPPLY

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `outputVoltageVDC` — 12V, 24V, 48V (maps existing `voltageRating`)
- `outputCurrentA` — 2.5A, 5A, 10A, 20A, 40A (maps existing `ratedCurrentA`)
- `outputPowerW` — watts (maps existing concept → `outputPowerW`)
- `inputVoltageRange` — 85–264 VAC (universal), 100–240 VAC
- `inputPhases` — 1-phase, 3-phase
- `mounting` — DIN rail, panel mount (maps existing)
- `protectionFeatures` — OCP, OVP, SFB (Selective Fuse Breaking), redundancy
- `efficiency` — Typical % at full load
- `operatingTempC` — -25 to +70°C typical
- `approvals` — UL 508, CE, cUL
- `dimensions` — Width in mm (DIN rail units, e.g. 6TE = 33.6mm)

**Top US/CA Manufacturers:**
1. Phoenix Contact (QUINT series, STEP series) — dominant; 5A/10A/20A/40A 24VDC DIN
2. PULS — premium; CP10/CP20/CP40 series
3. Sola/Hevi-Duty (Emerson) — legacy install base
4. Siemens (SITOP series) — common in Siemens-heavy shops
5. Allen-Bradley / Rockwell (1606-XLP series) — AB-standard shops
6. AutomationDirect (PSP series) — value tier; **prices visible on ADC**

**Data Sources:**
1. AutomationDirect — **prices visible**; value tier PSP/RHINO series
2. Grainger — **list prices visible**; Phoenix Contact, Sola
3. Phoenix Contact direct (phoenixcontact.com) — specs; pricing via distributors
4. Amazon — **prices visible**; Phoenix QUINT widely sold
5. Newark — **prices visible**; PULS, Phoenix Contact

**Price Reality:** 10A 24VDC Phoenix QUINT list ~$150–$200; 20A list ~$250–$350. Publicly priced. AutomationDirect value alternatives 30–50% less.

---

### LUGS

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `lugType` (maps existing)
- `connectionType` — Mechanical (set screw), Compression (hydraulic), Insulated piercing
- `conductorMaterial` — Copper-only, Aluminum-only, Al/Cu dual-rated (maps existing `material`)
- `wireRange` — Min–Max AWG or kcmil (maps existing)
- `numBarrels` — Single, dual, tri-tap
- `holeCount` — Number of mounting/tongue holes (maps existing `holes`)
- `holeDiameterIn` — Bolt hole diameter (maps existing `awgSize` → prefer `holeDiameterIn`)
- `holeSpacingIn` — Center-to-center bolt spacing
- `tongueThicknessIn` — For stackable lugs
- `voltageRating` — 600V, 1000V
- `ulListing` — UL 486A-486B
- `csaListing` — CSA C22.2 No. 65
- `termType` — Ring, Spade, Straight barrel, 90°

**Top US/CA Manufacturers:**
1. Burndy (Hubbell) — compression lug leader; HYLINK, YA series
2. Ilsco — mechanical and compression; SPA, SGB, GBK series
3. Penn-Union — compression and mechanical
4. Panduit — widely cross-referenced
5. nVent ERIFLEX — large format (≥ 400 kcmil)
6. Thomas & Betts (T&B / ABB) — Blackburn series; comprehensive

**Data Sources:**
1. AutomationDirect — **prices visible**; Penn-Union stock
2. Grainger — **list prices visible**; Ilsco, Burndy, T&B
3. Zoro — **list prices visible**
4. Conversions Tech (conversionstech.com) — **prices visible** + cross-reference tool

**Price Reality:** Mechanical lugs (up to 500kcmil) publicly priced $5–$80 each. Compression lugs similar range. Widely available with public pricing.

---

### TERMINALS (Terminal Blocks)

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `connectionType` — Screw clamp, Spring clamp (push-in), Feed-through, Ground, Fused, CB-style (maps existing)
- `wireRange` — AWG: e.g. 28–12 AWG, 10–2 AWG (maps existing)
- `currentRatingA` — Per terminal: 10A, 16A, 24A, 32A, 76A
- `voltageRating` — 300V, 600V, 800V, 1000V (maps existing)
- `mountingType` — DIN 35mm rail (TS35), DIN 32mm, Panel mount (maps existing)
- `bodyColor` — Gray (standard), Blue (neutral), Green-yellow (PE/ground), Red, Black
- `termWidth` — Pitch in mm: 5mm, 6mm, 8mm, 10mm
- `poles` — 1-pole, 2-pole, multi-pole
- `marker` — Tag strip, print-on
- `ulListed` — UL 508 / UL 1059

**Top US/CA Manufacturers:**
1. Phoenix Contact (PT, PTFIX, UK series) — most specified in US controls
2. Wago (281, 282, 2273 series) — push-in leader
3. ABB Entrelec (SNK, STD series; now partially TE Connectivity)
4. Marathon Special Products (US standby)
5. Weidmuller — strong in industrial
6. AutomationDirect (DINterm series) — value; **prices on ADC**

**Data Sources:**
1. AutomationDirect — **prices visible**; DINterm
2. Grainger — **list prices visible**; Phoenix Contact, Wago
3. Newark — **prices visible**; full range
4. RS Components — **prices visible**; European brands
5. Phoenix Contact direct — specs; pricing via distributors

**Price Reality:** Standard 12AWG screw-clamp terminal $1–$4 each. Phoenix PT 1.5 ~$1.20 each list; PTFIX bus blocks $8–$20. Widely publicly priced.

---

### WIRE CABLE

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`
- `wireType` — THHN, THWN-2, MTW, XHHW-2 (maps existing)
- `awgSize` — 22 AWG through 750 kcmil (maps existing)
- `conductorMaterial` — Copper, Aluminum (maps existing `material`)
- `strandCount` — Solid, 7-strand, 19-strand, 37-strand
- `voltageRating` — 600V, 1000V (maps existing)
- `tempRating` — 60°C, 75°C, 90°C
- `insulationColor` — Black, White, Red, Blue, Orange, Yellow, Green, Green/Yellow, Gray (maps existing `color`)
- `ulListed` — UL 83 (THHN), UL 44 (XHHW)

**Top US/CA Manufacturers:**
1. Southwire (SIMpull THHN) — dominant US
2. Encore Wire — second largest US; often lower price
3. General Cable (now Prysmian) — #2 globally, strong US
4. Belden — control wire / specialty

**Data Sources:**
1. Grainger — **list prices visible**; Southwire, Belden
2. Zoro — **list prices visible**
3. Wire & Supply (wireandsupply.com) — **prices visible**
4. Direct from Southwire — online store; **prices visible** (southwire.com)

**Price Reality:** THHN pricing fluctuates with copper spot. 12 AWG THHN list ~$0.25–$0.45/ft publicly visible. Sold by foot or 500ft/1000ft spool.

---

### CONDUIT

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`
- `conduitType` — EMT (Electrical Metallic Tubing), IMC, Rigid GRS, ENT, FMC, LFMC (maps existing `style`)
- `tradeSizeIn` — 1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4"
- `material` — Steel (galvanized), Aluminum, PVC (maps existing `material`)
- `lengthFt` — Standard: 10ft
- `ulListed` — UL 797 (EMT), UL 6 (Rigid)
- `nemaRating` — NEMA application suitability

**Top US/CA Manufacturers:**
1. Allied Tube & Conduit (Atkore) — dominant EMT/IMC
2. Wheatland Tube (Zekelman) — #2 US EMT
3. Triangle Wire & Cable / Southwire — ENT/FMC
4. Carlon (ABB) — PVC conduit

**Data Sources:**
1. Grainger — **list prices visible**; EMT wide selection
2. Zoro — **list prices visible**
3. AutomationDirect — **prices visible**; limited selection
4. Home Depot Pro / supply chain — **prices visible** for EMT

**Price Reality:** EMT is commodity; 1/2" EMT 10ft ~$2.50–$5.00 publicly visible. Price driven by steel tariffs.

---

### HARDWARE

**Required Specification Fields:**
- `manufacturer` (often generic/commodity)
- `hardwareType` — Hex bolt, Hex nut, Flat washer, Lock washer, Machine screw, Standoff, Threaded rod, Anchor, Clamp
- `material` — Steel (ZP), Stainless 18-8, Aluminum (maps existing `material`)
- `threadSize` — #10-32, #10-24, 1/4-20, 3/8-16, 1/2-13
- `lengthIn` — As applicable
- `finish` — Zinc-plated, plain, hot-dip galv
- `quantityPkg` — Per package count

**Top US/CA Suppliers:**
1. Fastenal — **prices visible with account; some publicly visible**
2. Grainger — **list prices visible**
3. Zoro — **list prices visible**
4. McMaster-Carr — **prices visible without login** (mcmaster.com)
5. Home Depot / Lowe's Pro — **prices visible**

**Price Reality:** Commodity; McMaster-Carr is gold standard for specs + public pricing.

---

### SWITCH

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `switchType` — Disconnect switch, Load-break switch, Safety switch, Fusible switch, Non-fusible (maps existing `style`)
- `ratedCurrentA` — 30A, 60A, 100A, 200A, 400A, 600A, 800A, 1200A (maps existing)
- `poles` — 2P, 3P, 4P (maps existing)
- `voltageRating` — 240V, 480V, 600V AC (maps existing)
- `fusedOrNon` — Fusible, Non-fusible
- `fuseClass` — J, R, H if fusible
- `nemaRating` — NEMA 1, 3R, 4, 4X, 12 (maps existing)
- `mounting` — Surface, flush (maps existing)
- `ulListed` — UL 98

**Top US/CA Manufacturers:**
1. Eaton (DH/DG/HD/HN Disconnect series)
2. Square D / Schneider (QMB/QMQB series)
3. Siemens (HNFC/GFNF series)
4. ABB

**Data Sources:**
1. Grainger — **list prices visible**
2. Zoro — **list prices visible**
3. AutomationDirect — **prices visible**; limited

**Price Reality:** 30A NEMA 1 non-fusible switch ~$30–$80 list. Publicly priced.

---

### LIGHT (Pilot Lights / Indicator Lights)

**Required Specification Fields:**
- `manufacturer`, `catalogNumber`, `series`
- `operatorSize` — 22mm, 30mm (maps existing `awgSize` → prefer `operatorSize`)
- `lightType` — LED, Incandescent, Neon
- `illuminationVoltage` — 6V, 24V, 120V, 240V AC/DC (maps existing `voltageRating`)
- `color` — Red, Green, Amber/Yellow, Blue, White, Clear (maps existing `color`)
- `lens` — Flush, projecting, transformer (maps existing `style`)
- `ipRating` — IP65, IP66, IP67
- `mounting` — 22mm panel cutout
- `contactBlocks` — Yes/No; how many NO/NC
- `ulListed` — UL 508

*Note: Pilot lights are often specified alongside CONTROLS. Consider merging catalog with CONTROLS category during scrape.*

**Top US/CA Manufacturers:** Same as CONTROLS — Schneider Harmony, Eaton M22, IDEC HW, Allen-Bradley 800T, AutomationDirect GCX

**Data Sources:** Same as CONTROLS.

**Price Reality:** 22mm LED pilot light $8–$40 list. Publicly priced widely.

---

## Pricing Summary by Source

| Source | URL | Price Visible (No Login) | Best Categories |
|--------|-----|--------------------------|-----------------|
| AutomationDirect | automationdirect.com | YES (full) | CONTROLS, TERMINALS, POWER SUPPLY, CB (supplementary), WIRE |
| Zoro | zoro.com | YES (list) | CB, LUGS, ENCLOSURE, SPD, SWITCH, CONDUIT, HARDWARE |
| Grainger | grainger.com | YES (list price) | All categories; highest list prices |
| McMaster-Carr | mcmaster.com | YES | HARDWARE, GLASTIC (some), CONDUIT fittings |
| Newark | newark.com | YES | CT, VT/CPT, CONTROLS, TERMINALS, POWER SUPPLY |
| Galco | galco.com | YES (many) | CB, CONTROLS, POWER SUPPLY |
| HomElectrical | homelectrical.com | YES | CAMLOCK, CB accessories |
| ATI Electrical | atielectrical.com | YES | CAMLOCK |
| Wire & Supply | wireandsupply.com | YES | CAMLOCK, WIRE |
| Amazon | amazon.com | YES (list) | POWER SUPPLY, TERMINALS, HARDWARE |
| Curbell Plastics | curbellplastics.com | YES | GLASTIC sheet |
| Piedmont Plastics | piedmontplastics.com | YES | GLASTIC sheet |
| Larson Electronics | larsonelectronics.com | YES | CPT/VT |
| Graybar | graybar.com | PARTIAL | Some list prices shown |
| Rexel USA / Platt | platt.com / rexelusa.com | NO | Account required |
| Gordon Electric | gordonelectric.com | NO | Account required |
| State Electric | stateelectric.com | NO | Account required |

---

*End of PLAN.md*
