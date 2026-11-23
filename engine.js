/**
 * Ants: the rules, with no DOM. Everything is decided by the run's seed and the
 * player's moves, so a run can be replayed exactly (see `replay`).
 *
 * The floor is a grid of tiles. Ants come in through a crack along the top row
 * and walk to the crumbs along the bottom row, always by a shortest path. Each
 * turn the player draws one line of chalk on a tile (ants won't cross chalk),
 * then every ant takes a step. An ant with no way to the crumbs is trapped.
 * Trap every ant to clear the level; if one reaches the bottom row, the run ends.
 */

export const COLS = 9;
export const ROWS = 11;

export const EMPTY = 0;
export const BLOCK = 1; // furniture, already on the floor
export const CHALK = 2;

const DIRS = [
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 0],
];

/** mulberry32, the same generator the hub's SDK uses for run seeds. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  return next;
}

function mix(seed, level) {
  let h = (seed ^ Math.imul(level + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** How hard each level is. */
export function levelConfig(level) {
  const ants = Math.min(6, Math.ceil(level / 2));
  return {
    ants,
    // A new ant comes through the crack every `gap` turns.
    gap: Math.max(2, 5 - Math.floor(level / 3)),
    chalk: 6 + 4 * ants - Math.min(ants, Math.floor(level / 4)) + Math.max(0, 3 - level) * 2, // a little extra to learn on
    blocks: 8,
    // On every `hurryEvery`th turn the ants take two steps.
    hurryEvery: level >= 9 ? 3 : level >= 6 ? 4 : level >= 3 ? 6 : 0,
  };
}

const idx = (r, c) => r * COLS + c;

/** Shortest distance from every tile to the bottom row (Infinity where it can't get there). */
export function distances(cells) {
  const dist = new Array(ROWS * COLS).fill(Infinity);
  const queue = [];
  for (let c = 0; c < COLS; c++) {
    const i = idx(ROWS - 1, c);
    if (cells[i] === EMPTY) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const j = idx(nr, nc);
      if (cells[j] !== EMPTY || dist[j] !== Infinity) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

export function newLevel(seed, level) {
  const cfg = levelConfig(level);
  const random = rng(mix(seed, level));
  for (;;) {
    const cells = new Array(ROWS * COLS).fill(EMPTY);
    let placed = 0;
    while (placed < cfg.blocks) {
      const r = 2 + random.int(ROWS - 4); // keep the top two rows and the bottom row clear
      const c = random.int(COLS);
      if (cells[idx(r, c)] === EMPTY) {
        cells[idx(r, c)] = BLOCK;
        placed++;
      }
    }
    if (distances(cells)[idx(0, COLS >> 1)] === Infinity) continue;
    const s = {
      seed,
      level,
      cfg,
      cells,
      ants: [], // on the floor: { id, r, c, dir, trapped }
      waiting: cfg.ants, // still to come through the crack
      chalk: cfg.chalk,
      turn: 0,
      status: 'playing', // 'playing' | 'cleared' | 'lost'
      random,
    };
    spawn(s, distances(cells));
    return s;
  }
}

/** The turn the next ant comes in, or null when they're all in. */
export function nextArrival(s) {
  if (!s.waiting) return null;
  const n = s.cfg.ants - s.waiting;
  return n * s.cfg.gap;
}

/** Top-row tiles an ant could come in on and still reach the crumbs. */
function openCrack(s, dist) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    if (dist[idx(0, c)] !== Infinity && !s.ants.some((a) => a.r === 0 && a.c === c)) cols.push(c);
  }
  return cols;
}

function spawn(s, dist) {
  const arrivals = [];
  while (s.waiting && nextArrival(s) <= s.turn) {
    const cols = openCrack(s, dist);
    if (!cols.length) break; // the crack is sealed off
    const c = cols[s.random.int(cols.length)];
    const ant = { id: s.cfg.ants - s.waiting, r: 0, c, dir: 0, trapped: false };
    s.ants.push(ant);
    s.waiting--;
    arrivals.push(ant);
  }
  return arrivals;
}

