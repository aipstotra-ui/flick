// 1€ filter (Casiez, Roussel and Vogel, CHI 2012): smooths a slow hand hard and a fast one lightly.

function alpha(dt, cutoff) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuro2D {
  constructor({ minCutoff, beta, dCutoff = 1 }) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = [0, 0];
    this.t = 0;
  }

  filter(p, t) {
    if (this.x === null) {
      this.x = [p[0], p[1]];
      this.t = t;
      return this.x;
    }
    const dt = t - this.t;
    if (dt <= 0) return this.x;
    const ad = alpha(dt, this.dCutoff);
    for (let i = 0; i < 2; i++) this.dx[i] += ad * ((p[i] - this.x[i]) / dt - this.dx[i]);
    const speed = Math.hypot(this.dx[0], this.dx[1]);
    const a = alpha(dt, this.minCutoff + this.beta * speed);
    this.x = [this.x[0] + a * (p[0] - this.x[0]), this.x[1] + a * (p[1] - this.x[1])];
    this.t = t;
    return this.x;
  }
}
