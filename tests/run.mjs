// Runs every test file (the Foundry simulation once per role × game) and reports a summary.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const runs = [
  ["tetris engine", "tetris.test.mjs", {}],
  ["snake engine", "snake.test.mjs", {}]
];
for (const GAME of ["tetris", "snake"]) {
  for (const ROLE of ["player", "gm", "gm-off"]) runs.push([`foundry ${GAME}/${ROLE}`, "overlay.test.mjs", { GAME, ROLE }]);
}

let failed = 0;
for (const [name, file, env] of runs) {
  const r = spawnSync(process.execPath, [dir + file], { env: { ...process.env, ...env }, encoding: "utf8" });
  const out = r.stdout + r.stderr;
  const ok = (out.match(/^ok /gm) ?? []).length;
  const bad = r.status !== 0;
  if (bad) failed++;
  console.log(`${bad ? "FAIL" : "pass"}  ${name.padEnd(24)} ${ok} checks`);
  if (bad || process.argv.includes("-v")) console.log(out.replace(/^/gm, "      "));
}
process.exit(failed ? 1 : 0);
