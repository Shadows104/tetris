import { TetrisGame, COLS, ROWS, CELL } from "./tetris.js";

const MODULE_ID = "tetris";
const SOCKET = `module.${MODULE_ID}`;

/* ---------------------------------------- */
/*  Break control (GM)                      */
/* ---------------------------------------- */

function isBreakActive() {
  return game.settings.get(MODULE_ID, "breakActive");
}

async function startBreak() {
  if (!game.user.isGM || isBreakActive()) return;
  // Remember whether the game was already paused so ending the break restores it exactly.
  await game.settings.set(MODULE_ID, "wasPaused", game.paused);
  if (!game.paused) game.togglePause(true, { broadcast: true });
  await game.settings.set(MODULE_ID, "breakActive", true);
}

async function endBreak() {
  if (!game.user.isGM || !isBreakActive()) return;
  await game.settings.set(MODULE_ID, "breakActive", false);
  if (!game.settings.get(MODULE_ID, "wasPaused") && game.paused) game.togglePause(false, { broadcast: true });
}

function toggleBreak() {
  return isBreakActive() ? endBreak() : startBreak();
}

/* ---------------------------------------- */
/*  Overlay                                 */
/* ---------------------------------------- */

class BreakOverlay {
  static element = null;
  static game = null;
  static scores = new Map(); // userId -> {name, color, score, best, state}

  static open() {
    if (this.element) return;
    document.activeElement?.blur();
    this.scores.clear();

    const el = document.createElement("div");
    el.id = "breaktime-overlay";
    el.innerHTML = `
      <header class="bt-header">
        <h1><i class="fa-solid fa-mug-hot"></i> Break Time</h1>
        ${game.user.isGM ? `<button type="button" class="bt-end"><i class="fa-solid fa-play"></i> End Break</button>` : ""}
      </header>
      <div class="bt-body">
        <aside class="bt-side">
          <section class="bt-panel"><h2>Hold</h2><canvas class="bt-hold" width="110" height="80"></canvas></section>
          <section class="bt-panel bt-help">
            <h2>Controls</h2>
            <dl>
              <dt>← →</dt><dd>Move</dd>
              <dt>↓</dt><dd>Soft drop</dd>
              <dt>Space</dt><dd>Hard drop</dd>
              <dt>↑ / X</dt><dd>Rotate right</dd>
              <dt>Z</dt><dd>Rotate left</dd>
              <dt>C / Shift</dt><dd>Hold</dd>
              <dt>P / Esc</dt><dd>Pause</dd>
              <dt>Enter</dt><dd>Start</dd>
            </dl>
          </section>
        </aside>
        <canvas class="bt-board" width="${COLS * CELL}" height="${ROWS * CELL}" tabindex="0"></canvas>
        <aside class="bt-side">
          <section class="bt-panel"><h2>Next</h2><canvas class="bt-next" width="110" height="80"></canvas></section>
          <section class="bt-panel bt-stats">
            <div><span>Score</span><strong data-stat="score">0</strong></div>
            <div><span>Lines</span><strong data-stat="lines">0</strong></div>
            <div><span>Level</span><strong data-stat="level">1</strong></div>
            <div><span>Best</span><strong data-stat="best">0</strong></div>
          </section>
          <section class="bt-panel"><h2>Table</h2><ol class="bt-scores"></ol></section>
        </aside>
      </div>`;
    document.body.append(el);
    this.element = el;

    el.querySelector(".bt-end")?.addEventListener("click", () => endBreak());
    el.querySelector(".bt-board").addEventListener("click", () => {
      if (this.game.state === "idle" || this.game.state === "over") this.game.start();
    });

    this.game = new TetrisGame(
      {
        board: el.querySelector(".bt-board"),
        next: el.querySelector(".bt-next"),
        hold: el.querySelector(".bt-hold")
      },
      stats => this._onStats(stats)
    );

    window.addEventListener("keydown", this._onKeyDown, { capture: true });
    this._onStats({ score: 0, best: 0, lines: 0, level: 1, state: "idle" });
    requestAnimationFrame(() => el.classList.add("bt-visible"));
  }

