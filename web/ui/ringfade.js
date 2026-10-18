/**
 * The rotate rings fade back while a sway brace preview is up (braceghost.js), so
 * they don't sit over the ghost and the side being aimed at, and fade in again
 * when the preview goes. Faint, they still work: a drag turns the part.
 */
import { requestRender } from './scene.js';

const FADED = 0.15;     // share of their usual opacity while a brace is aimed
const FADE_MS = 120;    // the brace ghost's fade

let fade = 1, target = 1, running = false, lastT = 0;

/** Wrap the gizmo's per-frame update: it resets every handle's opacity there (its
 *  hover highlight), so the fade is applied on top of that, once per material. */
export function initRingFade(gizmo) {
  const g = gizmo._gizmo;
  if (!g?.gizmo?.rotate) return;   // a three.js without these internals: no fade, rings as ever
  const own = g.updateMatrixWorld.bind(g);
  g.updateMatrixWorld = (force) => {
    own(force);
    if (fade >= 1) return;
    const mats = new Set();
    for (const group of [g.gizmo.rotate, g.helper.rotate]) {
      group.traverse((o) => { if (o.material) mats.add(o.material); });
    }
    for (const m of mats) m.opacity *= fade;
  };
}

/** Fade the rings back (a brace preview is up) or in again. */
export function fadeRings(back) {
  target = back ? FADED : 1;
  if (running || fade === target) return;
  running = true;
  lastT = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const step = (Math.max(0, now - lastT) / FADE_MS) * (1 - FADED);
  lastT = now;
  fade = target > fade ? Math.min(target, fade + step) : Math.max(target, fade - step);
  requestRender(100);
  if (fade !== target) requestAnimationFrame(frame);
  else running = false;
}
