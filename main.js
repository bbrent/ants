import { newLevel, play, canPlace, levelPoints, nextArrival, hurriedNext, ROWS, COLS, BLOCK, CHALK } from './engine.js';

const GAME_ID = 'ants';
const STEP_MS = 230;

const $ = (id) => document.getElementById(id);
const floor = $('floor');
const overlay = $('overlay');
const card = $('card');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Game hub ---------- */

const hubUrl = (() => {
  const q = new URLSearchParams(location.search).get('hub');
  const meta = document.querySelector('meta[name="hub-url"]')?.content ?? '/';
  return new URL(q || meta, location.href).href.replace(/\/+$/, '');
})();

let hub = null;
let me = null;

const hubReady = (async () => {
  try {
    const { Hub } = await import(`${hubUrl}/sdk/hub.js`);
    hub = new Hub(hubUrl, GAME_ID);
    me = await hub.me();
  } catch (e) {
    console.warn('Game hub not reachable; playing without scores', e);
    hub = null;
  }
  showWho();
})();

function showWho() {
  const who = $('who');
  if (!hub) who.textContent = 'Playing offline';
  else if (me) who.innerHTML = `Playing as <b>${esc(me.nickname)}</b>`;
  else who.innerHTML = `<a href="${esc(hub.loginUrl())}">Log in</a> to save scores`;
}

/* ---------- Ant drawing ---------- */

const ANT_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <g class="legs" stroke="#2a140c" stroke-width="1.6" stroke-linecap="round" fill="none">
    <path d="M17 17 L9 12 M17 20 L8 20 M17 23 L9 29"/>
    <path d="M23 17 L31 12 M23 20 L32 20 M23 23 L31 29"/>
  </g>
  <g class="feelers" stroke="#2a140c" stroke-width="1.3" stroke-linecap="round" fill="none">
    <path d="M18 9 Q15 4 12 4 M22 9 Q25 4 28 4"/>
  </g>
  <g fill="var(--ant)">
    <ellipse cx="20" cy="11" rx="4" ry="3.6"/>
    <ellipse cx="20" cy="19.5" rx="3" ry="4.2"/>
    <ellipse cx="20" cy="29.5" rx="5" ry="6.5"/>
  </g>
  <ellipse cx="18.4" cy="27" rx="1.4" ry="2.4" fill="#fff" opacity=".18"/>
