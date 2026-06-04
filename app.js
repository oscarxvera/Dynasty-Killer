// ── State ──
let opponent = null;
let roster = {};        // { PG: player, SG: player, ... }
let currentRound = 0;
let currentChoices = [];
let pendingPlayer = null;
let spent = 0;          // salary spent so far
let spinUsed = false;       // used the one re-spin this round
let eraChangeUsed = false;  // used the one era change this round
let lastEraKey = null;      // last team+era spun (avoid back-to-back repeats)
let gauntlet = null;        // Real GM ladder: { order: [#5..#1], stage: 0 }

function rankOf(team) {
  const ranked = [...LEGENDARY_TEAMS].sort((a, b) => b.rating - a.rating);
  return ranked.findIndex(t => t.abbr === team.abbr) + 1;
}
function startGauntlet() {
  const ranked = [...LEGENDARY_TEAMS].sort((a, b) => b.rating - a.rating);
  const top5 = ranked.slice(0, 5);            // #1..#5
  gauntlet = { order: [top5[4], top5[3], top5[2], top5[1], top5[0]], stage: 0 }; // climb #5 → #1
  opponent = gauntlet.order[0];
  lastOppAbbr = opponent.abbr;
  showReveal();
}
function advanceGauntlet() {
  opponent = gauntlet.order[gauntlet.stage];
  roster = {}; currentRound = 0; spent = 0;
  showReveal();
}
// POSITIONS is defined in data.js
const POS_NAMES = { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };

// ── Difficulty tiers ──
const DIFFICULTY = {
  classic: { label: "Classic", budget: 150, oppMult: 1.05, tier: "any",
             desc: "Roll any of the 25 dynasties · $150M cap · one-off game." },
  realgm:  { label: "Real GM", budget: 155, oppMult: 1.02, tier: "high",
             desc: "GAUNTLET: beat the top 5 dynasties #5→#1. Win all 5 to be crowned." },
};
let difficulty = "classic";

// Flat cap per mode. (Difficulty now comes from the opponent's real strength —
// ratings reflect actual sim power — so the cap no longer needs to scale by rank.)
function currentCap() {
  return cfg().budget;
}

// ── Helpers ──
const $ = (id) => document.getElementById(id);
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const pickedPlayers = () => Object.values(roster);
const openPositions = () => POSITIONS.filter(p => !roster[p]);
const cfg = () => DIFFICULTY[difficulty];
// Older eras had inflated counting stats (faster pace, weaker league), so their
// players cost more to stop you stacking cheap pre-merger legends.
const ERA_COST_MULT = { '1950s': 1.30, '1960s': 1.28, '1970s': 1.15 };
// player salary cost from production, adjusted for era
const playerCost = (p) =>
  Math.round((p.ppg + 0.8 * p.rpg + 1.0 * p.apg + 2 * p.spg + 2 * p.bpg) * (ERA_COST_MULT[p.era] || 1));
// single "game score" index from a stat line
const teamScore = (s, mult = 1) =>
  Math.round((s.ppg + 0.3 * s.rpg + 0.5 * s.apg + 1.2 * s.spg + 1.2 * s.bpg) * mult);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── How To Play ──
$('howToPlayBtn').addEventListener('click', () => $('howToPlayModal').classList.remove('hidden'));
$('modalCloseBtn').addEventListener('click', () => $('howToPlayModal').classList.add('hidden'));
$('modalGotItBtn').addEventListener('click', () => $('howToPlayModal').classList.add('hidden'));

// Auto-show How to Play on a visitor's first ever visit
if (!localStorage.getItem('dk_seen_howto')) {
  $('howToPlayModal').classList.remove('hidden');
  localStorage.setItem('dk_seen_howto', '1');
}

// ════════════════════════════════════════
// SCREEN 1: ROLL OPPONENT
// ════════════════════════════════════════
let isRolling = false;
// The spin card is the single roll control (click on desktop, tap on mobile).
$('spinCard').addEventListener('click', rollOpponent);

// Difficulty selector
$('diffDesc').textContent = cfg().desc;
document.querySelectorAll('.diff-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    difficulty = chip.dataset.diff;
    document.querySelectorAll('.diff-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    $('diffDesc').textContent = cfg().desc;
  });
});

// pick an opponent weighted by the chosen difficulty tier
let lastOppAbbr = null;   // last dynasty rolled (avoid back-to-back repeats)
function pickOpponent(isFinal) {
  const t = cfg().tier;
  let pool = LEGENDARY_TEAMS;
  if (t === "low") pool = LEGENDARY_TEAMS.filter(x => x.rating <= 95);
  else if (t === "high") pool = LEGENDARY_TEAMS.filter(x => x.rating >= 96);
  if (!pool.length) pool = LEGENDARY_TEAMS;
  // never land on the same dynasty twice in a row
  if (isFinal && lastOppAbbr && pool.length > 1) {
    const filtered = pool.filter(x => x.abbr !== lastOppAbbr);
    if (filtered.length) pool = filtered;
  }
  return rand(pool);
}

