// Tiny assertion + canvas stubs shared by the tests.

export function assert(cond, message) {
  if (cond) console.log("ok  ", message);
  else {
    console.error("FAIL", message);
    process.exitCode = 1;
  }
}

/** A 2D context that accepts every drawing call and does nothing. */
export function fakeContext(width = 110, height = 80) {
  return new Proxy({}, {
    get: (t, k) => (k === "canvas" ? { width, height } : k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true)
  });
}

export function fakeCanvas() {
  const ctx = fakeContext();
  return { getContext: () => ctx };
}
