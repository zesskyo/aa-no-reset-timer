# AA No Reset Timer (AA Live)

A live splitter for AA No Reset (1.16.1) runs. It follows the world you're playing through [Hermes](https://github.com/DuncanRuns/Hermes), works out the splits the same way the [stats site](https://zesskyo.github.io/aa-stats-no-reset-zesskyo-log/) does, and compares them with the runs on that site: your PB, average, best and worst splits, and the WR. It also shows pace, best possible time and sum of best.

The timer and splits are a web page served on your computer, so you can open it in a browser or add it to OBS as a browser source.

> **Note:** it reads Hermes' ciphered live log. Hermes says using that during a run isn't allowed for runs submitted to speedrun.com, so don't use it for runs you'll submit.

## Using it (Mac)

1. Install [Node.js](https://nodejs.org) (the LTS one).
2. Download this repo (Code › Download ZIP) and unzip it.
3. Double-click **app/Start AA Live.command**. The first time, macOS may refuse to open it: right-click it, choose Open, then Open again.
4. The splits open in your browser at <http://localhost:7476/>. To stop it, close its Terminal window.

**Updating:** download the repo again and replace your folder with it (or `git pull`, if you cloned it), then close AA Live's Terminal window and start it again. In OBS, right-click the browser source › Refresh (or press "Refresh cache of current page" in its properties); in a browser, reload the page.

**OBS:** add a Browser source with the URL `http://localhost:7476/`, width 400 and height 600.
The background is see-through in OBS; `?bg=60` makes it 60% black (0 to 100, `?bg=100` for solid black).
`?ms=0` hides the milliseconds.
The comparison can be picked in the URL too: `?comp=pb` (`pb`, `avg`, `best`, `worst` or `wr`), e.g. `?bg=60&comp=avg`. In a browser, click "vs …" to switch.

Options (after `node app/aa-live.mjs`):

| | |
|---|---|
| `--site <link>` | the stats site to compare with (default: Zesskyo's) |
| `--port <n>` | the port for the page (default 7476) |
| `--world <folder>` | a world folder to follow, instead of finding it through Hermes |
| `--no-open` | don't open the browser |

## How it works

- **Finding the world:** Hermes lists the running games in `~/Library/Application Support/MCSRHermes/instances/`, and each game's `hermes/state.json` says which world is open, or the last one played.
- **The live log:** while you play, Hermes writes the play log only ciphered, to `saves/<world>/hermes/restricted/play.log.enc`; the readable `play.log` is only made when you leave the world. Each line is ciphered on its own with a fixed character swap, which `src/rotator.mjs` undoes (a port of Hermes' `Rotator`).
- **The splits:** the whole log is read again at most once a second, with the stats site's own `parse-log.js`, `splits.js` and `stats.js`, so the live splits match the site. While a run is going, it's treated as if it ended now. The site decides some splits from what happens afterwards (when Enchanting ends, early Endgame), so those can move while they settle.
- **The timer:** SpeedRunIGT's retimed IGT (`retime`) from the latest line of the log, counted up in the page while the game isn't paused or closed.
- **Finished:** 80/80, or 79/80 with only Very Very Frightening missing (Thunderless). If thunder still comes, it carries on.
- **The comparisons:** the stats site's page has all its runs in it. They're downloaded when it starts and every 30 minutes, and the last download is kept for when there's no internet (in `~/Library/Application Support/AA Live/`).

## Changing it

- `src/server.mjs` finds the world, follows the log, works out the splits and serves the page.
- `src/page.html` is the timer and splits page.
- `src/rotator.mjs` deciphers the live log.
- `build.mjs` puts it all into one file, `app/aa-live.mjs`, with the stats site's code and the Minecraft font: `node build.mjs <aa-stats folder>`. It needs a copy of [aa-stats](https://github.com/zesskyo/aa-stats).
- `test/fake.mjs` pretends to be Minecraft for testing: `node test/fake.mjs <a play.log> <minutes>`, then `HOME=test/home node app/aa-live.mjs`.
