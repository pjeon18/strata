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
| Rapid | 1 block, 0.15 s | bolt, 0.24 s |
| Cross | 5-block plus, 0.5 s | bolt, 0.3 s |
| Laser | 1 block, 0.19 s | instant beam through every loose block and threat on the line, 3 damage, 0.7 s |
| Bomber | 1 block, 0.22 s | lobbed bomb, 1 s |

(Rates slowed on 2026-11-01; see D17.)

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

**D17 — Pace, dash and hit feel (Paul, 2026-11-01).**
- **Slower start.** Every build gun fires more slowly: Rapid went from 0.085 s
  to 0.15 s, Cross from 0.34 s to 0.5 s, Laser from 0.11 s to 0.19 s, and
  Bomber from 0.13 s to 0.22 s. Blasters are about a third slower too.
  - Tempo: the build gun speeds up 9% with each sealed layer, down to 55% of
    its starting delay by layer 6. This keeps the late layers from dragging.
  - Survival meteor waves start small and reach full size at about 50 seconds.
- **The core starts as one block.** Layer 1 is six blocks, and the core then
  grows as a diamond: 6, 18, 38, 66, 102, 146 blocks per layer (computed in
  node with `grid.js`). You also spawn closer. With 8 or fewer faces open,
  orange beacons show every face, so layer 1 teaches itself.
- **Dash (Q).** Two charges, and each refills in 1.9 s. It throws the plane
  toward the keys you hold, or where you look if you hold none. That's 40
  units/s for 0.22 s, with a barrel roll, a white trail and a quick lens
  punch. Hold Shift or Space with it to drop under or pop over the core.
  - A dash slips through meteors and can't be stunned in Versus, so it is
    also a dodge.
  - The two charges show as arcs on the left of the crosshair, mirroring the
    ammo arc on the right. They turn light blue when full, with a soft tick
    when one refills.
  - Versus bots and the title-screen pilot dash too. Containment's bots don't,
    so its balance holds.
- **Hit feel.**
  - When your shot connects, a white hit marker snaps out on the crosshair
    with a dry tick and a 35 ms freeze (rate-limited so a stream of breaks
    doesn't stutter). A broken block flashes as a white pop before it
    shatters, and a hit meteor or bot goes pure white for a frame.
  - A kill gets a bigger coral marker, a second bright note, a 65 ms freeze
    and a stronger shake.
  - Firing gives a white muzzle pop, a camera nudge backwards and a small lens
    punch, scaled up for blasts, lasers and bombs.
  - Getting hit freezes the game for about 100 ms and turns your plane white.
    The screen whites out, heaviest on the side the hit came from, and the
    camera is shoved away from the hit with a hard shake. Sound effects go
    muffled and the music ducks for about half a second, then they recover.
  - A cracked core freezes for 140 ms with a white flash and a muffle.
- **Balance, re-simulated** with the perfect-aim pilot (Survival) and the
  wobbling defender (Containment), in headless Chromium:

| Survival level | Layers | Score | Outcome |
|---|---|---|---|
| 1 | 7 | ~32,300 | survived both runs, no lives lost |
| 2 | 5–6 | 10,000–19,000 | survived once, cracked at 1:35 once |
| 3 | 4–5 | 6,000–11,700 | cracked at 1:25–1:44 |

  Star lines moved to 1,500 / 4,000 / 9,000 (about 3, 4 and 5 sealed layers).

| Containment defender | Layer timeline (s) | Critical at 7 layers |
|---|---|---|
| none | 4, 13, 27, 44, 64, 84, 107 | 1:47 |
| weak (0.2) | 60, 110, 124, 141, 162, 185, 217 | 3:37 |
| mid (0.5) | 73, 116, 130, 160, 184, 210, 237 | 3:57 |

  Critical mass moved from 4 to 7 layers, because the small early layers seal
  in seconds. That puts the curve back near the old one (1:26 / 3:15 / 4:18).

**D18 — Close call, build assist, stun immunity (Paul picked brainstorm 1–3, 2026-11-01).**
- **Close call.** If a dash takes you within about 1.4 units of a meteor, or
  within 1.8 of an enemy bolt or bomb in Versus, you get the charge back. You
  also hear a two-note chime, see a pale blue ring, and "Close call" rises out
  of the crosshair.
  - Solo adds 0.4 s of slow motion and 25 points.
  - Versus gets a lens punch instead, because slow motion would slow the whole
    match for everyone.
  - It counts once per dash.
- **Build assist.** If your aim doesn't already land on an open core face, the
  shot snaps to the open face closest to your crosshair, within 3.2°. The face
  has to point at you and be in clear line of sight. The ghost preview shows
  the snapped spot, so you see it before you fire. Aiming straight at a loose
  block still builds on it. Bots don't use it.
- **Stun immunity (Versus).** After a stun ends, a ship can't be stunned again
  for 1 s, and it blinks for that second. The host enforces it with its own
  clock, so every player sees the same result.

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
- **Q3 Where does it get hard?** (Mostly answered by D17: the one-block core grows 6, 18, 38, 66, 102 blocks a layer, and tempo speeds the gun up to match.) Originally: layer 3 already needed 222 faces. Either
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

## Brainstorm: balance and fun (2026-11-01, not built; Paul decides)

Ranked by how much each would add for the work it takes. 1–3 were built as D18.

1. **Perfect dodge.** Dash through a meteor or an enemy bolt in its last
   0.15 s and you get a short slow-motion beat and the charge back. It rewards
   reading the blinking ring instead of only running from it, and it makes the
   dash feel like a skill.
2. **Build assist.** The block preview snaps to the nearest open face when
   your aim is within a few degrees of it. Mouse aim at range is the hardest
   part of the game for a new player, and this keeps the challenge in choosing
   faces, not in pixel-hunting.
3. **No stun-locks in Versus.** After a stun ends you get 1 s where you can't
   be stunned again (your plane blinks). Four players focusing one person is
   currently miserable, and the bot runs show about 15 stuns per bot per
   minute.
4. **Layer modifiers.** Each new layer can roll a rule that's shown in the
   left tab: a gold layer worth double, a fragile layer whose blocks break in
   one hit, or a windy layer where shots drift. It gives Survival runs variety,
   like Tetris's speed changes.
5. **Seal charges a super.** Each seal fills a meter. When it's full, press a
   key to send a shockwave that clears every meteor and nibbler near the core.
   It ties defence to the main loop (build to protect) instead of to aim.
6. **Clean-seal bonus.** Seal a layer with no wasted blocks and earn ×1.5. It
   rewards planning, and pushes against D2's thick-shell strategy, so the
   choice gets sharper.
7. **Comeback items in Versus.** Pickups spawn nearer the trailing team. It's
   quiet rubber-banding that never touches the score rule.
8. **Ramming.** A dash through the other team's loose blocks breaks up to two
   of them, giving builders a way to fight back without switching loadout.
9. **Daily seed.** The same meteor schedule for everyone each day, with your
   best score kept per day. It's cheap replay value, and needs no server if
   the scores stay local.
10. **Unlock plane colours with stars.** Cosmetic only. It gives the stars a
    use without selling power.

Watch in real play:
- Level 1 may now be too easy for a strong player.
- Dash plus Super Speed is 1.9 × 40 units/s, which can overshoot the core.
