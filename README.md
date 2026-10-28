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

## Getting it

Download the app from the [latest release](https://github.com/zesskyo/aa-no-reset-timer/releases/latest):

- **Windows:** `AA-Live-…-win.exe`. Run it to install (it makes a Start menu and desktop shortcut). AA Live isn't signed, so the first time Windows may say it protected your PC: click **More info › Run anyway**. If Windows Firewall asks about AA Live, allow it on **private networks** (only needed for the phone link).
- **Mac:** `AA-Live-…-mac.dmg`. Open it and drag AA Live into Applications. It isn't signed, so the first time right-click it, choose **Open**, then **Open** again (if macOS says it's damaged: in Terminal, `xattr -cr "/Applications/AA Live.app"`).
- **Linux:** `AA-Live-…-linux.AppImage`. Make it executable and run it.

You also need Minecraft 1.16.1 with the [Hermes](https://github.com/DuncanRuns/Hermes) mod (**0.14 or newer**: older versions don't log the biome you're in, so the biome splits can't be timed and the Midgame checklist can't follow where you are; **0.16** logs the seed when you do `/seed`), and SpeedRunIGT.

## Starting it

Open **AA Live**. Its window shows just the splits (nothing on them to click, so a **Window Capture** of it in OBS works). **Right-click the splits › Settings…** (or press **Esc** on them) for its settings: the stats site, uploading runs, how the splits look (what they compare with, decimals, rows, size, background), keeping the window on top, the link for OBS, updates and bug reports. It finds the world you're playing by itself (through Hermes), and starts over when you make a new world. Closing the window stops it (and OBS's browser source goes blank until it's open again).

The splits are also at <http://localhost:7476/> while it's open: that's the link for OBS (below), and a browser. The settings are also at <http://localhost:7476/settings> (on this computer only).

<details><summary>Without the app (with Node.js)</summary>

**Code › Download ZIP** on this page, unzip it, and double-click **app\Start AA Live.bat** (Windows) or **app/Start AA Live.command** (Mac; the first time, right-click it › **Open** › **Open**). If Node.js isn't installed, it downloads its own copy the first time (about 30–45 MB, into `app/node`, checked against nodejs.org's checksums). The splits open in your browser; leave the window that opened running while you play. The settings: <http://localhost:7476/settings>.

</details>

## In OBS

Either a **Window Capture** of the app's window, or a **Browser** source with the URL `http://localhost:7476/` (AA Live's settings show it, with a Copy button), width **440** or more and height **554**. In a browser source the background is see-through.

The browser source follows how the splits look in AA Live's settings. Options after the link win over those, like `http://localhost:7476/?bg=60&ms=1`:

| | |
|---|---|
| `?bg=60` | the background 60% black (0 to 100; `100` for solid black) |
| `?ms=1` | the decimals the timer shows: `1` tenths, `2` hundredths, `0` none (3 without it) |
| `?rows=10` | how many splits are listed at once (8 without it; each one is 36 pixels more or less) |
| `?clock=s` | the timer's digits, as in LiveSplit: `s` (`1`, then `1:23`, then `1:23:45` as it grows), `m` (always `1:23`) or `h` (always `1:23:45`, the default) |
| `?scale=1.5` | 1.5 times bigger (multiply the width and height too) |
| `?comp=avg` | what it compares with: `auto` (the default: the average, the PB while the run's on PB pace, and the WR while it's on WR pace), `pb`, `avg`, `best`, `worst` or `wr`. It's shown at the top ("Auto: PB", "Auto: WR", "vs Avg"…) |

After updating AA Live, right-click the source › **Refresh**.

## What it compares with

