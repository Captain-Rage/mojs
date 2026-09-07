# mojs

Desktop-mate creatures that wander around your browser, like the old desktop
pets (BonziBuddy, Neopets, eSheep) but living on a web page.

Two creatures roam the screen by default — each randomly chosen from the
available species (critter, squirrel, bee, whale, snail, cat, pigeon,
piglet): they wander with a gentle Perlin-style drift, turn around at the
window edges, blink, bob, and rest from time to time. When two meet they
stop and react — curious greeting, happy, love, annoyed — before parting;
collisions startle them apart.

Built with Vite + vanilla JS on a `<canvas>` — no backend, no dependencies
at runtime. Deploy it as a static site anywhere (the build outputs to
`dist/`).

## Controls

- **species picker + ＋** add that creature (Random spins the wheel)
- **－** remove a creature (keeps at least two)
- **⏸ Pause / ▶ Resume** toggle the whole gang

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # static build → dist/
```

## Deploy

Pushed to GitHub; the live site deploys automatically via the deployment
configured on the repo.