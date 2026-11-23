# Ants

Ants are coming through a crack in the kitchen wall, heading for the crumbs on the far side of the tiled floor. Draw chalk lines on the tiles (ants won't cross chalk) to box them in before they get there.

- Tap a tile to draw one line of chalk. Then every ant takes a step along the shortest way to the crumbs.
- An ant with no way through is trapped. Trap every ant (or seal off the crack) to clear the level.
- Chalk is limited. Each level clear scores **100 per ant + 10 per chalk left over**.
- New ants arrive every few turns, later levels bring more of them, and from level 3 the ants sometimes hurry (two steps in one turn).
- The run ends when an ant reaches the crumbs.

## Files

| | |
|---|---|
| `index.html`, `styles.css`, `main.js` | The page. Static files, no build step |
| `engine.js` | The rules, with no DOM. Levels come from the run's seed, so `replay(seed, moves)` gives a run's exact score |
| `game.json` | The game's manifest for the game hub |
| `test/` | `npm test` (Node 18.17+, no dependencies) |
| `tools/sim.js` | `npm run sim`: a greedy bot plays 300 runs, to check the difficulty curve |

## Scores (game hub)

The game is a `casual` browser game for [game-hub](https://github.com/bbrent/game-hub):

1. Copy `game.json` into its own folder in the hub's games folder, e.g. `~/games/ants/game.json`, and set `url` to where the game is hosted. The hub picks it up within a minute.
2. Upload `index.html`, `styles.css`, `main.js` and `engine.js` to that address, e.g. `public_html/ants/`.
3. The page finds the hub at `/account` on the same site (the `hub-url` meta tag in `index.html`). Change it if the hub lives elsewhere; it has to be on the same site so the login cookie is sent.

When a logged-in player presses Play, the page starts a hub run and uses the run's seed for the levels. When the run ends, it sends the score with `finishRun` and shows the player's best, rank and the top 10. Players who aren't logged in can still play; they get a link to log in. If the hub can't be reached, the game plays offline.

The hub checks each score against `limits` in `game.json`. Because every level comes from the run's seed and the moves are kept (`run.moves` in `main.js`), the hub's future `"trust": "replay"` mode could re-score runs with `replay()` from `engine.js`.

## Local development

```sh
# In game-hub: a games folder with this game.json, its url set to http://localhost:8080/
GAMES_DIR=/path/to/games PUBLIC_URL=http://localhost:3000 npm run dev
# Here:
npm run dev   # then open http://localhost:8080/?hub=http://localhost:3000
```

Sign-up emails go to the hub's log when SMTP isn't set.
