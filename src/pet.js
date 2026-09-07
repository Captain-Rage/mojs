/**
 * A wandering "desktop mate" creature with social behaviour. Drawn on a
 * shared canvas. Comes in several species (squirrel, bee, whale, snail,
 * cat, pigeon, piglet, plus the original critter).
 *
 * Social behaviour (shared by every species): when two get close they stop,
 * face each other and react - curious greeting -> happy (blush, smile) ->
 * love (pulse, hearts) -> annoyed (sweat, wavy frown) before parting.
 * Collisions startle them apart. Nobody can get stuck: bodies are pushed
 * apart, walls make them glide instead of bouncing back, and a soft
 * edge-aversion keeps them off the borders.
 */

const NEAR = 130; // px base: creatures sense each other within this range
const DISTANT = 170; // px: avoidance zone after a meeting
const CONTACT_PAD = 42; // px added to the summed radii for "meeting" range
const EDGE = 42; // px: screen-edge aversion zone

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

// species: { r, speed, hue, face geometry, walker }
export const KINDS = {
  critter: { r: 26, speed: 1.0, hue: 150, walker: true, eyeS: 0.22, spread: 0.3, gaze: 0.3, eyS: -0.15, myS: 0.35, mrS: 0.25, sweat: true },
  squirrel: { r: 23, speed: 1.0, hue: 26, walker: true, eyeS: 0.22, spread: 0.3, gaze: 0.3, eyS: -0.15, myS: 0.35, mrS: 0.25, sweat: true },
  bee: { r: 17, speed: 1.25, hue: 46, walker: false },
  whale: { r: 38, speed: 0.6, hue: 205, walker: false, eyeS: 0.16, spread: 0.42, gaze: 0.42, eyS: -0.08, myS: 0.36, mrS: 0.2, sweat: true, big: true },
  snail: { r: 20, speed: 0.35, hue: 145, walker: false },
  cat: { r: 25, speed: 0.95, hue: 32, walker: true, eyeS: 0.21, spread: 0.3, gaze: 0.3, eyS: -0.15, myS: 0.35, mrS: 0.25, sweat: true },
  pigeon: { r: 23, speed: 0.9, hue: 218, walker: false },
  piglet: { r: 25, speed: 0.85, hue: 350, walker: true, eyeS: 0.2, spread: 0.3, gaze: 0.3, eyS: -0.15, myS: 0.35, mrS: 0.25, sweat: true },
};

const WALKERS = new Set(["critter", "squirrel", "cat", "piglet"]);

export class Pet {
  constructor(ctx, { x, y, kind = "critter", hue, speed = 1 }) {
    const cfg = KINDS[kind] || KINDS.critter;
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.hue = hue ?? cfg.hue;
    this.r = cfg.r;
    this.spd = cfg.speed * speed * 60; // px/s
    this.cfg = cfg;
    this.bobAmp = this.r * 0.3;
    this.angle = Math.random() * Math.PI * 2;
    this.t = Math.random() * 100;

    // social state
    this.mood = "wander";
    this.moodTime = 0;
    this.aloneFor = 0;
    this.sinceBump = 99;
    this.sinceTalk = 99;
    this.fx = [];
    this.partner = null;
    this.cooldown = 0;
    this.wasMeeting = false;
    this.meetingTime = 0;
    this.escape = 0;
    this.escapeAngle = 0;
    this.sinceMeeting = 99;
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

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.ttl);

    // ---- find nearest other creature ---------------------------------
    let other = null;
    let best = Infinity;
    for (const p of pets) {
      if (p === this) continue;
      const d2 = dist2(this, p);
      if (d2 < best) {
        best = d2;
        other = p;
      }
    }
    const d = other ? Math.sqrt(best) : Infinity;
    const sumR = other ? this.r + other.r : 0;
    const bump = other && d < sumR * 0.9;
    const contact = other && d < sumR + CONTACT_PAD;
    const near = other && d < NEAR + sumR * 0.5;

    if (near) this.aloneFor = 0;
    else this.aloneFor += dt;

