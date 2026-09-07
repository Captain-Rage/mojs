/**
 * A wandering "desktop mate" creature. Drawn on a shared canvas; it drifts
 * around with Perlin-ish wander, flips direction at the walls, and every so
 * often blinks, dozes, or chirps. Two of them roam by default.
 */
export class Pet {
  constructor(ctx, { x, y, hue = 150, speed = 1 }) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.hue = hue;
    this.spd = speed * 60; // px / s at 1x
    this.angle = Math.random() * Math.PI * 2;
    this.r = 26;
    this.vy = 0; // vertical bob velocity
    this.t = Math.random() * 100;
  }

  update(dt, W, H, pets) {
    this.t += dt;
    // Wander: random steering noise, eases between angles.
    if (Math.random() < dt * 0.8) this.angle += (Math.random() - 0.5) * 1.2;
    this.angle += Math.sin(this.t * 0.6) * dt * 0.4;

    const rest = Math.sin(this.t * 2) > 0.97; // occasional idle pause
    const speed = rest ? 0 : this.spd;

    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;

    // Bounce off the walls.
    const m = this.r + 4;
    if (this.x < m) { this.x = m; this.angle = Math.PI - this.angle; }
    if (this.x > W - m) { this.x = W - m; this.angle = Math.PI - this.angle; }
    if (this.y < m) { this.y = m; this.angle = -this.angle; }
    if (this.y > H - m) { this.y = H - m; this.angle = -this.angle; }

    // Gentle floating bobbing.
    this.vy += Math.sin(this.t * 3) * 0.001;
    this.y += Math.sin(this.t * 2) * 8 * dt;
  }

  draw(ctx) {
    const blink = Math.sin(this.t * 1.5) > 0.99;
    ctx.save();
    ctx.translate(this.x, this.y);
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

    // eyes
    ctx.fillStyle = "#fff";
    const ey = -this.r * 0.15;
    const ex = facing * this.r * 0.3;
    const eyeR = this.r * 0.22;
    ctx.beginPath(); ctx.arc(-this.r * 0.3, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.r * 0.3, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-this.r * 0.3 + ex, ey, eyeR * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.r * 0.3 + ex, ey, eyeR * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1d2e";
    ctx.beginPath(); ctx.arc(-this.r * 0.3 + ex * 0.5, ey, eyeR * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.r * 0.3 + ex * 0.5, ey, eyeR * 0.4, 0, Math.PI * 2); ctx.fill();

    // mouth
    ctx.strokeStyle = "#1a1d2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex * 0.4 + this.r * 0.1, this.r * 0.35, this.r * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // blink overlays
    if (blink) {
      ctx.fillStyle = "#1a1d2e";
      ctx.fillRect(-this.r * 0.3 - eyeR + 2, ey - 2, eyeR * 2 - 4, 4);
      ctx.fillRect(this.r * 0.3 - eyeR + 2, ey - 2, eyeR * 2 - 4, 4);
    }

    // feet
    ctx.strokeStyle = `hsl(${this.hue} 70% 34%)`;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const step = Math.sin(this.t * 10) * 4;
    ctx.beginPath();
    ctx.moveTo(-this.r * 0.4, this.r * 0.75);
    ctx.lineTo(-this.r * 0.4 + step, this.r * 0.95);
    ctx.moveTo(this.r * 0.4, this.r * 0.75);
    ctx.lineTo(this.r * 0.4 - step, this.r * 0.95);
    ctx.stroke();

    ctx.restore();
  }
}
