/**
 * A wandering "desktop mate" creature with social behaviour. Drawn on a
 * shared canvas. Creatures wander on their own, but when two get close they
 * meet, react, and change mood + facial expression:
 *
 *   lonely  → curious → happy greeting → love (blush, hearts)
 *            → after a while together: annoyed/crowded → they part
 *   bump    → startled (scared), then they hop apart
 *   alone for a long time → sad, until company arrives
 *   near a friend → turn to face them and slow down to "talk"
 *
 * Pets never get stuck ramming each other: overlapping bodies are pushed
 * apart, annoyed creatures steer away continuously, and after every
 * meeting both pick a fresh direction and avoid each other for a few
 * seconds before wandering again.
 *
 * Moods fade back to a neutral "wander" state.
 */

const NEAR = 130; // px: creatures sense each other within this range
const BUMP = 52; // px: considered a collision (two radii + a little)
const CONTACT = 88; // px: standing together / holding a meeting

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function drawHeart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.55, y - s * 1.05, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 1.05, x + s, y - s * 0.35, x, y + s * 0.35);
  ctx.fill();
}

function drawSweat(ctx, x, y, s) {
  ctx.fillStyle = "#69c7f0";
  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.05, x, y - s * 0.6);
  ctx.quadraticCurveTo(x - s * 0.7, y + s * 0.05, x, y + s);
  ctx.fill();
}

export class Pet {
  constructor(ctx, { x, y, hue = 150, speed = 1 }) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.hue = hue;
    this.spd = speed * 60; // px / s at 1x
    this.angle = Math.random() * Math.PI * 2;
    this.r = 26;
    this.t = Math.random() * 100;

