import { assert, fakeCanvas } from "./helpers.mjs";
globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
const { TetrisGame } = await import("../scripts/games/tetris.js");

const rotateCW = m => m[0].map((_, c) => m.map(r => r[c]).reverse());
let last;
const g = new TetrisGame({ board: fakeCanvas(), next: fakeCanvas(), hold: fakeCanvas() }, s => (last = s));

assert(!g.handleKey("ArrowLeft") && g.state === "idle", "keys ignored before start");
g.handleKey("Enter");
assert(g.state === "playing", "Enter starts");

const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "KeyZ", "KeyC", "ArrowDown"];
let n = 0;
while (g.state === "playing" && n < 1000) { g.handleKey(keys[n % 6]); g.handleKey("Space"); n++; }
assert(g.state === "over" && last.state === "over", `stacking ends in game over (${n} drops)`);
assert(last.best === last.score, "best tracks score");
g.handleKey("Enter");
assert(g.state === "playing" && g.score === 0, "Enter restarts");

g.start(); g.handleKey("ArrowDown"); g.handleKey("ArrowDown"); g.handleKey("Space");
assert(g.score === 0, "soft and hard drops award no points");

g.start();
g.grid[19] = Array(10).fill("#fff"); for (const x of [3, 4, 5, 6]) g.grid[19][x] = null;
g.piece = g._makePiece("I"); g.piece.x = 3; g._hardDrop();
assert(last.lines === 1 && g.score === 100 && g.grid[19].every(c => !c), "single line at level 1 = 100");

g.start();
for (let y = 16; y < 20; y++) { g.grid[y] = Array(10).fill("#fff"); g.grid[y][0] = null; }
g.piece = g._makePiece("I"); g._rotate(rotateCW);
while (g._move(-1, 0)); g._hardDrop();
assert(last.lines === 4 && g.score === 800, "Tetris at level 1 = 800");

g.handleKey("KeyP"); assert(g.state === "paused" && !g.handleKey("ArrowLeft"), "pause blocks movement");
g.handleKey("KeyP"); assert(g.state === "playing", "unpause");

const t = g.piece.type; g.handleKey("KeyC"); assert(g.holdType === t, "hold stores piece");
const t2 = g.piece.type; g.handleKey("KeyC"); assert(g.piece.type === t2, "cannot hold twice in a row");

g.piece = g._makePiece("T"); while (g._move(-1, 0)); g._rotate(rotateCW); g._rotate(rotateCW);
assert(!g._collides(g.piece.shape, g.piece.x, g.piece.y), "rotation at wall stays in bounds");

const bestBefore = g.best; g.start();
assert(g.score === 0 && g.best === bestBefore && bestBefore >= 800, "new game resets score but keeps best");

// Speed: starts brisk and ramps up per level, never faster than 50ms/row.
g.start();
const speeds = [1, 2, 5, 10, 20].map(level => ((g.level = level), Math.round(g.dropInterval)));
assert(speeds[0] === 550, `level 1 drops a row every 550ms (${speeds[0]})`);
assert(speeds.every((v, i) => i === 0 || v <= speeds[i - 1]) && speeds[3] < 50 * 1.5 && speeds[4] === 50, `speeds up each level to a 50ms floor (${speeds.join(", ")})`);
