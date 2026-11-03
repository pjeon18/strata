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
| **Grow vs Shrink** — one team grows, the other keeps it small | **Built** (D28), a Versus match type |

## Open questions for Paul

- **Q2 (answered in D28: denial only) How does the Shrink player shrink?** Cemented layers are unbreakable by
  the pitch, so Shrink can only *deny*. Option: a charged shot that can crack
  the *outermost* cemented layer only, which keeps the rule "sealed history is
  permanent." Recommend trying denial-only first: it may be enough.
- **Q3 Where does it get hard?** (Mostly answered by D17: the one-block core grows 6, 18, 38, 66, 102 blocks a layer, and tempo speeds the gun up to match.) Originally: layer 3 already needed 222 faces. Either
  that's the difficulty curve (bigger layers, faster meteors), or blocks should
  scale up with the core (2×2 bricks from layer 3).
- **Q4 Name.** "Strata" is a placeholder.

## Known gaps in this slice

- Desktop only (pointer lock). Phones get a screen that says so and offers watch mode (D19). No touch controls or gamepad yet.
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

## Polish plan: from slice to finished game (2026-11-01)

From a screen-by-screen audit after D18. Paul picks the order past batch 1.

**Batch 1: small fixes that every finished game has (built as D19)**
1. How to play works. The menu button currently does nothing. It opens a
   screen with the controls (including Dash) and the three rules a new player
   needs: covering the core seals a layer, meteors that hit bare core crack it,
   and a dash slips through anything.
2. Settings. Mouse sensitivity, invert Y, music and effects volume, screen
   shake and graphics quality, saved between visits. They open from the menu
   and from pause.
3. Pause gets Restart and Settings, so a bad start doesn't mean three screens
   of menus.
4. The result screen says how many points the next star needs, and offers the
   next level once you have a star on this one.
5. Phones and tablets get a clear screen that says Strata needs a mouse and
   keyboard, with a button to watch it play itself, instead of a menu that
   leads to a game they can't fly.
6. A tab icon and a link preview card, so a shared Versus invite link shows
   the game instead of a bare URL.

**Batch 2: medium, each needs one call from Paul**
7. A first-flight tutorial on the first visit: fly to the core, place a block,
   seal layer one, dash, shoot a meteor. Prompts come from what you do, not a
   wall of text. (Built as D20: on by default for first visits, skippable.)
8. A three-two-one countdown before each run so the first meteor never lands
   while you're still finding the core. (Call: Paul may prefer the snap start.)
9. Music that builds: it speeds and brightens in the last 20 seconds and when
   the core has one life left. Needs a second stem or a playback-rate change.
10. Level gating: earn a star to open the next level. (Call: gates hurt
    portfolio visitors who want to see Level 3.)
11. Merged core mesh, which removes the seam lines on cemented faces and keeps
    frame rate up past layer 6.
12. Automatic quality: drop the render resolution when the frame rate dips.

**Big: pick one or two**
13. Touch controls (virtual stick, aim drag, fire and dash buttons). Opens the
    game to everyone who clicks the portfolio link on a phone.
14. Layer modifiers and the seal-charged shockwave (brainstorm 4 and 5) for
    run-to-run variety.
15. Daily seed with a local best per day, plus plane colours unlocked with
    stars (brainstorm 9 and 10).
16. Grow vs Shrink (needs Q2).

**D19 notes.** Settings live in `src/settings.js` (one saved object, listeners
apply changes live). Fast graphics means one pixel per CSS pixel, no shadows
and no bloom. The audit also caught two bugs: the radar threw when its canvas
had no size (it now skips drawing), and the shader warm-up left a wireframe
preview cube sitting on the core during the title screen.

**D20 notes: the tutorial.** It's a fourth game type, `tutorial`, with six
steps: look, fly, place a block, seal layer one, dash, and blast a meteor. Each
step clears when you do the thing, not on a timer. A step stays on screen for
at least 0.8 seconds, then shows a tick for about a second before the next one
comes in, so a fast player still sees every instruction. Nothing can be lost:
there's no clock, no power-ups, and meteors don't crack the core. If the
meteor lands before you hit it, another one comes. A first visit on a computer
goes straight from the splash into the tutorial. Enter skips to the menu, and
finishing ends on a Ready card whose main button is Play Level 1. Either way
`strata-tutored` is saved, so later visits open the menu. How to play has a
Play the tutorial button for anyone who wants it again.


