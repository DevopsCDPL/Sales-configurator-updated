# UL 891 Switchboard — Design Input Knowledge Base

Reference for what a complete switchboard design/quote requires, and how the
configurator's System Design intake maps to it. Sources: UL 891 overview guides
(coastlabel.com, payapress.com, pcxcorp.com, ul.com, enerconpower.com), NEC
Articles 408/240/230, TPS estimate workbook. Compiled 2026-06-11.

## 1. Inputs the intake ALREADY captures
| Requirement | Intake field |
|---|---|
| System voltage + wiring config (3Ø4W / 3Ø3W / 1Ø3W) | Voltage System (8 std US systems) |
| Source scheme | Single Main / Main-Tie-Main / Multi-source |
| Available fault current → SCCR | Utility Fault (kA) (65 kA assumed if unknown) |
| Service entrance (NEC 230.95 GFP, SUSE label, bonding) | Service Entrance toggle → safety rules R7 |
| Environment (NEMA type, heaters) | Indoor/Outdoor + Special Environment → R10 |
| Feeder schedule (description, load type, kW/kVA/A/HP, PF, continuous, poles, qty) | Feeder grid w/ Excel paste |
| Continuous loads ×125% (NEC 210.19/215.2), motor FLA (NEC 430.250) | engine load calc per row |
| Main bus ampacity from total load | nextLadder over TPS bus ladder |
| Bus material/size/supports | TPS bus schedule + neutral schedule + glastic spacing (SCCR-based) |
| Spare/space provisioning | Spare + Space load types |

## 2. Inputs NOT yet in the intake (add when TPS confirms they vary per job)
- **Utility metering section** (PT/CT compartment, utility company requirements) — big space/cost driver
- **Customer power metering / HMI** (per-feeder metering, communicating trip units)
- **SPD (surge protection) yes/no + rating** — currently only a component pick
- **Ground-fault protection scheme** beyond service entrance (per-feeder GFP)
- **Bus bracing requirement** (fully rated vs series rated approach)
- **Future space %** (specified by consultants; we have Space rows but not a %)
- **Seismic certification** (IBC/OSHPD) — proposal mentions 1% calc only
- **Ambient temperature / altitude derating** (NEC 310.15; >40°C or >2000 m)
- **Cable entry: top/bottom + number/size of conductors per feeder** (drives lug selection; lugs are SEED 1/pole now)
- **Access: front-only vs front+rear** (affects frame depth choice — frame library has accessType)
- **Breaker brand preference / spec'd basis of design** (engineer swap exists; a default preference would pre-filter)
- **Finish/paint** (ANSI 61 assumed)

## 3. Standards quick reference
- **UL 891**: dead-front switchboards ≤600 V; SCCR is an ASSEMBLY rating (10–200 kA); bus copper/aluminum with size/spacing/support rules; bonded ground bus required.
- **NEC 408**: switchboard installation (clearances, plumb/level, field marking).
- **NEC 240.6**: standard breaker ratings ladder (engine uses TPS ladder).
- **NEC 240.87**: arc energy reduction (ERMS/ZSI) ≥1200 A — safety rule R5/R6.
- **NEC 230.95**: ground-fault protection on 480Y/277 service disconnects ≥1000 A — R7.
- **NEC 110.16**: arc-flash labels — generated per section (GEN-LABEL).
- **NEC 430.250**: 3Ø motor FLA table — seeded, drives HP rows.
- Best practice per industry guides: quoting accuracy rises with SLD + written spec up front — exactly what Propose line-up generates (SLD + sections + spec'd devices).

## 4. Engine behaviour (deterministic, NOT AI)
Propose line-up = pure calculation: per-row NEC load calc → device ladder pick →
cheapest catalog breaker passing (rating, kA, class) → greedy section packing
(frame heights) → bus from TPS schedule → SCCR roll-up → SLD/elevation. Same
inputs always give the same output; every step auditable. Engineer overrides:
swap (proposal + post-accept), section editor (planned), component picks.
