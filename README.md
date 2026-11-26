# kestrel-ridge-run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/dhvanilpatel983/kestrel-ridge-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/dhvanilpatel983/kestrel-ridge-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Kestrel is a flight game: you fly the Kestrel K-7 over Nimbus Reach, an island of ridges, conifer
forest and a single airfield. Three sorties — lift off, thread six marker rings around the island,
then bring her home on the numbers — with fuel, damage, stall behaviour, a chase camera and a
cockpit view, all drawn by a small software 3D renderer with nothing to download.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. `W`/`S` pitch, `A`/`D` roll, `Q`/`E` rudder, `Shift` throttle,
`G` gear, `C` camera, `R` restart, mouse drag to steer and the wheel for throttle.

## What is in here

- `game/` — the game itself: static files, an ES-module source tree, no build step and no network
- `screenshots/` — four real renders of the game (`?shot=cover|gates|cockpit|approach`)
- `main.ts` — hands `game/` and `screenshots/` to `/output` and writes the dossier
- `serve.ts` — a tiny static server for local play
- `tools/shoot.mjs` — takes the screenshots with headless Chrome

MIT licensed.
