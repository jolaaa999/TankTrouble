export class Vec2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  len(): number {
    return Math.hypot(this.x, this.y);
  }

  normalize(): Vec2 {
    const l = this.len();
    if (l <= 1e-8) return new Vec2(0, 0);
    return new Vec2(this.x / l, this.y / l);
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }
}
