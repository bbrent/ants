// Balance check: a greedy bot plays many seeds. Usage: node tools/sim.js [runs]
import { newLevel, play, canPlace, distances, levelPoints, ROWS, COLS, CHALK } from '../engine.js';

const idx = (r, c) => r * COLS + c;

// Pick the tile that most lengthens the ants' paths (trapping counts big),
// looking only at tiles near an ant.
function choose(s) {
  let best = null;
  let bestV = -Infinity;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!canPlace(s, r, c)) continue;
      if (!s.ants.some((a) => !a.trapped && Math.abs(a.r - r) + Math.abs(a.c - c) <= 4)) continue;
      const cells = s.cells.slice();
      cells[idx(r, c)] = CHALK;
      const d = distances(cells);
      let v = 0;
      for (const a of s.ants) {
        const x = d[idx(a.r, a.c)];
        v += x === Infinity ? 1000 : x * 10 - 0;
      }
      v -= Math.abs(r - s.ants[0].r) * 0.1;
      if (v > bestV) {
        bestV = v;
        best = [r, c];
      }
    }
  }
  return best; // null (wait) when no ant is loose
}

const runs = Number(process.argv[2] ?? 300);
const reached = {};
let total = 0;
for (let k = 0; k < runs; k++) {
  const seed = (k * 2654435761) >>> 0;
  let level = 1;
  let score = 0;
  for (; level <= 30; level++) {
    const s = newLevel(seed, level);
    while (s.status === 'playing') {
      const m = s.chalk > 0 ? choose(s) : null;
      if (m && !canPlace(s, m[0], m[1])) throw new Error('bad move');
      play(s, m ? m[0] : null, m ? m[1] : null);
    }
    if (s.status === 'lost') break;
    score += levelPoints(s);
  }
  reached[level] = (reached[level] ?? 0) + 1;
  total += score;
}
console.log('lost on level -> runs', reached, 'avg score', Math.round(total / runs));