    // social state
    this.mood = "wander";
    this.moodTime = 0;
    this.aloneFor = 0; // seconds without any neighbour within NEAR
    this.sinceBump = 99;
    this.sinceTalk = 99;
    this.fx = []; // floating emotes: {label, t, ttl}
    this.partner = null;
    this.cooldown = 0; // seconds of avoidance after a meeting ends
    this.wasMeeting = false;
  }

  setMood(m) {
    if (this.mood === m) return;
    this.mood = m;
    this.moodTime = 0;
  }

  emit(label) {
    this.fx.push({ label, t: 0, ttl: 1.1 });
  }

  faceToward(target, rate) {
    let want = Math.atan2(target.y - this.y, target.x - this.x);
    let d = want - this.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.angle += d * Math.min(1, rate);
  }

  update(dt, W, H, pets) {
    this.t += dt;
    this.moodTime += dt;
    this.sinceBump += dt;
    this.sinceTalk += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // floating emotes age + drift
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.ttl);

    // ---- find nearest other creature ---------------------------------
    let other = null;
    let best = Infinity;
    let sum = 0;
    for (const p of pets) {
      if (p === this) continue;
      const d2 = dist2(this, p);
      sum += d2;
      if (d2 < best) {
        best = d2;
        other = p;
      }
    }
    const d = other ? Math.sqrt(best) : Infinity;
    const bump = other && d < BUMP;
    const contact = other && d < CONTACT;
    const near = other && d < NEAR;

    if (near) this.aloneFor = 0;
    else this.aloneFor += dt;

    // ---- decide mood --------------------------------------------------
    if (bump) this.sinceBump = 0;

    if (bump && this.mood !== "scared") {
      this.setMood("scared");
      this.partner = other;
      // hop away from the collision
      this.angle = Math.atan2(this.y - other.y, this.x - other.x);
      this.recoil = 0.9;
    } else if (contact) {
      this.partner = other;
      this.wasMeeting = true;
      if (this.moodTime > 6.5) this.setMood("annoyed");
      else if (this.moodTime > 3.2) this.setMood("love");
      else if (this.moodTime > 1) this.setMood("happy");
      else this.setMood("curious");
    } else {
      const parting = this.wasMeeting;
      this.wasMeeting = false;
      this.partner = null;
      if (this.mood === "annoyed" || this.mood === "love" || this.mood === "happy" || this.mood === "curious") {
        this.setMood("wander");
      }
      if (parting) {
        // meeting just ended: pick a fresh direction and keep apart for a while
        this.cooldown = 4 + Math.random() * 3;
        this.angle = Math.random() * Math.PI * 2;
      }
      if (this.aloneFor > 11 && this.mood !== "sad") {
        this.setMood("sad");
        this.moodTime = 0;
      }
      if (this.mood === "sad" && near) this.setMood("wander");
      if (this.mood === "sad" && this.moodTime > 4) {
        this.setMood("wander"); // cheers up on its own
        this.aloneFor = 6;
      }
      if (this.mood === "wander" && this.moodTime > 9) {
        this.setMood("curious"); // pauses to look around occasionally
      }
    }

    // ---- steering + speed per mood ------------------------------------
    let speed = this.spd;
    let steer = 0;
    let bob = 1;

    if (this.mood === "curious") {
      speed = this.spd * 0.2;
      steer = 0.2;
      if (other && this.sinceTalk > 2.5) {
        this.sinceTalk = 0;
        this.emit(Math.random() < 0.5 ? "hi!" : "hej");
      }
    } else if (this.mood === "happy") {
      speed = this.spd * 0.25;
      bob = 1.6;
      if (other && this.sinceTalk > 3) {
        this.sinceTalk = 0;
        this.emit(Math.random() < 0.5 ? "o/" : "♫");
      }
    } else if (this.mood === "love") {
      speed = this.spd * 0.12;
      bob = 2.2;
      if (other) this.faceToward(other, 3);
      if (this.sinceTalk > 0.4) {
        this.sinceTalk = 0;
        this.emit(Math.random() < 0.7 ? "♥" : "mer kramar!");
      }
    } else if (this.mood === "annoyed") {
      speed = this.spd * 1.2;
      if (other) {
        // keep turning away so they actually separate instead of ramming
        this.angle = Math.atan2(this.y - other.y, this.x - other.x) + (Math.random() - 0.5) * 0.5;
      }
      if (this.sinceTalk > 1.8) {
        this.sinceTalk = 0;
        this.emit("…");
      }
    } else if (this.mood === "scared") {
      speed = this.spd * 1.8;
      this.recoil = Math.max(0, (this.recoil || 0) - dt);
      if (this.moodTime > 1.1 || this.recoil <= 0) this.setMood("wander");
      if (this.moodTime < 0.1) this.emit("!");
    } else if (this.mood === "sad") {
      speed = this.spd * 0.5;
      if (this.sinceTalk > 2) {
        this.sinceTalk = 0;
        this.emit("💧");
      }
    } else {
      // wander: gentle drift, occasional stops
      if (Math.random() < dt * 0.8) steer += (Math.random() - 0.5) * 1.2;
    }
    steer += Math.sin(this.t * 0.6) * dt * 0.4;

    // slow down when a friend is near and we're not wandering off
    if (contact && (this.mood === "curious" || this.mood === "happy" || this.mood === "love")) {
      if (other) this.faceToward(other, 2.5);
    }

    // ---- separation: never stack, and avoid each other during cooldown --
    if (other) {
      if (d < BUMP && d > 0) {
        // physically push overlapping bodies apart so they can't stay glued
        const push = ((BUMP - d) / BUMP) * this.spd * dt * 2.2;
        this.x += ((this.x - other.x) / d) * push;
        this.y += ((this.y - other.y) / d) * push;
      }
      if (this.cooldown > 0 && d < NEAR) {
        // after a meeting, turn and walk the other way for a moment
        this.angle = Math.atan2(this.y - other.y, this.x - other.x) + (Math.random() - 0.5) * 0.7;
      }
    }

    this.angle += steer;
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt + Math.sin(this.t * 2) * 7 * bob * dt * (bob > 1 ? 2 : 1);

    // ---- walls ---------------------------------------------------------
    const m = this.r + 4;
    if (this.x < m) { this.x = m; this.angle = Math.PI - this.angle; }
    if (this.x > W - m) { this.x = W - m; this.angle = Math.PI - this.angle; }
    if (this.y < m) { this.y = m; this.angle = -this.angle; }
    if (this.y > H - m) { this.y = H - m; this.angle = -this.angle; }
  }

  draw(ctx, dt) {
    const blink = Math.sin(this.t * 1.5) > 0.99;
    const pulse = this.mood === "love" ? 1 + Math.sin(this.t * 7) * 0.04 : 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulse, pulse);
    const facing = Math.cos(this.angle) >= 0 ? 1 : -1;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, this.r + 6, this.r * 0.8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    const g = ctx.createLinearGradient(0, -this.r, 0, this.r);
    g.addColorStop(0, `hsl(${this.hue} 70% 68%)`);
    g.addColorStop(1, `hsl(${this.hue} 70% 44%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    // belly highlight
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.2, -this.r * 0.35, this.r * 0.45, this.r * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    const r = this.r;
    const ey = -r * 0.15;
    const ex = facing * r * 0.3;
    const lx = -r * 0.3;
    const rx2 = r * 0.3;
    const eyeR = r * 0.22;
    const open = blink ? 0.12 : 1;

    ctx.strokeStyle = "#1a1d2e";
    ctx.lineWidth = 2;

    if (this.mood === "scared") {
      // wide eyes, tiny pupils
      ctx.fillStyle = "#fff";
      for (const exx of [lx, rx2]) {
        ctx.beginPath(); ctx.arc(exx, ey, eyeR * 1.15, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#1a1d2e";
      for (const exx of [lx + ex * 0.2, rx2 + ex * 0.2]) {
        ctx.beginPath(); ctx.arc(exx, ey, eyeR * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      // "o" mouth
      ctx.beginPath(); ctx.arc(ex * 0.4 + r * 0.1, r * 0.42, r * 0.16, 0, Math.PI * 2); ctx.stroke();
    } else if (this.mood === "annoyed") {
      // half-lidded eyes + flat wavy mouth + sweat
      ctx.fillStyle = "#1a1d2e";
      ctx.strokeStyle = "#1a1d2e";
      for (const exx of [lx, rx2]) {
        // iris tucked under heavy lid
        ctx.fillRect(exx - eyeR * 0.55, ey - eyeR * 0.3, eyeR * 1.1, eyeR * 0.9);
        ctx.strokeRect(exx - eyeR * 0.55, ey - eyeR * 0.3, eyeR * 1.1, eyeR * 0.9);
      }
      ctx.strokeStyle = "#1a1d2e";
      ctx.beginPath();
      ctx.moveTo(ex * 0.4 + r * 0.1 - r * 0.2, r * 0.4);
      ctx.quadraticCurveTo(ex * 0.4 + r * 0.1, r * 0.52, ex * 0.4 + r * 0.1 + r * 0.2, r * 0.4);
      ctx.stroke();
      drawSweat(ctx, r * 0.5 + 6, ey - r * 0.05, 6);
    } else if (this.mood === "sad") {
      // droopy eyes + frown
      ctx.strokeStyle = "#1a1d2e";
      for (const exx of [lx, rx2]) {
        ctx.beginPath();
        ctx.arc(exx, ey + r * 0.12, eyeR * 0.9, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.52, r * 0.24, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (this.mood === "happy" || this.mood === "love") {
      for (const exx of [lx, rx2]) {
        // closed happy eyes (∩), open wide when excited
        if (this.mood === "love") {
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(exx, ey, eyeR, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#1a1d2e";
          ctx.beginPath(); ctx.arc(exx + ex * 0.4, ey, eyeR * 0.44, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeStyle = "#1a1d2e";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(exx, ey + r * 0.05, eyeR * 1.1, Math.PI, 0);
          ctx.stroke();
        }
      }
      // blush
      ctx.fillStyle = "rgba(255,120,140,0.4)";
      ctx.beginPath(); ctx.ellipse(lx - eyeR * 0.7, ey + r * 0.32, eyeR * 0.8, eyeR * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rx2 + eyeR * 0.7, ey + r * 0.32, eyeR * 0.8, eyeR * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      // big smile
      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.2, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      if (this.mood === "love" && this.fx.some((f) => f.label === "♥")) {
        drawHeart(ctx, ex * 0.4 + r * 0.1, r * 0.05, 7, "#ff5d8f");
      }
    } else {
      // normal wandering face
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(lx, ey, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx2, ey, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + ex, ey, eyeR * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx2 + ex, ey, eyeR * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1d2e";
      ctx.beginPath(); ctx.arc(lx + ex * 0.5, ey + (1 - open) * 1.5, eyeR * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx2 + ex * 0.5, ey + (1 - open) * 1.5, eyeR * 0.4, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.35, r * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();

      if (blink) {
        ctx.fillStyle = "#1a1d2e";
        ctx.fillRect(lx - eyeR + 2, ey + 1, eyeR * 2 - 4, 4);
        ctx.fillRect(rx2 - eyeR + 2, ey + 1, eyeR * 2 - 4, 4);
      }
    }

    // feet
    ctx.strokeStyle = `hsl(${this.hue} 70% 34%)`;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const step = this.mood === "scared" || this.mood === "annoyed" ? Math.sin(this.t * 18) * 6 : Math.sin(this.t * 10) * 4;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.4, this.r * 0.75);
    ctx.lineTo(-this.r * 0.4 + step, this.r * 0.95);
    ctx.moveTo(this.r * 0.4, this.r * 0.75);
    ctx.lineTo(this.r * 0.4 - step, this.r * 0.95);
    ctx.stroke();

    ctx.restore();

    // floating emotes above the head
    for (const f of this.fx) {
      const p = f.t / f.ttl;
      const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(f.label, this.x, this.y - this.r * 1.8 - 16 * p);
    }
    ctx.globalAlpha = 1;
  }
}