  static close() {
    if (!this.element) return;
    window.removeEventListener("keydown", this._onKeyDown, { capture: true });
    this.game?.destroy();
    this.game = null;
    const el = this.element;
    this.element = null;
    el.classList.remove("bt-visible");
    setTimeout(() => el.remove(), 300);
  }

  /**
   * Captures keys before Foundry's KeyboardManager sees them, so arrows don't pan the
   * canvas and hotkeys don't fire while the break is on. Only game keys have their
   * browser default prevented, so things like F5 / dev tools still work.
   */
  static _onKeyDown = event => {
    if (!BreakOverlay.element) return;
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
    event.stopPropagation();
    if (BreakOverlay.game?.handleKey(event.code)) event.preventDefault();
  };

  static _onStats(stats) {
    if (!this.element) return;
    for (const [key, value] of Object.entries(stats)) {
      const node = this.element.querySelector(`[data-stat="${key}"]`);
      if (node) node.textContent = value.toLocaleString?.() ?? value;
    }
    const entry = {
      userId: game.user.id,
      name: game.user.name,
      color: game.user.color?.css ?? String(game.user.color ?? "#fff"),
      score: stats.score,
      best: stats.best,
      state: stats.state
    };
    this.updateScore(entry);
    game.socket.emit(SOCKET, { type: "score", ...entry });
  }

  static updateScore(entry) {
    this.scores.set(entry.userId, entry);
    this._renderScores();
  }

  static _renderScores() {
    const list = this.element?.querySelector(".bt-scores");
    if (!list) return;
    const rows = [...this.scores.values()].sort((a, b) => b.best - a.best || b.score - a.score);
    list.replaceChildren(
      ...rows.map(s => {
        const li = document.createElement("li");
        if (s.userId === game.user.id) li.classList.add("bt-me");
        const name = document.createElement("span");
        name.className = "bt-name";
        name.style.borderColor = s.color;
        name.textContent = s.name;
        const score = document.createElement("span");
        score.className = "bt-score";
        score.textContent = `${s.score.toLocaleString()}${s.state === "over" ? " ✖" : ""}`;
        score.title = `Best: ${s.best.toLocaleString()}`;
        li.append(name, score);
        return li;
      })
    );
  }
}

/* ---------------------------------------- */
/*  Hooks                                   */
/* ---------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "breakActive", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: active => {
      if (active) {
        BreakOverlay.open();
        ui.notifications.info("The GM has called a break. Enjoy some Tetris!");
      } else {
        BreakOverlay.close();
        ui.notifications.info("Break's over. Back to the game!");
      }
      ui.controls?.render();
    }
  });

  game.settings.register(MODULE_ID, "wasPaused", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.keybindings.register(MODULE_ID, "toggleBreak", {
    name: "Start / End Break",
    hint: "Toggle Breaktime Tetris for everyone (GM only).",
    editable: [{ key: "KeyB", modifiers: ["Control", "Shift"] }],
    restricted: true,
    onDown: () => {
      toggleBreak();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { startBreak, endBreak, toggleBreak, isBreakActive };

  game.socket.on(SOCKET, data => {
    if (data?.type === "score" && BreakOverlay.element) BreakOverlay.updateScore(data);
  });

  // Players who join or reload mid-break go straight into the break screen.
  if (isBreakActive()) BreakOverlay.open();
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const active = game.ready && isBreakActive();
  const tool = {
    name: "breaktime",
    title: active ? "End Break" : "Start Break (Tetris)",
    icon: active ? "fa-solid fa-play" : "fa-solid fa-mug-hot",
    button: true,
    visible: true,
    order: 100,
    onChange: () => toggleBreak()
  };

  // v13+: controls is a record keyed by control name, tools is a record too.
  const tokens = controls.tokens ?? controls.token;
  if (tokens?.tools) tokens.tools.breaktime = tool;
});