function rollOpponent() {
  if (isRolling) return;
  if (difficulty === 'realgm') { gauntlet = null; startGauntlet(); return; }
  isRolling = true;

  const card = $('spinCard');
  const inner = $('spinCardInner');
  card.classList.add('spinning');

  let ticks = 0;
  const total = 11 + Math.floor(Math.random() * 6);

  const interval = setInterval(() => {
    const t = pickOpponent();
    inner.innerHTML = teamSpinHTML('🏆', t.abbr, t.record);
    ticks++;
    if (ticks >= total) {
      clearInterval(interval);
      opponent = pickOpponent(true);
      lastOppAbbr = opponent.abbr;
      inner.innerHTML = teamSpinHTML('🏆', opponent.abbr, opponent.record);
      card.classList.remove('spinning');
      setTimeout(() => { showReveal(); isRolling = false; }, 550);
    }
  }, 75);
}

function teamSpinHTML(icon, name, sub) {
  return `<div class="spin-team-info">
    <span class="spin-icon">${icon}</span>
    <span class="spin-team-name">${name}</span>
    <span class="spin-team-era">${sub}</span>
  </div>`;
}

// ════════════════════════════════════════
// SCREEN 2: REVEAL
// ════════════════════════════════════════
function showReveal() {
  $('revealTeamName').textContent = opponent.name;
  const rank = rankOf(opponent);
  $('revealRecord').textContent = `${opponent.record}  ·  #${rank} all-time`;
  $('revealEyebrow').textContent = gauntlet
    ? `👑 REAL GM · STAGE ${gauntlet.stage + 1} / 5`
    : '⚔️ Your Opponent';
  $('revealDesc').textContent = opponent.description;

  const stats = [
    ['PPG', opponent.ppg], ['RPG', opponent.rpg], ['APG', opponent.apg],
    ['SPG', opponent.spg ?? 0], ['BPG', opponent.bpg ?? 0],
  ];
  $('revealStats').innerHTML = stats.map(([lbl, val]) =>
    `<div class="stat-item"><span class="stat-val">${val}</span><span class="stat-lbl">${lbl}</span></div>`
  ).join('');

  showScreen('revealScreen');
}

$('startDraftBtn').addEventListener('click', () => {
  roster = {};
  currentRound = 0;
  spent = 0;
  spinUsed = false;       // one Team respin per dynasty (whole draft)
  eraChangeUsed = false;  // one Era change per dynasty (whole draft)
  startDraftRound();
  showScreen('draftScreen');
});

// ════════════════════════════════════════
// SCREEN 3: DRAFT
// ════════════════════════════════════════
function startDraftRound() {
  // Opponent bar
  $('opponentBar').innerHTML =
    `<span class="opp-label">Beat</span>
     <span class="opp-name">${opponent.name}</span>
     <span class="opp-rec">${opponent.record}</span>`;

  $('roundNum').textContent = `Round ${currentRound + 1} / 5`;
  // NOTE: spinUsed / eraChangeUsed are NOT reset here — they're one-per-dynasty,
  // reset only when a new draft starts (Start Drafting), not each round.

  renderBudgetBar();
  renderRosterTrack();

  // reset spin section
  $('playerChoices').classList.add('hidden');
  $('playerChoices').innerHTML = '';
  $('draftReroll').innerHTML = '';   // chips only show once a roster is on screen
  $('spinSection').style.display = 'flex';
  $('draftSpinInner').innerHTML =
    `<span class="spin-icon">🔄</span><span class="spin-label">Spin for a team &amp; era</span>`;
}

function renderBudgetBar() {
  const cap = currentCap();
  const remaining = cap - spent;
  const pct = Math.min(100, (spent / cap) * 100);
  $('budgetBar').innerHTML =
    `<span class="bb-label">Cap</span>
     <div class="bb-track"><div class="bb-fill ${spent > cap ? 'over' : ''}" style="width:${pct}%"></div></div>
     <span class="bb-num">$${remaining}M left</span>`;
}

function renderRosterTrack() {
  $('rosterTrack').innerHTML = POSITIONS.map(pos => {
    const p = roster[pos];
    const cls = p ? 'track-slot filled' : 'track-slot';
    return `<div class="${cls}">
      <span class="tslot-pos">${pos}</span>
      <span class="tslot-name">${p ? shortName(p.name) : '—'}</span>
    </div>`;
  }).join('');
}

