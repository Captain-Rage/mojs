import "./style.css";
import { Pet } from "./pet.js";

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

const pets = [
  new Pet(ctx, { x: W * 0.3, y: H * 0.6, hue: 150, speed: 1.0 }),
  new Pet(ctx, { x: W * 0.7, y: H * 0.4, hue: 275, speed: 1.0 }),
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

addBtn.addEventListener("click", () => {
  pets.push(new Pet(ctx, { x: W / 2 + Math.random() * 80 - 40, y: H / 2, hue: Math.random() * 360 }));
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
