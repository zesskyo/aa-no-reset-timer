# AA Live

Live splitter for Minecraft 1.16.1 **AA No Reset** runs, LiveSplit-style. Follows the world you're playing through [Hermes](https://github.com/DuncanRuns/Hermes).

- Splits: Earlygame, Midgame, Endgame, Post-endgame
  - Earlygame: Any% (Overworld, Nether, Bastion/Fortress, Blind, Stronghold, End), Outer End (Elytra, End Leave), Enchanting
  - Endgame: Setup, Raid, Monument, HDWGH, End Again
  - Debris: under Midgame or Endgame, whichever it's done in
- Midgame checklist: what's left where you are (rare biomes, cats, shells, beacon, skulls, misc criteria), timed; anything with 3 or fewer left wherever you are
- Post-endgame: everything still left
- Compares with PB, average, best/worst segments or WR; current pace, best possible time, sum of best
- Changes: [releases](https://github.com/zesskyo/aa-no-reset-timer/releases)

> AA Live reads Hermes' ciphered live log. Hermes doesn't allow that for runs submitted to speedrun.com: **don't use AA Live for runs you'll submit.**

<a id="getting-it"></a>

## Install

From the [latest release](https://github.com/zesskyo/aa-no-reset-timer/releases/latest):

- **Windows:** `AA-Live-…-win.exe`. Not signed: *More info › Run anyway*. Allow it on private networks if the firewall asks (phone link only).
- **Mac:** `AA-Live-…-mac.dmg`, drag into Applications. Not signed: right-click › *Open* › *Open* the first time. "Damaged": `xattr -cr "/Applications/AA Live.app"`.
- **Linux:** `AA-Live-…-linux.AppImage`, make it executable.

Needs Minecraft 1.16.1 with SpeedRunIGT and Hermes **0.14+** (biomes; 0.16+ logs the seed on `/seed`).

## Use

- Open AA Live: the window shows only the splits. It finds the world by itself and starts over on a new world.
- Settings: right-click the splits › *Settings…*, or **Esc**. Also at <http://localhost:7476/settings>.
- Closing the window stops it.

## OBS

- **Window Capture** of the app, or
- **Browser source** `http://localhost:7476/` (copy it from the settings), width 440+, height ~554. See-through background.
- The browser source follows the settings. Link options override them, e.g. `http://localhost:7476/?bg=60&ms=1`:

| Option | |
|---|---|
| `?comp=` | `auto` (default: average, PB or WR while on that pace), `pb`, `avg`, `best`, `worst`, `wr` |
| `?clock=` | `s` (1, 1:23, 1:23:45 as it grows), `m` (1:23), `h` (1:23:45, default) |
| `?ms=` | decimals: `0`–`3` (default 3) |
| `?rows=` | splits shown (default 8) |
| `?scale=` | size, e.g. `1.5` |
| `?bg=` | background, % black: `0`–`100` |

- After updating: right-click the source › *Refresh*.

## Comparisons

- Without a stats site: the runs you've finished with AA Live running.
- With an [aa-stats](https://github.com/zesskyo/aa-stats) site (make one from [aa-stats-template](https://github.com/zesskyo/aa-stats-template)): put its link in the settings. Adds its runs, its WR, and its run numbers.

## Uploading runs to your stats site

1. GitHub › *Settings › Developer settings › Fine-grained tokens*: only your site's repository, *Contents: Read and write*.
2. In the settings: turn on *Upload runs*, paste the token, *Save*. Kept on your computer only; `-` + *Save* forgets it.
3. Finish a run, `/seed`, leave the world. It's added as the next run; the site rebuilds in a few minutes.

- Only worlds played with AA Live open, each once, and not one already on the site.
- No internet: retries every 5 minutes while open.

## Phone

- Same Wi-Fi: the phone link in the settings, e.g. `http://192.168.1.20:7476/`.
- Can't connect: allow AA Live on private networks (Windows firewall, Wi-Fi set to private); guest networks keep devices apart.

## Updating

- The app updates itself: downloads in the background, installs on restart or when closed. *Settings › Check for updates* checks now.
- Mac: only when run from Applications.
- Before 1.1.2 on Mac, or before 1.1.0: download the latest once by hand.

## Bugs

- *Settings › Save report*: the log, settings (not the token) and current state, as a text file.
- Attach it to a [new issue](https://github.com/zesskyo/aa-no-reset-timer/issues/new) with what happened.

## Files

- Settings and finished runs: `%APPDATA%\AA Live` (Windows), `~/Library/Application Support/AA Live` (Mac).

## Without the app (Node.js)

- *Code › Download ZIP*, then `app\Start AA Live.bat` (Windows) or `app/Start AA Live.command` (Mac). Downloads Node.js into `app/node` if needed.
- Updates itself on start (not mid-run); `--no-update` turns that off.
- Replay a run: `app\Replay a run.bat` / `app/Replay a run.command`, then a play.log or a run number.

| Option | |
|---|---|
| `--site <link>` | stats site |
| `--port <n>` | port (default 7476) |
| `--world <folder>` | follow this world instead of finding it through Hermes |
| `--replay <run>` | play back a play.log or a stats-site run number |
| `--no-open` | don't open a browser |
| `--local-only` | this computer only (no phone) |
| `--no-update` | don't update on start |

## How it works

- Finds the world from Hermes' instance list (`%LOCALAPPDATA%\MCSRHermes\instances`, `~/Library/Application Support/MCSRHermes/instances`) and each game's `hermes/state.json`.
- Reads `saves/<world>/hermes/restricted/play.log.enc`, deciphered line by line (`src/rotator.mjs`).
- Works out the splits with [aa-stats](https://github.com/zesskyo/aa-stats)' code, so they match an aa-stats site.
- Timer: SpeedRunIGT's IGT from the latest line, counting while unpaused.
- Finished: 80/80, or 79/80 missing only Very Very Frightening once a channeling trident has been held (Thunderless).

## Development

- `node build.mjs <aa-stats folder>` → `app/aa-live.mjs` (server, page, aa-stats code, icons, font).
- `src/server.mjs`: world, log, splits, server. `src/page.html`: splits page. `src/settings.html`: settings page.
- `desktop/`: the Electron app. `cd desktop && npm install && npm start`.
- Release: run the *Build the AA Live app* workflow with a version (`v1.2.0`, same as `desktop/package.json`) and a list of changes.
- `node test/fake.mjs <play.log> <minutes>` fakes a game; then `HOME=test/home node app/aa-live.mjs`.