**D21 notes: the swoop.** Paul's idea (2026-11-02). Getting from one face of
the core to the next was the hardest thing in the game: you fly a wide loop,
then turn the camera back while moving, and the loop gets longer every layer.
Double-tapping A or D now swoops you round to the neighbouring face; Space
goes over the top and Shift goes underneath. "Next face" means the cube face
next to the one you're most over, in the direction you tapped (relative to
the camera). The arc takes 0.55 seconds. It starts fast and eases onto the
face, bulging slightly outward. It stays outside everything solid and ends
1.5 to 9 units past the solid bounds. The camera turns on the same curve and
ends with the crosshair on the core's centre. For over and under, the camera
can't look quite straight down, so the plane stops a little off centre to
keep the core in the crosshair. The plane barrel-rolls and the camera stays
level. Each swoop costs a dash charge, so two in a row take you to the
opposite face. A swoop doesn't pass through meteors (that's still Q's job),
and a hit knocks you out of it. Double-taps are timed from when each key
went down, within 0.3 seconds, so a slow frame can't split one. Paul's
halfway stop is left out for now: on single taps it would fire whenever you
nudge sideways, and halfway leaves you on an edge where neither face is
square to you. The tutorial gained a swoop step (seven steps now).

**D22 notes: the water.** Paul (2026-11-02) found the look washed out. We
compared concept sheets (`assets/strata-look/`): graded, graded with cel
shading, and graded with cel shading and ink. He turned down both the grade
and cel shading, and kept the original fog and lighting. What ships is a
slight saturation lift on the finished frame (×1.08, nothing else) and a
rebuilt sea. The old sea had large dark reef blotches that read as uneven
shadows, and wide green-teal halos round every island. The new sea is one
even body of water: deep blue looking down, lighter and sky-tinted toward
the horizon. Two layers of small drifting ripples catch sun glints up close
and fade out with distance, so far water stays calm instead of shimmering.
The shoreline is narrow: about 9 units of shallows, a sandy rim and a thin
foam line that follows the same wobble as the island mesh and moves gently.

## Polish plan 2: making it feel finished (2026-11-02)

From a 19-moment screenshot audit (dash, swoop, seal, impacts, items, smoke,
nibblers, Containment, every menu). Ranked inside each group by how much a
player notices it. Paul picks; the trail fix is already done (D23).

**Effects and rendering**
1. (Done, D23) Dash, swoop and boost trails. Each frame left a large, uniform
   white ball at the plane, so a swoop drew a column of same-size discs across
   the screen, and the dash ring was nearly as big as the plane. Now: thin
   wingtip streaks of mixed sizes set behind the wing, a small uneven kickoff
   scatter, a smaller dash ring and a sparse boost trail.
2. (Done, D24) Ambient occlusion on the core. Every cube face is the same brightness, so a
   big core reads as flat cardboard (Layer 6 especially). Darken a cube's edges
   and corners where it meets neighbours, baked per vertex from the grid. This
   is the biggest "rendered" upgrade for the least cost.
3. (Done, D24) A crack you can see. Losing a life shows only in the HUD gems. Draw a dark
   jagged crack decal on the struck face, with a few chips, and a red pulse on
   the core edges.
4. (Done, D24) Meteor impacts. Now a white blob. Add a dust ring that spreads along the
   face, dark rock chips that tumble away, a brief scorch mark on loose blocks
   that survived, and a deeper boom.
5. (Done, D24) Meteors themselves: flat dodecahedrons with a trail of separate beads.
   Give them a lumpy rock (noise-displaced), glowing cracks on the side facing
   their direction of travel, and a continuous tapered heat trail.
6. (Done, D24) Smoke power-up: a single giant grey lump that fills the screen and looks
   solid. Make it 20 to 30 soft puffs of mixed size that roll and drift, partly
   see-through at the edges, thrown a little further away.
7. (Done, D24) Shield: a flat pink sphere over the plane. Make it a fresnel bubble (clear in
   the middle, bright at the rim) with a ripple where a meteor hits it.
8. Power-ups are coloured cubes you can't tell apart until you've learned the
   colours. Put each one's icon on its faces.
9. Blaster bolts read as a string of yellow beads. Make them short stretched
   streaks with a hot core.
10. Seal moment: add a colour wave rolling across the new layer from where the
    last block landed (the per-block delay exists; it needs a visible sweep),
    and a soft shock that ripples the sea below.
