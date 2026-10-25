# AA Live

A live splitter for **AA No Reset** runs of Minecraft 1.16.1: all advancements in one world. It follows the world you're playing through [Hermes](https://github.com/DuncanRuns/Hermes) and splits the run as it goes, LiveSplit-style. The splits are a page served on your computer, so you can open it in a browser or add it to OBS as a browser source.

- **Splits:** Any%, Outer End, Enchanting, Midgame, Debris, Endgame and Post-endgame. Some have sub-splits:
  - Any%: Overworld, Nether, Bastion/Fortress, Blind, Stronghold, End
  - Outer End: Elytra, End Leave
  - Endgame: Setup, Raid, Monument, HDWGH, End Again
- **The Midgame checklist:** what's left to do where you are (the rare biomes, cats, shells, the beacon, skulls, the misc advancement criteria…), timed, with icons of what's still needed.
- **Comparisons:** your PB, average, best and worst segments, sum of best, pace and best possible time, against the runs you've finished with AA Live, or the runs on your stats site.
- Milliseconds, a see-through background, any size, a phone on the same Wi-Fi, and playing back old runs.

> **Note:** AA Live reads Hermes' ciphered live log while you play. Hermes says using that during a run isn't allowed for runs submitted to speedrun.com, so **don't use AA Live for runs you'll submit**.

## What you need

- Minecraft 1.16.1 with the [Hermes](https://github.com/DuncanRuns/Hermes) mod, and SpeedRunIGT.
- That's it: AA Live runs on [Node.js](https://nodejs.org), and if it isn't installed, AA Live downloads its own copy the first time it starts (about 30–45 MB, into its `app/node` folder, checked against nodejs.org's checksums; nothing is installed on the computer). If Node.js is installed, it uses that.
- AA Live itself: **Code › Download ZIP** on this page, then unzip it somewhere.

## Starting it

**Windows:** double-click **app\Start AA Live.bat**. The first time:
- if Windows says it protected your PC, click **More info › Run anyway**;
- if Windows Firewall asks about Node.js, allow it on **private networks** (only needed for the phone link).

**Mac:** double-click **app/Start AA Live.command**. The first time, macOS may refuse to open it: right-click it, choose **Open**, then **Open** again.

The first time, if Node.js isn't installed, it downloads it first (a minute or so). Then the splits open in your browser at <http://localhost:7476/>. Leave the window that opened running while you play; close it to stop AA Live. It finds the world you're playing by itself (through Hermes), and starts over when you make a new world.

## In OBS

Add a **Browser** source with the URL `http://localhost:7476/`, width **440** and height **554**. The background is see-through.

Options go after the link, like `http://localhost:7476/?bg=60&ms=1`:

| | |
|---|---|
| `?bg=60` | the background 60% black (0 to 100; `100` for solid black) |
| `?ms=1` | the decimals the timer shows: `1` tenths, `2` hundredths, `0` none (3 without it) |
| `?rows=10` | how many splits are listed at once (8 without it; each one is 36 pixels more or less) |
| `?scale=1.5` | 1.5 times bigger (multiply the width and height too) |
| `?comp=avg` | what it compares with: `pb`, `avg`, `best`, `worst` or `wr` (in a browser, click it to change) |

After updating AA Live, right-click the source › **Refresh**.

## What it compares with

- **On its own:** every run you finish with AA Live running is kept on your computer, and the next runs are compared with those (PB, average, best segments…). Until you've finished one, there's nothing to compare with.
- **With a stats site:** if you have an [aa-stats](https://github.com/zesskyo/aa-stats) site of your runs (you can make one from [aa-stats-template](https://github.com/zesskyo/aa-stats-template)), put its link in the box under the splits (in your browser, not OBS) and press Save. AA Live then compares with the site's runs too, and with its world record, and numbers your runs after the site's.

## On your phone

With your phone on the same Wi-Fi, open the link AA Live shows under the splits in your browser ("On your phone"), like `http://192.168.1.20:7476/`. If the phone can't connect:
- Windows: allow Node.js through Windows Firewall on private networks (Windows Security › Firewall › Allow an app through firewall), and make sure your Wi-Fi is set to a **private** network;
- Mac: AA Live says when it starts if the firewall is blocking it, with what to do;
- some routers keep Wi-Fi devices apart (guest networks): try your phone's hotspot.

## Playing back a run

Double-click **app\Replay a run.bat** (Windows) or **app/Replay a run.command** (Mac), and drag a run's play.log onto the window (or type its number on your stats site). The page then plays that run instead of following Minecraft, with a slider and speeds up to 1200×.

## Updating

**To update, close AA Live's window and start it again** (double-click **Start AA Live.bat**, or **Start AA Live.command** on a Mac). Each time it starts, AA Live looks for a newer version here on GitHub, and if there is one, puts it in place and starts the new one: a few seconds (with no internet, it just starts). Then, in OBS, right-click the browser source › **Refresh**.

It never updates in the middle of a run: if a new version comes out while it's running, it says so under the splits (in your browser), and updates the next time you start it.

> **Downloaded AA Live before it updated itself (before version 1.0)?** Update by hand once: close AA Live's window, download the ZIP again (**Code › Download ZIP**), unzip it and replace your old folder with it. Your settings and finished runs are kept elsewhere (see below), so nothing is lost. If your OBS source is still 482 high, make it **554** (8 rows are listed now). From then on, restarting it is enough.

To update by hand at any time, do the same. To stop it updating itself, add `--no-update` at the end of the line in the start file.

## Where it keeps things

Its settings and the runs you've finished: `%APPDATA%\AA Live` on Windows, `~/Library/Application Support/AA Live` on a Mac.

## Options

After `node app/aa-live.mjs` (or add them to the end of the line in the start files):

| | |
|---|---|
| `--site <link>` | the stats site to compare with (instead of the one set on the page) |
| `--port <n>` | the port for the page (7476 without it) |
| `--world <folder>` | a world folder to follow, instead of finding it through Hermes |
| `--no-open` | don't open the browser |
| `--local-only` | only this computer can open the page (not a phone) |
| `--no-update` | don't look for a newer version when it starts |
| `--replay <run>` | play back a run: a play.log, or its number on the stats site |

## How it works

- **Finding the world:** Hermes lists the running games (in `%LOCALAPPDATA%\MCSRHermes\instances` on Windows, `~/Library/Application Support/MCSRHermes/instances` on a Mac), and each game's `hermes/state.json` says which world is open.
- **The live log:** while you play, Hermes writes the play log ciphered, to `saves/<world>/hermes/restricted/play.log.enc`; each line is ciphered on its own, and `src/rotator.mjs` undoes it.
- **The splits:** the whole log is read again at most once a second, with the code of [aa-stats](https://github.com/zesskyo/aa-stats) (which is inside `app/aa-live.mjs`), so the splits match an aa-stats site exactly.
- **The timer:** SpeedRunIGT's retimed IGT from the latest line of the log, counted up while the game isn't paused.
- **Finished:** 80/80, or 79/80 with only Very Very Frightening missing once a channeling trident has been in the inventory (Thunderless).

## Changing it

- `src/server.mjs` finds the world, follows the log, works out the splits and serves the page; `src/page.html` is the page; `src/rotator.mjs` deciphers the live log.
- `node build.mjs <aa-stats folder>` puts it all into `app/aa-live.mjs`, with aa-stats' code, icons and the Minecraft font. It needs a copy of [aa-stats](https://github.com/zesskyo/aa-stats).
- `node test/fake.mjs <a play.log> <minutes>` pretends to be Minecraft for testing; then `HOME=test/home node app/aa-live.mjs`.
