import * as store from './store.js';
import { SEED_IDEAS, TAG_GROUPS } from './seed.js';
import { createTonight } from './tonight.js';
import {
  SEASONS, seasonOf, todayISO, nextWeekday, prettyDate, fetchWeather, badOutdoorDay, describeCode,
  costLabel, driveLabel, DEFAULT_FILTERS, activeFilterCount, applyFilters, buildHistory, scoreIdea,
  weightedPick, weightedSample, RATING_PARAMS, compareRatings, inSeason, wearTips, ideaEmoji,
} from './logic.js';

// ---------- state ----------

const state = {
  tab: ({ tonight: 'pick', spin: 'pick', decide: 'pick', dates: 'plans' })[localStorage.getItem('dn.tab')] || localStorage.getItem('dn.tab') || 'pick',
  pickMode: 'match', // match | spin | decide
  filters: { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('dn.filters') || '{}') },
  filtersOpen: false,
  sort: 'best',
  weather: null,
  modal: null,
  wheel: { ids: [], rot: 0, result: null, spinning: false },
  decide: { a: '', b: '', result: null, running: false, weighted: false },
  setup: { mode: null },
  installPrompt: null,
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const ALL_TAGS = [...TAG_GROUPS.food, ...TAG_GROUPS.activity];
const TAG_LABEL = {
  burgers: '🍔 Burgers', chinese: '🥡 Chinese', steak: '🥩 Steak', greek: '🥙 Greek', diner: '🍳 Diner', treats: '🍦 Treats',
  'cook-at-home': '👩‍🍳 Cook at home', picnic: '🧺 Picnic', outdoors: '🌳 Outdoors', walk: '🚶 Walk', indoors: '🏠 Indoors',
  'at-home': '🛋️ At home', show: '🎬 Show/movie', holiday: '🎄 Holiday', active: '⛸️ Active', games: '🎳 Games',
  drive: '🚗 Drive', 'day-trip': '🗺️ Day trip', museum: '🖼️ Museum',
};
const tagLabel = (t) => TAG_LABEL[t] || t;

function saveFilters() {
  localStorage.setItem('dn.filters', JSON.stringify(state.filters));
}

// ---------- derived data ----------

function couple() {
  return store.get('couple')?.data || { names: [store.me?.name || 'Me', 'Partner'], home: null };
}
const partnerName = () => couple().names.find((n) => n !== store.me?.name) || 'Partner';
const home = () => couple().home || null;

function ctx(dayISO = todayISO()) {
  const ideas = store.list('idea').map((r) => r.data);
  const ideasById = Object.fromEntries(ideas.map((i) => [i.id, i]));
  const history = buildHistory(store.list('date'), store.list('rating'), ideasById);
  const triedIds = new Set([...history.triedIds, ...ideas.filter((i) => i.tried).map((i) => i.id)]);
  const day = state.weather?.days?.[dayISO];
  const bad = badOutdoorDay(day);
  return {
    ideas, ideasById, history, triedIds, day,
    season: seasonOf(new Date(`${dayISO}T12:00:00`)),
    badWeather: bad,
    niceWeather: !!day && !bad && day.hi >= 60 && day.hi <= 85,
  };
}

function filtered(c = ctx()) {
  return applyFilters(c.ideas, state.filters, c)
    .map((idea) => ({ idea, ...scoreIdea(idea, c) }));
}

function ratingsFor(dateId) {
  return store.list('rating').map((r) => r.data).filter((r) => r.dateId === dateId);
}

// ---------- rendering ----------

const app = document.getElementById('app');
const modalEl = document.getElementById('modal');

function render() {
  if (!store.me) {
    app.innerHTML = viewSetup();
    return;
  }
  app.innerHTML = `
    ${viewHeader()}
    ${viewInstallBanner()}
    <main class="main">${VIEWS[state.tab]()}</main>
    ${viewTabs()}`;
  if (state.tab === 'pick' && state.pickMode === 'spin') drawWheel();
  if (state.tab === 'pick' && state.pickMode === 'match') { tonight.after(); tonight.markSeen(); }
}

function renderModal() {
  if (!state.modal) {
    modalEl.innerHTML = '';
    modalEl.hidden = true;
    document.body.classList.remove('modal-open');
    return;
  }
  modalEl.hidden = false;
  document.body.classList.add('modal-open');
  modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <button class="sheet-close" data-act="closeModal" aria-label="Close">✕</button>
    ${MODALS[state.modal.type]()}
  </div>`;
  MODAL_AFTER[state.modal.type]?.();
}

function openModal(type, props = {}) {
  state.modal = { type, ...props };
  renderModal();
}
function closeModal() {
  state.modal = null;
  renderModal();
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
}

function viewHeader() {
  const wx = state.weather?.current;
  const s = store.status;
  let dot = 'local';
  let dotTitle = 'Only on this phone';
  if (store.remoteEnabled()) {
    if (s.syncing) { dot = 'syncing'; dotTitle = 'Syncing…'; }
    else if (s.error) { dot = 'error'; dotTitle = 'Offline, will retry'; }
    else { dot = 'ok'; dotTitle = 'Synced'; }
  }
  return `<header class="top">
    <div class="brand">Date Night <span class="heart">♥</span></div>
    <div class="top-right">
      ${wx ? `<span class="pill" title="Weather">${wx.emoji} ${wx.temp}°</span>` : ''}
      <button class="icon-btn" data-act="openSettings" aria-label="Settings"><span class="dot ${dot}" title="${dotTitle}"></span>⚙️</button>
    </div>
  </header>`;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

function viewInstallBanner() {
  if (isStandalone() || localStorage.getItem('dn.installDismissed')) return '';
  return `<div class="banner">
    <span>📲 Add this to your home screen so it opens like an app.</span>
    <button class="link" data-act="openInstall">How</button>
    <button class="link muted" data-act="dismissInstall" aria-label="Dismiss">✕</button>
  </div>`;
}

function viewTabs() {
  const tabs = [['pick', '🌙', 'Pick'], ['plans', '📅', 'Plans'], ['memories', '💞', 'Memories'], ['ideas', '💡', 'Ideas']];
  const needs = needsMyRating().length + readyToReveal().length;
  const upcoming = store.list('date').filter((d) => d.data.status === 'planned').length;
  return `<nav class="tabs">${tabs.map(([k, i, l]) => `
    <button class="tab ${state.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">
      <span class="tab-i">${i}${k === 'memories' && needs ? `<b class="badge">${needs}</b>` : ''}${k === 'pick' && tonight.badge() ? '<b class="badge">!</b>' : ''}${k === 'plans' && upcoming ? `<b class="badge soft">${upcoming}</b>` : ''}</span><span>${l}</span>
    </button>`).join('')}</nav>`;
}

// ---------- filters ----------

function chip(label, on, act, data = {}) {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" ${attrs}>${label}</button>`;
}

function viewFilters() {
  const f = state.filters;
  const n = activeFilterCount(f);
  const c = ctx();
  const wxNote = c.day ? `${c.day.emoji} Today: ${c.day.label}, ${c.day.hi}°/${c.day.lo}°${c.day.pop ? `, ${c.day.pop}% rain` : ''}` : '';
  if (!state.filtersOpen) {
    return `<button class="filters-toggle" data-act="toggleFilters">🎛️ Filters${n ? ` (${n})` : ''} <span class="muted">${esc(filterSummary())}</span></button>`;
  }
  return `<section class="filters">
    <div class="filters-head"><b>Filters</b>
      <span><button class="link" data-act="resetFilters">Reset</button> <button class="link" data-act="toggleFilters">Done</button></span>
    </div>
    <label>How far?</label>
    <div class="chips">
      ${[[0, 'At home'], [15, '15 min'], [30, '30 min'], [60, '1 hr'], ['any', 'Any']].map(([v, l]) => chip(l, String(f.drive) === String(v), 'fSet', { k: 'drive', v })).join('')}
    </div>
    <label>Budget (for two)</label>
    <div class="chips">
      ${[[15, 'Under $15'], [30, 'Under $30'], [50, 'Under $50'], ['any', 'Splurge OK']].map(([v, l]) => chip(l, String(f.budget) === String(v), 'fSet', { k: 'budget', v })).join('')}
    </div>
    <label>Energy</label>
    <div class="chips">
      ${[['Low', '😌 Chill'], ['Med', '🙂 Some walking'], ['High', '⚡ Active']].map(([v, l]) => chip(l, f.energy.includes(v), 'fToggle', { k: 'energy', v })).join('')}
    </div>
    <label>In the mood for</label>
    <div class="chips">${ALL_TAGS.map((t) => chip(tagLabel(t), f.include.includes(t), 'fTag', { k: 'include', v: t })).join('')}</div>
    <label>Not tonight 🚫</label>
    <div class="chips no">${ALL_TAGS.map((t) => chip(tagLabel(t), f.exclude.includes(t), 'fTag', { k: 'exclude', v: t })).join('')}</div>
    <label>Smart filters</label>
    <div class="chips">
      ${chip(`🍂 In season (${c.season})`, f.inSeason, 'fBool', { k: 'inSeason' })}
      ${chip('🌦️ Skip outdoor if weather is bad', f.weatherOk, 'fBool', { k: 'weatherOk' })}
      ${chip('✨ Only new-to-us', f.hideTried, 'fBool', { k: 'hideTried' })}
    </div>
    ${wxNote ? `<p class="muted small">${wxNote}</p>` : ''}
  </section>`;
}

