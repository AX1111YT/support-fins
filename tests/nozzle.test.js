// Nozzle size (web/nozzle.js): the support widths scale from their 0.4 numbers.
// 0.4 must leave every number exactly as it was; the one-line features (tines,
// tip) scale both ways; the structural widths (wall, wedge, brace rib) only grow.
// It reaches the Worker in opts.tunables.nozzle, like the gap.

import { tiltedBlockTopo, analyze, fins, prop, assert, assertClose } from './_util.js';
import { applyNozzle } from '../web/nozzle.js';
import { SWAY } from '../web/sway.js';
import { PERP } from '../web/fins/wedges.js';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const knobs = () => ({ th: prop.PROP.th, tip: prop.PROP.tip, tineW: prop.PROP.tineW,
  perpTh: PERP.th, swayTineW: SWAY.tineW, swayThMin: SWAY.thMin, swayThMax: SWAY.thMax,
  swayThPerMm: SWAY.thPerMm, wallHalf: SWAY.wallHalf });

/** Volume of the supports built for a tilted block (no bed pad), at this nozzle. */
function volumeAt(nozzle) {
  const topo = tiltedBlockTopo(-20, 20, -15, 15, 0, 30, 45);
  const res = analyze(topo, 45, IDENTITY);
  const built = fins.buildFins(topo, res, IDENTITY,
    { mode: 'auto', bedPad: false, tines: true, tunables: { nozzle } });
  const t = built.triangles;
  assert(t.length > 0, `nothing built at nozzle ${nozzle}`);
  // Overlapping solids count twice -- fine for comparing one part at two nozzles.
  let v = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i], t[i + 1], t[i + 2]];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

Deno.test('nozzle: 0.4 is the tuned numbers, unchanged', () => {
  const before = knobs();
  applyNozzle(0.6);
  applyNozzle(0.4);
  assert(JSON.stringify(knobs()) === JSON.stringify(before), 'a round trip to 0.4 moved a width');
  assert(prop.PROP.th === 1.0 && prop.PROP.tip === 0.6 && prop.PROP.tineW === 0.5,
         'the 0.4 wall / tip / tine are no longer 1.0 / 0.6 / 0.5');
});

Deno.test('nozzle: a bigger nozzle widens everything, a smaller one only the one-line features', () => {
  const base = knobs();
  try {
    applyNozzle(0.6);
    for (const [k, v] of Object.entries(knobs())) {
      if (k === 'wallHalf') assert(v > base.wallHalf, 'braces keep no further off a wider wedge');
      else assertClose(v, base[k] * 1.5, 1e-9, `${k} at 0.6`);
    }
    applyNozzle(0.2);
    assertClose(prop.PROP.tineW, base.tineW / 2, 1e-9, 'tine at 0.2');
    assertClose(prop.PROP.tip, base.tip / 2, 1e-9, 'tip at 0.2');
    assertClose(SWAY.tineW, base.swayTineW / 2, 1e-9, 'brace tine at 0.2');
    // A free-standing wall gets no stiffer from a finer nozzle: never below 0.4's.
    for (const k of ['th', 'perpTh', 'swayThMin', 'swayThMax', 'swayThPerMm', 'wallHalf']) {
      assert(knobs()[k] === base[k], `${k} shrank at 0.2`);
    }
  } finally { applyNozzle(0.4); }
});

Deno.test('nozzle: junk leaves the widths alone', () => {
  const before = knobs();
  for (const v of [undefined, NaN, 0, -0.4, 5, '0.6']) applyNozzle(v);
  fins.applyTunables({});
  assert(JSON.stringify(knobs()) === JSON.stringify(before), 'junk nozzle moved a width');
});

Deno.test('nozzle: reaches the build through tunables', () => {
  try {
    const v4 = volumeAt(0.4), v8 = volumeAt(0.8), v2 = volumeAt(0.2);
    assert(v8 > v4 * 1.3, `0.8 nozzle built ${v8.toFixed(0)} mm3, not wider than 0.4's ${v4.toFixed(0)}`);
    assert(v2 <= v4, `0.2 nozzle built more (${v2.toFixed(0)}) than 0.4 (${v4.toFixed(0)})`);
  } finally { applyNozzle(0.4); }
});
