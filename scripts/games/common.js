// Helpers shared by the break-time games.
//
// Every game class follows the same contract so the break screen can host any of them:
//   static id, label, icon        identity shown in the GM's game picker
//   static width, height          board canvas size in pixels
//   static panels                 { hold?: true, next?: true } preview canvases the game draws into
//   static stats                  [[key, label], ...] shown in the stats panel (keys from getStats())
//   static controls               [[keys, action], ...] shown in the controls panel
//   constructor(canvases, onStats)  canvases = { board, next?, hold? }
//   start(), togglePause(), destroy(), handleKey(code) -> boolean, getStats(), state, best

/** Darkened overlay with a title and hint for the idle / paused / game-over states. */
export function drawStateMessage(ctx, width, height, state) {
  const msg = {
    idle: ["Break Time!", "Press Enter to play"],
    paused: ["Paused", "Press P to resume"],
    over: ["Game Over", "Press Enter to play again"]
  }[state];
  if (!msg) return;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(msg[0], width / 2, height / 2 - 10);
  ctx.font = "16px sans-serif";
  ctx.fillText(msg[1], width / 2, height / 2 + 20);
}

/** Shared keys: Enter starts from idle/game over, P/Esc toggles pause. Returns true if handled. */
export function handleCommonKey(game, code) {
  if (code === "Enter" && (game.state === "idle" || game.state === "over")) {
    game.start();
    return true;
  }
  if ((code === "KeyP" || code === "Escape") && (game.state === "playing" || game.state === "paused")) {
    game.togglePause();
    return true;
  }
  return false;
}