11. World life: gulls circling the big island, a boat or two leaving wakes, a
    wisp of smoke from the volcano, cloud shadows drifting across the sea.
12. Islands: a crater on the volcano, rocks at the waterline, a few palms
    rather than only round trees.

**Feel and mechanics**
13. Three-two-one countdown before each run, so the first wave never lands
    while you're finding the core (from batch 2).
14. Music that builds: brighter and faster in the last 20 seconds and on your
    last life (from batch 2).
15. Score where it happens: small "+30" numbers that rise from the face you
    sealed or the meteor you hit, as well as the big callout.
16. An out-of-ammo nudge: the crosshair shakes and the ammo arc flashes, so an
    empty click is never silent on screen.
17. End of round: instead of cutting to the result, the camera orbits the
    finished core for two seconds with the final layer count, then the card.
18. A clean-seal bonus for sealing a layer without losing a life.
19. Engine sound that rises with speed, a whoosh on swoops that pans with the
    direction, and a whistle that grows as a meteor gets close.

**HUD and screens**
20. (Done, D24) The key-hint bar lists twelve controls for the whole round. Show it for the
    first round only (or until each control has been used), then hide it; H
    still brings it back.
21. (Done, D24) The empty power-up slot says "Empty" all game. Hide the label until you
    hold something.
22. Callouts keep showing over the pause blur. Pause should clear them.
23. Result screen: add accuracy, best streak and fastest layer, and animate the
    score counting up.
24. Settings: field of view, crosshair size and a colour-blind option for the
    layer colours.

**D23 notes: trails.** Paul: the boost and swoop smoke took up too much of the
screen. The dash trail dropped a 0.3-unit ball at the plane every frame, plus
two 0.16 dots at the wingtips; over a 0.55-second swoop that drew a column of
identical discs across the screen. Now each wingtip leaves a fine streak
(0.04 to 0.09, set just behind the wing), a dash adds a few sparse puffs off
the tail, and the push-off is a small uneven scatter of five puffs from 0.08 to
0.24. The dash ring shrank from 2.2 to 0.8 and lasts 0.18 seconds. The Super
Speed trail is sparser, smaller and mixed in size (0.05 to 0.13).

**D24 notes: the top five.** Built 2026-11-02 from polish plan 2.
- Contact shading (`blocks.js`). Every block carries a 12-bit mask of which
  edge-diagonal neighbours are solid, as an instance attribute. The shader
  darkens a face toward any edge with a block across it (down to 52%), so
  steps and inside corners on the core read as depth. Loose bricks get it too.
  The mask is rebuilt on every sync (12 lookups per block).
- Cracks. A strike on bare core puts a crack decal (three canvas-drawn
  variants, a dark line over a pale broken edge) on the nearest open face,
  with dark chips. A crack hides while something sits in front of it and goes
  for good once that face is sealed under a new layer, which is also when the
  life comes back. New rounds clear them.
- Impacts: a short white flash, a sand-coloured dust ring and a white ring
  spreading flat along the struck face, dark chips, purple chunks, a few
  embers, and nine dust puffs of mixed size and tone that hang about 0.8
  seconds. The sound gains a low thump.
- Meteors: three lumpy faceted rock shapes (a subdivided dodecahedron pushed
  in and out per corner, flat-shaded, with a warm rim) and one tapered heat
  cone behind each: white-hot at the rock, orange, then gone. Its length
  scales with speed. Embers are sparser and mixed in size.
- Smoke: 26 puffs in two tones, bigger toward the middle. Each rolls and
  breathes on its own and the cloud drifts out a touch. Each puff is solid
  facing you and thins at its edge, so the rim is half see-through. The
  gameplay radius is unchanged.
- Shield: an additive soap-bubble shell, nearly clear facing you and bright
  at the rim, with faint drifting bands. A meteor it breaks (or a stun it
  blocks in Versus) sends a ripple out from where it landed.
- Key hints: each one dims once you've used that control. Once Aim, Fly, Up,
  Down, Dash, Swoop, Place and Blast have all been used, the bar fades away
  for good (`strata-used`). H brings it back. The empty item slot no longer
  says "Empty".

**D25 to D28 notes: the rest of polish plan 2, and the big four (2026-11-02).**
Paul: "i like all these, implement". Everything still open from both polish
lists went in at once, except cloud shadows on the sea. He had just asked for
even water without patches, so those are left out.

