// Self-contained Tetris engine rendered onto <canvas> elements.

export const COLS = 10;
export const ROWS = 20;
export const CELL = 30;

const PIECES = {
  I: { color: "#3ad7e6", shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  J: { color: "#4a6cf0", shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: "#f0a030", shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
  O: { color: "#f0d840", shape: [[1, 1], [1, 1]] },
  S: { color: "#4ccf5a", shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  T: { color: "#b05ce8", shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  Z: { color: "#e8484a", shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] }
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

function rotateCW(m) {
  return m[0].map((_, c) => m.map(row => row[c]).reverse());
}

function rotateCCW(m) {
  return m[0].map((_, c) => m.map(row => row[row.length - 1 - c]));
}

export class TetrisGame {
  /**
   * @param {object} els
   * @param {HTMLCanvasElement} els.board
   * @param {HTMLCanvasElement} els.next
   * @param {HTMLCanvasElement} els.hold
   * @param {(stats: object) => void} onStats  Called whenever score/lines/level/state changes.
   */
  constructor({ board, next, hold }, onStats) {
    this.boardCtx = board.getContext("2d");
    this.nextCtx = next.getContext("2d");
    this.holdCtx = hold.getContext("2d");
    this.onStats = onStats;
    this.best = 0;
    this.state = "idle"; // idle | playing | paused | over
    this._frame = this._frame.bind(this);
    this._raf = null;
    this.reset();
    this.render();
  }

  reset() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.holdType = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropTimer = 0;
    this.piece = null;
    this._fillQueue();
  }

  start() {
    this.reset();
    this.state = "playing";
    this._spawn();
    this._lastTime = performance.now();
    if (!this._raf) this._raf = requestAnimationFrame(this._frame);
    this._emit();
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

  get dropInterval() {
    return Math.max(60, 1000 * Math.pow(0.82, this.level - 1));
  }

  /* ---------------------------------------- */
  /*  Input                                   */
  /* ---------------------------------------- */

  /** @returns {boolean} whether the key was used by the game */
  handleKey(code) {
    if (code === "Enter" && (this.state === "idle" || this.state === "over")) {
      this.start();
      return true;
    }
    if (code === "KeyP" || code === "Escape") {
      if (this.state === "playing" || this.state === "paused") {
        this.togglePause();
        return true;
      }
      return false;
    }
    if (this.state !== "playing") return false;

    switch (code) {
      case "ArrowLeft": this._move(-1, 0); break;
      case "ArrowRight": this._move(1, 0); break;
      case "ArrowDown":
        if (this._move(0, 1)) { this.score += 1; this.dropTimer = 0; this._emit(); }
        break;
      case "ArrowUp":
      case "KeyX": this._rotate(rotateCW); break;
      case "KeyZ": this._rotate(rotateCCW); break;
      case "Space": this._hardDrop(); break;
      case "KeyC":
      case "ShiftLeft":
      case "ShiftRight": this._hold(); break;
      default: return false;
    }
    this.render();
    return true;
  }

  /* ---------------------------------------- */
  /*  Mechanics                               */
  /* ---------------------------------------- */

  _fillQueue() {
    while (this.queue.length < 3) {
      if (!this.bag.length) {
        this.bag = Object.keys(PIECES);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  _makePiece(type) {
    const shape = PIECES[type].shape.map(r => [...r]);
    return { type, shape, x: Math.floor((COLS - shape[0].length) / 2), y: type === "I" ? -1 : 0 };
  }

  _spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this._fillQueue();
    }
    this.piece = this._makePiece(type);
    this.dropTimer = 0;
    if (this._collides(this.piece.shape, this.piece.x, this.piece.y)) this._gameOver();
  }

  _collides(shape, px, py) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const gx = px + x, gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && this.grid[gy][gx]) return true;
      }
    }
    return false;
  }

  _move(dx, dy) {
    const p = this.piece;
    if (this._collides(p.shape, p.x + dx, p.y + dy)) return false;
    p.x += dx;
    p.y += dy;
    return true;
  }

  _rotate(fn) {
    const p = this.piece;
    if (p.type === "O") return;
    const shape = fn(p.shape);
    for (const [kx, ky] of KICKS) {
      if (!this._collides(shape, p.x + kx, p.y + ky)) {
        p.shape = shape;
        p.x += kx;
        p.y += ky;
        return;
      }
    }
  }

  _ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this._collides(p.shape, p.x, y + 1)) y++;
    return y;
  }

  _hardDrop() {
    const target = this._ghostY();
    this.score += (target - this.piece.y) * 2;
    this.piece.y = target;
    this._lock();
  }

  _hold() {
    if (!this.canHold) return;
    const current = this.piece.type;
    if (this.holdType) this._spawn(this.holdType);
    else this._spawn();
    this.holdType = current;
    this.canHold = false;
  }

  _lock() {
    const p = this.piece;
    for (let y = 0; y < p.shape.length; y++) {
      for (let x = 0; x < p.shape[y].length; x++) {
        if (!p.shape[y][x]) continue;
        const gy = p.y + y;
        if (gy < 0) return this._gameOver();
        this.grid[gy][p.x + x] = PIECES[p.type].color;
      }
    }

    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(Boolean)) {
        this.grid.splice(y, 1);
        this.grid.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      this.score += LINE_SCORES[cleared] * this.level;
      this.lines += cleared;
      this.level = Math.floor(this.lines / 10) + 1;
    }

    this.canHold = true;
    this._spawn();
    this._emit();
  }

  _gameOver() {
    this.state = "over";
    this.best = Math.max(this.best, this.score);
    this._emit();
    this.render();
  }

  _emit() {
    this.best = Math.max(this.best, this.score);
    this.onStats?.({
      score: this.score,
      best: this.best,
      lines: this.lines,
      level: this.level,
      state: this.state
    });
  }

  _frame(now) {
    const dt = now - (this._lastTime ?? now);
    this._lastTime = now;
    if (this.state === "playing") {
      this.dropTimer += dt;
      if (this.dropTimer >= this.dropInterval) {
        this.dropTimer = 0;
        if (!this._move(0, 1)) this._lock();
      }
      this.render();
    }
    this._raf = requestAnimationFrame(this._frame);
  }

  /* ---------------------------------------- */
  /*  Rendering                               */
  /* ---------------------------------------- */

  render() {
    const ctx = this.boardCtx;
    ctx.fillStyle = "#11131a";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(COLS * CELL, y * CELL + 0.5); ctx.stroke();
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y][x]) this._drawCell(ctx, x, y, this.grid[y][x]);
      }
    }

    if (this.piece && (this.state === "playing" || this.state === "paused")) {
      const p = this.piece;
      const color = PIECES[p.type].color;
      const gy = this._ghostY();
      this._drawShape(ctx, p.shape, p.x, gy, color, CELL, 0.2);
      this._drawShape(ctx, p.shape, p.x, p.y, color, CELL, 1);
    }

    if (this.state !== "playing") {
      const msg = {
        idle: ["Break Time!", "Press Enter to play"],
        paused: ["Paused", "Press P to resume"],
        over: ["Game Over", "Press Enter to play again"]
      }[this.state];
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(msg[0], (COLS * CELL) / 2, (ROWS * CELL) / 2 - 10);
      ctx.font = "16px sans-serif";
      ctx.fillText(msg[1], (COLS * CELL) / 2, (ROWS * CELL) / 2 + 20);
    }

    this._renderPreview(this.nextCtx, this.queue[0]);
    this._renderPreview(this.holdCtx, this.holdType, !this.canHold);
  }

  _renderPreview(ctx, type, dim = false) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    if (!type) return;
    const shape = PIECES[type].shape;
    // Trim empty rows/cols so the preview is centred.
    const rows = shape.map((r, i) => (r.some(Boolean) ? i : -1)).filter(i => i >= 0);
    const cols = shape[0].map((_, c) => (shape.some(r => r[c]) ? c : -1)).filter(c => c >= 0);
    const size = 22;
    const ox = (width - cols.length * size) / 2 / size - cols[0];
    const oy = (height - rows.length * size) / 2 / size - rows[0];
    this._drawShape(ctx, shape, ox, oy, PIECES[type].color, size, dim ? 0.35 : 1);
  }

  _drawShape(ctx, shape, px, py, color, size, alpha) {
    ctx.globalAlpha = alpha;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x] && py + y >= 0) this._drawCell(ctx, px + x, py + y, color, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawCell(ctx, x, y, color, size = CELL) {
    const px = x * size, py = y * size;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(px + 1, py + 1, size - 2, 4);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(px + 1, py + size - 5, size - 2, 4);
  }
}