function shortName(name) {
  const parts = name.split(' ');
  if (parts.length === 1) return name;
  return parts[0][0] + '. ' + parts.slice(1).join(' ');
}

// ── Spin for team/era → 8 players ──
let draftSpinning = false;
$('draftSpinCard').addEventListener('click', spinDraft);

function spinDraft() {
  if (draftSpinning) return;
  draftSpinning = true;

  const card = $('draftSpinCard');
  const inner = $('draftSpinInner');
  card.classList.add('spinning');

  let ticks = 0;
  const total = 9 + Math.floor(Math.random() * 6);

  const interval = setInterval(() => {
    const t = rand(ERA_TEAMS);
    inner.innerHTML = teamSpinHTML('🏀', t.team, t.era);
    ticks++;
    if (ticks >= total) {
      clearInterval(interval);
      // avoid landing on the same team+era as the previous spin
      let landPool = ERA_TEAMS;
      if (lastEraKey) { const f = ERA_TEAMS.filter(e => e.key !== lastEraKey); if (f.length) landPool = f; }
      const landed = rand(landPool);
      lastEraKey = landed.key;
      inner.innerHTML = teamSpinHTML('🏀', landed.team, landed.era);
      card.classList.remove('spinning');
      setTimeout(() => { showPlayerChoices(landed); draftSpinning = false; }, 350);
    }
  }, 75);
}

const POOL_START = 20;   // players shown before extending
const POOL_STEP = 10;    // how many more each "Extend pool"
let poolFull = [];       // full available list for the spun team-era
let poolShown = 0;       // how many currently rendered
let poolEra = null;

function showPlayerChoices(eraTeam) {
  const alreadyNames = pickedPlayers().map(p => p.name);
  poolEra = eraTeam;
  poolFull = (ROSTERS[eraTeam.key] || [])
    .filter(p => !alreadyNames.includes(p.name))
    .sort((a, b) => (b.ppg + b.rpg + b.apg) - (a.ppg + a.rpg + a.apg))
    .map(p => ({ ...p, team: eraTeam.team, era: eraTeam.era }));
  poolShown = Math.min(POOL_START, poolFull.length);
  renderPool();
}

function respin() {
  $('playerChoices').classList.add('hidden');
  $('draftReroll').innerHTML = '';
  $('spinSection').style.display = 'flex';
  $('draftSpinInner').innerHTML =
    `<span class="spin-icon">🔄</span><span class="spin-label">Spin for a team &amp; decade</span>`;
}