*Feel (D25).*
- **Countdown.** Three-two-one before Survival and Containment. You can fly
  and aim, but the clock, waves and bots wait.
- **Score pops.** Points rise from where you earned them: seals, meteors,
  nibblers and bots.
- **Empty click.** It shakes the crosshair and flashes the ammo arc.
- **Clean seal.** A layer sealed without the core taking a crack scores
  ×1.5, and the callout says so.
- **Outro.** Rounds end with a 2.6-second orbit of the finished core before
  the result card. Versus and watch mode skip it.
- **Result stats.** The result counts the score up and adds accuracy (blaster
  hits per shot), fastest layer and clean seals.
- **Pause.** Callouts hide under the pause screen.

*Rendering, world and sound (D25).*
- **Power-ups.** Each wears its icon on a cube of its own colour.
- **Blaster bolts.** They are stretched streaks pointed along their flight.
- **Seal wave.** It rolls slower (0.045 seconds per unit of distance), and two
  slow rings spread on the sea below.
- **Islands.** Tall peaks get a volcano crater, rocks sit at every waterline,
  and palms with curved trunks lean out over the shelf.
- **Life.** Seven gulls wheel over the big island, two sailboats with V wakes
  loop the islands, and smoke curls off the volcano.
- **Sound.**
  - An engine hum follows your speed (more while dashing or swooping).
  - One whistle tracks the nearest meteor, rising and panning as it closes.
  - Swoops pan left or right.
  - The music pitches up 6% and gets 30% louder in the last 20 seconds or
    on the last life.

*Settings and systems (D26).*
- **Settings.** Field of view (58° to 92°), crosshair size, and colour-blind
  colours. In colour-blind mode you are amber, they are blue, and layers
  alternate light and dark.
- **Level gating.** Level 2 opens with a star on Level 1, and Level 3 with a
  star on Level 2. Locked cards show a lock and say what opens them.
  Finishing the tutorial does not unlock levels. A first star takes about
  three seals, so the gate is light.
- **Automatic quality.** If frame rate sits under 42 for three seconds, the
  render resolution drops to 1.25×, then to 1× with no bloom. It only ever
  steps down.
- **Merged core.** Settled sealed blocks are one mesh of only their outside
  faces, with corner shading baked into the vertex colours. That removes the
  seam ticks (old known gap 3). Blocks still in their seal wave stay
  instanced until they finish.

*Touch controls (D26, `src/touch.js`).*
- **Choosing touch.** Phones get "Play with touch" next to "Watch it play".
- **Controls.**
  - A stick wherever the left thumb lands; a flick to the edge swoops that way.
  - Drag anywhere on the right to look.
  - Place, Blast, Dash, Item, Rise, Sink and Pause buttons.
  - A Wave button appears when the shockwave is ready.
- **Aim and layout.**
  - Aim assist widens from 3.2° to 7°.
  - Under 540 pixels tall, the HUD and menus shrink to fit.
  - In portrait, it asks you to turn the phone.
- The tutorial is keyboard-only and is skipped on touch.

*Modes (D27, D28).*
- **Layer modifiers.** From layer 2, 55% of Survival layers roll one of four
  rules, named on the tag and announced as the layer starts:
  - Gold scores ×2 and turns the meter gold.
  - Fragile makes meteors smash ×2 as far.
  - Rush makes meteors fly ×1.35 as fast.
  - Storm brings waves ×0.55 as often.
- **Shockwave.** Each Survival seal charges it a third. When full, R (or
  Wave) breaks every meteor and nibbler in the sky, with points, three rings
  and a slow-motion beat.
- **Daily.** A fourth Survival card, named for the date. It uses Crosswinds
  rules with meteors, wave sizes and modifiers drawn from a seed made from the
  date, so everyone gets the same run. The best score is kept per day, and no
  stars are awarded.
- **Plane colours.** Classic, Sunset (2 stars), Lilac (4), Mint (6) and
  Gold (9), picked on the loadout screen and saved.
- **Grow vs Shrink.** A match type the Versus host picks in the room.
  - Coral is Grow and wins by sealing 4 layers before the 3:00 clock ends.
  - Violet is Shrink: it can't build, both buttons blast, and its bots never
    build. It wins by holding out.
  - Sealed layers stay sealed (Q2 answered as denial only, as recommended).
    The board shows layers sealed out of 4 against blocks broken.