export function canPlace(s, r, c) {
  if (s.status !== 'playing' || s.chalk <= 0) return false;
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (s.cells[idx(r, c)] !== EMPTY) return false;
  return !s.ants.some((a) => a.r === r && a.c === c);
}

/** Marks trapped ants. The level is cleared when every ant is trapped and so are any still to come. */
function check(s, dist) {
  for (const a of s.ants) a.trapped = dist[idx(a.r, a.c)] === Infinity;
  if (s.ants.some((a) => a.r === ROWS - 1)) s.status = 'lost';
  else if (s.ants.every((a) => a.trapped) && (!s.waiting || !openCrack(s, dist).length)) s.status = 'cleared';
}

/** Every ant takes one step. Returns the moves, for animation. */
function stepAnts(s, dist) {
  const moves = [];
  for (const a of s.ants) {
    const here = dist[idx(a.r, a.c)];
    const options = [];
    for (let d = 0; d < 4; d++) {
      const nr = a.r + DIRS[d][0];
      const nc = a.c + DIRS[d][1];
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const j = idx(nr, nc);
      if (s.cells[j] !== EMPTY) continue;
      // Free ants walk downhill; trapped ants wander their enclosure.
      if (here === Infinity || dist[j] === here - 1) options.push(d);
    }
    if (!options.length) continue;
    if (here === Infinity && s.random() < 0.4) continue; // trapped ants pause now and then
    const d = options[s.random.int(options.length)];
    const from = { r: a.r, c: a.c };
    a.r += DIRS[d][0];
    a.c += DIRS[d][1];
    a.dir = d;
    moves.push({ ant: a.id, from, to: { r: a.r, c: a.c }, dir: d });
  }
  return moves;
}

/**
 * The player's turn: chalk on (r, c), or wait (r = null).
 * Returns what happened, for animation: a list of phases, each
 * { moves: [...], arrivals: [...] }. Hurried turns have two phases.
 */
export function play(s, r, c) {
  if (s.status !== 'playing') throw new Error('The level is over');
  if (r !== null) {
    if (!canPlace(s, r, c)) throw new Error('You cannot draw chalk there');
    s.cells[idx(r, c)] = CHALK;
    s.chalk--;
  }
  s.turn++;
  const dist = distances(s.cells);
  check(s, dist);
  const phases = [];
  if (s.status !== 'playing') return phases;

  const steps = hurried(s) ? 2 : 1;
  for (let k = 0; k < steps && s.status === 'playing'; k++) {
    const moves = stepAnts(s, dist);
    check(s, dist);
    phases.push({ moves, arrivals: [] });
  }
  if (s.status === 'playing') {
    phases[phases.length - 1].arrivals = spawn(s, dist);
    check(s, dist);
  }
  return phases;
}

/** Whether this turn (s.turn, once played) is one where the ants take two steps. */
function hurried(s) {
  return !!s.cfg.hurryEvery && s.turn % s.cfg.hurryEvery === 0;
}

/** Whether the coming turn is a hurried one. */
export function hurriedNext(s) {
  return !!s.cfg.hurryEvery && (s.turn + 1) % s.cfg.hurryEvery === 0;
}

/** Points for clearing a level: 100 per ant trapped, 10 per chalk left over. */
export function levelPoints(s) {
  return s.status === 'cleared' ? 100 * s.cfg.ants + 10 * s.chalk : 0;
}

/**
 * Plays a whole run from its seed and moves (each [r, c], or null to wait).
 * Gives the score the run should have, e.g. for checking a reported score.
 */
export function replay(seed, moves) {
  let score = 0;
  let level = 1;
  let s = newLevel(seed, level);
  for (const m of moves) {
    if (s.status === 'lost') break;
    play(s, m ? m[0] : null, m ? m[1] : null);
    if (s.status === 'cleared') {
      score += levelPoints(s);
      s = newLevel(seed, ++level);
    }
  }
  return { score, level, status: s.status };
}
