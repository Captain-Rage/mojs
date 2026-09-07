# mojs

Desktop-mate creatures that wander around your browser, like the old desktop
pets (BonziBuddy, Neopets, eSheep) but living on a web page.

Two creatures roam the screen by default: they wander with a gentle
Perlin-style drift, turn around at the window edges, blink, bob, and rest
from time to time. Click an empty spot and they'll wander toward it.

Built with Vite + vanilla JS on a `<canvas>` — no backend, no dependencies
at runtime. Deploy it as a static site anywhere (the build outputs to
`dist/`).

## Controls

- **＋** add a creature (up to a handful)
- **－** remove a creature (keeps at least two)
- **⏸ Pause / ▶ Resume** toggle the whole gang

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # static build → dist/
```

## Deploy

Pushed to GitHub; the live site is wired up for automatic deployment via
luffs' phantasm-deploy setup.