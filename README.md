# EMBERWOK 🔥

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/arya161100/emberwok/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/arya161100/emberwok/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Run a wok stall at a night market for seven nights. Customers take a seat
and order invented dishes; you cook each dish through a chain of stations
(**CHOP → WOK → STEAM**), serve before patience runs out, earn coins and
tips, keep your reputation (hearts) alive, and spend earnings on upgrades
between nights. Night 7 ends with a food critic and the final results
screen.

An entry for the [make.fun best-game-01](https://make.fun/c/best-game-01?ref=3cjrh3ss)
competition. No network, no external libraries, no assets: all art is drawn
procedurally on canvas, all sound is synthesized with WebAudio, and the
simulation is fully deterministic (same seed → same night). The game is
played with keyboard and mouse, has a goal, rules, a way to win, lose and
score, a start and a restart, and a HUD — all shown in its own screenshots.

## How to play

1. **Click a customer's ticket** to start their dish. Its first step lands
   on the matching station.
2. **Work the stations.** Click a station (or press `1`–`4`) to select it,
   then press **Space** — or hold it — to cook. Each act adds progress.
3. **Mind the burn.** A finished WOK or STEAM item burns if it sits too
   long; toss it with **X** and start the dish again. CHOP never burns.
4. **Serve.** Finished dishes land on the plate. Press **S** / **Enter** (or
   click the plate) to serve the oldest matching customer. Serving with
   70%+ patience left is **PERFECT** (+3 coins); serves within 8s of each
   other chain a combo (up to x2.0 coins).
5. **Tea.** Press **T** (or click the teapot) to soothe everyone: +25%
   patience, 12s cooldown (6s with the Tea Stall upgrade).
6. **Survive 7 nights.** Meet each night's coin target for +1 heart and
   +20 coins. Lose all hearts and the stall goes dark. Between nights,
   buy at most one upgrade from the shop — or skip it.

## Controls

| Key / click | Action |
| --- | --- |
| Click ticket | Start that customer's dish |
| Click station / `1`–`4` | Select CHOP / WOK / STEAM / PLATE |
| `Space` (tap or hold) | Work the selected station |
| `S` / `Enter` | Serve the plate |
| `T` / click teapot | Pour tea |
| `X` / click trash | Toss a burnt dish |
| `P` | Pause / resume |
| `R` | Restart the night (or restart from game over / results) |
| `M` | Mute |
| `Enter` | Confirm / start / continue |

## Dishes

| Dish | Price | Chain | From night |
| --- | --- | --- | --- |
| Moon Noodles | 8 | CHOP → WOK | 1 |
| Cloud Dumplings | 10 | CHOP → STEAM | 1 |
| Ember Skewers | 12 | WOK → STEAM | 2 |
| Golden Cinder Buns | 14 | STEAM → WOK | 4 |
| Starfruit Tea Cake | 18 | CHOP → STEAM → WOK | 6 |

Tips scale with patience left (up to +50%); the night-7 food critic tips
x3. One rush hour per night drops 3 customers at once.

## Upgrades (between nights, at most one per night)

Sharp Cleaver (30), Second Wok (45), Big Steamer (45), Tea Stall (25),
Extra Seat (50), Comfy Stools (35).

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and press Enter. No build
step, no network requests.

Screenshot scenes (used for the dossier images) are staged deterministically
with `?shot=`:

```sh
http://localhost:8080/?shot=start&seed=1    # title
http://localhost:8080/?shot=play&seed=1     # night 3, mid-rush
http://localhost:8080/?shot=perfect&seed=1  # a PERFECT serve
http://localhost:8080/?shot=end&seed=1      # night 1 done + shop
```

## File structure

```text
game/
  index.html          # canvas + module entry, no external refs
  src/
    config.js         # dishes, nights, upgrades, stations, LAYOUT, tuning
    random.js         # seeded RNG (mulberry32)
    world.js          # the whole simulation (screens, cooking, serving)
    render.js         # all drawing: market, stations, HUD, screens
    input.js          # keyboard + mouse -> the world's input object
    audio.js          # WebAudio synth: effects + music loop
    shots.js          # deterministic screenshot scenes + autopilot
    main.js           # boot, fixed-timestep loop, ?shot= support
screenshots/          # 4 dossier screenshots (1-start … 4-end)
main.ts               # entry program: copies game/ + screenshots/ to
                      # /output and writes /output/dossier.json
serve.ts              # tiny static server for local play
vendor/makefun-game.ts# make.fun dossier library (kit copy, unchanged)
```

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).

---

Built for [make.fun](https://make.fun/c/best-game-01?ref=3cjrh3ss) — play the
entry, and if you build your own, enter it too.