function renderPool() {
  const choicesEl = $('playerChoices');

  if (poolFull.length === 0) {
    choicesEl.innerHTML = `
      <div class="pick-header">
        <div class="pick-team">${poolEra.team}</div>
        <div class="pick-sub">${poolEra.era}</div>
      </div>
      <p class="empty-note">You've already drafted everyone available from this roster. Spin again!</p>
      <button class="btn-respin" id="respinBtn">🎲 Spin again</button>`;
    choicesEl.classList.remove('hidden');
    $('spinSection').style.display = 'none';
    $('respinBtn').addEventListener('click', respin);
    return;
  }

  const remaining = currentCap() - spent;
  const open = openPositions();
  currentChoices = poolFull.slice(0, poolShown);
  const moreLeft = poolFull.length - poolShown;
  const otherEras = ERA_TEAMS.filter(e => e.team === poolEra.team && e.era !== poolEra.era);

  // usable = affordable AND fills an open position, among shown players
  const canUse = (p) => playerCost(p) <= remaining &&
    (p.positions && p.positions.length ? p.positions : [p.pos]).some(pos => open.includes(pos));
  const usable = currentChoices.some(canUse);
  // is there a cheaper affordable+fitting player deeper in the pool?
  const helpDeeper = moreLeft > 0 && poolFull.slice(poolShown).some(canUse);

  // cheapest real player anywhere on this roster that fills an open spot (min-deal fallback)
  const fitsOpen = (p) => (p.positions && p.positions.length ? p.positions : [p.pos]).some(pos => open.includes(pos));
  let minDeal = null;
  poolFull.forEach(p => { if (fitsOpen(p)) { const c = playerCost(p); if (!minDeal || c < minDeal.cost) minDeal = { player: p, cost: c }; } });
  // offer a minimum-contract signing only when you genuinely can't afford anyone for an open slot
  const needMinDeal = !usable && !helpDeeper && minDeal && minDeal.cost > remaining;

  let note = '';
  if (!usable) {
    note = helpDeeper
      ? `<p class="empty-note">Nothing here fits your $${remaining}M and an open spot — extend the pool for cheaper players.</p>`
      : needMinDeal
        ? `<p class="empty-note">You're short on cap — sign a player to a minimum deal, or spin a new team.</p>`
        : `<p class="empty-note">No affordable fit on this roster — spin a new team.</p>`;
  }

  choicesEl.innerHTML = `
    <div class="pick-header">
      <div class="pick-team">${poolEra.team}</div>
      <div class="pick-sub">${poolEra.era} · showing ${poolShown}/${poolFull.length} · $${remaining}M left</div>
    </div>
    ${note}
    <div class="choices-scroll">
      <div class="choices-grid">
        ${currentChoices.map((p, i) => playerCardHTML(p, i, remaining)).join('')}
      </div>
    </div>
    <div class="pool-controls">
      ${needMinDeal ? `<button class="btn-respin pulse" id="minDealBtn">✍️ Sign ${shortName(minDeal.player.name)} — min deal ($${remaining}M)</button>` : ''}
      ${moreLeft > 0 ? `<button class="btn-respin ${(!usable && helpDeeper) ? 'pulse' : ''}" id="extendBtn">➕ Extend pool (+${Math.min(POOL_STEP, moreLeft)})</button>` : ''}
    </div>`;
  choicesEl.classList.remove('hidden');
  $('spinSection').style.display = 'none';

  // compact one-time reroll chips at the top of the draft screen
  $('draftReroll').innerHTML =
    `${!spinUsed ? `<button class="reroll-chip team" id="respinBtn">🔄 Team</button>` : ''}
     ${(!eraChangeUsed && otherEras.length) ? `<button class="reroll-chip era" id="eraBtn">🔁 Era</button>` : ''}`;

  choicesEl.querySelectorAll('.player-card').forEach((card, i) => {
    if (card.classList.contains('unaffordable')) return;
    card.addEventListener('click', () => openPositionPicker(currentChoices[i]));
  });
  if ($('extendBtn')) $('extendBtn').addEventListener('click', () => {
    poolShown = Math.min(poolShown + POOL_STEP, poolFull.length);
    renderPool();
  });
  if ($('respinBtn')) $('respinBtn').addEventListener('click', () => {
    spinUsed = true;
    // change the TEAM only — keep the same decade/era
    const sameEra = ERA_TEAMS.filter(e => e.era === poolEra.era && e.team !== poolEra.team);
    if (sameEra.length) showPlayerChoices(rand(sameEra));
    else respin();
  });
  if ($('eraBtn')) $('eraBtn').addEventListener('click', () => {
    eraChangeUsed = true;
    // change the ERA only — keep the same team (otherEras = same team, different era)
    showPlayerChoices(rand(otherEras));
  });
  if ($('minDealBtn')) $('minDealBtn').addEventListener('click', () => signMinDeal(minDeal.player));
}

// Last-resort: sign a real player to a minimum contract = whatever cap you have left.
function signMinDeal(player) {
  const open = openPositions();
  const elig = (player.positions && player.positions.length ? player.positions : [player.pos]).filter(p => open.includes(p));
  const pos = elig[0];
  if (!pos) return;
  roster[pos] = player;
  spent += Math.min(playerCost(player), currentCap() - spent); // never exceed the cap
  $('restartBtn').classList.remove('hidden');
  currentRound++;
  if (openPositions().length === 0 || currentRound >= 5) setTimeout(showResult, 350);
  else startDraftRound();
}

function playerCardHTML(p, i, remaining) {
  const cost = playerCost(p);
  const broke = cost > remaining;
  return `<div class="player-card anim-in ${broke ? 'unaffordable' : ''}" style="animation-delay:${Math.min(i, 8) * 0.04}s">
    <div class="pc-top">
      <span class="pc-name">${p.name}</span>
      <span class="pc-pos">${(p.positions && p.positions.length ? p.positions : [p.pos]).join('/')}</span>
    </div>
    <div class="pc-meta">${p.team} · ${p.era} · <span class="pc-cost">$${cost}M</span></div>
    <div class="pc-stats">
      <div class="pc-stat"><b>${p.ppg}</b><span>PPG</span></div>
      <div class="pc-stat"><b>${p.rpg}</b><span>RPG</span></div>
      <div class="pc-stat"><b>${p.apg}</b><span>APG</span></div>
      <div class="pc-stat"><b>${p.spg ?? 0}</b><span>SPG</span></div>
      <div class="pc-stat"><b>${p.bpg ?? 0}</b><span>BPG</span></div>
    </div>
  </div>`;
}

