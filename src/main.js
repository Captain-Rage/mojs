import "./style.css";
import { Pet, KINDS } from "./pet.js";

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

// Classic "desktop mate" style: whatever the window size is, pets roam it.
let W = 0;
let H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const kinds = Object.keys(KINDS);
const randomKind = () => kinds[(Math.random() * kinds.length) | 0];
const makeHue = (kind) => KINDS[kind].hue + Math.random() * 30 - 15;

const pets = [
  new Pet(ctx, { x: W * 0.3, y: H * 0.6, kind: randomKind() }),
  new Pet(ctx, { x: W * 0.7, y: H * 0.4, kind: randomKind() }),
];

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  ctx.clearRect(0, 0, W, H);
  for (const pet of pets) pet.update(dt, W, H, pets);
  for (const pet of pets) pet.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- toolbar: add / remove / toggle speed --------------------------------
const addBtn = document.getElementById("add");
const removeBtn = document.getElementById("remove");
const speedBtn = document.getElementById("speed");
let running = true;

const kindSelect = document.getElementById("kind");

addBtn.addEventListener("click", () => {
  const pick = kindSelect.value;
  const kind = pick === "random" ? randomKind() : pick;
  pets.push(new Pet(ctx, { x: W / 2 + Math.random() * 80 - 40, y: H / 2, kind, hue: makeHue(kind) }));
});
removeBtn.addEventListener("click", () => {
  if (pets.length <= 2) return;
  pets.pop();
});
speedBtn.addEventListener("click", () => {
  running = !running;
  speedBtn.textContent = running ? "⏸ Pause" : "▶ Resume";
});

// Make the toolbar a little floating widget that stays put.
const bar = document.getElementById("bar");
bar.addEventListener("pointerdown", (e) => e.stopPropagation());

window.__mojs = { pets: () => pets, pause: () => (running = !running) };
