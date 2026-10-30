# Strata — concept and decisions

Working title. A 3D flying game crossed with Tetris. A core floats in the sky.
You fly around it shooting blocks onto it. Close the core in completely and that
layer cements: unbreakable, part of the core, points. Then the next layer starts
on a bigger core.

Run: `npm install` then `npm run dev` → http://localhost:5500 (launch entry `strata`).
`?watch` plays itself (`?mode=containment&watch` for Containment). Dev handle:
`window.__strata` (`step`, `start(game)`, `aim`, `fire`, `cover`, `meteor`,
`drone`, `auto`, `skill`, `bots`, `addBot`).

---

## Decisions made for the first slice (all reversible; Paul decides)

**D1 — What counts as a layer.** A layer seals when *no outside air can reach any
core face*. Air moves face to face. That one rule covers everything in the pitch:
- blocks can sit directly on the core or several cells out
- the shell can be lumpy, and can go over your own or an opponent's half-built layer
- blocks meeting only at an edge still seal (you can't see core through an edge)

The minimum for the 3×3×3 start is 54 blocks (the six faces; edges and corners
aren't needed). Verified in node and in play.

**D2 — What cements.** Every loose block plus every pocket of trapped air. A
thicker or wider shell is worth more points but takes longer while meteors fly.
That's the Tetris risk: hold out for the four-line clear, or take the single.

**D3 — Score.** Cemented cells × 10 × layer number. Shooting down a meteor is
+50, a nibbler +25. No points for placing a block, only for sealing a layer
(like Tetris lines).

**D4 — Losing (solo Survival).** The core has 3 integrity. A meteor that hits
*bare* core takes one. Each seal restores one. Meteors that hit loose blocks
only smash blocks (radius ~2). A meteor that hits the ship stuns it for ~1 s.
That's the solo stand-in for "immobilise each other" in versus.

**D5 — Controls.** Mouse aims, WASD flies where you look, Space/Shift up and
down. Hold left click to spray blocks (~12/s). Right click fires a blast that
breaks loose blocks and shoots threats. The camera is over the shoulder, so the
ship never covers the crosshair. A wire cube previews exactly where the next
block lands.

**D6 — Look (revised 2026-10-30 to Paul's Switch Sports Resort references).**
The first pass was cel-shaded with ink outlines; Paul pointed it at two
recordings of that game instead. Now:
- **World:** no ink pass. Standard materials with a soft fresnel rim (`paint()`
  in `look.js`), light bloom that only catches whites and glows, and horizon
  haze. A turquoise sea with reef patches and surf lines, and lathe islands with
  sand, cliff, grass, round trees and one volcano. Bright white clouds.
- **Ship:** a white prop plane with teal trim and glowing cyan prop rings. The
  bots fly the same plane with violet rings.
- **Colour roles:** coral is you and the selected state, violet is the other
  side, lilac is your tags, mint is the cursor, navy is the info pills. Core
  layers avoid coral and violet, so both sides always read against them.
- **UI (`hud.js`, `hud.css`):** M PLUS Rounded throughout.
  - In play: an avatar next to the lilac score lozenge, which bumps with a
    yellow ring burst when points land. A navy layer tag, a white pill meter, and
    navy pills for the clock and the gems. A left-edge tab names the moment
    ("Almost sealed", "One more and it goes critical").
  - Callouts drop in letter by letter with a bounce, with hatch stripes and
    sparkles: cream and orange for good moments ("Sealed!", "Go!"), white and
    purple for bad ones ("Cracked!", "Critical!", "Finish!").
  - Screens: a splash with the logo on a white swoosh band, then a menu with a
    white card, outlined pill options that fill on hover, a mint chevron cursor
    and a coral description band over the blurred world. The result screen has
    an extruded "Result" title, a lilac badge (marked "New record!" when it's
    your best), a stats row, and a holographic wipe between screens.
- It's all original artwork in that register: no Nintendo marks or assets. "Sky
  Core" on the splash is a placeholder kicker, like the name.

**D7 — Feel.** Blocks pop in with overshoot. Each placement blip climbs a
pentatonic scale as the layer fills, so you hear the seal coming. The seal gets
a 0.3 s hit-stop, a white flash, a colour wave rolling out from your last block,
and a shockwave that knocks nibblers off. The banner rises fast, hangs, then
falls. With 8 or fewer faces left, orange beacons show the gaps through
everything.

**D8 — Versus scoring: split by blocks (Paul, 2026-10-30).** When a layer
seals, its points (trapped air included) are split by how many of its loose
blocks each player placed. The grid records who placed each block
(`grid.owner`; `cement()` returns `made.blocks[player]`). A block blasted and
re-placed belongs to whoever placed it last. Verified in node: 36 vs 18 blocks
→ 360 vs 180 points.

What this does to play: closing a layer is no longer a steal. The leader wants
it sealed now, and the trailer wants to blast the leader's blocks first to
shrink their share before it locks. Blasting becomes the comeback tool, not
just defence. Watch for one risk in playtests: if a seal pays the trailer too,
nobody ever has a reason *not* to help close it, and versus could drift into
co-op.

**D9 — Containment (built 2026-10-30).** Builder bots grow the core; you stop
it reaching critical mass, which is **4 sealed layers**. Your role here:
- you can't place blocks; both mouse buttons blast
- a bot takes 5 hits and gets knocked off its line by each one
- clearing their (plum) blocks earns a little; downing a bot earns more

Score is time held × 5 + 100 per bot + 5 per block. The end screen shows time
held and bots downed.

The bots run the same brain as `?watch`: they paint the nearest open face and
only fire when the shot lands on it. Pressure escalates in four ways:
- bots warp in close, on the far side of the core from you
- a new bot every 35 s, up to 4
- their fire rate speeds up from 0.30 s toward 0.15 s
- respawns shorten from 7 s toward 2.5 s

Each of their seals gets the full beat, with a falling sawtooth instead of your
rising chime. The last seal plays the end in slow motion.

Balance, simulated with an AI defender whose aim wobbles to stand in for a
person (`__strata.skill(k)`):

| Defender | Critical at |
|---|---|
| none | 1:26 |
| weak (0.2) | ~3:15 |
| mid (0.5) | 4:18 (first layer at 2:37, then 40 s, 33 s, 28 s) |
| perfect aim | never (first pass, 3-hit bots spawning far out; fixed) |

The shape is the Tetris death spiral: you hold, the speed-up breaks through,
and it collapses fast. These are simulated numbers. A real person flying with
a mouse is the test that matters.

**D10 — Round 3 of Paul's notes (2026-10-30).**
- **Loading cover** (about 1.5 s). It puts one of every meteor, pickup, bot,
  smoke cloud and laser in the scene and compiles the shaders, so nothing
  hitches the first time it appears. It runs on timers, not rAF, so a
  backgrounded tab still finishes loading.
- **Mute**: a button bottom-left, or the M key. It's remembered between visits.
- **Look fixes:**
  - the splash says just "Strata"; the menu, picker and pause headers use the
    same gradient wordmark
  - callout strokes are thinner (12px → 5px)
  - the score and the badge have no outline
  - the meter is a white capsule with a coloured count and a slim bar
  - "Modes" text is darker
  - core health is green gems
- **Meteors:**
  - three kinds: slow (big, 3 hits, wide smash), normal, and fast (small,
    1 hit)
  - the target ring is thin and small, sits still, and blinks once impact is
    under 1.6 s away
  - no path line

**D11 — Survival levels and stars.** Three levels of 2:00 each. Meteors arrive
in waves, and later levels send them more often, in bigger waves, with more
fast rocks and more nibblers (see `levels.js`). Ending: the clock runs out
("Finish!") or the core cracks. Stars come from the final score, at 500 / 2,000
/ 6,500, roughly 1, 2 and 3 sealed layers. Best stars are saved per level.

Simulated with the perfect-aim pilot:

| Level | Score | Layers | Outcome |
|---|---|---|---|
| 1 | 14,500 | 4 | survived |
| 2 | 7,610 | 3 | survived, 1 life left |
| 3 | 4,140 | 2 | cracked at 1:22 |

A person aims worse but plans better, so check these lines against real play.
Containment stays endless, with no stars.

**D12 — Loadouts and ammo.** Picked before every run; the last pick is
remembered.

| Loadout | Build gun | Blaster |
|---|---|---|
| Rapid | 1 block, 0.085 s | bolt |
| Cross | 5-block plus, 0.34 s | bolt that breaks a plus |
| Laser | 1 block, 0.11 s | instant beam through every loose block and threat on the line, 3 damage, 0.55 s |

One energy pool of 120 feeds both guns. A block costs 1.5, a bolt 2.5, a cross
shot 6, a laser 10. It refills at 95/s once you've held fire for 1.8 s, so it
only bites on long sprays. The ammo arc sits on the right of the crosshair: mint
while charging, yellow when low, shaking when empty.

**D13 — Power-ups.** Up to 3 float around the core and blink before they expire
at 30 s. Fly through one to hold it (one slot), press E to use it.
- Big Block: the next 5 shots land 3×3. Survival only.
- Infinite Ammo: 8 s.
- Super Speed: 6 s, about 1.9× speed, with the lens pulled wide.
- Smoke: a thrown cloud. Nibblers and bots inside it stall.
- Shield: 10 s. Meteors break on you and score, and you can't be stunned.

**D14 — Radar.** Top right, heading-up: it turns as you turn, with a north
tick. It shows the core, items (their colour), meteors (blinking red when
close), nibblers, bots (oriented triangles), and you. Height reads as dot size.
The clock and gems moved under it.

**D15 — Music and copy (2026-10-30).**
- **Music:** "Slam" by Shane Ivers, re-encoded to 128 kbps
  (`public/music/slam.mp3`). It loops from your first click, because browsers
  block audio before one. It drops to about a third of its volume while paused
  and follows the mute button.
- **Credit:** shown on the pause card, as CC BY 4.0 requires: "Slam by Shane
  Ivers | silvermansound.com / Royalty Free Music by free-stock-music.com /
  CC BY 4.0", with links.
- **Copy rule (Paul):** instructions and descriptions are full plain sentences
  ("Use your mouse to look around and WASD to move."). No clipped
  tagline-style fragments ("Mouse aims. WASD flies where you look."). Short
  labels like key hints and stat names are fine as labels.

**D16 — Versus (built 2026-10-30).** Online rooms for up to 4 players: Coral
(seats 1–2) against Violet (seats 3–4). The host can fill empty seats with
bots.
- **Rooms:** Versus → Create a room gives a 4-letter code and an invite link
  (`?room=CODE`); friends join with the link or by typing the code. It runs on
  trystero (WebRTC over public relays, no server), so it works from GitHub
  Pages. Add `?local` to test in two tabs of one browser without relays.
- **Rules:**
  - 3:00 rounds on one shared core
  - each seal's points split by blocks each team placed (D8, now per team, with
    a per-pilot share for the result table)
  - your blasts only break the other team's loose blocks; your own team's stop
    the shot
  - hitting an enemy ship stuns it: bolt 0.6 s, laser 1.2 s, bomb 1.5 s;
    Shield blocks it
  - power-ups as in solo; no meteors
- **Roles (loadouts):**
  - Rapid: all-rounder
  - Cross: builder; its blast went back to a single bolt so it stays the
    builder
  - Laser: sniper
  - Bomber (new): breaker. A lobbed bomb breaks the block it hits plus the
    blocks touching its six faces (up to 7), and stuns ships within 2.6. It
    works in solo too.
- **Network model:** the host owns the grid, every shot's outcome, the bots,
  the items, the clock and the score.
  - Each player flies their own ship and streams its pose at 20 Hz.
  - Guests fire locally for feel and send intents; the host's ops decide what
    lands. Ops go out at 25 Hz and state at 15 Hz.
  - Guests apply the host's list of cemented cells instead of sealing
    themselves, so grids cannot drift. Verified by hashing both grids, over
    `?local` and over the real relays.
  - If a player drops mid-match, a bot takes the seat. If the host leaves, the
    room ends.
- **Bots** (`builder.js` `brawl`): they build most of the time and switch to
  attacking enemy blocks or nearby ships every few seconds. Breakers and snipers
  attack more often.
- **Not done yet:**
  - joining mid-match only lets you watch from the lobby until the round ends
  - name tags show role icons; no voice or chat
  - balance is untested with real people

## Modes (pitch → plan)

| Mode | Status |
|---|---|
| **Survival (solo)** — seal layers, meteors + nibblers erode you | **Built**: 3 levels with stars (D11) |
| **Containment (solo)** — builder bots grow the core; you blast them and their blocks before it reaches world-ending size | **Built** (D9) |
| **Versus (2v2 online, bots fill seats)** — both teams build, stun, break each other's blocks, power-ups | **Built** (D16) |
| **Grow vs Shrink (1v1)** — one grows, one keeps it small | Needs open question Q2 |

## Open questions for Paul

- **Q2 How does the Shrink player shrink?** Cemented layers are unbreakable by
  the pitch, so Shrink can only *deny*. Option: a charged shot that can crack
  the *outermost* cemented layer only, which keeps the rule "sealed history is
  permanent." Recommend trying denial-only first: it may be enough.
- **Q3 Where does it get hard?** Layer 3 already needs 222 faces. Either
  that's the difficulty curve (bigger layers, faster meteors), or blocks should
  scale up with the core (2×2 bricks from layer 3).
- **Q4 Name.** "Strata" is a placeholder.

## Known gaps in this slice

- Desktop only (pointer lock). No touch or gamepad yet.
- Core cells render as individual boxes, so faint seam ticks appear on cemented
  faces. A merged surface mesh would remove them and scale better.
- Not tested on a mid-range laptop for frame rate.
- No multiplayer. Pocket Tactics / MISCHIEF / DOWNRIVER already have a trystero
  host-authoritative pattern to reuse.
