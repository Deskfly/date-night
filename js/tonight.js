// "Tonight" tab: each partner checks in privately, swipes ideas, then sees matches.
import * as store from './store.js';
import {
  todayISO, costLabel, driveLabel, combineCheckins, tonightDeck, ideaEmoji, moodLine, wearTips,
  ENERGY, VIBES, TIME_OPTS, BUDGET_OPTS, NOVELTY_OPTS, isOutdoor, weatherHint,
} from './logic.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHECK_STEPS = [
  { key: 'energy', q: 'How much energy do you have tonight?', opts: [[1, `${ENERGY[1].emoji} Wiped`], [2, `${ENERGY[2].emoji} Okay`], [3, `${ENERGY[3].emoji} Excited`]] },
  { key: 'time', q: 'How much time do you have?', opts: TIME_OPTS },
  { key: 'budget', q: "What's the budget tonight?", opts: BUDGET_OPTS },
  { key: 'vibes', q: 'What sounds good? Pick any.', opts: VIBES, multi: true },
  { key: 'novelty', q: 'Something new, or an old favorite?', opts: NOVELTY_OPTS },
];

export function createTonight(api) {
  // api: { ctx, partnerName, render, openModal, toast, goDecide }
  const local = { step: 0, draft: { vibes: [] }, prevId: null, anim: null };

  const today = () => todayISO();
  const idFor = (name) => `c_${today()}_${name}`;
  const mine = () => store.get(idFor(store.me.name))?.data || null;
  const theirs = () => store.get(idFor(api.partnerName()))?.data || null;

  function save(data) {
    store.put('checkin', idFor(store.me.name), { date: today(), by: store.me.name, ...data });
  }

  // ---------- views ----------

  function view() {
    const me = mine();
    const them = theirs();
    if (!me) return viewCheckin(them);
    if (!me.done) return viewSwipe(me, them);
    if (!them?.done) return viewWaiting(me, them);
    return viewMatches(me, them);
  }

  function viewCheckin(them) {
    const s = CHECK_STEPS[local.step];
    const d = local.draft;
    const dots = CHECK_STEPS.map((_, i) => `<i class="${i <= local.step ? 'on' : ''}"></i>`).join('');
    return `<section class="tonight">
      <div class="dots">${dots}</div>
      ${local.step === 0 ? `<h2>Tonight 🌙</h2><p class="muted">Check in privately. ${esc(api.partnerName())} ${them ? 'already checked in' : "will too"}, then you'll swipe and see what matches.</p>` : ''}
      <h3 class="q">${s.q}</h3>
      <div class="choices ${s.multi ? 'multi' : ''}">
        ${s.opts.map(([v, l]) => {
          const on = s.multi ? d.vibes.includes(v) : d[s.key] === v;
          return `<button class="choice ${on ? 'on' : ''}" data-act="tnPick" data-k="${s.key}" data-v="${v}">${l}</button>`;
        }).join('')}
      </div>
      <div class="row center">
        ${local.step > 0 ? '<button class="btn ghost" data-act="tnBack">Back</button>' : ''}
        ${s.multi ? `<button class="btn" data-act="tnNext">${d.vibes.length ? 'Next' : 'Skip'}</button>` : ''}
      </div>
    </section>`;
  }

  function buildDeck(me, them) {
    const c = api.ctx();
    const t = combineCheckins([me, them?.date === today() ? them : null]);
    let deck = tonightDeck(c, t, 10);
    // If my partner already swiped, put the ideas they liked (that fit both of us) in my deck too.
    if (them?.likes?.length) {
      const fit = new Set(tonightDeck(c, t, 999).map((x) => x.idea.id));
      const extra = them.likes.filter((id) => fit.has(id) && !deck.some((x) => x.idea.id === id));
      deck = [...extra.map((id) => ({ idea: c.ideasById[id], why: [] })), ...deck].slice(0, 12);
    }
    return deck.map((x) => x.idea.id);
  }

  function viewSwipe(me, them) {
    const c = api.ctx();
    if (!me.deck) {
      // Build once and keep it, so reloading doesn't reshuffle.
      setTimeout(() => save({ ...me, deck: buildDeck(me, them), likes: [], passes: [] }), 0);
      return '<p class="empty">Shuffling ideas…</p>';
    }
    const round2 = !!me.deck2;
    const seen = new Set([...(me.likes || []), ...(round2 ? me.passes2 || [] : me.passes || [])]);
    const deck = round2 ? me.deck2 : me.deck;
    const left = deck.filter((id) => !seen.has(id) && c.ideasById[id]);
    if (!me.deck.length) {
      return `<section class="tonight center"><div class="big">🤔</div><h2>Nothing fits all of that</h2>
        <p class="muted">Try a bigger budget, more time, or "Either" for new vs. favorite.</p>
        <button class="btn" data-act="tnRedo">Change my check-in</button></section>`;
    }
    // Lots of "no" in a row? Offer a different way in.
    const streak = trailingPasses(me);
    if (!round2 && streak >= 5 && !me.fatigueOffered && left.length) {
      return `<section class="tonight center">
        <div class="big">😅</div><h2>Tough crowd tonight?</h2>
        <p class="muted">That's ${streak} nos in a row. Totally fine. Want to try it a different way?</p>
        <div class="col">
          <button class="btn" data-act="tnFatigue" data-v="pick">🎲 Just pick one for me</button>
          <button class="btn ghost" data-act="tnFatigue" data-v="again">👀 Give the ones I skipped a second look</button>
          <button class="btn ghost" data-act="tnFatigue" data-v="keep">Keep swiping</button>
          <button class="link" data-act="tnRedo">Change my check-in</button>
        </div></section>`;
    }
    if (!left.length) {
      // Nothing liked? Before giving up, bring back a few skipped ideas with a fresh angle.
      if (!round2 && !(me.likes || []).length && (me.passes || []).length) {
        setTimeout(() => save({ ...me, deck2: secondLookDeck(me, them) }), 0);
        return '<p class="empty">Hmm, let\'s take a second look…</p>';
      }
      setTimeout(() => save({ ...me, done: true }), 0);
      return '<p class="empty">Locking in your picks…</p>';
    }
    const idea = c.ideasById[left[0]];
    const prev = local.prevId ? c.ideasById[local.prevId] : null;
    const n = deck.length - left.length + 1;
    const reframe = round2 ? reframeFor(idea) : '';
    const day = c.day;
    const tips = wearTips(idea, day).slice(0, 3);
    const rated = c.history.ideaAvg[idea.id];
    const tried = c.triedIds.has(idea.id);
    const diff = (a, b) => (prev && a !== b ? 'changed' : '');
    const tone = idea.tags?.includes('at-home') ? 'home' : isOutdoor(idea) ? 'out' : 'in';
    return `<section class="tonight">
      ${round2 ? `<div class="note center">👀 <b>Second look.</b> Sometimes an idea clicks after you've seen the others.</div>` : ''}
      <div class="deck-head"><span>${n} of ${deck.length}</span><span class="muted small">❤️ = I'd do it tonight</span></div>
      <div class="deck">
        <article class="swipe-card tone-${tone}" id="swipe-card">
          <div class="stamp yes">YES</div><div class="stamp no">NOPE</div>
          <div class="sc-emoji">${ideaEmoji(idea)}</div>
          <div class="sc-body">
            <div class="sc-title">${esc(idea.title)}</div>
            <div class="sc-chips">
              <span class="${diff(costLabel(idea), prev && costLabel(prev))}">💲 ${costLabel(idea)}</span>
              <span class="${diff(driveLabel(idea), prev && driveLabel(prev))}">🚗 ${driveLabel(idea)}</span>
              <span class="${diff(idea.energy, prev?.energy)}">${{ Low: '😌 Chill', Med: '🙂 Some walking', High: '⚡ Active' }[idea.energy]}</span>
              <span class="${diff(tone, prev && (prev.tags?.includes('at-home') ? 'home' : isOutdoor(prev) ? 'out' : 'in'))}">${tone === 'home' ? '🛋️ At home' : tone === 'out' ? `🌳 Outside${weatherHint(day)}` : '🏠 Indoors'}</span>
            </div>
            ${reframe ? `<div class="sc-reframe">💡 ${esc(reframe)}</div>` : ''}
            <div class="sc-note">${tried ? (rated ? `⭐ You rated it ${rated.toFixed(1)}` : '🔁 You’ve done this') : '✨ New to you'}</div>
            ${tips.length ? `<div class="sc-wear">${tips.map(([e, t]) => `<span>${e} ${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
        </article>
      </div>
      <div class="swipe-btns">
        <button class="round no" data-act="tnSwipe" data-v="no" aria-label="Not tonight">✕</button>
        <button class="round yes" data-act="tnSwipe" data-v="yes" aria-label="Yes">❤</button>
      </div>
      <p class="center muted small">Swipe right for yes, left for no. ${esc(api.partnerName())} won't see your picks until you're both done.</p>
    </section>`;
  }

  function viewWaiting(me, them) {
    return `<section class="tonight center">
      <div class="big">🔒</div><h2>Your picks are locked in</h2>
      <p>You liked <b>${(me.likes || []).length}</b> idea${(me.likes || []).length === 1 ? '' : 's'}.</p>
      <p class="muted">${them ? `${esc(api.partnerName())} is still swiping…` : `Waiting for ${esc(api.partnerName())} to check in.`} We'll show your matches the moment they're done.</p>
      <button class="link" data-act="tnRedo">Redo my picks</button>
    </section>`;
  }

  function viewMatches(me, them) {
    const c = api.ctx();
    const t = combineCheckins([me, them]);
    const celebrateKey = `dn.cel.${today()}`;
    if (t.bothNew && !localStorage.getItem(celebrateKey)) {
      return `<section class="celebrate">
        <div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${2 + ((i * 7) % 10) / 6}s;animation-delay:-${((i * 13) % 20) / 10}s">${['✨', '🎉', '💖', '⭐', '🎊'][i % 5]}</i>`).join('')}</div>
        <div class="big">✨</div>
        <h2>You're both up for something new!</h2>
        <p>Same page, same spark. Most of the best stories start with "we'd never done that before." Go make one tonight.</p>
        <button class="btn big-btn" data-act="tnCelebrated">Show us 💫</button>
      </section>`;
    }
    const likesA = new Set(me.likes || []);
    const both = (them.likes || []).filter((id) => likesA.has(id) && c.ideasById[id]);
    const ranked = both.map((id) => ({ idea: c.ideasById[id], s: scoreOf(c, id) })).sort((a, b) => b.s - a.s);
    const mood = moodLine([me, them]);
    if (!ranked.length) {
      const topA = (me.likes || []).find((id) => c.ideasById[id]);
      const topB = (them.likes || []).find((id) => c.ideasById[id]);
      return `<section class="tonight center">
        <div class="big">🤝</div><h2>No exact match tonight</h2>
        ${mood ? `<p class="muted">${esc(mood)}</p>` : ''}
        ${topA && topB ? `<p>${esc(store.me.name)} liked <b>${esc(c.ideasById[topA].title)}</b>.<br>${esc(api.partnerName())} liked <b>${esc(c.ideasById[topB].title)}</b>.</p>
          <button class="btn" data-act="tnCompromise" data-a="${topA}" data-b="${topB}">Let fate decide ⚖️</button>`
          : `<p>One of you passed on everything. Maybe a cozy night in? 🛋️</p>`}
        <div><button class="link" data-act="tnRedoBoth">Start tonight over</button></div>
      </section>`;
    }
    const top = ranked[0].idea;
    const tips = wearTips(top, c.day);
    return `<section class="tonight">
      <div class="center"><div class="big">💞</div><h2>It's a match!</h2>${mood ? `<p class="muted">${esc(mood)}</p>` : ''}</div>
      <section class="hero pop">
        <div class="hero-label">You both said yes to</div>
        <div class="hero-title">${ideaEmoji(top)} ${esc(top.title)}</div>
        <div class="meta"><span>💲${costLabel(top)}</span><span>🚗 ${driveLabel(top)}</span><span>${top.energy}</span></div>
        ${tips.length ? `<div class="wear">${tips.map(([e, x]) => `<span>${e} ${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="row"><button class="btn" data-act="planIdea" data-id="${top.id}" data-when="${today()}">Plan it for tonight</button></div>
      </section>
      ${ranked.length > 1 ? `<h3>Also a match</h3>${ranked.slice(1).map((r) => `<button class="card block-card" data-act="planIdea" data-id="${r.idea.id}" data-when="${today()}">${ideaEmoji(r.idea)} ${esc(r.idea.title)}</button>`).join('')}` : ''}
      <div class="center"><button class="link" data-act="tnRedoBoth">Start tonight over</button></div>
    </section>`;
  }

  function trailingPasses(me) {
    const log = me.log || [];
    let n = 0;
    for (let i = log.length - 1; i >= 0 && !log[i][1]; i--) n++;
    return n;
  }

  // Skipped ideas worth another look: ones your partner liked first, then the best fits.
  function secondLookDeck(me, them) {
    const c = api.ctx();
    const theyLiked = new Set(them?.likes || []);
    const t = combineCheckins([me, them]);
    const scored = Object.fromEntries(tonightDeck(c, t, 999).map((x) => [x.idea.id, x.score]));
    return (me.passes || [])
      .filter((id) => c.ideasById[id])
      .sort((a, b) => (theyLiked.has(b) - theyLiked.has(a)) || ((scored[b] || 0) - (scored[a] || 0)))
      .slice(0, 4);
  }

  // A small new angle on an idea, so a second look isn't just the same card again.
  function reframeFor(idea) {
    const t = idea.tags || [];
    if (t.includes('walk')) return 'Do the short version: 20 minutes, then food.';
    if (t.includes('at-home')) return 'Phones away, candles on. Make it feel like an event.';
    if (t.includes('show')) return 'Pick the snacks together. That part counts too.';
    if (t.includes('drive')) return "Each of you picks 3 songs. No skipping allowed.";
    if (t.includes('games')) return 'Loser buys dessert.';
    if (t.some((x) => ['burgers', 'chinese', 'steak', 'greek', 'diner'].includes(x))) return 'Try one thing on the menu neither of you has had.';
    if (idea.special) return 'Big one. Save it for a night you want to remember.';
    return 'Same idea, new spot. Swap where you go.';
  }

  function scoreOf(c, id) {
    return tonightDeck(c, combineCheckins([mine(), theirs()]), 999).find((x) => x.idea.id === id)?.score || 0.5;
  }

  // ---------- actions ----------

  const actions = {
    tnPick: (el) => {
      const s = CHECK_STEPS[local.step];
      const raw = el.dataset.v;
      const v = Number.isNaN(Number(raw)) ? raw : Number(raw);
      if (s.multi) {
        const arr = local.draft.vibes;
        local.draft.vibes = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
        api.render();
        return;
      }
      local.draft[s.key] = v;
      if (navigator.vibrate) navigator.vibrate(8);
      next();
    },
    tnNext: () => next(),
    tnBack: () => { local.step = Math.max(0, local.step - 1); api.render(); },
    tnSwipe: (el) => swipe(el.dataset.v === 'yes'),
    tnRedo: () => { store.remove(idFor(store.me.name)); local.step = 0; local.draft = { vibes: [] }; api.render(); },
    tnRedoBoth: () => {
      if (!confirm("Start tonight over for both of you?")) return;
      store.remove(idFor(store.me.name));
      store.remove(idFor(api.partnerName()));
      local.step = 0; local.draft = { vibes: [] };
      api.render();
    },
    tnFatigue: (el) => {
      const me = mine();
      const v = el.dataset.v;
      if (v === 'keep') { save({ ...me, fatigueOffered: true }); return; }
      if (v === 'again') { save({ ...me, fatigueOffered: true, deck2: secondLookDeck(me, theirs()) }); return; }
      // "Just pick one": choose the best remaining idea and count it as a yes.
      const c = api.ctx();
      const seen = new Set([...(me.likes || []), ...(me.passes || [])]);
      const t = combineCheckins([me, theirs()]);
      const pool = tonightDeck(c, t, 999).filter((x) => me.deck.includes(x.idea.id) && !seen.has(x.idea.id));
      const pick = pool[0]?.idea.id || me.deck.find((id) => !seen.has(id));
      api.toast?.(`Picked for you: ${c.ideasById[pick]?.title || ''}`);
      save({ ...me, fatigueOffered: true, likes: [...(me.likes || []), pick], done: true });
    },
    tnCelebrated: () => { localStorage.setItem(`dn.cel.${today()}`, '1'); api.render(); },
    tnCompromise: (el) => api.goDecide(el.dataset.a, el.dataset.b),
  };

  function next() {
    if (local.step < CHECK_STEPS.length - 1) {
      local.step++;
      api.render();
    } else {
      save({ ...local.draft, done: false });
      local.step = 0;
      local.draft = { vibes: [] };
    }
  }

  function swipe(yes) {
    const me = mine();
    const c = api.ctx();
    const round2 = !!me.deck2;
    const seen = new Set([...(me.likes || []), ...(round2 ? me.passes2 || [] : me.passes || [])]);
    const id = (round2 ? me.deck2 : me.deck).find((x) => !seen.has(x) && c.ideasById[x]);
    if (!id) return;
    const card = document.getElementById('swipe-card');
    if (card) {
      card.style.transition = 'transform 0.3s ease-in, opacity 0.3s';
      card.style.transform = `translateX(${yes ? 140 : -140}%) rotate(${yes ? 20 : -20}deg)`;
      card.style.opacity = '0';
    }
    if (navigator.vibrate) navigator.vibrate(yes ? [10, 30, 10] : 8);
    local.prevId = id;
    setTimeout(() => {
      const m = mine();
      const log = [...(m.log || []), [id, yes]];
      if (yes) save({ ...m, log, likes: [...(m.likes || []), id] });
      else if (m.deck2) save({ ...m, log, passes2: [...(m.passes2 || []), id] });
      else save({ ...m, log, passes: [...(m.passes || []), id] });
    }, 220);
  }

  // Drag-to-swipe on the card.
  function after() {
    const card = document.getElementById('swipe-card');
    if (!card) return;
    let x0 = null;
    let dx = 0;
    card.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
    card.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.classList.toggle('lean-yes', dx > 40);
      card.classList.toggle('lean-no', dx < -40);
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      if (Math.abs(dx) > 90) swipe(dx > 0);
      else { card.style.transition = 'transform 0.2s'; card.style.transform = ''; card.classList.remove('lean-yes', 'lean-no'); }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function badge() {
    const me = mine();
    const them = theirs();
    if (them && !me) return 1; // partner checked in, waiting on me
    if (me?.done && them?.done && !localStorage.getItem(`dn.seen.${today()}`)) return 1;
    return 0;
  }

  return { view, actions, after, badge, markSeen: () => { if (mine()?.done && theirs()?.done) localStorage.setItem(`dn.seen.${today()}`, '1'); } };
}