// ── Position Picker ──
function openPositionPicker(player) {
  pendingPlayer = player;
  $('pickerPlayerName').textContent = player.name;
  $('pickerPlayerMeta').textContent = `${player.team} · Natural ${player.pos}`;

  const open = openPositions();
  // Positions the player actually logged 40+ games at this decade
  const eligible = player.positions && player.positions.length ? player.positions : [player.pos];
  $('pickerPlayerMeta').textContent =
    `${player.team} · Plays: ${eligible.join(' / ')}`;

  $('posPickerOptions').innerHTML = POSITIONS.map(pos => {
    const canPlay = eligible.includes(pos);
    const isOpen = open.includes(pos);
    const allowed = canPlay && isOpen;
    const isRec = pos === player.pos && allowed;
    let cls = 'pos-opt';
    if (!allowed) cls += ' pos-opt-full';
    if (isRec) cls += ' recommended';
    let tag = '';
    if (!canPlay) tag = `<span class="pos-opt-tag" style="color:var(--text-dim)">CAN'T PLAY</span>`;
    else if (!isOpen) tag = `<span class="pos-opt-tag" style="color:var(--text-dim)">FILLED</span>`;
    else if (isRec) tag = `<span class="pos-opt-tag">★ NATURAL FIT</span>`;
    return `<div class="${cls}" data-pos="${pos}">
      <span class="pos-opt-name">${pos} <span style="color:var(--text-muted);font-weight:600;font-size:0.78rem">${POS_NAMES[pos]}</span></span>
      ${tag}
    </div>`;
  }).join('');

  $('posPickerOptions').querySelectorAll('.pos-opt:not(.pos-opt-full)').forEach(opt => {
    opt.addEventListener('click', () => assignPlayer(opt.dataset.pos));
  });

  $('posPickerModal').classList.remove('hidden');
}

$('posPickerClose').addEventListener('click', () => $('posPickerModal').classList.add('hidden'));

function assignPlayer(pos) {
  roster[pos] = pendingPlayer;
  spent += playerCost(pendingPlayer);
  pendingPlayer = null;
  $('posPickerModal').classList.add('hidden');
  $('restartBtn').classList.remove('hidden'); // drafted at least one player
  currentRound++;

  if (openPositions().length === 0 || currentRound >= 5) {
    setTimeout(showResult, 350);
  } else {
    startDraftRound();
  }
}

// ════════════════════════════════════════
// SCREEN 4: RESULT
// ════════════════════════════════════════
const surname = (n) => n.split(' ').slice(-1)[0];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Possession-based game engine ──
function simulateGame(home, away, awayMult, homeMult) {
  homeMult = homeMult || 1;
  const QTRS = 4, POSS_PER_Q = 25;          // 100 possessions/team
  const THREE_RATE = 0.34, MADE_VAL = 2 * (1 - THREE_RATE) + 3 * THREE_RATE;
  const sumS = (t, s) => t.reduce((a, p) => a + (p[s] || 0), 0);
  const combo = (t) => ({ ppg: sumS(t,'ppg'), rpg: sumS(t,'rpg'), apg: sumS(t,'apg'), spg: sumS(t,'spg'), bpg: sumS(t,'bpg') });

  const hOP = teamScore(combo(home), homeMult);   // your team scaled by chemistry
  const aOP = teamScore(combo(away), awayMult);   // dynasty scaled by difficulty edge
  const hPPP = hOP / (QTRS * POSS_PER_Q);
  const aPPP = aOP / (QTRS * POSS_PER_Q);

  // usage weights from scoring share
  const weights = (t) => { const tot = sumS(t,'ppg') || 1; return t.map(p => p.ppg / tot); };
  const hW = weights(home), aW = weights(away);
  // defensive stop rate forced by the OTHER team
  const def = (t) => Math.min(0.17, (sumS(t,'spg') + sumS(t,'bpg')) / 130);
  const hDef = def(home), aDef = def(away);

  const pickIdx = (w) => { let r = Math.random(), a = 0; for (let i = 0; i < w.length; i++) { a += w[i]; if (r <= a) return i; } return w.length - 1; };

  function possession(off, w, ppp, oppDef, oppTeam) {
    const p = off[pickIdx(w)];
    const nm = surname(p.name);
    if (Math.random() < oppDef) {                      // forced stop
      const r = Math.random();
      if (r < 0.4) { const d = surname(pick(oppTeam).name); return { pts: 0, kind: 'steal', text: `${d} steals it from ${nm}` }; }
      if (r < 0.7) { const d = surname(pick(oppTeam).name); return { pts: 0, kind: 'block', text: `${d} blocks ${nm}` }; }
      return { pts: 0, kind: 'to', text: `${nm} turns it over` };
    }
    const scoreProb = Math.min(0.95, (ppp / MADE_VAL) / (1 - oppDef));
    if (Math.random() < scoreProb) {
      const three = Math.random() < THREE_RATE;
      return { pts: three ? 3 : 2, kind: three ? 'score3' : 'score2', text: `${nm} ${three ? 'drains a three' : pick(['scores', 'lays it in', 'hits a jumper', 'gets the bucket', 'finishes inside'])}` };
    }
    return { pts: 0, kind: 'miss', text: `${nm} ${pick(['misses', 'is off the mark', 'rims it out'])}` };
  }

  // running box-score totals
  const hStats = { pts: 0, fgm: 0, tpm: 0, stl: 0, blk: 0, to: 0 };
  const aStats = { pts: 0, fgm: 0, tpm: 0, stl: 0, blk: 0, to: 0 };
  function tally(stats, oppStats, r) {
    stats.pts += r.pts;
    if (r.kind === 'score2') stats.fgm++;
    else if (r.kind === 'score3') { stats.fgm++; stats.tpm++; }
    else if (r.kind === 'to') stats.to++;
    else if (r.kind === 'steal') { stats.to++; oppStats.stl++; }
    else if (r.kind === 'block') oppStats.blk++;
  }

  const frames = [];
  let you = 0, them = 0;
  const qScores = [];
  for (let q = 0; q < QTRS; q++) {
    frames.push({ type: 'qstart', q: q + 1 });
    for (let i = 0; i < POSS_PER_Q; i++) {
      const h = possession(home, hW, hPPP, aDef, away);
      you += h.pts; tally(hStats, aStats, h);
      if (h.pts || Math.random() < 0.5) frames.push({ type: 'play', side: 'you', you, them, text: h.text, score: h.pts > 0 });
      const a = possession(away, aW, aPPP, hDef, home);
      them += a.pts; tally(aStats, hStats, a);
      if (a.pts || Math.random() < 0.5) frames.push({ type: 'play', side: 'them', you, them, text: a.text, score: a.pts > 0 });
    }
    qScores.push([you, them]);
    frames.push({ type: 'qend', q: q + 1, you, them });
  }
  // break ties with sudden possessions
  while (you === them) {
    const h = possession(home, hW, hPPP, aDef, away); you += h.pts; tally(hStats, aStats, h);
    if (h.pts) frames.push({ type: 'play', side: 'you', you, them, text: 'OT: ' + h.text, score: true });
    const a = possession(away, aW, aPPP, hDef, home); them += a.pts; tally(aStats, hStats, a);
    if (a.pts) frames.push({ type: 'play', side: 'them', you, them, text: 'OT: ' + a.text, score: true });
  }
  hStats.pts = you; aStats.pts = them;
  frames.push({ type: 'done', you, them });
  return { frames, you, them, qScores, hStats, aStats };
}