    // ---- decide mood --------------------------------------------------
    if (bump) this.sinceBump = 0;

    if (bump && this.mood !== "scared") {
      this.setMood("scared");
      this.partner = other;
      this.escape = 0.9;
      this.escapeAngle = Math.atan2(this.y - other.y, this.x - other.x);
      this.emit("!");
    } else if (contact) {
      const startMeeting = !this.wasMeeting && this.sinceMeeting > 1;
      this.partner = other;
      this.wasMeeting = true;
      if (startMeeting) {
        this.meetingTime = 0;
        if (this.sinceMeeting < 8) this.cooldown = Math.min(this.cooldown + 6, 25);
      }
      this.meetingTime += dt;
      if (this.meetingTime > 6.5) this.setMood("annoyed");
      else if (this.meetingTime > 3.2) this.setMood("love");
      else if (this.meetingTime > 1) this.setMood("happy");
      else this.setMood("curious");
    } else {
      this.sinceMeeting += dt;
      const parting = this.wasMeeting;
      this.wasMeeting = false;
      this.partner = null;
      if (this.mood === "annoyed" || this.mood === "love" || this.mood === "happy" || this.mood === "curious") {
        this.setMood("wander");
      }
      if (parting) {
        this.sinceMeeting = 0;
        this.cooldown = 6 + Math.random() * 3;
        this.angle = Math.random() * Math.PI * 2;
      }
      if (this.aloneFor > 11 && this.mood !== "sad") {
        this.setMood("sad");
        this.moodTime = 0;
      }
      if (this.mood === "sad" && near) this.setMood("wander");
      if (this.mood === "sad" && this.moodTime > 4) {
        this.setMood("wander");
        this.aloneFor = 6;
      }
      if (this.mood === "wander" && this.moodTime > 9) {
        this.setMood("curious");
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
        this.angle = Math.atan2(this.y - other.y, this.x - other.x) + (Math.random() - 0.5) * 0.5;
      }
      if (this.sinceTalk > 1.8) {
        this.sinceTalk = 0;
        this.emit("…");
      }
    } else if (this.mood === "scared") {
      speed = this.spd * 1.8;
      if (this.escape > 0) {
        this.escapeAngle += (Math.random() - 0.5) * 0.08;
        this.escape -= dt;
      } else {
        this.setMood("wander");
        this.cooldown = 3 + Math.random() * 2;
      }
    } else if (this.mood === "sad") {
      speed = this.spd * 0.5;
      if (this.sinceTalk > 2) {
        this.sinceTalk = 0;
        this.emit("💧");
      }
    } else {
      if (Math.random() < dt * 1.6) steer += (Math.random() - 0.5) * 1.4;
    }
    steer += Math.sin(this.t * 0.6) * dt * 0.4;

    // slow down when a friend is near and we're not wandering off
    if (contact && (this.mood === "curious" || this.mood === "happy" || this.mood === "love")) {
      if (other) this.faceToward(other, 2.5);
    }

    // ---- separation: never stack, and avoid each other during cooldown --
    for (const q of pets) {
      if (q === this) continue;
      const dq = Math.hypot(q.x - this.x, q.y - this.y);
      const minSep = (this.r + q.r) * 0.95;
      if (dq < minSep && dq > 0) {
        const push = ((minSep - dq) / minSep) * this.spd * dt * 1.6;
        this.x += ((this.x - q.x) / dq) * push;
        this.y += ((this.y - q.y) / dq) * push;
      }
    }
    if (other && this.cooldown > 0 && d < DISTANT && (this.mood === "wander" || this.mood === "sad")) {
      this.angle = Math.atan2(this.y - other.y, this.x - other.x) + (Math.random() - 0.5) * 0.7;
      if (this.mood === "wander") {
        speed = Math.max(speed, this.spd * 1.15);
      }
    }