function filterSummary() {
  const f = state.filters;
  const bits = [];
  if (f.drive !== 'any') bits.push(Number(f.drive) === 0 ? 'at home' : `≤${f.drive} min`);
  if (f.budget !== 'any') bits.push(`<$${f.budget}`);
  if (f.energy.length) bits.push(f.energy.join('/').toLowerCase());
  if (f.include.length) bits.push(f.include.join(', '));
  if (f.exclude.length) bits.push(`no ${f.exclude.join(', ')}`);
  return bits.join(' · ');
}

// ---------- Ideas tab ----------

function ideaCard({ idea, why }, c) {
  const tried = c.triedIds.has(idea.id);
  const rated = c.history.ideaAvg[idea.id];
  return `<article class="card idea ${tried ? 'tried' : ''}">
    <button class="check ${tried ? 'on' : ''}" data-act="toggleTried" data-id="${idea.id}" aria-label="Mark as done">${tried ? '✓' : ''}</button>
    <div class="idea-body" data-act="editIdea" data-id="${idea.id}">
      <div class="idea-title">${esc(idea.title)}</div>
      <div class="meta">
        <span>💲${costLabel(idea)}</span><span>🚗 ${driveLabel(idea)}</span><span>${{ Low: '😌', Med: '🙂', High: '⚡' }[idea.energy] || ''} ${idea.energy}</span>
        ${idea.leans && idea.leans !== 'Both' ? `<span>💝 ${esc(idea.leans)}</span>` : ''}
        ${rated ? `<span>⭐ ${rated.toFixed(1)}</span>` : ''}
      </div>
      ${why.length ? `<div class="why">${esc(why.slice(0, 2).join(' · '))}</div>` : ''}
    </div>
    <div class="idea-actions">
      <button class="star ${idea.fav ? 'on' : ''}" data-act="toggleFav" data-id="${idea.id}" aria-label="Favorite">${idea.fav ? '♥' : '♡'}</button>
      <button class="btn small" data-act="planIdea" data-id="${idea.id}">Plan</button>
    </div>
  </article>`;
}

function viewIdeas() {
  const c = ctx();
  let rows = filtered(c);
  if (state.sort === 'best') rows.sort((a, b) => b.score - a.score);
  else rows.sort((a, b) => a.idea.title.localeCompare(b.idea.title));
  return `
    ${!home() ? `<div class="banner"><span>🌦️ Want weather-smart picks? Share your location once.</span><button class="link" data-act="useLocation">Turn on</button></div>` : ''}
    ${viewFilters()}
    <div class="grid2"><button class="btn ghost" data-act="openFind">🔎 Find new</button><button class="btn ghost" data-act="newIdea">+ Add idea</button></div>
    <div class="list-head">
      <span><b>${rows.length}</b> idea${rows.length === 1 ? '' : 's'} match</span>
      <button class="link" data-act="sort">${state.sort === 'best' ? 'Best first' : 'A–Z'} ⇅</button>
    </div>
    ${rows.length ? rows.map((r) => ideaCard(r, c)).join('') : `<p class="empty">Nothing matches. Try loosening a filter.</p>`}
  `;
}

// ---------- Spin tab ----------

const WHEEL_COLORS = ['#ff6b8b', '#ffb347', '#7bd389', '#6ec6ff', '#b39ddb', '#ff8a65', '#4dd0e1', '#f06292', '#aed581', '#ffd54f'];

function ensureWheel() {
  const rows = filtered();
  const valid = new Set(rows.map((r) => r.idea.id));
  if (!state.wheel.ids.length || state.wheel.ids.some((id) => !valid.has(id)) || (state.wheel.ids.length < Math.min(8, rows.length))) {
    state.wheel.ids = weightedSample(rows, 8, (r) => r.score).map((r) => r.idea.id);
    state.wheel.result = null;
  }
  return rows;
}

function viewSpin() {
  const rows = ensureWheel();
  const c = ctx();
  const res = state.wheel.result && c.ideasById[state.wheel.result];
  return `
    ${viewFilters()}
    ${rows.length < 2 ? `<p class="empty">Need at least 2 matching ideas to spin. Loosen your filters.</p>` : `
    <div class="wheel-wrap">
      <div class="pointer">▼</div>
      <canvas id="wheel" width="640" height="640"></canvas>
      <button class="spin-btn" data-act="spin" ${state.wheel.spinning ? 'disabled' : ''}>SPIN</button>
    </div>
    <p class="center muted small">${state.wheel.ids.length} of ${rows.length} matching ideas on the wheel. Better fits for tonight get picked more often.</p>
    <div class="center"><button class="link" data-act="reshuffle">🔀 Swap in different ideas</button></div>
    ${res ? `<section class="hero pop">
      <div class="hero-label">The wheel says…</div>
      <div class="hero-title">${esc(res.title)}</div>
      <div class="meta"><span>💲${costLabel(res)}</span><span>🚗 ${driveLabel(res)}</span><span>${res.energy}</span></div>
      <div class="row"><button class="btn" data-act="planIdea" data-id="${res.id}">Let's do it</button>
      <button class="btn ghost" data-act="spin">Spin again</button></div>
    </section>` : ''}`}
  `;
}

function drawWheel() {
  const canvas = $('#wheel');
  if (!canvas) return;
  const c = ctx();
  const ideas = state.wheel.ids.map((id) => c.ideasById[id]).filter(Boolean);
  const g = canvas.getContext('2d');
  const R = canvas.width / 2;
  const seg = (Math.PI * 2) / ideas.length;
  g.clearRect(0, 0, canvas.width, canvas.height);
  ideas.forEach((idea, i) => {
    const start = -Math.PI / 2 + i * seg;
    g.beginPath();
    g.moveTo(R, R);
    g.arc(R, R, R - 6, start, start + seg);
    g.closePath();
    g.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.stroke();
    g.save();
    g.translate(R, R);
    g.rotate(start + seg / 2);
    g.fillStyle = '#2b1b2e';
    g.font = '600 26px system-ui, -apple-system, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    let label = idea.title.split(/[(,+]/)[0].trim();
    if (label.length > 20) label = `${label.slice(0, 19)}…`;
    g.fillText(label, R - 30, 0);
    g.restore();
  });
  canvas.style.transform = `rotate(${state.wheel.rot}deg)`;
}

function spin() {
  if (state.wheel.spinning) return;
  const c = ctx();
  const ideas = state.wheel.ids.map((id) => c.ideasById[id]).filter(Boolean);
  if (ideas.length < 2) return;
  const winner = weightedPick(ideas, (i) => scoreIdea(i, c).score);
  const w = ideas.indexOf(winner);
  const segDeg = 360 / ideas.length;
  const target = w * segDeg + segDeg * (0.2 + Math.random() * 0.6); // angle on the wheel under the pointer
  const want = (360 - target) % 360;
  const cur = ((state.wheel.rot % 360) + 360) % 360;
  const final = state.wheel.rot + 360 * 6 + ((want - cur + 360) % 360);
  state.wheel.spinning = true;
  state.wheel.result = null;
  render();
  const canvas = $('#wheel');
  canvas.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.8, 0.1, 1)';
  requestAnimationFrame(() => { canvas.style.transform = `rotate(${final}deg)`; });
  if (navigator.vibrate) navigator.vibrate(20);
  setTimeout(() => {
    state.wheel.rot = final;
    state.wheel.spinning = false;
    state.wheel.result = winner.id;
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    render();
  }, 4300);
}

// ---------- Decide tab ----------

