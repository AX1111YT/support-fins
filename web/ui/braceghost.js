/**
 * The sway brace hover preview's motion (walls.js decides WHAT it shows): the ghost
 * fades in and out instead of popping, a big jump in height cross-fades, a pointer
 * slipping off the upright side for a moment (an edge, a small facet) doesn't blink
 * it, the label eases after the cursor, and the cursor dot eases to amber on a spot
 * that can't take a brace, and the rotate rings fade back while it's up (ringfade.js).
 * Nothing here changes which brace a click stands.
 */
import * as THREE from 'three';
import { scene, meshFrom, MODEL, clip, requestRender } from './scene.js';
import { el } from './dom.js';
import { fadeRings } from './ringfade.js';

const FADE_MS = 120;     // ghost fade in / out
const GRACE_MS = 150;    // off the side this long before the preview starts to fade
const OPACITY = 0.45;    // the wall ghost's opacity
const CROSS_MM = 4;      // a height change past this cross-fades; smaller ones swap in place
const TIP_EASE = 0.35;   // share of the gap the label closes each frame
const CURSOR_OK = new THREE.Color(0xcffbe4), CURSOR_BAD = new THREE.Color(0xffb454);

const tip = el('brace-tip');
const ghostMat = () => new THREE.MeshStandardMaterial({
  color: 0x8ff0bd, roughness: 0.7, transparent: true, opacity: 0,
  side: THREE.DoubleSide, clippingPlanes: clip,
});
let ghosts = [];         // { mesh, on }: `on` fades it in, otherwise out and away
let height = null;       // the shown brace's height, to tell a step from a jump
let cursorMat = null, cursorBad = false;
let tipAt = null, tipTo = null;
let grace = 0, graceDone = null;
let running = false, lastT = 0;

/** walls.js hands over its cursor dot's material, whose colour this eases. */
export function initBraceGhost(material) { cursorMat = material; }

/** Show the brace `tris` (height `h` mm); `tris` null = this spot is refused. */
export function showBrace(tris, h, text, bad) {
  cancelGrace();
  const cur = ghosts.find((g) => g.on);
  if (!tris) {
    if (cur) cur.on = false;
    height = null;
  } else if (cur && Math.abs(h - height) <= CROSS_MM) {
    // a step: same mesh, new shape, opacity untouched
    cur.mesh.geometry.dispose();
    cur.mesh.geometry = shape(tris);
    height = h;
  } else {
    if (cur) cur.on = false;
    const mesh = meshFrom(tris, ghostMat());
    if (mesh) { mesh.layers.disable(MODEL); ghosts.push({ mesh, on: true }); }
    height = h;
  }
  cursorBad = bad;
  fadeRings(true);
  tip.textContent = text;
  tip.classList.toggle('bad', bad);
  tip.classList.add('show');
  kick();
}

/** Where the label should sit (screen px); it eases there, or jumps if hidden. */
export function moveTip(x, y) {
  tipTo = [x, y];
  if (!tip.classList.contains('show') || !tipAt) { tipAt = [x, y]; place(); }
  kick();
}

/** Fade the preview out, after GRACE_MS when `soft` (the pointer may come straight
 *  back). `then` runs when the fade starts, e.g. to hide the cursor dot; a later soft
 *  call inside the grace replaces it (the latest place the pointer went decides). */
export function hideBrace(soft, then) {
  if (soft) {
    graceDone = then;
    if (grace) return;
    grace = setTimeout(() => { grace = 0; const f = graceDone; graceDone = null; fadeAll(); f?.(); }, GRACE_MS);
    return;
  }
  finishGrace();
  fadeAll();
  then?.();
}

/** Gone this frame: the geometry is stale (a rebuild) or a click just placed it. */
export function dropBrace() {
  finishGrace();
  for (const g of ghosts) remove(g);
  ghosts = [];
  height = null;
  cursorBad = false;
  fadeRings(false);
  if (cursorMat) cursorMat.color.copy(CURSOR_OK);
  tip.classList.remove('show');
  tipAt = null;
}

export const braceGrace = () => !!grace;

function cancelGrace() {
  if (grace) clearTimeout(grace);
  grace = 0;
  graceDone = null;
}

/** End a grace early, still doing what it was going to (e.g. hide the dot). */
function finishGrace() {
  const f = graceDone;
  cancelGrace();
  f?.();
}

function fadeAll() {
  for (const g of ghosts) g.on = false;
  fadeRings(false);
  height = null;
  cursorBad = false;
  tip.classList.remove('show');
  tipAt = null;
  kick();
}

function shape(tris) {
  const arr = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) arr.set(tris[i].slice(0, 3), i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

function remove(g) {
  scene.remove(g.mesh);
  g.mesh.geometry.dispose();
  g.mesh.material.dispose();
}

function place() {
  tip.style.left = `${tipAt[0]}px`;
  tip.style.top = `${tipAt[1]}px`;
}

function kick() {
  if (running) return;
  running = true;
  lastT = performance.now();
  requestAnimationFrame(frame);
}

/** One animation frame: step the fades, the label and the cursor colour; stop when all settle. */
function frame(now) {
  const step = Math.min(1, Math.max(0, now - lastT) / FADE_MS) * OPACITY;
  lastT = now;
  let busy = false;
  for (const g of ghosts) {
    const m = g.mesh.material, to = g.on ? OPACITY : 0;
    m.opacity = to > m.opacity ? Math.min(to, m.opacity + step) : Math.max(to, m.opacity - step);
    if (m.opacity !== to) busy = true;
  }
  for (const g of ghosts) if (!g.on && g.mesh.material.opacity === 0) remove(g);
  ghosts = ghosts.filter((g) => g.on || g.mesh.material.opacity > 0);
  if (tipAt && tipTo) {
    const dx = tipTo[0] - tipAt[0], dy = tipTo[1] - tipAt[1];
    if (Math.abs(dx) + Math.abs(dy) > 0.5) {
      tipAt = [tipAt[0] + dx * TIP_EASE, tipAt[1] + dy * TIP_EASE];
      busy = true;
    } else tipAt = [...tipTo];
    place();
  }
  if (cursorMat) {
    const to = cursorBad ? CURSOR_BAD : CURSOR_OK, c = cursorMat.color;
    if (Math.abs(c.r - to.r) + Math.abs(c.g - to.g) + Math.abs(c.b - to.b) > 0.01) {
      c.lerp(to, Math.min(1, step / OPACITY));
      busy = true;
    } else c.copy(to);
  }
  requestRender(100);
  if (busy) requestAnimationFrame(frame);
  else running = false;
}
