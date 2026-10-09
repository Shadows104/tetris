// Runs module.js against a fake Foundry (jsdom + stubbed game/ui/Hooks/socket).
// ROLE = player | gm | gm-off (GM with "open the game when a break starts" off)
// GAME = tetris | snake (the game chosen for the break)
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { assert, fakeContext } from "./helpers.mjs";

const ROLE = process.env.ROLE ?? "player";
const GAME = process.env.GAME ?? "tetris";
const IS_GM = ROLE.startsWith("gm");
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

/* ---------- Fake browser ---------- */
const dom = new JSDOM("<!doctype html><head></head><body></body>", { pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, {
  window, document: window.document,
  HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement,
  // Run one-off callbacks (the overlay fade-in); ignore the games' animation loops.
  requestAnimationFrame: f => (f.length ? 1 : setTimeout(f)),
  cancelAnimationFrame: () => {}
});
window.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this.width, this.height); };
const style = document.createElement("style");
style.textContent = readFileSync(new URL("../styles/module.css", import.meta.url), "utf8");
document.head.append(style);

/* ---------- Fake Foundry ---------- */
const hooks = {};
const fire = (n, ...a) => (hooks[n] ?? []).forEach(f => f(...a));
globalThis.Hooks = { once: (n, f) => (hooks[n] ??= []).push(f), on: (n, f) => (hooks[n] ??= []).push(f) };

const users = [
  { id: "gm", name: "GM", isGM: true, active: true },
  { id: "p1", name: "Alice", isGM: false, active: true, color: { css: "#f00" } },
  { id: "p2", name: "Bob", isGM: false, active: true, color: { css: "#0f0" } }
];
const settings = {};
const sent = [];
const notes = [];
const dialogs = [];
let socketHandler;
globalThis.ui = { notifications: { info: m => notes.push(m) }, controls: { render() {} } };
globalThis.foundry = {
  applications: { api: { DialogV2: { wait: async opts => (dialogs.push(opts), GAME) } } }
};
globalThis.game = {
  user: IS_GM ? users[0] : users[1], users, paused: false, ready: true,
  togglePause(p) { this.paused = p; },
  settings: {
    register: (m, k, o) => (settings[k] = { ...o, value: o.default }),
    get: (m, k) => settings[k].value,
    set: async (m, k, v) => { settings[k].value = v; settings[k].onChange?.(v); }
  },
  keybindings: { _b: {}, register(m, k, o) { this._b[k] = o; }, get(m, k) { return this._b[k].editable; } },
  socket: { emit: (ch, d) => sent.push(d), on: (ch, f) => (socketHandler = f) },
  modules: { get: () => ({}) }
};

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const shown = () => $("#breaktime-overlay")?.classList.contains("bt-visible");
const count = sel => $(`${sel} .bt-ready-count`).textContent;
const breakOn = () => game.settings.get("tetris", "breakActive");
const toolbar = () => { const c = { tokens: { tools: {} } }; fire("getSceneControlButtons", c); return c.tokens.tools.breaktime; };
const pressShortcut = () => window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyB", ctrlKey: true, shiftKey: true, bubbles: true }));
const foundryShortcut = () => game.keybindings._b.breakShortcut.onDown();
const keyReachesFoundry = code => {
  let got = false; const f = () => (got = true);
  window.addEventListener("keydown", f);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { code, bubbles: true }));
  window.removeEventListener("keydown", f);
  return got;
};
const score = (userId, name, score, best, state = "playing", ready = false) =>
  socketHandler({ type: "score", userId, name, color: "#0f0", score, best, state, ready });
const barCells = i => [...document.querySelectorAll("#breaktime-bar .bt-scores li")[i].children].map(c => c.textContent.trim());

/* ---------- Load module ---------- */
await import("../scripts/module.js");
fire("init");
fire("ready");
if (ROLE === "gm-off") await game.settings.set("tetris", "gmShowsTetris", false);

/* ---------- Start the break ---------- */
if (IS_GM) {
  const tool = toolbar();
  assert(tool?.title === "Start Break", "GM toolbar has Start Break mug");
  await tool.onChange();
  assert(dialogs.length === 1 && dialogs[0].buttons.map(b => b.action).join() === "tetris,snake", "mug asks the GM to pick Tetris or Snake");
} else {
  assert(!toolbar(), "players never get the toolbar button");
  await game.settings.set("tetris", "breakGame", GAME);
  await game.settings.set("tetris", "breakActive", true);
}
await tick();
assert(breakOn(), "break is running");
// Pausing happens on the GM's client (startBreak); the player test flips the setting directly.
if (IS_GM) assert(game.paused, "starting the break pauses Foundry");
assert($("#breaktime-overlay").dataset.game === GAME, `everyone gets the chosen game (${GAME})`);
assert(notes.some(n => n.includes(GAME === "snake" ? "Snake" : "Tetris")), "break notification names the game");
assert(sent.some(d => d.type === "sync"), "opening asks others to resend their state");
if (GAME === "snake") {
  assert(!$(".bt-hold") && !$(".bt-next"), "Snake has no Hold/Next panels");
  assert($(".bt-help").textContent.includes("Steer") && $('[data-stat="length"]').textContent === "3", "Snake controls and Length stat shown");
  assert($(".bt-board").width === 500 && $(".bt-board").height === 500, "Snake board is 500×500");
} else {
  assert($(".bt-hold") && $(".bt-next") && $('[data-stat="lines"]') && $('[data-stat="level"]').textContent === "1", "Tetris has Hold/Next and Lines/Level");
}