let simTimer = null;

function showResult() {
  const players = pickedPlayers();
  const sum = (stat) => players.reduce((a, p) => a + (p[stat] || 0), 0);
  const yours = { ppg: sum('ppg'), rpg: sum('rpg'), apg: sum('apg'), spg: sum('spg'), bpg: sum('bpg') };

  // Opponent's real five (per-player) for play-by-play; fall back to a split of combined.
  const away = (typeof LEGENDARY_STARTERS !== 'undefined' && LEGENDARY_STARTERS[opponent.abbr])
    || POSITIONS.map(() => ({ name: opponent.abbr + ' player', ppg: opponent.ppg/5, rpg: opponent.rpg/5, apg: opponent.apg/5, spg: (opponent.spg||0)/5, bpg: (opponent.bpg||0)/5 }));
  const theirs = {
    ppg: opponent.ppg, rpg: opponent.rpg, apg: opponent.apg,
    spg: opponent.spg || 0, bpg: opponent.bpg || 0,
  };

  // Chemistry: your 5 never played together (x0.97 baseline), but reward drafting
  // multiple starters from the SAME franchise+decade (+4% per such pair, capped).
  const groups = {};
  players.forEach(p => { const k = `${p.team}|${p.era}`; groups[k] = (groups[k] || 0) + 1; });
  let pairs = 0;
  Object.values(groups).forEach(n => { pairs += (n * (n - 1)) / 2; });
  const chemFactor = 0.97 + Math.min(0.16, 0.04 * pairs); // up to +16%

  const sim = simulateGame(players, away, cfg().oppMult, chemFactor);

  // prep UI: show live sim, hide final
  $('finalResult').classList.add('hidden');
  $('liveSim').classList.remove('hidden');
  $('lsYou').textContent = '0'; $('lsThem').textContent = '0';
  $('lsOppName').textContent = opponent.abbr;
  $('lsQ').textContent = 'TIP-OFF'; $('lsClock').textContent = '';
  $('pbp').innerHTML = '';
  showScreen('resultScreen');

  const done = () => revealFinal(sim, yours, theirs);
  window.__sim = sim; window.__onDone = done;
  playSim(sim, done);
}

