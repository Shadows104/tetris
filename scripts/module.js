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
  static active = false;    // a break is running on this client
  static visible = false;   // the Tetris screen is showing
  static element = null;
  static bar = null;        // GM-only "break in progress" bar shown while the Tetris screen is hidden
  static game = null;
  static scores = new Map(); // userId -> {name, color, score, best, state, ready}
  static stats = null;
  static ready = false;
  static _joined = false;   // whether this user has opened the Tetris screen this break
  static _allReadyNotified = false;

  /** Called on every client when a break starts (or on load during one). */
  static start() {
    if (this.active) return;
    this.active = true;
    this.scores.clear();
    this.ready = false;
    this._joined = false;
    this._allReadyNotified = false;
    this.stats = { score: 0, best: 0, lines: 0, level: 1, state: "idle" };
    this._build();

    if (!game.user.isGM || game.settings.get(MODULE_ID, "gmShowsTetris")) this.show();
    else this._showBar();

    // Ask everyone already on break to resend their state, so late joiners see the full table.
    game.socket.emit(SOCKET, { type: "sync" });
    this.render();
  }

  /** Called on every client when the break ends. */
  static stop() {
    if (!this.active) return;
    this.active = false;
    this.hide();
    this.game?.destroy();
    this.game = null;
    const el = this.element;
    this.element = null;
    setTimeout(() => el?.remove(), 300);
    this.bar?.remove();
    this.bar = null;
  }

  /** Bring the Tetris screen up and route keyboard input to it. */
  static show() {
    if (!this.active || this.visible) return;
    this.visible = true;
    document.activeElement?.blur();
    this.bar?.classList.add("bt-hidden");
    window.addEventListener("keydown", this._onKeyDown, { capture: true });
    requestAnimationFrame(() => this.element?.classList.add("bt-visible"));
    if (!this._joined) {
      this._joined = true;
      this._publish();
    }
  }

  /** Open or close the GM's Tetris board without affecting the break. */
  static toggle() {
    if (!this.active || !game.user.isGM) return;
    if (this.visible) this.hide();
    else this.show();
  }

  /** Put the Tetris screen away without ending the break (GM only). */
  static hide() {
    if (!this.visible) return;
    this.visible = false;
    window.removeEventListener("keydown", this._onKeyDown, { capture: true });
    if (this.game?.state === "playing") this.game.togglePause();
    this.element?.classList.remove("bt-visible");
    if (this.active && game.user.isGM) this._showBar();
  }

  static _showBar() {
    if (this.bar) {
      this.bar.classList.remove("bt-hidden");
      return;
    }
    const bar = document.createElement("div");
    bar.id = "breaktime-bar";
    bar.innerHTML = `
      <span class="bt-bar-title"><i class="fa-solid fa-mug-hot"></i> Break in progress</span>
      <span class="bt-ready-count"></span>
      <button type="button" class="bt-scores-toggle" aria-expanded="false"><i class="fa-solid fa-trophy"></i> Scores</button>
      <button type="button" class="bt-show"><i class="fa-solid fa-gamepad"></i> Play Tetris</button>
      <button type="button" class="bt-end"><i class="fa-solid fa-play"></i> End Break</button>
      <div class="bt-bar-scores bt-hidden">
        <div class="bt-scores-head"><span>Player</span><span>Now</span><span>Best</span></div>
        <ol class="bt-scores"></ol>
        <p class="bt-no-scores">Nobody has started a game yet.</p>
      </div>`;
    bar.querySelector(".bt-scores-toggle").addEventListener("click", event => {
      const open = bar.querySelector(".bt-bar-scores").classList.toggle("bt-hidden") === false;
      event.currentTarget.setAttribute("aria-expanded", String(open));
    });
    bar.querySelector(".bt-show").addEventListener("click", () => this.show());
    bar.querySelector(".bt-end").addEventListener("click", () => endBreak());
    document.body.append(bar);
    this.bar = bar;
    this.render();
  }

  static _build() {
    const el = document.createElement("div");
    el.id = "breaktime-overlay";
    el.innerHTML = `
      <header class="bt-header">
        <h1><i class="fa-solid fa-mug-hot"></i> Break Time</h1>
        <span class="bt-ready-count"></span>
        ${game.user.isGM
          ? `<button type="button" class="bt-hide"><i class="fa-solid fa-pen-ruler"></i> Back to Foundry</button>
             <button type="button" class="bt-end"><i class="fa-solid fa-play"></i> End Break</button>`
          : `<button type="button" class="bt-ready"></button>`}
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
          <section class="bt-panel">
            <h2>Table</h2>
            <div class="bt-scores-head"><span>Player</span><span>Now</span><span>Best</span></div>
            <ol class="bt-scores"></ol>
          </section>
        </aside>
      </div>`;
    document.body.append(el);
    this.element = el;

    el.querySelector(".bt-end")?.addEventListener("click", () => endBreak());
    el.querySelector(".bt-hide")?.addEventListener("click", () => this.hide());
    el.querySelector(".bt-ready")?.addEventListener("click", event => {
      // Blur so Space/Enter go to the game instead of re-clicking the button.
      event.currentTarget.blur();
      this.ready = !this.ready;
      this._publish();
    });
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
  }

  /**
   * Captures keys before Foundry's KeyboardManager sees them, so arrows don't pan the
   * canvas and hotkeys don't fire while the break is on. Only game keys have their
   * browser default prevented, so things like F5 / dev tools still work.
   */
  static _onKeyDown = event => {
    if (!BreakOverlay.visible) return;
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return;
    event.stopPropagation();
    // Foundry never sees keys while the board is up, so handle the GM's shortcut here.
    if (game.user.isGM && BreakOverlay._isBreakShortcut(event)) {
      event.preventDefault();
      if (!event.repeat) BreakOverlay.hide();
      return;
    }
    if (BreakOverlay.game?.handleKey(event.code)) event.preventDefault();
  };

  static _isBreakShortcut(event) {
    const held = {
      Control: event.ctrlKey || event.metaKey,
      Shift: event.shiftKey,
      Alt: event.altKey
    };
    return game.keybindings.get(MODULE_ID, "breakShortcut").some(
      ({ key, modifiers = [] }) => key === event.code && Object.entries(held).every(([m, down]) => modifiers.includes(m) === down)
    );
  }

  static _onStats(stats) {
    if (!this.element) return;
    for (const [key, value] of Object.entries(stats)) {
      const node = this.element.querySelector(`[data-stat="${key}"]`);
      if (node) node.textContent = value.toLocaleString?.() ?? value;
    }
    this.stats = stats;
    this._publish();
  }

  /** Record this user's score and ready state locally and send it to everyone else. */
  static _publish() {
    if (!this.active || !this._joined) return;
    const entry = {
      userId: game.user.id,
      name: game.user.name,
      color: game.user.color?.css ?? String(game.user.color ?? "#fff"),
      score: this.stats.score,
      best: this.stats.best,
      state: this.stats.state,
      ready: this.ready
    };
    this.updateScore(entry);
    game.socket.emit(SOCKET, { type: "score", ...entry });
  }

  static updateScore(entry) {
    this.scores.set(entry.userId, entry);
    this.render();
  }

  static removeUser(userId) {
    this.scores.delete(userId);
    this.render();
  }

  static render() {
    if (!this.active) return;
    this._renderScores();
    this._renderReady();
  }

  static _renderReady() {
    const button = this.element.querySelector(".bt-ready");
    if (button) {
      button.classList.toggle("bt-is-ready", this.ready);
      button.innerHTML = this.ready
        ? `<i class="fa-solid fa-check"></i> Ready! (click to undo)`
        : `<i class="fa-solid fa-hand"></i> I'm ready to continue`;
    }

    const players = game.users.filter(u => u.active && !u.isGM);
    const readyCount = players.filter(u => this.scores.get(u.id)?.ready).length;
    const allReady = players.length > 0 && readyCount === players.length;
    for (const count of document.querySelectorAll("#breaktime-overlay .bt-ready-count, #breaktime-bar .bt-ready-count")) {
      count.textContent = players.length ? `${readyCount}/${players.length} players ready` : "";
      count.classList.toggle("bt-all-ready", allReady);
    }

    if (game.user.isGM && allReady && !this._allReadyNotified) {
      ui.notifications.info("All players are ready to continue.");
    }
    this._allReadyNotified = allReady;
  }

  /** Draw the scoreboard in the Tetris screen and in the GM's bar dropdown. */
  static _renderScores() {
    const rows = [...this.scores.values()].sort((a, b) => b.best - a.best || b.score - a.score);
    for (const list of document.querySelectorAll("#breaktime-overlay .bt-scores, #breaktime-bar .bt-scores")) {
      list.replaceChildren(...rows.map(s => this._scoreRow(s)));
    }
    this.bar?.querySelector(".bt-no-scores").classList.toggle("bt-hidden", rows.length > 0);
  }

  static _scoreRow(s) {
    const li = document.createElement("li");
    if (s.userId === game.user.id) li.classList.add("bt-me");

    const name = document.createElement("span");
    name.className = "bt-name";
    name.style.borderColor = s.color;
    const label = document.createElement("span");
    label.className = "bt-name-text";
    label.textContent = s.name;
    name.append(label);
    if (s.ready) {
      const mark = document.createElement("i");
      mark.className = "fa-solid fa-check bt-ready-mark";
      mark.title = "Ready to continue";
      name.append(mark);
    }

    const now = document.createElement("span");
    now.className = "bt-score";
    now.textContent = `${s.score.toLocaleString()}${s.state === "over" ? " ✖" : ""}`;
    if (s.state === "over") now.title = "Game over";

    const best = document.createElement("span");
    best.className = "bt-best";
    best.textContent = s.best.toLocaleString();

    li.append(name, now, best);
    return li;
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
        BreakOverlay.start();
        ui.notifications.info("The GM has called a break. Enjoy some Tetris!");
      } else {
        BreakOverlay.stop();
        ui.notifications.info("Break's over. Back to the game!");
      }
      // reset: rebuild the tool list so the mug button is removed/restored.
      ui.controls?.render({ reset: true });
    }
  });

  game.settings.register(MODULE_ID, "gmShowsTetris", {
    name: "GM: Open Tetris when a break starts",
    hint: "Only affects the GM. When off, starting a break leaves you in Foundry with a small break bar, so you can keep prepping; click Play Tetris on the bar to join in. Players always get Tetris.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "wasPaused", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.keybindings.register(MODULE_ID, "breakShortcut", {
    name: "Start Break / Show or Hide Tetris",
    hint: "Starts a break for everyone. During a break, opens or closes your own Tetris board; it never ends the break (use the End Break button for that).",
    editable: [{ key: "KeyB", modifiers: ["Control", "Shift"] }],
    restricted: true,
    onDown: () => {
      if (isBreakActive()) BreakOverlay.toggle();
      else startBreak();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    startBreak,
    endBreak,
    toggleBreak,
    isBreakActive,
    toggleBoard: () => BreakOverlay.toggle()
  };

  game.socket.on(SOCKET, data => {
    if (!BreakOverlay.active) return;
    if (data?.type === "score") BreakOverlay.updateScore(data);
    else if (data?.type === "sync") BreakOverlay._publish();
  });

  // Players who join or reload mid-break go straight into the break screen.
  if (isBreakActive()) BreakOverlay.start();
});

Hooks.on("userConnected", (user, connected) => {
  if (!connected) BreakOverlay.removeUser(user.id);
  else BreakOverlay.render();
});

Hooks.on("getSceneControlButtons", controls => {
  // During a break the button is removed, so the break can only be ended deliberately
  // from the End Break button on the Tetris screen or the GM's break bar.
  if (!game.user.isGM || (game.ready && isBreakActive())) return;
  const tool = {
    name: "breaktime",
    title: "Start Break (Tetris)",
    icon: "fa-solid fa-mug-hot",
    button: true,
    visible: true,
    order: 100,
    onChange: () => startBreak()
  };

  // v13+: controls is a record keyed by control name, tools is a record too.
  const tokens = controls.tokens ?? controls.token;
  if (tokens?.tools) tokens.tools.breaktime = tool;
});