/* ---------- Role-specific behaviour ---------- */
if (ROLE === "player") {
  assert(shown() && !keyReachesFoundry("ArrowLeft"), "player's game is visible and captures keys");
  pressShortcut();
  assert(shown(), "Ctrl+Shift+B does nothing for players");
  assert(!$(".bt-end") && !$(".bt-hide") && $(".bt-ready"), "player sees Ready button only");
  assert(count("#breaktime-overlay") === "0/2 players ready", "ready count starts at 0/2");

  sent.length = 0;
  $(".bt-ready").click();
  assert(sent.at(-1)?.ready === true && count("#breaktime-overlay") === "1/2 players ready", "clicking Ready broadcasts and counts");
  assert(document.activeElement !== $(".bt-ready"), "Ready button blurs so keys go to the game");

  score("p2", "Bob", 300, 300, "playing", true);
  assert($("#breaktime-overlay .bt-ready-count").classList.contains("bt-all-ready"), "all ready highlighted");
  assert(!notes.some(n => n.includes("All players")), "players don't get the GM's all-ready notification");

  sent.length = 0;
  socketHandler({ type: "sync" });
  assert(sent.length === 1 && sent[0].userId === "p1", "sync request re-sends own state");

  users[2].active = false;
  fire("userConnected", users[2], false);
  assert(count("#breaktime-overlay") === "1/1 players ready" && !$(".bt-scores").textContent.includes("Bob"), "disconnected player removed");
  users[2].active = true;

  $(".bt-board").click();
  assert(sent.at(-1)?.state === "playing", "clicking the board starts a game");

  await game.settings.set("tetris", "breakActive", false);
} else if (ROLE === "gm") {
  assert(shown() && !$("#breaktime-bar"), "GM default: game opens, no bar");
  assert(sent.some(d => d.type === "score" && d.userId === "gm"), "GM who opened the game is on the scoreboard");
  assert($(".bt-end") && $(".bt-hide") && !$(".bt-ready"), "GM sees Back to Foundry + End Break");
  assert(!toolbar(), "mug removed from toolbar during the break");

  $(".bt-hide").click();
  assert(!shown() && $("#breaktime-bar") && breakOn(), "Back to Foundry hides the game; break continues");
  assert($("#breaktime-bar .bt-show").textContent.includes(GAME === "snake" ? "Play Snake" : "Play Tetris"), "bar button names the game");
  assert(keyReachesFoundry("ArrowLeft"), "GM's keys reach Foundry while hidden");
  assert(window.getComputedStyle($("#breaktime-overlay")).visibility === "hidden", "hidden game screen doesn't block clicks");

  foundryShortcut(); await tick();
  assert(shown() && breakOn(), "Ctrl+Shift+B (in Foundry) reopens the game");
  pressShortcut();
  assert(!shown() && breakOn(), "Ctrl+Shift+B (on the game) hides it; break continues");
  $("#breaktime-bar .bt-show").click(); await tick();
  assert(shown() && $("#breaktime-bar").classList.contains("bt-hidden"), "Play button brings it back");
  $(".bt-hide").click();

  score("p1", "Alice", 0, 0, "idle", true);
  assert(!notes.some(n => n.includes("All players")), "no notification until everyone is ready");
  score("p2", "Bob", 100, 100, "playing", true);
  score("p2", "Bob", 200, 200, "playing", true);
  assert(notes.filter(n => n.includes("All players")).length === 1, "GM notified exactly once when all ready");
  assert(count("#breaktime-bar") === "2/2 players ready", "bar shows ready count");

  $("#breaktime-bar .bt-end").click(); await tick(10);
} else {
  assert(!shown() && $("#breaktime-bar"), "GM with auto-open off: bar instead of the game");
  assert(keyReachesFoundry("ArrowLeft"), "GM's keys reach Foundry");
  assert(!sent.some(d => d.type === "score" && d.userId === "gm"), "GM not on scoreboard until they open the game");
  sent.length = 0;
  socketHandler({ type: "sync" });
  assert(sent.length === 0, "GM doesn't answer sync until they join");

  const drop = $("#breaktime-bar .bt-bar-scores");
  $("#breaktime-bar .bt-scores-toggle").click();
  assert(!drop.classList.contains("bt-hidden") && !$(".bt-no-scores").classList.contains("bt-hidden"), "Scores dropdown opens, empty message shown");
  score("p2", "Bob", 1200, 1200, "playing", true);
  score("p1", "Alice", 300, 300, "over", true);
  assert(JSON.stringify([barCells(0), barCells(1)]) === JSON.stringify([["Bob", "1,200", "1,200"], ["Alice", "300 ✖", "300"]]), "dropdown shows Player / Now / Best");
  score("p1", "Alice", 0, 300, "playing", true);
  assert(JSON.stringify(barCells(1)) === JSON.stringify(["Alice", "0", "300"]), "new game: Now resets, Best kept");
  score("p1", "Alice", 1500, 1500, "playing", true);
  assert(barCells(0)[0] === "Alice", "beating the top best moves to the top");
  assert(notes.some(n => n.includes("All players")), "all-ready notification works without opening the game");

  foundryShortcut(); await tick();
  assert(shown() && sent.some(d => d.type === "score" && d.userId === "gm"), "shortcut opens game; GM joins scoreboard");
  $(".bt-end").click(); await tick(10);
}

/* ---------- End the break ---------- */
await tick(400);
assert(!breakOn(), "break ended");
if (IS_GM) assert(!game.paused, "ending the break unpauses Foundry");
assert(!$("#breaktime-overlay") && !$("#breaktime-bar"), "everything removed after the break");
assert(keyReachesFoundry("ArrowLeft"), "keys reach Foundry after the break");
if (IS_GM) {
  assert(toolbar(), "mug returns to the toolbar");
  foundryShortcut(); await tick();
  assert(dialogs.length === 2 && breakOn(), "Ctrl+Shift+B with no break asks for a game and starts one");
}