const SIM_SPEEDS = { vslow: 200, slow: 110, medium: 60, fast: 28, vfast: 12 };
let simDelay = SIM_SPEEDS.medium;
let simFrames = [], simIdx = 0, simOnDone = null;

function startSimTimer() {
  if (simTimer) clearInterval(simTimer);
  const pbp = $('pbp');
  simTimer = setInterval(() => {
    if (simIdx >= simFrames.length) { clearInterval(simTimer); simTimer = null; simOnDone && simOnDone(); return; }
    const f = simFrames[simIdx++];
    if (f.type === 'qstart') { $('lsQ').textContent = 'Q' + f.q; }
    else if (f.type === 'qend') {
      $('lsClock').textContent = `End Q${f.q}`;
      $('lsYou').textContent = f.you; $('lsThem').textContent = f.them;
    } else if (f.type === 'play') {
      $('lsYou').textContent = f.you; $('lsThem').textContent = f.them;
      $('lsClock').textContent = `${f.you}–${f.them}`;
      const row = document.createElement('div');
      row.className = 'pbp-row ' + f.side + (f.score ? ' score' : '');
      row.textContent = (f.side === 'you' ? '▸ ' : '◂ ') + f.text + (f.score ? `  (${f.you}–${f.them})` : '');
      pbp.prepend(row);
      while (pbp.childNodes.length > 40) pbp.removeChild(pbp.lastChild);
    } else if (f.type === 'done') {
      $('lsYou').textContent = f.you; $('lsThem').textContent = f.them;
      clearInterval(simTimer); simTimer = null; simOnDone && simOnDone();
    }
  }, simDelay);
}

