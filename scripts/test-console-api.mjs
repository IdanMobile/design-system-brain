/** Test console HTTP API (shared — no imports from cursor/fix-all to avoid cycles). */

const UI = process.env.TEST_CONSOLE_UI ?? "http://127.0.0.1:6110";

export async function api(path, init) {
  for (const base of ["http://127.0.0.1:6111", UI]) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if (res.ok) return res.json();
    } catch {
      /* next */
    }
  }
  throw new Error("Test console API not reachable");
}