function viewDecide() {
  const c = ctx();
  const d = state.decide;
  const ideas = c.ideas.filter((i) => !i.hidden).sort((a, b) => a.title.localeCompare(b.title));
  const opts = (sel) => `<option value="">Pick an idea…</option>${ideas.map((i) => `<option value="${i.id}" ${sel === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}`;
  const nameOf = (v) => c.ideasById[v]?.title || v;
  const slot = (k, label) => `
    <div class="slot ${d.result === k ? 'win' : ''} ${d.result && d.result !== k ? 'lose' : ''}" id="slot-${k}">
      <div class="slot-label">${label}</div>
      ${d.running || d.result ? `<div class="slot-title">${esc(nameOf(d[k]))}</div>` : `
      <select data-act="decideSel" data-k="${k}">${opts(c.ideasById[d[k]] ? d[k] : '')}</select>
      <input type="text" placeholder="…or type anything" data-k="${k}" class="decide-text" value="${c.ideasById[d[k]] ? '' : esc(d[k])}">`}
    </div>`;
  const ready = d.a && d.b;
  const winner = d.result ? d[d.result] : null;
  return `
    <section class="decide">
      <h2>Can't choose? 🤔</h2>
      <p class="muted">Each of you pick one (or let me grab two), then let fate decide.</p>
      <div class="vs-wrap">${slot('a', 'Idea A')}<div class="vs">VS</div>${slot('b', 'Idea B')}</div>
      ${d.result ? `
        <div class="center pop"><div class="big">🎉</div><p><b>${esc(nameOf(winner))}</b> wins!</p>
        <div class="row center">
          ${c.ideasById[winner] ? `<button class="btn" data-act="planIdea" data-id="${winner}">Plan it</button>` : ''}
          <button class="btn ghost" data-act="decideRun">Best 2 of 3?</button>
          <button class="btn ghost" data-act="decideReset">New matchup</button>
        </div></div>` : `
        <div class="row center">
          <button class="btn ghost" data-act="decidePair">🎲 Give us two</button>
          <button class="btn" data-act="decideRun" ${ready && !d.running ? '' : 'disabled'}>Decide for us!</button>
        </div>
        <label class="toggle"><input type="checkbox" data-act="decideWeighted" ${d.weighted ? 'checked' : ''}> Lean toward what fits tonight (weather, season, past ratings)</label>`}
    </section>`;
}

function decideRun() {
  const d = state.decide;
  if (!d.a || !d.b || d.running) return;
  const c = ctx();
  let pA = 0.5;
  if (d.weighted) {
    const sa = c.ideasById[d.a] ? scoreIdea(c.ideasById[d.a], c).score : 1;
    const sb = c.ideasById[d.b] ? scoreIdea(c.ideasById[d.b], c).score : 1;
    pA = sa / (sa + sb);
  }
  const winner = Math.random() < pA ? 'a' : 'b';
  d.running = true;
  d.result = null;
  render();
  // Flip the highlight back and forth, slowing down, then land on the winner.
  const flips = 14 + (winner === 'b' ? 1 : 0);
  let i = 0;
  const step = () => {
    const k = i % 2 === 0 ? 'a' : 'b';
    $('#slot-a')?.classList.toggle('hot', k === 'a');
    $('#slot-b')?.classList.toggle('hot', k === 'b');
    if (navigator.vibrate) navigator.vibrate(8);
    i++;
    if (i < flips) setTimeout(step, 60 + i * i * 2.2);
    else setTimeout(() => { d.running = false; d.result = winner; render(); }, 500);
  };
  step();
}

// ---------- Dates tab ----------

function datesSorted() {
  return store.list('date').sort((a, b) => (b.data.when || '').localeCompare(a.data.when || ''));
}

function needsMyRating() {
  if (!store.me) return [];
  return datesSorted().filter((d) => d.data.status === 'done' && !ratingsFor(d.id).some((r) => r.by === store.me.name));
}

function readyToReveal() {
  if (!store.me) return [];
  return datesSorted().filter((d) => {
    if (d.data.status !== 'done') return false;
    const rs = ratingsFor(d.id);
    return rs.length >= 2 && !(d.data.revealedBy || []).includes(store.me.name);
  });
}

function dateCard(d) {
  const x = d.data;
  const rs = ratingsFor(d.id);
  const mine = rs.some((r) => r.by === store.me.name);
  let badge = '';
  if (x.status === 'planned') badge = '<span class="tag">Planned</span>';
  else if (!mine) badge = '<span class="tag hot">Rate it</span>';
  else if (rs.length < 2) badge = `<span class="tag">Waiting on ${esc(partnerName())}</span>`;
  else if (!(x.revealedBy || []).includes(store.me.name)) badge = '<span class="tag hot">Reveal! 🎁</span>';
  else {
    const cmp = compareRatings(rs[0], rs[1]);
    badge = `<span class="tag">${cmp.verdict.emoji} ${cmp.overall.toFixed(1)}</span>`;
  }
  const wx = x.log?.weather;
  return `<article class="card date" data-act="openDate" data-id="${d.id}">
    <div><div class="idea-title">${esc(x.title)}</div>
    <div class="meta"><span>📅 ${prettyDate(x.when)}${x.time ? ` · ${esc(x.time)}` : ''}</span>
    ${wx ? `<span>${wx.emoji} ${wx.hi ?? ''}${wx.hi != null ? '°' : ''}</span>` : ''}
    ${x.log?.spent ? `<span>💲${x.log.spent}</span>` : ''}</div></div>
    ${badge}
  </article>`;
}

function viewInsights(done) {
  if (!done.length) return '';
  const all = done.map((d) => {
    const rs = ratingsFor(d.id);
    const overall = rs.length >= 2 ? (rs[0].scores.overall + rs[1].scores.overall) / 2 : null;
    return { d, overall };
  });
  const rated = all.filter((x) => x.overall != null);
  const avgAll = rated.length ? rated.reduce((a, x) => a + x.overall, 0) / rated.length : null;
  const month = todayISO().slice(0, 7);
  const spent = done.filter((d) => (d.data.when || '').startsWith(month)).reduce((a, d) => a + (Number(d.data.log?.spent) || 0), 0);
  const durs = done.map((d) => d.data.log?.durationMin).filter(Boolean);
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
  const best = rated.sort((a, b) => b.overall - a.overall)[0];
  const c = ctx();
  const topTag = Object.entries(c.history.tagAvg).sort((a, b) => b[1] - a[1])[0];
  return `<section class="stats">
    <div><b>${done.length}</b><span>dates</span></div>
    <div><b>${avgAll ? avgAll.toFixed(1) : '–'}</b><span>avg rating</span></div>
    <div><b>$${Math.round(spent)}</b><span>this month</span></div>
    <div><b>${avgDur ? `${(avgDur / 60).toFixed(1)}h` : '–'}</b><span>avg length</span></div>
  </section>
  ${best || topTag ? `<p class="muted small center">${best ? `🏆 Best so far: <b>${esc(best.d.data.title)}</b>. ` : ''}${topTag ? `You rate ${esc(tagLabel(topTag[0]))} dates highest.` : ''}</p>` : ''}`;
}

const tonight = createTonight({
  ctx: () => ctx(),
  partnerName: () => partnerName(),
  render: () => render(),
  toast: (m) => toast(m),
  goDecide: (a, b) => { state.decide = { ...state.decide, a, b, result: null }; state.tab = 'pick'; state.pickMode = 'decide'; render(); window.scrollTo(0, 0); },
});

// ---------- Pick / Plans / Memories ----------

function nudges() {
  const items = [];
  for (const d of readyToReveal()) items.push(`<button class="nudge hot" data-act="reveal" data-id="${d.id}">🎁 Both ratings are in for <b>${esc(d.data.title)}</b>. Reveal!</button>`);
  for (const d of needsMyRating()) if (!readyToReveal().includes(d)) items.push(`<button class="nudge" data-act="rate" data-id="${d.id}">⭐ How was <b>${esc(d.data.title)}</b>? Rate it</button>`);
  const today = todayISO();
  for (const d of store.list('date')) {
    if (d.data.status === 'planned' && d.data.when < today) items.push(`<button class="nudge" data-act="logDate" data-id="${d.id}">📝 Did you go to <b>${esc(d.data.title)}</b>? Log it</button>`);
  }
  return items.slice(0, 3).join('');
}

function viewPick() {
  const modes = [['match', '💞', 'Match'], ['spin', '🎡', 'Spin'], ['decide', '⚖️', 'This or that']];
  const body = state.pickMode === 'spin' ? viewSpin() : state.pickMode === 'decide' ? viewDecide() : tonight.view();
  return `${nudges()}
    <div class="seg">${modes.map(([k, e, l]) => `<button class="${state.pickMode === k ? 'on' : ''}" data-act="pickMode" data-v="${k}">${e} ${l}</button>`).join('')}</div>
    ${body}`;
}

function planCard(d) {
  const x = d.data;
  const c = ctx();
  const idea = c.ideasById[x.ideaId];
  const day = state.weather?.days?.[x.when];
  const tips = wearTips(idea, day, x.time).slice(0, 3);
  const isToday = x.when === todayISO();
  return `<article class="card plan">
    <div class="plan-top" data-act="openDate" data-id="${d.id}">
      <div class="plan-date"><b>${new Date(`${x.when}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric' })}</b><span>${new Date(`${x.when}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></div>
      <div class="plan-main">
        <div class="idea-title">${idea ? `${ideaEmoji(idea)} ` : ''}${esc(x.title)}</div>
        <div class="meta"><span>${isToday ? '<b>Tonight</b>' : prettyDate(x.when)}${x.time ? ` · ${fmtTime(x.time)}` : ''}</span>
        ${day ? `<span>${day.emoji} ${day.hi}°${day.pop >= 30 ? ` · ${day.pop}% rain` : ''}</span>` : ''}
        ${idea ? `<span>💲${costLabel(idea)}</span>` : ''}</div>
      </div>
    </div>
    ${tips.length ? `<div class="wear">${tips.map(([e, t]) => `<span>${e} ${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="row">
      <a class="btn small ghost" href="${esc(gcalLink(d))}" target="_blank" rel="noopener">📅 Calendar</a>
      ${x.when <= todayISO() ? `<button class="btn small" data-act="logDate" data-id="${d.id}">We went! 🎉</button>` : `<button class="btn small ghost" data-act="openDate" data-id="${d.id}">Details</button>`}
    </div>
  </article>`;
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function viewPlans() {
  const planned = store.list('date').filter((d) => d.data.status === 'planned').sort((a, b) => (a.data.when || '').localeCompare(b.data.when || ''));
  return `
    <button class="btn block-btn" data-act="planIdea">+ Plan a date</button>
    ${planned.length ? `<h3>Coming up</h3>${planned.map(planCard).join('')}`
      : `<div class="empty"><div class="big">📅</div><p>Nothing planned yet.</p><p class="small">Plan one here, or use <b>Pick</b> to find one together.</p></div>`}
  `;
}

function viewMemories() {
  const done = datesSorted().filter((d) => d.data.status === 'done');
  const todo = [...new Set([...needsMyRating(), ...readyToReveal()])];
  const rest = done.filter((d) => !todo.includes(d));
  return `
    ${viewInsights(done)}
    ${todo.length ? `<h3>Your turn ✨</h3>${todo.map(dateCard).join('')}` : ''}
    ${rest.length ? `<h3>Our dates</h3>${rest.map(dateCard).join('')}` : ''}
    ${!done.length ? `<div class="empty"><div class="big">💞</div><p>Your dates will show up here after you go.</p><p class="small">You'll each rate them privately, then reveal together.</p></div>` : ''}
    <div class="center"><button class="link" data-act="logUnplanned">+ Add a date we already went on</button></div>
  `;
}

const VIEWS = { pick: viewPick, plans: viewPlans, memories: viewMemories, ideas: viewIdeas };

// ---------- Setup ----------

const WORDS = 'maple otter cocoa pickle sunny velvet mango comet daisy waffle pepper lemon cobalt ginger hazel olive peach river tulip willow amber berry candle clover coral ember fable fern harbor ivy jasper lilac lotus meadow nova orchid pebble poppy quill raven sage sparrow thistle topaz violet wren zephyr acorn basil cedar dune echo fig grove honey indigo juniper kiwi lark moss nectar opal plum'.split(' ');
function genCode() {
  const r = crypto.getRandomValues(new Uint32Array(4));
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${WORDS[r[2] % WORDS.length]}-${1000 + (r[3] % 9000)}`;
}

function parseJoin() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('join')) return null;
  return { code: h.get('join'), names: [h.get('a'), h.get('b')].filter(Boolean) };
}

function viewSetup() {
  const join = parseJoin();
  const localNote = store.remoteEnabled() ? '' : `<p class="note">Heads up: sharing between phones isn't switched on yet, so for now everything stays on this phone.</p>`;
  if (join) {
    return `<section class="setup">
      <div class="big">💌</div>
      <h1>You're invited!</h1>
      <p>${join.names.length === 2 ? `${esc(join.names[0])} & ${esc(join.names[1])}'s` : 'A'} shared Date Night app. Which one are you?</p>
      <div class="col">${join.names.map((n) => `<button class="btn big-btn" data-act="joinAs" data-v="${esc(n)}">I'm ${esc(n)}</button>`).join('')}</div>
      ${localNote}
    </section>`;
  }
  if (state.setup.mode === 'code') {
    return `<section class="setup">
      <h1>Join with a code</h1>
      <form data-form="joinCode" class="col">
        <label>Couple code<input name="code" required autocomplete="off" autocapitalize="off" placeholder="maple-otter-cocoa-1234"></label>
        <label>Your name<input name="name" required></label>
        <button class="btn big-btn">Join</button>
        <button type="button" class="link" data-act="setupMode" data-v="">Back</button>
      </form>
    </section>`;
  }
  return `<section class="setup">
    <div class="big">💕</div>
    <h1>Date Night</h1>
    <p>Pick dates you'll both love, spin for ideas, and rate them together.</p>
    <form data-form="startCouple" class="col">
      <label>Your name<input name="me" required placeholder="Alex"></label>
      <label>Your partner's name<input name="partner" required placeholder="Sam"></label>
      <label class="toggle"><input type="checkbox" name="seed" checked> Start with 30 sample ideas (you can edit them)</label>
      <button class="btn big-btn">Let's go</button>
    </form>
    <button class="link" data-act="setupMode" data-v="code">I have a couple code</button>
    ${localNote}
  </section>`;
}

async function startCouple(form) {
  const meName = form.me.value.trim();
  const partner = form.partner.value.trim();
  if (!meName || !partner) return;
  const code = genCode();
  store.setMe({ couple: code, name: meName });
  const names = [meName, partner];
  const records = [{ kind: 'couple', id: 'couple', data: { names, home: null, createdAt: new Date().toISOString() } }];
  if (form.seed.checked) {
    for (const idea of SEED_IDEAS) {
      const leans = names.includes(idea.leans) ? idea.leans : 'Both';
      records.push({ kind: 'idea', id: idea.id, data: { ...idea, leans } });
    }
  }
  store.putMany(records);
  render();
  openModal('invite');
}

async function joinAs(name) {
  const join = parseJoin();
  store.setMe({ couple: join.code, name });
  history.replaceState(null, '', location.pathname);
  render();
  await store.sync();
  toast(store.get('couple') ? `Welcome, ${name}! 💕` : 'Joined. Waiting for shared data…');
}

async function joinCode(form) {
  const code = form.code.value.trim().toLowerCase();
  const name = form.name.value.trim();
  if (!code || !name) return;
  if (store.remoteEnabled()) {
    try {
      if (!(await store.remoteHasCouple(code))) { toast("Couldn't find that code"); return; }
    } catch { toast('Could not reach the server'); return; }
  }
  store.setMe({ couple: code, name });
  state.setup.mode = null;
  render();
  await store.sync();
}

// ---------- Modals ----------

const MODALS = {};
const MODAL_AFTER = {};

MODALS.invite = () => {
  const c = couple();
  const link = inviteLink();
  return `<h2>Invite ${esc(partnerName())} 💌</h2>
    <p>Send this link to ${esc(partnerName())}. When they open it, the app will be shared between your phones.</p>
    <div class="code-box">${esc(link)}</div>
    <div class="row"><button class="btn" data-act="shareInvite">Send invite</button><button class="btn ghost" data-act="copyInvite">Copy link</button></div>
    <p class="muted small">Your couple code: <b>${esc(store.me.couple)}</b>. Keep it between you two; anyone with it can see your dates.</p>
    ${store.remoteEnabled() ? '' : `<p class="note">Sharing isn't switched on yet, so the link won't sync until it is.</p>`}
    <button class="link" data-act="closeModal">${c.names ? 'Done' : 'Later'}</button>`;
};

function inviteLink() {
  const [a, b] = couple().names;
  const p = new URLSearchParams({ join: store.me.couple, a, b });
  return `${location.origin}${location.pathname}#${p}`;
}

MODALS.install = () => `
  <h2>Add to home screen 📲</h2>
  ${state.installPrompt ? `<button class="btn" data-act="nativeInstall">Install now</button>` : ''}
  <h3>iPhone (Safari)</h3>
  <ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
  <h3>Android / Pixel (Chrome)</h3>
  <ol><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</li></ol>`;

MODALS.idea = () => {
  const id = state.modal.id;
  const i = id ? store.get(id)?.data : { title: '', cost: [0, 30], drive: 15, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: [] };
  const names = couple().names;
  return `<h2>${id ? 'Edit idea' : 'New idea'}</h2>
  <form data-form="saveIdea" class="col">
    <label>What is it?<input name="title" required value="${esc(i.title)}" placeholder="Taco night at…"></label>
    <div class="grid2">
      <label>Cost from $<input name="c0" type="number" min="0" inputmode="numeric" value="${i.cost[0]}"></label>
      <label>to $<input name="c1" type="number" min="0" inputmode="numeric" value="${i.cost[1]}"></label>
    </div>
    <label>Drive (minutes, 0 = at home)<input name="drive" type="number" min="0" inputmode="numeric" value="${i.drive}"></label>
    <label>Energy<select name="energy">${['Low', 'Med', 'High'].map((e) => `<option ${i.energy === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
    <label>Whose favorite?<select name="leans">${['Both', ...names].map((e) => `<option ${i.leans === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
    <label>Season</label>
    <div class="chips">${['Any', ...SEASONS].map((s) => `<label class="chip-check"><input type="checkbox" name="seasons" value="${s}" ${i.seasons.includes(s) ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div>
    <label>Tags</label>
    <div class="chips">${ALL_TAGS.map((t) => `<label class="chip-check"><input type="checkbox" name="tags" value="${t}" ${i.tags.includes(t) ? 'checked' : ''}><span>${tagLabel(t)}</span></label>`).join('')}</div>
    <label>Notes<textarea name="notes" rows="2" placeholder="Address, tips, hours…">${esc(i.notes || '')}</textarea></label>
    <button class="btn">Save</button>
    ${id ? `<button type="button" class="link danger" data-act="hideIdea" data-id="${id}">Remove this idea</button>` : ''}
  </form>`;
};

function saveIdea(form) {
  const id = state.modal.id || uid('i');
  const prev = store.get(id)?.data || {};
  const fd = new FormData(form);
  const seasons = fd.getAll('seasons');
  const data = {
    ...prev,
    id,
    title: fd.get('title').trim(),
    cost: [Number(fd.get('c0')) || 0, Number(fd.get('c1')) || Number(fd.get('c0')) || 0],
    drive: Number(fd.get('drive')) || 0,
    energy: fd.get('energy'),
    leans: fd.get('leans'),
    seasons: seasons.length ? seasons : ['Any'],
    tags: fd.getAll('tags'),
    notes: fd.get('notes').trim(),
  };
  store.put('idea', id, data);
  closeModal();
  toast('Saved');
}

// Plan a date: one question per screen (what → when → summary).
function planDraft() {
  const m = state.modal;
  if (!m.draft) {
    const ex = m.dateId ? store.get(m.dateId)?.data : null;
    m.draft = {
      ideaId: ex?.ideaId || m.ideaId || '',
      title: ex && !ex.ideaId ? ex.title : '',
      when: ex?.when || m.when || (m.past ? todayISO() : nextWeekday(1)),
      time: ex?.time || '17:30',
      notes: ex?.notes || '',
    };
    m.step = ex ? 2 : m.draft.ideaId ? 1 : 0;
  }
  return m.draft;
}

function whenChoices(past) {
  const d = new Date();
  const iso = (off) => { const x = new Date(d); x.setDate(x.getDate() + off); return todayISO(x); };
  if (past) return [[iso(0), 'Today'], [iso(-1), 'Yesterday'], [iso(-2), '2 days ago']];
  const sat = nextWeekday(6);
  return [[iso(0), 'Tonight'], [iso(1), 'Tomorrow'], [nextWeekday(1), `Next Monday`], [sat, 'Saturday']];
}

MODALS.plan = () => {
  const m = state.modal;
  const dr = planDraft();
  const c = ctx();
  const dots = [0, 1, 2].map((i) => `<i class="${i <= m.step ? 'on' : ''}"></i>`).join('');
  const title = m.past ? 'Add a past date' : m.dateId ? 'Edit plan' : 'Plan a date';
  if (m.step === 0) {
    const rows = filtered(c).sort((a, b) => b.score - a.score);
    const favs = c.ideas.filter((i) => i.fav && !i.hidden);
    const top = rows.filter((r) => !r.idea.fav).slice(0, 5).map((r) => r.idea);
    const all = c.ideas.filter((i) => !i.hidden).sort((a, b) => a.title.localeCompare(b.title));
    const btn = (i) => `<button class="pick-row" data-act="planPick" data-id="${i.id}">${ideaEmoji(i)} <span>${esc(i.title)}</span><small>${costLabel(i)}</small></button>`;
    return `<div class="dots">${dots}</div><h2>${title}</h2><h3 class="q">What are you doing?</h3>
      ${favs.length ? `<h3>♥ Favorites</h3>${favs.map(btn).join('')}` : ''}
      ${top.length ? `<h3>Good fits right now</h3>${top.map(btn).join('')}` : ''}
      <details><summary class="link">See all ${all.length} ideas</summary>${all.map(btn).join('')}</details>
      <h3>Something else</h3>
      <div class="row"><input id="plan-other" placeholder="Type your own idea" value="${esc(dr.title)}" style="flex:1"><button class="btn small" data-act="planOther">Next</button></div>`;
  }
  const what = c.ideasById[dr.ideaId]?.title || dr.title;
  if (m.step === 1) {
    return `<div class="dots">${dots}</div><h2>${title}</h2>
      <p class="muted center">${esc(what)}</p>
      <h3 class="q">When?</h3>
      <div class="choices">${whenChoices(m.past).map(([v, l]) => `<button class="choice ${dr.when === v ? 'on' : ''}" data-act="planWhen" data-v="${v}">${l} <small class="muted">${prettyDate(v)}</small></button>`).join('')}</div>
      <label class="center">or pick a day <input type="date" id="plan-date" value="${dr.when}"></label>
      <h3 class="q">What time?</h3>
      <div class="chips center">${['17:30', '18:00', '19:00', '20:00'].map((t) => `<button class="chip ${dr.time === t ? 'on' : ''}" data-act="planTime" data-v="${t}">${fmtTime(t)}</button>`).join('')}
      <input type="time" id="plan-time" value="${dr.time}" style="width:auto"></div>
      <div class="row center"><button class="btn ghost" data-act="planStep" data-v="0">Back</button><button class="btn" data-act="planStep" data-v="2">Next</button></div>`;
  }
  const idea = c.ideasById[dr.ideaId];
  const day = state.weather?.days?.[dr.when];
  return `<div class="dots">${dots}</div><h2>${title}</h2>
    <section class="summary">
      <div class="sum-emoji">${idea ? ideaEmoji(idea) : '💕'}</div>
      <div class="hero-title">${esc(what)}</div>
      <p>📅 ${prettyDate(dr.when)} · ${fmtTime(dr.time)} <button class="link small" data-act="planStep" data-v="1">change</button></p>
      ${idea ? `<p class="small">💲 ${costLabel(idea)} · 🚗 ${driveLabel(idea)}</p>` : ''}
      ${day ? `<p class="small">${day.emoji} ${day.label}, ${day.hi}°/${day.lo}°${day.pop ? `, ${day.pop}% rain` : ''} · sunset ${day.sunset}</p>` : ''}
      ${day && badOutdoorDay(day) && idea?.tags?.includes('outdoors') ? '<p class="note">Weather looks rough for being outside. Maybe have a backup?</p>' : ''}
    </section>
    ${m.past ? '' : wearBlock(idea, day, dr.time)}
    <label>Notes<textarea id="plan-notes" rows="2" placeholder="Reservation, address, anything to remember…">${esc(dr.notes)}</textarea></label>
    <div class="row center"><button class="btn ghost" data-act="planStep" data-v="0">Change idea</button>
    <button class="btn" data-act="planSave">${m.past ? 'Next: how did it go?' : m.dateId ? 'Save changes' : 'Save plan 💕'}</button></div>`;
};

MODAL_AFTER.plan = () => {
  const dr = state.modal.draft;
  $('#plan-date')?.addEventListener('change', (e) => { dr.when = e.target.value; renderModal(); });
  $('#plan-time')?.addEventListener('change', (e) => { dr.time = e.target.value; renderModal(); });
  $('#plan-notes')?.addEventListener('input', (e) => { dr.notes = e.target.value; });
};

function savePlan() {
  const m = state.modal;
  const dr = m.draft;
  const c = ctx();
  const title = c.ideasById[dr.ideaId]?.title || dr.title;
  if (!title) { toast('Pick an idea or type one'); return; }
  const id = m.dateId || uid('d');
  const prev = store.get(id)?.data || {};
  store.put('date', id, {
    ...prev, ideaId: dr.ideaId || null, title, when: dr.when, time: dr.time, notes: (dr.notes || '').trim(),
    status: prev.status || 'planned', createdBy: prev.createdBy || store.me.name,
  });
  if (m.past) { openModal('log', { dateId: id }); return; }
  closeModal();
  state.tab = 'plans';
  render();
  toast('Planned! 💕');
}

MODALS.date = () => {
  const d = store.get(state.modal.id);
  if (!d) return '<p>That date was removed.</p>';
  const x = d.data;
  const rs = ratingsFor(d.id);
  const mine = rs.find((r) => r.by === store.me.name);
  const wx = x.status === 'planned' ? state.weather?.days?.[x.when] : null;
  const log = x.log;
  let body = '';
  if (x.status === 'planned') {
    body = `
      ${wx ? `<p>${wx.emoji} Forecast: ${wx.label}, ${wx.hi}°/${wx.lo}°${wx.pop ? `, ${wx.pop}% chance of rain` : ''}. Sunset ${wx.sunset}.</p>` : ''}
      ${wx && badOutdoorDay(wx) && ctx().ideasById[x.ideaId]?.tags?.includes('outdoors') ? `<p class="note">Weather looks rough for an outdoor date. Maybe have a backup?</p>` : ''}
      ${x.notes ? `<p>📝 ${esc(x.notes)}</p>` : ''}
      ${wearBlock(ctx().ideasById[x.ideaId], wx, x.time)}
      <div class="col">
      <a class="btn ghost center" href="${esc(gcalLink(d))}" target="_blank" rel="noopener">📅 Add to Google Calendar${partnerEmail() ? ` (invites ${esc(partnerName())})` : ''}</a>
      ${partnerEmail() ? '' : `<p class="muted small">Tip: once ${esc(partnerName())} adds their email in ⚙️ Settings, the calendar invite will include them automatically.</p>`}
      <button class="btn" data-act="logDate" data-id="${d.id}">We went! How did it go?</button>
      <button class="btn ghost" data-act="editPlan" data-id="${d.id}">Change plan</button>
      <button class="link danger" data-act="deleteDate" data-id="${d.id}">Cancel this date</button></div>`;
  } else {
    body = `
      <div class="meta big-meta">
        ${log?.weather ? `<span>${log.weather.emoji} ${esc(log.weather.label)}${log.weather.hi != null ? `, ${log.weather.hi}°` : ''}</span>` : ''}
        ${log?.season ? `<span>🍂 ${log.season}</span>` : ''}
        ${log?.durationMin ? `<span>⏱️ ${fmtDur(log.durationMin)}</span>` : ''}
        ${log?.spent ? `<span>💲${log.spent}</span>` : ''}
      </div>
      ${log?.happened ? `<p>📖 ${esc(log.happened)}</p>` : ''}
      ${rs.length >= 2 ? `<button class="btn" data-act="reveal" data-id="${d.id}">${(x.revealedBy || []).includes(store.me.name) ? 'See our ratings' : 'Reveal our ratings 🎁'}</button>`
        : mine ? `<p class="note">You've rated it. Waiting on ${esc(partnerName())}… no peeking 🙈</p>`
          : `<button class="btn" data-act="rate" data-id="${d.id}">Rate this date</button>`}
      <div class="row"><button class="btn ghost small" data-act="logDate" data-id="${d.id}">Edit details</button>
      ${mine && rs.length < 2 ? `<button class="btn ghost small" data-act="rate" data-id="${d.id}">Change my rating</button>` : ''}
      <button class="link danger" data-act="deleteDate" data-id="${d.id}">Delete</button></div>`;
  }
  return `<h2>${esc(x.title)}</h2><p class="muted">📅 ${prettyDate(x.when)}${x.time ? ` · ${esc(x.time)}` : ''}</p>${body}`;
};

function fmtDur(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h${mm ? ` ${mm}m` : ''}` : `${mm}m`;
}

const WX_CHOICES = [['Clear', '☀️'], ['Partly cloudy', '⛅'], ['Cloudy', '☁️'], ['Rain', '🌧️'], ['Snow', '❄️'], ['Fog', '🌫️'], ['Storms', '⛈️']];

MODALS.log = () => {
  const d = store.get(state.modal.dateId);
  const x = d.data;
  const log = x.log || {};
  const day = state.weather?.days?.[x.when];
  const wxLabel = log.weather?.label || (day ? (day.label === 'Mostly clear' ? 'Clear' : day.label === 'Drizzle' ? 'Rain' : day.label) : 'Clear');
  const hi = log.weather?.hi ?? day?.hi ?? '';
  return `<h2>How did it go? 📝</h2><p class="muted">${esc(x.title)} · ${prettyDate(x.when)}</p>
  <form data-form="saveLog" class="col">
    <div class="grid2">
      <label>Started<input type="time" name="start" value="${esc(log.start || x.time || '17:30')}"></label>
      <label>Ended<input type="time" name="end" value="${esc(log.end || '')}"></label>
    </div>
    <div class="grid2">
      <label>Weather<select name="wx">${WX_CHOICES.map(([l, e]) => `<option value="${l}" ${l === wxLabel ? 'selected' : ''}>${e} ${l}</option>`).join('')}</select></label>
      <label>Temp °F<input type="number" name="hi" inputmode="numeric" value="${hi}"></label>
    </div>
    <label>We spent $<input type="number" name="spent" min="0" inputmode="decimal" value="${esc(log.spent ?? '')}"></label>
    <label>What happened?<textarea name="happened" rows="3" placeholder="Where you went, funny moments, what you ordered…">${esc(log.happened || '')}</textarea></label>
    <button class="btn">Save${(x.status !== 'done') ? ' & rate it' : ''}</button>
  </form>`;
};

function saveLog(form) {
  const id = state.modal.dateId;
  const d = store.get(id);
  const fd = new FormData(form);
  const start = fd.get('start');
  const end = fd.get('end');
  let durationMin = null;
  if (start && end) {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    durationMin = ((h2 * 60 + m2) - (h1 * 60 + m1) + 1440) % 1440 || null;
  }
  const wxLabel = fd.get('wx');
  const wxEmoji = WX_CHOICES.find(([l]) => l === wxLabel)?.[1] || '🌡️';
  const hi = fd.get('hi') === '' ? null : Number(fd.get('hi'));
  const wasDone = d.data.status === 'done';
  const data = {
    ...d.data,
    status: 'done',
    log: {
      start, end, durationMin, spent: fd.get('spent') === '' ? null : Number(fd.get('spent')),
      happened: fd.get('happened').trim(),
      weather: { label: wxLabel, emoji: wxEmoji, hi },
      season: seasonOf(new Date(`${d.data.when}T12:00:00`)),
      loggedBy: store.me.name,
    },
  };
  store.put('date', id, data);
  if (!wasDone && !ratingsFor(id).some((r) => r.by === store.me.name)) openModal('rate', { dateId: id });
  else openModal('date', { id });
}

MODALS.rate = () => {
  const id = state.modal.dateId;
  const d = store.get(id);
  const prev = ratingsFor(id).find((r) => r.by === store.me.name) || { scores: {}, again: '', best: '', change: '' };
  return `<h2>Your rating 🤫</h2>
  <p class="muted">${esc(d.data.title)}. ${esc(partnerName())} won't see this until you've both rated.</p>
  <form data-form="saveRating" class="col">
    ${RATING_PARAMS.map((p) => `<div class="rate-row">
      <span>${p.emoji} ${p.label}</span>
      <div class="stars" data-k="${p.key}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="s ${prev.scores[p.key] >= v ? 'on' : ''}" data-act="star" data-k="${p.key}" data-v="${v}">★</button>`).join('')}</div>
      <input type="hidden" name="${p.key}" value="${prev.scores[p.key] || ''}">
    </div>`).join('')}
    <label>Do it again?</label>
    <div class="chips">${[['yes', '😍 Yes!'], ['maybe', '🤔 Maybe'], ['no', '🙅 Nah']].map(([v, l]) => `<label class="chip-check"><input type="radio" name="again" value="${v}" ${prev.again === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <label>Best part<textarea name="best" rows="2" placeholder="My favorite moment was…">${esc(prev.best)}</textarea></label>
    <label>One thing I'd change<textarea name="change" rows="2" placeholder="Next time let's…">${esc(prev.change)}</textarea></label>
    <button class="btn">Lock in my rating 🔒</button>
  </form>`;
};

function saveRating(form) {
  const fd = new FormData(form);
  const scores = {};
  for (const p of RATING_PARAMS) scores[p.key] = Number(fd.get(p.key)) || 0;
  if (!scores.overall) { toast('Give it an overall rating first'); return; }
  const dateId = state.modal.dateId;
  store.put('rating', `r_${dateId}_${store.me.name}`, {
    dateId, by: store.me.name, scores, again: fd.get('again') || 'maybe',
    best: fd.get('best').trim(), change: fd.get('change').trim(), at: new Date().toISOString(),
  });
  const both = ratingsFor(dateId).length >= 2;
  if (both) openModal('reveal', { id: dateId, stage: 'ready' });
  else { openModal('date', { id: dateId }); toast(`Locked in! We'll reveal once ${partnerName()} rates.`); }
}

MODALS.reveal = () => {
  const m = state.modal;
  const d = store.get(m.id);
  const rs = ratingsFor(m.id);
  if (rs.length < 2) return '<p>Waiting on both ratings.</p>';
  const meR = rs.find((r) => r.by === store.me.name) || rs[0];
  const them = rs.find((r) => r !== meR);
  if (m.stage === 'ready') {
    return `<div class="reveal-ready center"><div class="big">🎁</div><h2>Both ratings are in!</h2>
      <p>${esc(d.data.title)}</p><button class="btn big-btn" data-act="revealGo">Reveal</button></div>`;
  }
  if (m.stage === 'count') return `<div class="center countdown" id="countdown">3</div>`;
  const cmp = compareRatings(meR, them);
  const followUp = followUps(d, cmp);
  return `<div class="reveal">
    <div class="center"><div class="big">${cmp.verdict.emoji}</div><h2>${cmp.verdict.text}</h2>
    <p class="muted">${esc(d.data.title)} · ${cmp.overall.toFixed(1)} / 5 together</p></div>
    <div class="legend"><span class="me">■ ${esc(meR.by)}</span><span class="them">■ ${esc(them.by)}</span></div>
    ${cmp.rows.map((r) => `<div class="cmp-row"><div class="cmp-label">${r.emoji} ${r.label}</div>
      <div class="bar me"><i data-w="${r.a * 20}"></i><b>${r.a || '–'}</b></div>
      <div class="bar them"><i data-w="${r.b * 20}"></i><b>${r.b || '–'}</b></div></div>`).join('')}
    <div class="sync"><b>${cmp.sync}%</b> in sync. ${cmp.syncLine}</div>
    ${cmp.biggest ? `<p class="small">Biggest difference: <b>${cmp.biggest.label}</b> (${cmp.biggest.a} vs ${cmp.biggest.b}). Ask each other why!</p>` : ''}
    <p>${cmp.againLine}</p>
    ${[meR, them].filter((r) => r.best).map((r) => `<blockquote>💬 <b>${esc(r.by)}'s favorite part:</b> ${esc(r.best)}</blockquote>`).join('')}
    ${[meR, them].filter((r) => r.change).map((r) => `<blockquote>🔧 <b>${esc(r.by)} would change:</b> ${esc(r.change)}</blockquote>`).join('')}
    ${followUp}
  </div>`;
};
MODAL_AFTER.reveal = () => {
  if (state.modal.stage === 'count') {
    let n = 3;
    const t = setInterval(() => {
      n--;
      const el = $('#countdown');
      if (!el) { clearInterval(t); return; }
      if (navigator.vibrate) navigator.vibrate(15);
      if (n > 0) el.textContent = n;
      else { clearInterval(t); state.modal.stage = 'done'; renderModal(); markRevealed(state.modal.id); }
    }, 700);
  }
  if (state.modal.stage === 'done') {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.bar i').forEach((i, k) => { setTimeout(() => { i.style.width = `${i.dataset.w}%`; }, k * 120); });
    }));
  }
};

function markRevealed(id) {
  const d = store.get(id);
  const by = d.data.revealedBy || [];
  if (!by.includes(store.me.name)) {
    const data = { ...d.data, revealedBy: [...by, store.me.name] };
    // If you both want to go again, add it to favorites.
    const rs = ratingsFor(id);
    if (rs.length >= 2 && rs.every((r) => r.again === 'yes') && d.data.ideaId) {
      const idea = store.get(d.data.ideaId);
      if (idea && !idea.data.fav) store.put('idea', idea.id, { ...idea.data, fav: true });
    }
    store.put('date', id, data);
  }
}

function followUps(d, cmp) {
  const c = ctx();
  const idea = c.ideasById[d.data.ideaId];
  const tips = [];
  const log = d.data.log || {};
  if (cmp.overall >= 4 && idea) tips.push(`This one's a keeper. ${idea.fav ? 'It\'s in your favorites.' : ''}`);
  if (log.spent != null && log.spent > 50 && cmp.rows.find((r) => r.key === 'value')) {
    const v = cmp.rows.find((r) => r.key === 'value');
    if ((v.a + v.b) / 2 < 3.5) tips.push(`You spent $${log.spent} and didn't feel it was worth it. Look for a cheaper version next time.`);
  }
  if (log.durationMin && log.durationMin < 90 && cmp.overall >= 4) tips.push('Short and sweet worked. Easy pick for a tired Monday.');
  if (log.weather && ['Rain', 'Snow', 'Storms'].includes(log.weather.label) && cmp.overall < 3.5 && idea?.tags?.includes('outdoors')) {
    tips.push('Bad weather hurt this one. The app will steer away from outdoor ideas on days like that.');
  }
  let similar = [];
  if (idea && cmp.overall >= 3.5) {
    similar = c.ideas
      .filter((i) => i.id !== idea.id && !i.hidden && !c.triedIds.has(i.id) && i.tags?.some((t) => idea.tags.includes(t)))
      .map((i) => ({ i, s: scoreIdea(i, c).score }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.i);
  }
  if (!tips.length && !similar.length) return '';
  return `<section class="followup"><h3>Next time 🔮</h3>
    ${tips.map((t) => `<p>• ${esc(t)}</p>`).join('')}
    ${similar.length ? `<p>Since you liked this, try:</p>${similar.map((i) => `<button class="btn ghost small block" data-act="planIdea" data-id="${i.id}">${esc(i.title)}</button>`).join('')}` : ''}
  </section>`;
}

function wearBlock(idea, day, time) {
  const tips = wearTips(idea, day, time);
  if (!tips.length) return '';
  return `<div class="wear-box"><b>What to wear & bring</b><div class="wear">${tips.map(([e, t]) => `<span>${e} ${esc(t)}</span>`).join('')}</div></div>`;
}

function partnerEmail() {
  return (couple().emails || {})[partnerName()] || '';
}

function saveArea(form) {
  const c = store.get('couple')?.data || couple();
  store.put('couple', 'couple', { ...c, searchArea: form.area.value.trim() });
  toast('Saved');
  renderModal();
}

// ---------- Find new dates (prefilled Google searches) ----------

const TAG_WORDS = {
  burgers: 'burgers', chinese: 'chinese food', steak: 'steakhouse', greek: 'greek', diner: 'diner', treats: 'dessert',
  'cook-at-home': 'cooking class', picnic: 'picnic spot', outdoors: 'outdoor', walk: 'walking trail', indoors: 'indoor',
  'at-home': 'at home', show: 'live show', holiday: 'holiday lights', active: 'active', games: 'arcade OR bowling',
  drive: 'scenic drive', 'day-trip': 'day trip', museum: 'museum',
};
const FOOD = ['burgers', 'chinese', 'steak', 'greek', 'diner', 'treats'];

function findSearches() {
  const c = couple();
  const area = c.searchArea ? `"${c.searchArea}"` : 'near me';
  const f = state.filters;
  const season = seasonOf().toLowerCase();
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const minus = f.exclude.map((t) => TAG_WORDS[t]).filter(Boolean).flatMap((w) => w.split(' OR ')).map((w) => `-${w.split(' ')[0]}`).join(' ');
  const foods = f.include.filter((t) => FOOD.includes(t)).map((t) => TAG_WORDS[t]);
  const acts = f.include.filter((t) => !FOOD.includes(t)).map((t) => TAG_WORDS[t]);
  const cheap = f.budget !== 'any' && f.budget <= 30 ? '(free OR cheap OR "under $20")' : '';
  const energy = f.energy.length === 1 ? { Low: 'relaxing', Med: '', High: 'active OR adventurous' }[f.energy[0]] : '';
  const or = (xs) => (xs.length > 1 ? `(${xs.join(' OR ')})` : xs[0] || '');
  return [
    { emoji: '🎟️', label: 'Events happening now', q: `("things to do" OR events OR festival) ${area} "${month}" -jobs -hiring ${minus}` },
    { emoji: '🍽️', label: foods.length ? `Restaurants: ${foods.join(', ')}` : 'Date-night restaurants', q: `${or(foods.length ? foods : ['restaurant'])} "date night" ${area} -chain ${cheap} ${minus}` },
    { emoji: '🗺️', label: acts.length ? `Things to do: ${acts.join(', ')}` : `${seasonOf()} date ideas`, q: `${or(acts.length ? acts : [`${season} date ideas`])} ${energy ? `(${energy})` : ''} ${area} ${cheap} ${minus}` },
    { emoji: '💬', label: 'What locals recommend (Reddit)', q: `site:reddit.com ("date night" OR "date ideas") ${area} ${minus}` },
    { emoji: '📅', label: 'Event listings', q: `(site:eventbrite.com OR site:allevents.in) ${area} ${season}` },
    { emoji: '💸', label: 'Free or cheap dates', q: `(free OR cheap) "date ideas" ${area} ${season} ${minus}` },
  ].map((x) => ({ ...x, q: x.q.replace(/\s+/g, ' ').trim() }));
}

MODALS.find = () => {
  const n = activeFilterCount(state.filters);
  return `<h2>Find new dates 🔎</h2>
  <p class="muted">These open Google with a search built from your filters${n ? ` (${esc(filterSummary())})` : ''}. Find something good? Come back and tap <b>Add it</b>.</p>
  <div class="col">${findSearches().map((x) => `
    <a class="find-link" href="https://www.google.com/search?q=${encodeURIComponent(x.q)}" target="_blank" rel="noopener">
      <span class="find-e">${x.emoji}</span><span><b>${esc(x.label)}</b><code>${esc(x.q)}</code></span>
    </a>`).join('')}</div>
  <div class="row"><button class="btn" data-act="newIdea">+ Add it</button>
  ${couple().searchArea ? '' : '<span class="muted small">Searching "near me". Set a town in ⚙️ Settings for better results.</span>'}</div>`;
};

function saveEmail(form) {
  const email = form.email.value.trim();
  const c = store.get('couple')?.data || couple();
  store.put('couple', 'couple', { ...c, emails: { ...(c.emails || {}), [store.me.name]: email } });
  toast(email ? 'Email saved' : 'Email removed');
  renderModal();
}

// Opens Google Calendar with everything filled in. Nothing is sent until you tap Save there.
function gcalLink(d) {
  const x = d.data;
  const c = ctx();
  const idea = c.ideasById[x.ideaId];
  const [y, m, dd] = (x.when || todayISO()).split('-').map(Number);
  const [hh, mm] = (x.time || '18:00').split(':').map(Number);
  const start = new Date(y, m - 1, dd, hh, mm);
  const hours = idea?.tags?.includes('day-trip') ? 6 : idea?.special ? 4 : 3;
  const end = new Date(start.getTime() + hours * 3600000);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (t) => `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
  const day = state.weather?.days?.[x.when];
  const lines = [
    '💕 Date night!',
    idea ? `💲 About ${costLabel(idea)} · 🚗 ${driveLabel(idea)}` : '',
    day ? `${day.emoji} Forecast: ${day.label}, ${day.hi}°/${day.lo}°${day.pop ? `, ${day.pop}% rain` : ''}` : '',
    x.notes ? `📝 ${x.notes}` : '',
    ...wearTips(idea, day, x.time).map(([e, t]) => `${e} ${t}`),
    '',
    'Planned with Date Night',
  ].filter((l, i, a) => l || (i && a[i - 1]));
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Date night: ${x.title}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: lines.join('\n'),
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (partnerEmail()) p.set('add', partnerEmail());
  return `https://calendar.google.com/calendar/render?${p}`;
}

MODALS.settings = () => {
  const c = couple();
  const s = store.status;
  return `<h2>Settings</h2>
  <p>You're <b>${esc(store.me.name)}</b>, sharing with <b>${esc(partnerName())}</b>.</p>
  <div class="col">
    <button class="btn" data-act="openInvite">Invite ${esc(partnerName())} 💌</button>
    <button class="btn ghost" data-act="openInstall">Add to home screen 📲</button>
  </div>
  <h3>Area for "Find new dates" searches</h3>
  <form data-form="saveArea" class="row">
    <input name="area" placeholder="Leave blank to use 'near me'" value="${esc(c.searchArea || '')}" style="flex:1">
    <button class="btn small">Save</button>
  </form>
  <p class="muted small">A town or city, like "Springfield, IL". Stored privately in your account.</p>
  <h3>Your email (for calendar invites)</h3>
  <form data-form="saveEmail" class="row">
    <input type="email" name="email" placeholder="you@example.com" value="${esc((c.emails || {})[store.me.name] || '')}" style="flex:1">
    <button class="btn small">Save</button>
  </form>
  <p class="muted small">${partnerEmail() ? `✅ ${esc(partnerName())}'s email is set, so invites will include them.` : `${esc(partnerName())} hasn't added an email yet.`} Emails are stored privately in your account.</p>
  <h3>Sync</h3>
  ${store.remoteEnabled()
    ? `<p class="small">${s.error ? `⚠️ ${esc(s.error)}` : s.lastSync ? `✅ Last synced ${s.lastSync.toLocaleTimeString()}` : 'Not synced yet'}</p>
       <button class="btn ghost small" data-act="syncNow">Sync now</button>`
    : `<p class="note">Sharing isn't switched on yet, so data stays on this phone.</p>`}
  <h3>Home base (for weather)</h3>
  <p class="small">${c.home ? 'Set ✓' : 'Not set yet. Weather tips are off.'}</p>
  <button class="btn ghost small" data-act="useLocation">Use my current location</button>
  <h3>Couple code</h3>
  <p class="small"><code>${esc(store.me.couple)}</code></p>
  <details><summary class="small muted">Testing & reset</summary>
    <div class="col">
      <button class="btn ghost small" data-act="switchPerson">Switch to ${esc(partnerName())} on this phone</button>
      <button class="link danger" data-act="signOut">Leave on this phone</button>
    </div>
  </details>
  <p class="muted small">Date Night v1</p>`;
};

// ---------- actions ----------

const ACTIONS = {
  tab: (el) => { state.tab = el.dataset.v; localStorage.setItem('dn.tab', state.tab); closeModal(); render(); window.scrollTo(0, 0); },
  closeModal,
  planPick: (el) => { const m = state.modal; m.draft.ideaId = el.dataset.id; m.draft.title = ''; m.step = 1; renderModal(); },
  planOther: () => { const v = $('#plan-other').value.trim(); if (!v) { toast('Type an idea first'); return; } const m = state.modal; m.draft.ideaId = ''; m.draft.title = v; m.step = 1; renderModal(); },
  planWhen: (el) => { state.modal.draft.when = el.dataset.v; renderModal(); },
  planTime: (el) => { state.modal.draft.time = el.dataset.v; renderModal(); },
  planStep: (el) => { state.modal.step = Number(el.dataset.v); renderModal(); },
  planSave: () => savePlan(),
  pickMode: (el) => { state.pickMode = el.dataset.v; render(); },
  openSettings: () => openModal('settings'),
  openInstall: () => openModal('install'),
  openFind: () => openModal('find'),
  openInvite: () => openModal('invite'),
  dismissInstall: () => { localStorage.setItem('dn.installDismissed', '1'); render(); },
  nativeInstall: async () => { state.installPrompt?.prompt(); state.installPrompt = null; closeModal(); },
  toggleFilters: () => { state.filtersOpen = !state.filtersOpen; render(); },
  resetFilters: () => { state.filters = { ...DEFAULT_FILTERS, energy: [], include: [], exclude: [] }; saveFilters(); render(); },
  fSet: (el) => { const v = el.dataset.v; state.filters[el.dataset.k] = v === 'any' ? 'any' : Number(v); saveFilters(); render(); },
  fToggle: (el) => {
    const arr = state.filters[el.dataset.k];
    const v = el.dataset.v;
    state.filters[el.dataset.k] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    saveFilters(); render();
  },
  fTag: (el) => {
    const k = el.dataset.k;
    const other = k === 'include' ? 'exclude' : 'include';
    const v = el.dataset.v;
    const arr = state.filters[k];
    state.filters[k] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    state.filters[other] = state.filters[other].filter((x) => x !== v);
    saveFilters(); render();
  },
  fBool: (el) => { state.filters[el.dataset.k] = !state.filters[el.dataset.k]; saveFilters(); render(); },
  sort: () => { state.sort = state.sort === 'best' ? 'az' : 'best'; render(); },
  toggleTried: (el) => {
    const it = store.get(el.dataset.id);
    const c = ctx();
    const loggedTried = c.history.triedIds.has(it.id);
    if (loggedTried && !it.data.tried) { toast('Already in your date history'); return; }
    store.put('idea', it.id, { ...it.data, tried: !it.data.tried });
  },
  toggleFav: (el) => { const it = store.get(el.dataset.id); store.put('idea', it.id, { ...it.data, fav: !it.data.fav }); },
  editIdea: (el) => openModal('idea', { id: el.dataset.id }),
  newIdea: () => openModal('idea', { id: null }),
  hideIdea: (el) => { const it = store.get(el.dataset.id); store.put('idea', it.id, { ...it.data, hidden: true }); closeModal(); toast('Removed'); },
  planIdea: (el) => openModal('plan', { ideaId: el.dataset.id, when: el.dataset.when }),
  logUnplanned: () => openModal('plan', { past: true, when: todayISO() }),
  editPlan: (el) => openModal('plan', { dateId: el.dataset.id }),
  openDate: (el) => openModal('date', { id: el.dataset.id }),
  logDate: (el) => openModal('log', { dateId: el.dataset.id }),
  deleteDate: (el) => {
    if (!confirm('Delete this date?')) return;
    store.remove(el.dataset.id);
    for (const r of store.list('rating')) if (r.data.dateId === el.dataset.id) store.remove(r.id);
    closeModal();
  },
  rate: (el) => openModal('rate', { dateId: el.dataset.id }),
  star: (el) => {
    const row = el.closest('.rate-row');
    const v = Number(el.dataset.v);
    row.querySelector('input').value = v;
    row.querySelectorAll('.s').forEach((s) => s.classList.toggle('on', Number(s.dataset.v) <= v));
    if (navigator.vibrate) navigator.vibrate(5);
  },
  reveal: (el) => {
    const d = store.get(el.dataset.id);
    openModal('reveal', { id: el.dataset.id, stage: (d.data.revealedBy || []).includes(store.me.name) ? 'done' : 'ready' });
  },
  revealGo: () => { state.modal.stage = 'count'; renderModal(); },
  spin,
  reshuffle: () => { state.wheel.ids = []; state.wheel.result = null; render(); },
  decideSel: () => {},
  decidePair: () => {
    const rows = filtered();
    if (rows.length < 2) { toast('Not enough ideas match your filters'); return; }
    const [a, b] = weightedSample(rows, 2, (r) => r.score);
    state.decide = { ...state.decide, a: a.idea.id, b: b.idea.id, result: null };
    render();
  },
  decideRun,
  decideReset: () => { state.decide = { ...state.decide, a: '', b: '', result: null }; render(); },
  decideWeighted: (el) => { state.decide.weighted = el.checked; },
  setupMode: (el) => { state.setup.mode = el.dataset.v || null; render(); },
  joinAs: (el) => joinAs(el.dataset.v),
  shareInvite: async () => {
    const url = inviteLink();
    if (navigator.share) {
      try { await navigator.share({ title: 'Date Night 💕', text: `Join our Date Night app, ${partnerName()}!`, url }); } catch { /* cancelled */ }
    } else ACTIONS.copyInvite();
  },
  copyInvite: async () => {
    try { await navigator.clipboard.writeText(inviteLink()); toast('Link copied'); } catch { toast('Copy failed. Long-press the link to copy.'); }
  },
  syncNow: async () => { await store.sync(); renderModal(); toast(store.status.error ? 'Sync failed' : 'Synced'); },
  useLocation: () => {
    if (!navigator.geolocation) { toast('Location not available'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = store.get('couple');
      const h = { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) };
      store.put('couple', 'couple', { ...(c?.data || {}), names: couple().names, home: h });
      loadWeather();
      closeModal();
      toast('Home base updated');
    }, () => toast('Could not get your location'));
  },
  switchPerson: () => { store.setMe({ ...store.me, name: partnerName() }); closeModal(); render(); toast(`Now using the app as ${store.me.name}`); },
  signOut: () => { if (confirm('Remove Date Night data from this phone? Shared data stays safe online.')) { store.resetLocal(); closeModal(); render(); } },
};

document.addEventListener('click', (e) => {
  if (e.target === modalEl) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = ACTIONS[el.dataset.act];
  if (!act) return;
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  e.preventDefault();
  act(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('select[data-act=decideSel]')) { state.decide[el.dataset.k] = el.value; render(); }
  if (el.matches('input[data-act=decideWeighted]')) state.decide.weighted = el.checked;
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('.decide-text')) {
    state.decide[el.dataset.k] = el.value.trim();
    const btn = document.querySelector('[data-act=decideRun]');
    if (btn) btn.disabled = !(state.decide.a && state.decide.b);
  }
});

Object.assign(ACTIONS, tonight.actions);

const FORMS = { startCouple, joinCode, saveIdea, saveLog, saveRating, saveEmail, saveArea };
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  FORMS[f.dataset.form]?.(f);
});

// ---------- boot ----------

async function loadWeather() {
  try {
    const h = home();
    if (!h) return;
    state.weather = await fetchWeather(h.lat, h.lon);
    render();
  } catch { /* offline is fine */ }
}

store.onChange(() => {
  render();
  // Live-update read-only modals when the partner's data arrives.
  if (state.modal && ['date', 'settings'].includes(state.modal.type)) renderModal();
  if (state.modal?.type === 'reveal' && state.modal.stage === 'ready') renderModal();
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) store.sync(); });
setInterval(() => { if (!document.hidden) store.sync(); }, 20000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
renderModal();
loadWeather();
store.sync();

// Exposed for debugging in the browser console.
window.dn = { store, state, inSeason, describeCode };