function setSimSpeed(name) {
  simDelay = SIM_SPEEDS[name] || SIM_SPEEDS.medium;
  document.querySelectorAll('#simSpeed .ss-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.speed === name));
  if (simTimer) startSimTimer(); // apply immediately mid-sim
}

document.querySelectorAll('#simSpeed .ss-chip').forEach(chip =>
  chip.addEventListener('click', () => setSimSpeed(chip.dataset.speed)));

function playSim(sim, onDone) {
  simFrames = sim.frames; simIdx = 0; simOnDone = onDone;
  setSimSpeed('medium');        // every sim starts at Medium
  startSimTimer();
}

$('skipSimBtn').addEventListener('click', () => {
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
  if (window.__onDone) window.__onDone();
});

function revealFinal(sim, yours, theirs) {
  const won = sim.you > sim.them;
  const margin = Math.abs(sim.you - sim.them);
  const cats = ['ppg','rpg','apg','spg','bpg'], labels = { ppg:'PPG',rpg:'RPG',apg:'APG',spg:'SPG',bpg:'BPG' };
  const mult = cfg().oppMult;
  const theirsAdj = {}; cats.forEach(c => theirsAdj[c] = +((theirs[c]||0) * (c==='ppg'?mult:1)).toFixed(1));

  $('liveSim').classList.add('hidden');
  $('finalResult').classList.remove('hidden');

  $('resultBadge').textContent = won ? '🏆' : '💀';
  $('resultTitle').textContent = won ? 'You Beat the Dynasty!' : 'The Dynasty Stands';
  $('resultTitle').style.color = won ? 'var(--gold)' : 'var(--red)';
  $('resultSubtitle').textContent = won
    ? `Final: you ${sim.you}, ${opponent.name} ${sim.them} on ${cfg().label} — a ${margin}-point win.`
    : `Final: ${opponent.name} ${sim.them}, you ${sim.you} on ${cfg().label} — a ${margin}-point loss. Run it back.`;

  const scoreHTML = `<div class="final-score">
    <div class="fs-side ${won ? 'win' : 'loss'}"><div class="fs-pts">${sim.you}</div><div class="fs-name">Your Team</div></div>
    <div class="fs-dash">–</div>
    <div class="fs-side ${won ? 'loss' : 'win'}"><div class="fs-pts">${sim.them}</div><div class="fs-name">${opponent.abbr}</div></div>
  </div>`;

  const qHTML = `<div class="qbox"><div class="qrow qhead"><span></span>${sim.qScores.map((_,i)=>`<span>Q${i+1}</span>`).join('')}<span>F</span></div>
    <div class="qrow"><span>You</span>${sim.qScores.map((s,i)=>`<span>${s[0]-(i?sim.qScores[i-1][0]:0)}</span>`).join('')}<span class="qf">${sim.you}</span></div>
    <div class="qrow"><span>${opponent.abbr}</span>${sim.qScores.map((s,i)=>`<span>${s[1]-(i?sim.qScores[i-1][1]:0)}</span>`).join('')}<span class="qf">${sim.them}</span></div></div>`;

  // Simulated box score (lower turnovers is better)
  const hs = sim.hStats, as = sim.aStats;
  const boxRows = [
    ['PTS', hs.pts, as.pts, true], ['FG Made', hs.fgm, as.fgm, true],
    ['3PT Made', hs.tpm, as.tpm, true], ['Steals', hs.stl, as.stl, true],
    ['Blocks', hs.blk, as.blk, true], ['Turnovers', hs.to, as.to, false],
  ];
  const boxHTML = `<p class="box-title">Simulated box score</p>
    <div class="qbox"><div class="qrow box-row qhead"><span></span><span>You</span><span>${opponent.abbr}</span></div>
    ${boxRows.map(([lbl,y,t,hi]) => {
      const youBetter = hi ? y >= t : y <= t;
      return `<div class="qrow box-row"><span>${lbl}</span>
        <span class="${youBetter?'qf':''}">${y}</span>
        <span class="${!youBetter?'qf':''}">${t}</span></div>`;
    }).join('')}</div>`;

  $('matchupGrid').innerHTML = scoreHTML + qHTML + boxHTML;

  $('yourRosterResult').innerHTML = POSITIONS.map(pos => {
    const p = roster[pos];
    return `<div class="roster-list-item"><b>${pos}</b>${p ? p.name : '—'}
      <span class="rli-stats">${p ? `${p.ppg} pts · ${p.rpg} reb` : ''}</span></div>`;
  }).join('');

  // ── Real GM gauntlet flow ──
  const ga = $('gauntletActions');
  if (gauntlet) {
    $('tryAgainBtn').style.display = 'none';
    $('playAgainBtn').style.display = 'none';
    if (won) {
      gauntlet.stage++;
      if (gauntlet.stage >= 5) {
        // crowned!
        $('resultBadge').textContent = '👑';
        $('resultTitle').textContent = 'DYNASTY KILLER';
        $('resultTitle').style.color = 'var(--gold)';
        $('resultSubtitle').textContent = `You beat all 5 of the greatest dynasties ever — you are a Real GM.`;
        ga.innerHTML = `<button class="btn-primary btn-xl" id="gauntletDoneBtn">🔄 RUN IT AGAIN</button>`;
        $('gauntletDoneBtn').onclick = () => { gauntlet = null; fullReset(); };
      } else {
        const next = gauntlet.order[gauntlet.stage];
        $('resultTitle').textContent = `Stage ${gauntlet.stage} Cleared!`;
        $('resultSubtitle').textContent = `${gauntlet.stage} of 5 dynasties down. Next up: ${next.name} (#${rankOf(next)} all-time).`;
        ga.innerHTML = `<p class="streak-note">🔥 ${gauntlet.stage}/5 dynasties beaten</p>
          <button class="btn-primary btn-xl" id="nextStageBtn">NEXT DYNASTY → #${rankOf(next)}</button>`;
        $('nextStageBtn').onclick = () => advanceGauntlet();
      }
    } else {
      $('resultTitle').textContent = 'Gauntlet Over';
      $('resultSubtitle').textContent = `You fell at stage ${gauntlet.stage + 1} of 5. Dynasties beaten: ${gauntlet.stage}. Run it back.`;
      ga.innerHTML = `<p class="streak-note">Reached stage ${gauntlet.stage + 1} / 5</p>
        <button class="btn-primary btn-xl" id="retryGauntletBtn">🔄 RETRY GAUNTLET</button>
        <button class="btn-primary btn-xl" id="exitGauntletBtn" style="background:var(--surface2);color:var(--text);box-shadow:none;">EXIT</button>`;
      $('retryGauntletBtn').onclick = () => { gauntlet = null; startGauntlet(); };
      $('exitGauntletBtn').onclick = () => { gauntlet = null; fullReset(); };
    }
  } else {
    $('tryAgainBtn').style.display = '';
    $('playAgainBtn').style.display = '';
    ga.innerHTML = '';
  }
}

function fullReset() {
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
  gauntlet = null;
  $('tryAgainBtn').style.display = ''; $('playAgainBtn').style.display = ''; $('gauntletActions').innerHTML = '';
  opponent = null; roster = {}; currentRound = 0; spent = 0; isRolling = false;
  $('restartBtn').classList.add('hidden');
  $('spinCardInner').innerHTML =
    `<span class="spin-icon">🎲</span><span class="spin-label">Roll your opponent</span>`;
  showScreen('rollScreen');
}

// New opponent (from result screen) and Restart (mid-draft) both fully reset
$('playAgainBtn').addEventListener('click', fullReset);
$('restartBtn').addEventListener('click', fullReset);

// Try Again: re-draft against the SAME opponent
$('tryAgainBtn').addEventListener('click', () => {
  roster = {}; currentRound = 0; spent = 0;
  startDraftRound();
  showScreen('draftScreen');
});