</svg>`;

const ROT = [180, 270, 90, 0]; // engine directions: down, left, right, up

/* ---------- State ---------- */

let s = null; // the current level, from engine.js
let score = 0;
let busy = false;
let run = null; // the hub's run, when logged in
let antEls = new Map();
let tiles = [];

function buildFloor() {
  floor.innerHTML = '';
  tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = document.createElement('button');
      t.className = `tile${(r + c) % 2 ? ' b' : ''}${r === ROWS - 1 ? ' goal' : ''}`;
      t.dataset.r = r;
      t.dataset.c = c;
      t.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      floor.append(t);
      tiles.push(t);
    }
  }
}

function drawLevel() {
  for (const el of antEls.values()) el.remove();
  antEls = new Map();
  tiles.forEach((t, i) => {
    t.classList.toggle('block', s.cells[i] === BLOCK);
    t.classList.toggle('jar', s.cells[i] === BLOCK && (i * 7 + s.level) % 4 === 0);
    t.classList.toggle('chalk', s.cells[i] === CHALK);
  });
  for (const a of s.ants) addAnt(a);
  updateHud();
}

function addAnt(a) {
  const el = document.createElement('div');
  el.className = 'ant arrive';
  el.innerHTML = ANT_SVG;
  place(el, a.r, a.c, a.dir);
  floor.append(el);
  antEls.set(a.id, el);
}

function place(el, r, c, dir) {
  el.style.setProperty('--r', r);
  el.style.setProperty('--c', c);
  el.querySelector('svg').style.setProperty('--rot', `${ROT[dir]}deg`);
}

function updateHud() {
  $('level').textContent = s.level;
  $('score').textContent = score;
  $('chalk').textContent = s.chalk;
  document.querySelector('.stat.chalk').classList.toggle('low', s.chalk <= 3);
  for (const a of s.ants) antEls.get(a.id)?.classList.toggle('trapped', a.trapped);

  const notice = $('notice');
  let text = '';
  let warn = false;
  if (s.status === 'playing') {
    const loose = s.ants.filter((a) => !a.trapped).length;
    const next = nextArrival(s);
    const parts = [];
    if (loose) parts.push(`${loose} ant${loose > 1 ? 's' : ''} loose`);
    if (next !== null) {
      const in_ = next - s.turn;
      parts.push(in_ <= 1 ? 'another ant next turn' : `next ant in ${in_} turns`);
    }
    if (hurriedNext(s)) {
      parts.unshift('Ants hurry next turn!');
      warn = true;
    }
    if (!s.chalk) {
      parts.unshift('Out of chalk');
      warn = true;
    }
    text = parts.join(' · ');
  }
  notice.textContent = text || ' ';
  notice.classList.toggle('warn', warn);
  floor.classList.toggle('live', !busy && s.status === 'playing');
  $('wait').disabled = busy || s.status !== 'playing';
}

/* ---------- Turns ---------- */

async function turn(r, c) {
  if (busy || !s || s.status !== 'playing') return;
  if (r !== null && !canPlace(s, r, c)) return;
  busy = true;
  run?.moves.push(r === null ? null : [r, c]);
  const phases = play(s, r, c);
  if (r !== null) {
    const t = tiles[r * COLS + c];
    t.style.setProperty('--angle', `${20 + ((r * 31 + c * 17) % 50)}deg`);
    t.classList.add('chalk');
  }
  updateHud();

  for (const phase of phases) {
    for (const m of phase.moves) place(antEls.get(m.ant), m.to.r, m.to.c, m.dir);
    for (const a of phase.arrivals) addAnt(a);
    if (phase.moves.length || phase.arrivals.length) await sleep(STEP_MS);
  }
  busy = false;
  updateHud();

  if (s.status === 'cleared') await cleared();
  else if (s.status === 'lost') await lost();
  else if (!s.chalk) {
    // Nothing left to draw: let the ants walk on their own.
    await sleep(120);
    turn(null, null);
  }
}

async function cleared() {
  busy = true;
  const pts = levelPoints(s);
  score += pts;
  updateHud();
  toast(`Level ${s.level} cleared! +${pts}`, `${s.cfg.ants} ant${s.cfg.ants > 1 ? 's' : ''} trapped · ${s.chalk} chalk left`);
  await sleep(1500);
  s = newLevel(seed, s.level + 1);
  busy = false;
  drawLevel();
}

async function lost() {
  busy = true;
  const winner = s.ants.find((a) => a.r === ROWS - 1);
  if (winner) antEls.get(winner.id)?.classList.add('won');
  updateHud();
  await sleep(1100);
  await gameOver();
}

function toast(text, small) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1400);
}

floor.addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (t) turn(Number(t.dataset.r), Number(t.dataset.c));
});
$('wait').addEventListener('click', () => turn(null, null));

/* ---------- Runs and cards ---------- */

let seed = 0;

async function start() {
  overlay.hidden = true;
  score = 0;
  run = null;
  await hubReady;
  if (hub && me) {
    try {
      run = { ...(await hub.startRun()), moves: [] };
    } catch (e) {
      console.warn('Could not start a run', e);
      toast('Scores are off for this game', e.message);
    }
  }
  seed = run ? run.seed : (Math.random() * 2 ** 32) >>> 0;
  s = newLevel(seed, 1);
  busy = false;
  drawLevel();
}

async function gameOver() {
  let result = null;
  let error = null;
  if (run) {
    try {
      result = await hub.finishRun(run, score);
    } catch (e) {
      error = e.message;
    }
  }
  let board = null;
  if (hub) board = await hub.leaderboard(undefined, 10).catch(() => null);

  const reached = s.level;
  let saved = '';
  if (result?.recorded && result.best !== null) {
    saved = `<p>Your best: <b>${result.best}</b>${result.rank ? ` · #${result.rank} overall` : ''}</p>`;
  } else if (result && !result.recorded) {
    saved = `<p class="small">This score wasn't added to the leaderboard.</p>`;
  } else if (error) {
    saved = `<p class="small">Couldn't save the score: ${esc(error)}</p>`;
  } else if (hub && !me) {
    saved = `<p class="small"><a href="${esc(hub.loginUrl())}">Log in</a> to save your scores.</p>`;
  }

  card.innerHTML = `
    <h2>An ant got the crumbs!</h2>
    <p class="small">You reached level ${reached}</p>
    <div class="big">${score}</div>
    ${saved}
    ${leaderboardHtml(board)}
    <button class="primary" id="again">Play again</button>`;
  overlay.hidden = false;
  $('again').addEventListener('click', start);
  $('again').focus();
  busy = false;
}

function leaderboardHtml(board) {
  if (!board?.rows?.length) return '';
  const rows = board.rows
    .map((r) => `<tr class="${me && r.name === me.nickname ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.score}</td></tr>`)
    .join('');
  return `<table class="board"><caption class="small">${esc(board.board.label)}</caption>${rows}</table>`;
}

async function intro() {
  card.innerHTML = `
    <h2>Ants</h2>
    <p>Ants are coming through the crack in the wall, heading for the crumbs on the far side of the kitchen.</p>
    <ul class="how">
      <li>Tap a tile to draw a line of chalk. Ants won't cross it.</li>
      <li>After each line, every ant takes a step along the shortest way to the crumbs.</li>
      <li>Box every ant in to clear the level. Leftover chalk is worth points.</li>
      <li>More ants come in every few turns, and later on they hurry.</li>
    </ul>
    <button class="primary" id="play">Play</button>
    <p class="small" id="intro-who"></p>`;
  overlay.hidden = false;
  $('play').addEventListener('click', start);
  await hubReady;
  const w = $('intro-who');
  if (!w) return;
  if (!hub) w.textContent = "The game hub isn't reachable, so scores won't be saved.";
  else if (me) w.innerHTML = `Playing as <b>${esc(me.nickname)}</b>`;
  else w.innerHTML = `<a href="${esc(hub.loginUrl())}">Log in</a> to save your scores, or just play.`;
}

buildFloor();
s = newLevel(1, 1);
drawLevel();
busy = true;
updateHud();
intro();