- **On its own:** every run you finish with AA Live running is kept on your computer, and the next runs are compared with those (PB, average, best segments…). Until you've finished one, there's nothing to compare with.
- **With a stats site:** if you have an [aa-stats](https://github.com/zesskyo/aa-stats) site of your runs (you can make one from [aa-stats-template](https://github.com/zesskyo/aa-stats-template)), put its link in AA Live's settings and press Save. AA Live then compares with the site's runs too, and with its world record, and numbers your runs after the site's.

## Uploading runs to your stats site

AA Live can add each run you finish to your [aa-stats](https://github.com/zesskyo/aa-stats) site by itself, like the site's own *Add run* (the log, ghost file and stats, with the date and seed):

1. Make a GitHub token that can change your site's repository: on GitHub, **Settings › Developer settings › Fine-grained tokens › Generate new token**, *Only select repositories*: your site's, and under *Repository permissions*, **Contents: Read and write**.
2. In AA Live's settings, tick **Upload each finished run to the stats site**, paste the token, and press Save. It's kept on your computer only, in AA Live's folder (see below); type `-` there and Save to forget it.
3. Finish a run, do `/seed` (or type the seed when making the world), and leave the world. A few seconds later the run is added as the next run number, and the site rebuilds itself (a few minutes). Then add a video or notes from the site as usual.

Only worlds played with AA Live running are uploaded, each one once, and not a run that's already on the site. If it can't upload (no internet, say), it tries again every 5 minutes while AA Live is open, and says why in the settings.

## On your phone

With your phone on the same Wi-Fi, open the link AA Live's settings show ("On a phone"), like `http://192.168.1.20:7476/`. If the phone can't connect:
- Windows: allow Node.js through Windows Firewall on private networks (Windows Security › Firewall › Allow an app through firewall), and make sure your Wi-Fi is set to a **private** network;
- Mac: AA Live says when it starts if the firewall is blocking it, with what to do;
- some routers keep Wi-Fi devices apart (guest networks): try your phone's hotspot.

## Playing back a run

Double-click **app\Replay a run.bat** (Windows) or **app/Replay a run.command** (Mac), and drag a run's play.log onto the window (or type its number on your stats site). The page then plays that run instead of following Minecraft, with a slider and speeds up to 1200×.

## Updating

**The app** updates itself: when it opens (and every few hours while it's open), it downloads a new version in the background and asks whether to restart now; if not, the new version is put in place when you close it. Nothing to download or install by hand. On a Mac, that needs AA Live in your **Applications** folder (not opened from the .dmg). **Settings › Check for updates** looks again. Then, in OBS, right-click the browser source › **Refresh**. (Versions before 1.1.2 on a Mac, and before 1.1.0 anywhere, can't do that yet: download 1.1.2 once by hand.)

**Without the app:** close AA Live's window and start it again. Each time it starts, it looks for a newer version here on GitHub and puts it in place (a few seconds; with no internet, it just starts). It never updates in the middle of a run: if a new version comes out while it's running, it says so in the settings, and updates the next time. To stop it updating itself, add `--no-update` at the end of the line in the start file.

## Reporting a bug

**Settings › Save a bug report** saves a text file of what AA Live printed, its settings (not the token) and what it sees now. Attach it to a [new issue](https://github.com/zesskyo/aa-no-reset-timer/issues/new) with what went wrong (and the run's number, if it's on your stats site).

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
- **Finished:** 80/80, or 79/80 with only Very Very Frightening missing once a channeling trident (or a Channeling book and a trident) has been in the inventory (Thunderless).

## Changing it

The app is `desktop/` (Electron): `cd desktop && npm install && npm start` runs it from `app/aa-live.mjs` (build that first). Pushing a version tag (`v1.2.0`, with the same version in `desktop/package.json`) builds the installers on GitHub (`.github/workflows/desktop.yml`) and puts them in a release; running that workflow by hand builds them without a release.


- `src/server.mjs` finds the world, follows the log, works out the splits and serves the page; `src/page.html` is the page; `src/rotator.mjs` deciphers the live log.
- `node build.mjs <aa-stats folder>` puts it all into `app/aa-live.mjs`, with aa-stats' code, icons and the Minecraft font. It needs a copy of [aa-stats](https://github.com/zesskyo/aa-stats).
- `node test/fake.mjs <a play.log> <minutes>` pretends to be Minecraft for testing; then `HOME=test/home node app/aa-live.mjs`.
