import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLevel, play, canPlace, distances, levelPoints, replay, nextArrival, ROWS, COLS, EMPTY, CHALK } from '../engine.js';

const idx = (r, c) => r * COLS + c;

test('levels come from the seed', () => {
  const a = newLevel(42, 3);
  const b = newLevel(42, 3);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.ants, b.ants);
  assert.notDeepEqual(newLevel(43, 3).cells, a.cells);
});

test('every new level has a way through and one ant at the crack', () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = newLevel(seed, 1 + (seed % 12));
    assert.equal(s.ants.length, 1);
    assert.equal(s.ants[0].r, 0);
    assert.notEqual(distances(s.cells)[idx(0, s.ants[0].c)], Infinity);
  }
});

test('free ants take a shortest path down', () => {
  const s = newLevel(7, 1);
  const a = s.ants[0];
  const before = distances(s.cells)[idx(a.r, a.c)];
  play(s, null, null);
  assert.equal(distances(s.cells)[idx(a.r, a.c)], before - 1);
});

test('chalk only goes on empty tiles without ants, and runs out', () => {
  const s = newLevel(1, 1);
  const a = s.ants[0];
  assert.equal(canPlace(s, a.r, a.c), false);
  assert.equal(canPlace(s, -1, 0), false);
  s.chalk = 0;
  assert.equal(canPlace(s, ROWS - 1, 0), false);
  assert.throws(() => play(s, ROWS - 1, 0));
});

test('boxing the ant in clears the level and scores it', () => {
  const s = newLevel(5, 1);
  s.cells.fill(EMPTY);
  Object.assign(s.ants[0], { r: 0, c: 4 });
  s.cells[idx(0, 3)] = CHALK;
  s.cells[idx(0, 5)] = CHALK;
  assert.equal(s.status, 'playing');
  play(s, 1, 4);
  assert.equal(s.status, 'cleared');
  assert.equal(s.ants[0].trapped, true);
  assert.equal(levelPoints(s), 100 + 10 * (s.cfg.chalk - 1));
});

test('an ant that reaches the bottom row ends the run', () => {
  const s = newLevel(9, 1);
  while (s.status === 'playing') play(s, null, null);
  assert.equal(s.status, 'lost');
  assert.equal(levelPoints(s), 0);
  assert.ok(s.ants.some((a) => a.r === ROWS - 1));
});

test('more ants come through the crack on later levels', () => {
  const s = newLevel(3, 6);
  assert.ok(s.cfg.ants > 1);
  const when = nextArrival(s);
  // Seal the floor far below so nobody gets through while we wait.
  for (let c = 0; c < COLS; c++) s.cells[idx(ROWS - 2, c)] = CHALK;
  for (let t = 0; t < when && s.status === 'playing'; t++) play(s, null, null);
  assert.ok(s.ants.length >= 2 || s.status === 'cleared');
});

test('replay gives the same score as playing', () => {
  const seed = 1234;
  const moves = [];
  let s = newLevel(seed, 1);
  let score = 0;
  // A simple scripted player: chalk the tile right under each loose ant.
  for (let turn = 0; turn < 400 && s.status !== 'lost'; turn++) {
    const a = s.ants.find((x) => !x.trapped);
    let m = null;
    if (a) {
      for (const [r, c] of [[a.r + 1, a.c], [a.r, a.c - 1], [a.r, a.c + 1]]) {
        if (canPlace(s, r, c)) {
          m = [r, c];
          break;
        }
      }
    }
    moves.push(m);
    play(s, m ? m[0] : null, m ? m[1] : null);
    if (s.status === 'cleared') {
      score += levelPoints(s);
      s = newLevel(seed, s.level + 1);
    }
  }
  assert.deepEqual(replay(seed, moves), { score, level: s.level, status: s.status });
});
