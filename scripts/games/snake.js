// Snake engine rendered onto a <canvas>. See common.js for the game contract.

import { drawStateMessage, handleCommonKey } from "./common.js";

export const SIZE = 20; // cells per side
export const CELL = 25;

const FOOD_POINTS = 10;
const FOOD_PER_LEVEL = 5;
const START_LENGTH = 3;

const DIRECTIONS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0]
};

export class SnakeGame {
  static id = "snake";
  static label = "Snake";
  static icon = "fa-solid fa-worm";
  static width = SIZE * CELL;
  static height = SIZE * CELL;
  static panels = {};
  static stats = [["score", "Score"], ["length", "Length"], ["level", "Level"], ["best", "Best"]];
  static controls = [
    ["← ↑ → ↓", "Steer"],
    ["W A S D", "Steer"],
    ["P / Esc", "Pause"],
    ["Enter", "Start"]
  ];

  /**
   * @param {object} els
   * @param {HTMLCanvasElement} els.board
   * @param {(stats: object) => void} onStats  Called whenever score/length/level/state changes.
   */
  constructor({ board }, onStats) {
    this.ctx = board.getContext("2d");
    this.onStats = onStats;
    this.best = 0;
    this.state = "idle"; // idle | playing | paused | over
    this._frame = this._frame.bind(this);
    this._raf = null;
    this.reset();
    this.render();
  }

  reset() {
    const mid = Math.floor(SIZE / 2);
    // Head first, trailing off to the left, heading right.
    this.snake = Array.from({ length: START_LENGTH }, (_, i) => [mid - i, mid]);
    this.dir = [1, 0];
    this.turns = []; // queued direction changes, so quick double-taps aren't lost
    this.score = 0;
    this.eaten = 0;
    this.level = 1;
    this.stepTimer = 0;
    this._placeFood();
  }

  start() {
    this.reset();
    this.state = "playing";
    this._lastTime = performance.now();
    if (!this._raf) this._raf = requestAnimationFrame(this._frame);
    this._emit();
    this.render();
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") {
      this.state = "playing";
      this._lastTime = performance.now();
    }
    this.render();
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  get stepInterval() {
    return Math.max(55, 140 - (this.level - 1) * 10);
  }

  getStats() {
    return { score: this.score, best: this.best, length: this.snake.length, level: this.level, state: this.state };
  }

  /* ---------------------------------------- */
  /*  Input                                   */
  /* ---------------------------------------- */

  /** @returns {boolean} whether the key was used by the game */
  handleKey(code) {
    if (handleCommonKey(this, code)) return true;
    if (this.state !== "playing") return false;
    const dir = DIRECTIONS[code];
    if (!dir) return false;

    // Compare against the last queued turn (or current heading) so you can't reverse into yourself.
    const last = this.turns.at(-1) ?? this.dir;
    const reverse = dir[0] === -last[0] && dir[1] === -last[1];
    const same = dir[0] === last[0] && dir[1] === last[1];
    if (!reverse && !same && this.turns.length < 2) this.turns.push(dir);
    return true;
  }

  /* ---------------------------------------- */
  /*  Mechanics                               */
  /* ---------------------------------------- */

  _placeFood() {
    const taken = new Set(this.snake.map(([x, y]) => `${x},${y}`));
    const free = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if (!taken.has(`${x},${y}`)) free.push([x, y]);
    }
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  /** Advance the snake one cell. */
  step() {
    if (this.turns.length) this.dir = this.turns.shift();
    const [hx, hy] = this.snake[0];
    const head = [hx + this.dir[0], hy + this.dir[1]];
    const eating = this.food && head[0] === this.food[0] && head[1] === this.food[1];

    // The tail moves out of the way this step unless we're growing.
    const body = eating ? this.snake : this.snake.slice(0, -1);
    const hitWall = head[0] < 0 || head[0] >= SIZE || head[1] < 0 || head[1] >= SIZE;
    const hitSelf = body.some(([x, y]) => x === head[0] && y === head[1]);
    if (hitWall || hitSelf) return this._gameOver();

    this.snake = [head, ...body];
    if (eating) {
      this.eaten++;
      this.score += FOOD_POINTS * this.level;
      this.level = Math.floor(this.eaten / FOOD_PER_LEVEL) + 1;
      this._placeFood();
      if (!this.food) return this._gameOver(); // filled the board
      this._emit();
    }
  }

  _gameOver() {
    this.state = "over";
    this._emit();
    this.render();
  }

  _emit() {
    this.best = Math.max(this.best, this.score);
    this.onStats?.(this.getStats());
  }

  _frame(now) {
    const dt = now - (this._lastTime ?? now);
    this._lastTime = now;
    if (this.state === "playing") {
      this.stepTimer += dt;
      if (this.stepTimer >= this.stepInterval) {
        this.stepTimer = 0;
        this.step();
      }
      this.render();
    }
    this._raf = requestAnimationFrame(this._frame);
  }

  /* ---------------------------------------- */
  /*  Rendering                               */
  /* ---------------------------------------- */

  render() {
    const ctx = this.ctx;
    const px = SIZE * CELL;
    ctx.fillStyle = "#11131a";
    ctx.fillRect(0, 0, px, px);

    // Checkerboard so movement is easy to read.
    ctx.fillStyle = "rgba(255,255,255,0.025)";
    for (let y = 0; y < SIZE; y++) {
      for (let x = (y % 2); x < SIZE; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }

    if (this.food) {
      const [fx, fy] = this.food;
      ctx.fillStyle = "#e8484a";
      ctx.beginPath();
      ctx.arc(fx * CELL + CELL / 2, fy * CELL + CELL / 2, CELL * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4ccf5a";
      ctx.fillRect(fx * CELL + CELL / 2 - 1, fy * CELL + 3, 3, 5);
    }

    this.snake.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? "#7ee08a" : "#4ccf5a";
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, 3);
    });

    // Eyes on the head, facing the direction of travel.
    const [hx, hy] = this.snake[0];
    const [dx, dy] = this.dir;
    const cx = hx * CELL + CELL / 2, cy = hy * CELL + CELL / 2;
    ctx.fillStyle = "#11131a";
    for (const side of [-1, 1]) {
      const ex = cx + dx * 5 + dy * side * 5;
      const ey = cy + dy * 5 + dx * side * 5;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.state !== "playing") drawStateMessage(ctx, px, px, this.state);
  }
}
