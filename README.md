# Strata

A 3D flying game crossed with Tetris. You fly around a floating core and shoot blocks onto it. When the core is completely covered, the layer locks for good and scores.

Play it at https://pjeon18.github.io/strata/

## Modes

- **Survival**: three two-minute levels. Meteors arrive in waves and nibblers eat your loose blocks. Your final score decides how many stars you earn.
- **Containment**: builder bots try to grow the core. You stop them before they seal four layers.
- **Versus**: two to four players online, Coral against Violet. Both teams build on the same core and split each layer's points by the blocks they placed. Empty seats can be filled with bots.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5500. Add `?watch` to the URL to watch the game play itself, or `?local` to test Versus in two tabs of one browser.

The design decisions and open questions are in [CONCEPT.md](CONCEPT.md).

## Music

Slam by Shane Ivers | https://www.silvermansound.com
Royalty Free Music by https://www.free-stock-music.com
Creative Commons / Attribution 4.0 International (CC BY 4.0)
https://creativecommons.org/licenses/by/4.0/