    if (this.escape > 0) {
      this.angle = this.escapeAngle;
    } else {
      // gentle aversion from the screen edges so pets don't camp on borders
      let repX = 0;
      let repY = 0;
      if (this.x < EDGE) repX = 1;
      else if (this.x > W - EDGE) repX = -1;
      if (this.y < EDGE) repY = 1;
      else if (this.y > H - EDGE) repY = -1;
      if (repX !== 0 || repY !== 0) {
        const distX = this.x < W / 2 ? this.x : W - this.x;
        const distY = this.y < H / 2 ? this.y : H - this.y;
        const strength = 1 - Math.min(distX, distY) / EDGE;
        const want = Math.atan2(repY, repX);
        let d = want - this.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.angle += d * Math.min(1, strength * 10 * dt);
        while (this.angle > Math.PI) this.angle -= Math.PI * 2;
        while (this.angle < -Math.PI) this.angle += Math.PI * 2;
      }
      this.angle += steer;
    }
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt + Math.sin(this.t * 2) * this.bobAmp * bob * dt * (bob > 1 ? 2 : 1);

    // ---- walls: clamp + glide along them (no mirror-bounce pinning) -----
    const m = this.r + 4;
    const onL = this.x < m;
    const onR = this.x > W - m;
    const onT = this.y < m;
    const onB = this.y > H - m;
    this.x = Math.max(m, Math.min(W - m, this.x));
    this.y = Math.max(m, Math.min(H - m, this.y));
    if (onL || onR || onT || onB) {
      let vx = this.angle >= 0 && this.angle < Math.PI ? Math.max(0.15, Math.cos(this.angle) * 0.8) : Math.min(-0.15, Math.cos(this.angle) * 0.8);
      let vy = 0.6;
      if (onT || onB) {
        vy = onT ? 0.55 : -0.55;
        vx = Math.cos(this.angle) * 0.8;
      } else {
        vy = Math.sin(this.angle) * 0.8;
      }
      if (onL) vx = 0.55;
      if (onR) vx = -0.55;
      if (onT) vy = 0.55;
      if (onB) vy = -0.55;
      this.angle = Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.3;
      if (this.escape > 0) this.escapeAngle = this.angle;
    }
  }

  // ---- drawing -----------------------------------------------------------

  draw(ctx) {
    const blink = Math.sin(this.t * 1.5) > 0.99;
    const pulse = this.mood === "love" ? 1 + Math.sin(this.t * 7) * 0.04 : 1;
    const facing = Math.cos(this.angle) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    const shadowW = this.r * 0.8;
    ctx.beginPath();
    ctx.ellipse(0, this.r + 6, shadowW, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawBack(ctx, facing);
    this.drawBody(ctx, facing);
    this.drawFace(ctx, facing, blink);
    this.drawFront(ctx, facing);
    if (WALKERS.has(this.kind)) this.drawFeet(ctx, facing);

    ctx.restore();

    for (const f of this.fx) {
      const p = f.t / f.ttl;
      const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(f.label, this.x, this.y - this.r * 1.9 - 16 * p);
    }
    ctx.globalAlpha = 1;
  }

  drawBack(ctx, facing) {
    const r = this.r;
    if (this.kind === "squirrel") {
      // big fluffy tail sweeping up behind
      ctx.save();
      ctx.translate(-facing * r * 0.95, -r * 0.7);
      ctx.rotate(-facing * 0.8);
      const g = ctx.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
      g.addColorStop(0, `hsl(${this.hue} 45% 64%)`);
      g.addColorStop(1, `hsl(${this.hue} 60% 40%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // fluffy tip tuft
      ctx.fillStyle = `hsl(${this.hue} 50% 52%)`;
      for (const t of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.arc(t * r * 0.3, -r * 0.72, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(-r * 0.1, -r * 0.5, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this.kind === "bee") {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.42, -r * 0.55, r * 0.3, r * 0.55, 0.4, 0, Math.PI * 2);
      ctx.ellipse(r * 0.42, -r * 0.55, r * 0.3, r * 0.55, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "whale") {
      const bx = -facing * r * 1.0;
      ctx.fillStyle = `hsl(${this.hue} 60% 36%)`;
      ctx.beginPath();
      ctx.moveTo(bx, -r * 0.15);
      ctx.lineTo(bx - facing * r * 0.5, -r * 0.62);
      ctx.lineTo(bx - facing * r * 0.18, 0);
      ctx.lineTo(bx - facing * r * 0.5, r * 0.62);
      ctx.lineTo(bx, r * 0.15);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === "cat") {
      // tapered tail curving up behind with a dunk-dark tip
      const tx = -facing * r * 1.35;
      const ty = -r * 0.28;
      ctx.fillStyle = `hsl(${this.hue} 30% 50%)`;
      ctx.beginPath();
      ctx.moveTo(-facing * r * 0.6, r * 0.12);
      ctx.quadraticCurveTo(-facing * r * 1.35, r * 0.05, tx, ty);
      ctx.quadraticCurveTo(-facing * r * 1.28, r * 0.28, -facing * r * 0.75, r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `hsl(${this.hue} 30% 36%)`;
      ctx.beginPath();
      ctx.arc(tx, ty + r * 0.06, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "piglet") {
      // curly corkscrew tail
      ctx.save();
      ctx.translate(-facing * r * 1.0, -r * 0.25);
      ctx.rotate(-facing * 0.4);
      ctx.strokeStyle = `hsl(${this.hue} 55% 55%)`;
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, Math.PI * 0.7, Math.PI * 4.4);
      ctx.stroke();
      ctx.restore();
    } else if (this.kind === "pigeon") {
      ctx.fillStyle = `hsl(${this.hue} 20% 55%)`;
      for (const dy of [-0.12, 0.05, 0.22]) {
        ctx.beginPath();
        ctx.moveTo(-facing * r * 1.0, dy * r * 2.6);
        ctx.lineTo(-facing * r * 1.55, dy * r * 2.6 + r * 0.12);
        ctx.lineTo(-facing * r * 1.0, dy * r * 2.6 + r * 0.3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawBody(ctx, facing) {
    const r = this.r;
    const hue = this.hue;
    if (this.kind === "critter") {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 70% 68%)`);
      g.addColorStop(1, `hsl(${hue} 70% 44%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.2, -r * 0.35, r * 0.45, r * 0.3, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "squirrel") {
      // arched, leaping-ready body with a light belly
      const g = ctx.createLinearGradient(0, -r * 1.1, 0, r * 1.1);
      g.addColorStop(0, `hsl(${hue} 55% 66%)`);
      g.addColorStop(1, `hsl(${hue} 50% 44%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.9, r * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      const bg = ctx.createLinearGradient(facing * r * 0.2, 0, facing * r * 0.9, 0);
      bg.addColorStop(0, "rgba(255,240,215,0.85)");
      bg.addColorStop(1, "rgba(255,240,215,0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.5, r * 0.18, r * 0.5, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.ellipse(-facing * r * 0.22, -r * 0.52, r * 0.38, r * 0.26, -0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "cat") {
      // round tabby body with back stripes and a muzzle patch
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 28% 64%)`);
      g.addColorStop(1, `hsl(${hue} 30% 44%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.98, r * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 30% 36%)`;
      for (const oy of [-0.32, 0, 0.32]) {
        ctx.beginPath();
        ctx.ellipse(-facing * r * 0.42, oy * r, r * 0.16, r * 0.07, facing * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      const mg = ctx.createLinearGradient(facing * r * 0.2, 0, facing * r * 0.95, 0);
      mg.addColorStop(0, "rgba(255,250,240,0.95)");
      mg.addColorStop(1, "rgba(255,250,240,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.55, 0, r * 0.48, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "piglet") {
      // plump round pig body with a pale belly
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 60% 74%)`);
      g.addColorStop(1, `hsl(${hue} 55% 60%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.04, r * 0.96, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,230,240,0.6)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.3, r * 0.7, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "bee") {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 85% 62%)`);
      g.addColorStop(1, `hsl(${hue} 85% 48%)`);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = "rgba(25,20,10,0.85)";
      ctx.fillRect(-r, -r * 0.35, r * 2, r * 0.24);
      ctx.fillRect(-r, r * 0.18, r * 2, r * 0.24);
      ctx.restore();
      ctx.strokeStyle = "rgba(25,20,10,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.kind === "whale") {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 60% 62%)`);
      g.addColorStop(1, `hsl(${hue} 65% 42%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.2, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 70% 78%)`;
      ctx.beginPath();
      ctx.ellipse(r * 0.3, r * 0.42, r * 0.8, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "snail") {
      // soft wet foot with a front head bump
      const g = ctx.createLinearGradient(0, -r * 0.5, 0, r);
      g.addColorStop(0, `hsl(${hue} 42% 74%)`);
      g.addColorStop(1, `hsl(${hue} 42% 55%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.05, r * 1.08, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${hue} 42% 68%)`;
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.55, r * 0.02, r * 0.48, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      // ripples along the foot fringe
      ctx.strokeStyle = `hsl(${hue} 35% 48%)`;
      ctx.lineWidth = 1.5;
      for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
        ctx.beginPath();
        ctx.arc(dx * r, r * 0.52, r * 0.2, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      // spiral shell riding on the back
      const sx = -facing * r * 0.4;
      const sy = -r * 0.3;
      const sr = r * 0.8;
      const sg = ctx.createRadialGradient(sx - sr * 0.35, sy - sr * 0.35, sr * 0.08, sx, sy, sr);
      sg.addColorStop(0, "hsl(34 60% 74%)");
      sg.addColorStop(1, "hsl(32 55% 50%)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "hsl(30 50% 42%)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "hsl(32 48% 40%)";
      ctx.lineWidth = 1.8;
      for (const t of [0.26, 0.48, 0.7]) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr * t, Math.PI * 0.85, Math.PI * 1.8);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.beginPath();
      ctx.ellipse(sx - sr * 0.3, sy - sr * 0.32, sr * 0.3, sr * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "pigeon") {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, `hsl(${hue} 25% 68%)`);
      g.addColorStop(1, `hsl(${hue} 25% 50%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // chest highlight
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.5, r * 0.3, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // iridescent neck patch
      const ng = ctx.createLinearGradient(0, -r * 0.1, 0, -r * 0.5);
      ng.addColorStop(0, "#5d9c6a");
      ng.addColorStop(1, "#7a5fa0");
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.2, -r * 0.28, r * 0.38, r * 0.28, 0.4, 0, Math.PI * 2);
      ctx.fill();
      // head
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(facing * r * 0.45, -r * 0.52, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFace(ctx, facing, blink) {
    if (this.kind === "bee") {
      // big black bee-eyes + antennae
      const r = this.r;
      ctx.fillStyle = "#1a1d2e";
      ctx.fillRect(-r * 0.32, -r * 0.05, r * 0.2, r * 0.28);
      ctx.fillRect(r * 0.12, -r * 0.05, r * 0.2, r * 0.28);
      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -r * 0.32);
      ctx.lineTo(-r * 0.42, -r * 0.72);
      ctx.moveTo(r * 0.32, -r * 0.32);
      ctx.lineTo(r * 0.42, -r * 0.72);
      ctx.stroke();
      ctx.fillStyle = "#1a1d2e";
      ctx.beginPath();
      ctx.arc(-r * 0.44, -r * 0.78, r * 0.09, 0, Math.PI * 2);
      ctx.arc(r * 0.44, -r * 0.78, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (this.kind === "snail") {
      // eyestalks with small eyes that retract on blink
      const r = this.r;
      const retract = blink ? 0.55 : 1;
      for (const side of [-1, 1]) {
        const bx = side * r * 0.4;
        const tx = bx + side * r * 0.16;
        const ty = -r * 0.92 * retract;
        ctx.strokeStyle = `hsl(${this.hue} 40% 58%)`;
        ctx.lineWidth = 2.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, -r * 0.4);
        ctx.quadraticCurveTo(bx + side * r * 0.24, -r * 0.72, tx, ty);
        ctx.stroke();
        ctx.fillStyle = blink ? `hsl(${this.hue} 42% 62%)` : "#fff";
        ctx.beginPath();
        ctx.arc(tx, ty - r * 0.03, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        if (!blink) {
          ctx.fillStyle = "#1a1d2e";
          ctx.beginPath();
          ctx.arc(tx, ty - r * 0.03, r * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // little smile
      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(facing * r * 0.3, r * 0.18, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return;
    }
    if (this.kind === "pigeon") {
      // single forward eye on the head + orange beak
      const r = this.r;
      const hx = facing * r * 0.45;
      const hy = -r * 0.52;
      if (this.mood === "scared") {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(hx + facing * r * 0.1, hy, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1d2e";
        ctx.beginPath();
        ctx.arc(hx + facing * r * 0.1, hy, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const closed = this.mood === "happy" || this.mood === "love";
        ctx.strokeStyle = "#1a1d2e";
        ctx.lineWidth = 2;
        if (blink && !closed) ctx.lineWidth = 2.6;
        ctx.beginPath();
        if (closed) {
          ctx.arc(hx + facing * r * 0.08, hy + r * 0.02, r * 0.1, Math.PI, 0);
        } else {
          ctx.arc(hx + facing * r * 0.08, hy, r * 0.13, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
      // beak
      ctx.fillStyle = "#f5a623";
      ctx.beginPath();
      ctx.moveTo(hx + facing * r * 0.24, hy + r * 0.03);
      ctx.lineTo(hx + facing * r * 0.62, hy + r * 0.12);
      ctx.lineTo(hx + facing * r * 0.24, hy + r * 0.2);
      ctx.closePath();
      ctx.fill();
      if (this.mood === "scared") {
        ctx.beginPath();
        ctx.arc(0, -r * 0.1, r * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    // default expressive face (critter, squirrel, whale, cat, piglet)
    const c = this.cfg;
    const r = this.r;
    const eyeR = r * c.eyeS;
    const lx = -r * c.spread;
    const rx2 = r * c.spread;
    const ey = r * c.eyS;
    const ex = facing * r * c.gaze;
    const open = blink ? 0.12 : 1;
    const mood = this.mood;

    ctx.strokeStyle = "#1a1d2e";
    ctx.lineWidth = 2;

    if (mood === "scared") {
      ctx.fillStyle = "#fff";
      for (const xx of [lx, rx2]) {
        ctx.beginPath();
        ctx.arc(xx, ey, eyeR * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#1a1d2e";
      for (const xx of [lx + ex * 0.2, rx2 + ex * 0.2]) {
        ctx.beginPath();
        ctx.arc(xx, ey, eyeR * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.42, r * 0.16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mood === "annoyed") {
      ctx.fillStyle = "#1a1d2e";
      for (const xx of [lx, rx2]) {
        ctx.fillRect(xx - eyeR * 0.55, ey - eyeR * 0.3, eyeR * 1.1, eyeR * 0.9);
        ctx.strokeRect(xx - eyeR * 0.55, ey - eyeR * 0.3, eyeR * 1.1, eyeR * 0.9);
      }
      ctx.beginPath();
      ctx.moveTo(ex * 0.4 + r * 0.1 - r * 0.2, r * 0.4);
      ctx.quadraticCurveTo(ex * 0.4 + r * 0.1, r * 0.52, ex * 0.4 + r * 0.1 + r * 0.2, r * 0.4);
      ctx.stroke();
      drawSweat(ctx, r * 0.5 + 6, ey - r * 0.05, 6);
    } else if (mood === "sad") {
      for (const xx of [lx, rx2]) {
        ctx.beginPath();
        ctx.arc(xx, ey + r * 0.12, eyeR * 0.9, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.52, r * 0.24, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (mood === "happy" || mood === "love") {
      for (const xx of [lx, rx2]) {
        if (mood === "love") {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(xx, ey, eyeR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1a1d2e";
          ctx.beginPath();
          ctx.arc(xx + ex * 0.4, ey, eyeR * 0.44, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(xx, ey + r * 0.05, eyeR * 1.1, Math.PI, 0);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(255,120,140,0.4)";
      ctx.beginPath();
      ctx.ellipse(lx - eyeR * 0.7, ey + r * 0.32, eyeR * 0.8, eyeR * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(rx2 + eyeR * 0.7, ey + r * 0.32, eyeR * 0.8, eyeR * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * 0.2, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      if (mood === "love" && this.fx.some((f) => f.label === "♥")) {
        drawHeart(ctx, ex * 0.4 + r * 0.1, r * 0.05, 7, "#ff5d8f");
      }
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(lx, ey, eyeR, 0, Math.PI * 2);
      ctx.arc(rx2, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx + ex, ey, eyeR * 0.15, 0, Math.PI * 2);
      ctx.arc(rx2 + ex, ey, eyeR * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1d2e";
      ctx.beginPath();
      ctx.arc(lx + ex * 0.5, ey + (1 - open) * 1.5, eyeR * 0.4, 0, Math.PI * 2);
      ctx.arc(rx2 + ex * 0.5, ey + (1 - open) * 1.5, eyeR * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1a1d2e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex * 0.4 + r * 0.1, r * c.myS, r * c.mrS, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      if (blink) {
        ctx.fillStyle = "#1a1d2e";
        ctx.fillRect(lx - eyeR + 2, ey + 1, eyeR * 2 - 4, 4);
        ctx.fillRect(rx2 - eyeR + 2, ey + 1, eyeR * 2 - 4, 4);
      }
    }
  }

  drawFront(ctx, facing) {
    const r = this.r;
    if (this.kind === "squirrel") {
      // rounded ears with a warm inner ear
      ctx.fillStyle = `hsl(${this.hue} 50% 46%)`;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.16, -r * 0.8);
        ctx.quadraticCurveTo(s * r * 0.4, -r * 1.3, s * r * 0.6, -r * 0.92);
        ctx.quadraticCurveTo(s * r * 0.42, -r * 0.94, s * r * 0.16, -r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,210,190,0.5)";
        ctx.beginPath();
        ctx.moveTo(s * r * 0.26, -r * 0.86);
        ctx.quadraticCurveTo(s * r * 0.4, -r * 1.14, s * r * 0.55, -r * 0.94);
        ctx.quadraticCurveTo(s * r * 0.42, -r * 0.96, s * r * 0.26, -r * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `hsl(${this.hue} 50% 46%)`;
      }
      // tiny nose
      ctx.fillStyle = "#1a1d2e";
      ctx.beginPath();
      ctx.arc(facing * r * 0.62, -r * 0.02, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === "cat") {
      // pointy ears with inner pink
      for (const s of [-1, 1]) {
        ctx.fillStyle = `hsl(${this.hue} 28% 44%)`;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.14, -r * 0.72);
        ctx.lineTo(s * r * 0.34, -r * 1.2);
        ctx.lineTo(s * r * 0.66, -r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,160,175,0.55)";
        ctx.beginPath();
        ctx.moveTo(s * r * 0.22, -r * 0.76);
        ctx.lineTo(s * r * 0.36, -r * 1.08);
        ctx.lineTo(s * r * 0.56, -r * 0.84);
        ctx.closePath();
        ctx.fill();
      }
      // whiskers
      ctx.strokeStyle = "rgba(30,30,30,0.5)";
      ctx.lineWidth = 1;
      for (let k = 1; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(facing * r * 0.55, k * r * 0.08);
        ctx.lineTo(facing * r * 1.0, k * r * 0.18);
        ctx.moveTo(facing * r * 0.55, -k * r * 0.04);
        ctx.lineTo(facing * r * 1.0, -k * r * 0.14);
        ctx.stroke();
      }
      // nose
      ctx.fillStyle = "#e07080";
      ctx.beginPath();
      ctx.moveTo(facing * r * 0.62, -r * 0.06);
      ctx.lineTo(facing * r * 0.9, 0);
      ctx.lineTo(facing * r * 0.62, r * 0.07);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === "whale") {
      // pectoral fin
      ctx.fillStyle = `hsl(${this.hue} 60% 38%)`;
      ctx.beginPath();
      ctx.moveTo(facing * r * 0.55, r * 0.15);
      ctx.quadraticCurveTo(facing * r * 0.85, r * 0.35, facing * r * 0.62, r * 0.62);
      ctx.quadraticCurveTo(facing * r * 0.42, r * 0.4, facing * r * 0.55, r * 0.15);
      ctx.closePath();
      ctx.fill();
      // blowhole spout
      const phase = this.t % 9;
      if (phase < 1.5 && this.mood !== "annoyed" && this.mood !== "scared") {
        ctx.globalAlpha = 0.8 * (1 - phase / 1.5);
        ctx.strokeStyle = "#cfe8ff";
        ctx.lineWidth = 3;
        for (const dx of [-0.14, 0, 0.14]) {
          ctx.beginPath();
          ctx.moveTo(dx * r, -r * 0.95);
          ctx.quadraticCurveTo(dx * r - r * 0.12, -r * 1.5, dx * r * 0.4, -r * 1.55);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else if (this.kind === "pigeon") {
      // folded wings
      ctx.strokeStyle = `hsl(${this.hue} 25% 42%)`;
      ctx.lineWidth = r * 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.quadraticCurveTo(facing * r * 0.25, r * 0.1, facing * r * 0.18, r * 0.5);
      ctx.stroke();
    } else if (this.kind === "piglet") {
      // blush cheeks
      ctx.fillStyle = "rgba(255,120,150,0.4)";
      ctx.beginPath();
      ctx.arc(-r * 0.55, r * 0.2, r * 0.17, 0, Math.PI * 2);
      ctx.arc(r * 0.55, r * 0.2, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      // floppy triangle ears
      for (const s of [-1, 1]) {
        ctx.fillStyle = `hsl(${this.hue} 60% 58%)`;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.2, -r * 0.7);
        ctx.quadraticCurveTo(s * r * 0.15, -r * 1.08, s * r * 0.48, -r * 1.06);
        ctx.quadraticCurveTo(s * r * 0.55, -r * 0.82, s * r * 0.34, -r * 0.68);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,200,215,0.55)";
        ctx.beginPath();
        ctx.moveTo(s * r * 0.26, -r * 0.74);
        ctx.quadraticCurveTo(s * r * 0.25, -r * 0.98, s * r * 0.44, -r * 0.98);
        ctx.quadraticCurveTo(s * r * 0.47, -r * 0.84, s * r * 0.34, -r * 0.73);
        ctx.closePath();
        ctx.fill();
      }
      // snout
      ctx.fillStyle = `hsl(${this.hue} 65% 76%)`;
      ctx.beginPath();
      ctx.ellipse(facing * r * 0.6, 0, r * 0.36, r * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsl(${this.hue} 55% 60%)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // nostrils
      ctx.fillStyle = "#b3596b";
      ctx.beginPath();
      ctx.arc(facing * r * 0.72, -r * 0.09, r * 0.07, 0, Math.PI * 2);
      ctx.arc(facing * r * 0.72, r * 0.09, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFeet(ctx, facing) {
    const r = this.r;
    const bottoms = { critter: 1.02, squirrel: 1.18, cat: 0.9, piglet: 0.96 };
    const bot = r * (bottoms[this.kind] ?? 0.95);
    const w = r * (this.kind === "squirrel" ? 0.55 : 0.5);
    ctx.strokeStyle = `hsl(${this.hue} 70% 30%)`;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const step = this.mood === "scared" || this.mood === "annoyed" ? Math.sin(this.t * 18) * 6 : Math.sin(this.t * 10) * 4;
    ctx.beginPath();
    ctx.moveTo(-w, r * 0.72);
    ctx.lineTo(-w + step, bot);
    ctx.moveTo(w, r * 0.72);
    ctx.lineTo(w - step, bot);
    ctx.stroke();
  }
}