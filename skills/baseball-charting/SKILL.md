---
name: baseball-charting
description: Baseball scouting, charting, and game prep tools for Lincoln High School Fighting Zebras and summer league — MAXpreps integration, PitchIQ app reference, scouting packet generation, and coaching workflows.
metadata: {"openclaw":{"emoji":"⚾"}}
---

# Baseball Coaching — PitchIQ Scouting & Game Prep

Mike is head coach at Lincoln High School (Fighting Zebras) and coaches Marysville Giants (Pacific Empire Summer College League) plus youth baseball. PitchIQ is the iOS app he built for game charting and scouting.

---

## Teams

| Team | Level | Role |
|------|-------|------|
| Lincoln High School Fighting Zebras | Varsity HS | Head Coach |
| Pacific Empire Summer College League — Marysville Giants | Summer College | Coach |
| Youth Baseball | Youth | Coach |

---

## PitchIQ App

- **Repo:** `github.com/mallen012/bullpen-iq` (private, master branch)
- **Stack:** React Native (Expo SDK 52), Supabase, Zustand, TanStack Query
- **Domain:** PitchIQ.net
- **Supabase URL:** `https://vvxwrwhishtyhntofvst.supabase.co`

### Key Features
- **ChartP** — Live pitcher charting (pitch-by-pitch: strike/ball, type, velocity, zone, AB results)
- **ChartB** — Opponent hitter scouting (ratings, zone tracking, spray charts, multi-game series)
- **Catcher Dashboard** — Compare catchers by strike%, K, BB, PB/WP/CS/SB per pitcher pairing
- **ClutchUP** — Hitting drill game with spray chart scoring
- **MAXpreps Import** — Roster + stats import via Edge Function scraping
- **Scouting Packet** — Printable ChartB packets from MAXpreps data

---

## Scouting Workflow (Weekly Game Prep)

### Step 1: Get Opponent MAXpreps URL
Find the opponent on MAXpreps. URL format:
```
https://www.maxpreps.com/{state}/{city}/{school-mascot}/baseball/stats/
```

### Step 2: Generate Scouting Materials
Run from the bullpen-iq project directory on Mike's Windows machine:

```bash
cd c:/Users/mikea/projects/baseball/bullpen-iq

# Terminal text scouting report (quick intel)
npx tsx tools/scout-report.ts "<maxpreps-url>"

# Full printable scouting packet (HTML → print to PDF)
npx tsx tools/scout-chartb.ts "<maxpreps-url>" 14

# Coach intel pages only (4 copies, landscape)
npx tsx tools/scout-chartb.ts "<maxpreps-url>" 14 --coach-only
```

### Step 3: Output Location
- HTML file generated at: `c:/tmp/PitchIQ_Scout_{TeamName}.html`
- Auto-opens in browser
- Print to PDF or paper (binder-friendly margins: 0.6in left for hole punch)

### Output Structure (Full Packet)
| Pages | Content |
|-------|---------|
| 1–14 | Player ChartB scouting sheets (pre-filled from MAXpreps) |
| 15–16 | Blank template sheets for manual charting |
| 17–20 | Coach intel sheets (landscape, foldable) |

---

## Scouting Rating System

All ratings computed from `src/utils/scouting-ratings.ts` (single source of truth).

| Rating | Formula | Scale |
|--------|---------|-------|
| Speed | SB/game × 3 + triples/AB × 40 + runs/game × 0.5 | 1-5 |
| Power | SLG × 3 + HR/AB × 20 + XBH/AB × 5 | 1-5 |
| Aggressiveness | K% × 5 - BB% × 4 + 0.5 | 1-5 |
| SB Threat | 0→1, 1-3→2, 4-8→3, 9-15→4, 16+→5 | 1-5 |

### Auto-Generated Tags
- Speed ≥ 4: SPEED THREAT
- Power ≥ 4: POWER
- SB ≥ 4: WILL RUN
- Aggressiveness ≥ 4: FREE SWINGER
- Aggressiveness ≤ 2: PATIENT
- AVG ≥ .350: CONTACT HITTER
- OBP ≥ .400: HIGH OBP
- K% ≥ 30%: STRIKES OUT
- ERA ≤ 2.0 + IP ≥ 5: ACE
- IP ≥ 3: DUAL THREAT

---

## Coach Intel Sheet Layout

**Left side (visible when folded):**
- **OFFENSE** — Top 3 leaders: Singles, Doubles, Triples, HR, SB, BB, K, Bunt Threat
  - #1 leaders highlighted in dark green (ties included)
- **DEFENSE** — Pitching staff table sorted by IP:
  - Columns: #, Pitcher, IP, ERA, W, L, K, BB, H, BAA, RA, SB, WHIP
  - Red bold on category leaders (best ERA, most K, most W, fewest BB, best WHIP)
  - Red bold on top 2 SB players (ties included)
  - Shaded columns: K/BB (orange), H/BAA/SB (green)
- Bunt threats + speed threats callouts
- Roster quick reference

**Right side (hidden when folded):**
- Pre-Game / Lineup Notes (lined)
- Pitching Adjustments (lined)
- Key At-Bats / Situations (lined)
- Post-Game Notes (lined)
- **Key Takeaways** box: top 3 threats, pitching staff summary, team tendencies

---

## ChartP Field Mappings (Pitcher Chart)

Per-pitch: strike/ball, pitch type (FB/CB/CH/SL/CT/KN), velocity, zone (1-9 + outside), AB result, batter jersey#

Session totals: total pitches, strikes, balls, strike%, 1st pitch strike%, K, BB, HBP, hits, ER, velo averages by type

Catcher tracking: PB, WP, CS, SB per pitcher-catcher pairing

---

## ChartB Field Mappings (Scouting Chart)

Header ratings: bunt threat (Y/N + 1-4), runner (G/Y/R), SB (1-5), power (1-4), aggressiveness (1-4)

Per AB: pitch-by-pitch (FB/CB/CH/SL/CT, strike/ball, swing Y/N, zone coords), AB result, spray chart hit

Multi-game: color-coded by game (1=blue, 2=green, 3=red, 4=black)

---

## MAXpreps Integration

- **Roster import:** Edge Function `scrape-maxpreps` → POST to Supabase
- **Stats import:** Edge Function `scrape-maxpreps-stats` → scrapes print page for full batting/pitching/fielding
- **Search:** `maxpreps.com?q={query}&t=school` → returns school list with canonical URLs
- **Own roster refresh:** MAXpreps refresh button in app (was opponent-only, now works for own team too)

---

## Environment Requirements

```bash
# .env file in bullpen-iq project root
EXPO_PUBLIC_SUPABASE_URL=https://vvxwrwhishtyhntofvst.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Tools needed: Node.js, npx, tsx (`npm i -g tsx`)

---

## When Mike Asks You To...

**"Scout [team name]"** or **"Prep for [opponent]"**
1. Help find their MAXpreps URL
2. Remind Mike to run the scouting tools on his laptop
3. Summarize key takeaways if he shares the text report output

**"Who's their best hitter?"** or **"What should we know about [player]?"**
- Reference the scouting rating system above
- Look at OPS, K%, BB%, SB, HR for quick assessment

**"What's our pitching plan?"**
- High K% hitters: expand zone, off-speed early
- Low K% hitters: tough outs, make them chase
- High BB% hitters: attack zone, don't nibble
- Low BB% hitters: use off-speed out of zone
- SB threats: quick slide step, vary timing

**"How did [pitcher] do?"**
- Reference ChartP session data: total pitches, strike%, K, BB, velo, pitch mix
- Check AB efficiency (goal: 3-5 pitch ABs, flag 6+ pitch ABs)

---

## Key Dates & Schedule Context
- HS season: February–May
- Summer league: June–July
- Mike preps scouting packets weekly before each series
- Games are typically Tue/Thu with occasional Saturday tournaments
