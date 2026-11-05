// Pure helpers: seasons, weather, filters, scoring, and rating math.

export const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];

export function seasonOf(date = new Date()) {
  const m = date.getMonth(); // 0 = Jan
  if (m === 11 || m <= 1) return 'Winter';
  if (m <= 4) return 'Spring';
  if (m <= 7) return 'Summer';
  return 'Fall';
}

export const todayISO = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export function nextWeekday(weekday = 1, from = new Date()) {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return todayISO(d);
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---- Weather (Open-Meteo, free, no key) ----

const WMO = [
  [[0], 'Clear', '☀️'],
  [[1], 'Mostly clear', '🌤️'],
  [[2], 'Partly cloudy', '⛅'],
  [[3], 'Cloudy', '☁️'],
  [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'Snow', '❄️'],
  [[95, 96, 99], 'Storms', '⛈️'],
];

export function describeCode(code) {
  for (const [codes, label, emoji] of WMO) if (codes.includes(code)) return { label, emoji };
  return { label: 'Unknown', emoji: '🌡️' };
}

export async function fetchWeather(lat, lon) {
  const cacheKey = `dn.wx.${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.wx;
  } catch { /* ignore */ }
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset'
    + '&temperature_unit=fahrenheit&timezone=auto&past_days=14&forecast_days=10';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather unavailable');
  const j = await res.json();
  const days = {};
  j.daily.time.forEach((t, i) => {
    const code = j.daily.weather_code[i];
    days[t] = {
      hi: Math.round(j.daily.temperature_2m_max[i]),
      lo: Math.round(j.daily.temperature_2m_min[i]),
      pop: j.daily.precipitation_probability_max[i] ?? 0,
      sunset: (j.daily.sunset[i] || '').slice(11, 16),
      code,
      ...describeCode(code),
    };
  });
  const wx = {
    current: { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, ...describeCode(j.current.weather_code) },
    days,
  };
  localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), wx }));
  return wx;
}

// Is this day a bad day to be outside?
export function badOutdoorDay(day) {
  if (!day) return false;
  return day.pop >= 50 || day.code >= 51 || day.hi < 40 || day.hi > 92;
}

// ---- Ideas ----

export const isOutdoor = (idea) => idea.tags?.includes('outdoors');

export function inSeason(idea, season) {
  return !idea.seasons?.length || idea.seasons.includes('Any') || idea.seasons.includes(season);
}

export function costLabel(idea) {
  const [a, b] = idea.cost || [0, 0];
  if (!a && !b) return 'Free';
  if (a === b) return `$${a}`;
  return `$${a}–${b}`;
}

export function driveLabel(idea) {
  if (!idea.drive) return 'At home';
  if (idea.drive >= 60) return `${Math.floor(idea.drive / 60)}h${idea.drive % 60 ? ` ${idea.drive % 60}m` : ''}`;
  return `${idea.drive} min`;
}

export const DEFAULT_FILTERS = {
  drive: 'any', // 0 | 15 | 30 | 60 | 'any'
  budget: 50, // 15 | 30 | 50 | 'any'
  energy: [],
  include: [],
  exclude: [],
  inSeason: true,
  weatherOk: false,
  hideTried: false,
};

export function activeFilterCount(f) {
  let n = 0;
  if (f.drive !== 'any') n++;
  if (f.budget !== 'any') n++;
  if (f.energy.length) n++;
  if (f.include.length) n++;
  if (f.exclude.length) n++;
  if (f.inSeason) n++;
  if (f.weatherOk) n++;
  if (f.hideTried) n++;
  return n;
}

export function applyFilters(ideas, f, ctx) {
  return ideas.filter((idea) => {
    if (idea.hidden) return false;
    if (f.drive !== 'any' && (idea.drive || 0) > Number(f.drive)) return false;
    if (f.budget !== 'any' && (idea.cost?.[0] || 0) > Number(f.budget)) return false;
    if (f.energy.length && !f.energy.includes(idea.energy)) return false;
    if (f.include.length && !f.include.some((t) => idea.tags?.includes(t))) return false;
    if (f.exclude.length && f.exclude.some((t) => idea.tags?.includes(t))) return false;
    if (f.inSeason && !inSeason(idea, ctx.season)) return false;
    if (f.weatherOk && ctx.badWeather && isOutdoor(idea)) return false;
    if (f.hideTried && ctx.triedIds.has(idea.id)) return false;
    return true;
  });
}

// ---- History & scoring ----

export const RATING_PARAMS = [
  { key: 'overall', label: 'Overall', emoji: '⭐' },
  { key: 'fun', label: 'Fun', emoji: '🎉' },
  { key: 'food', label: 'Food & drinks', emoji: '🍔' },
  { key: 'connection', label: 'Connection', emoji: '💞' },
  { key: 'value', label: 'Worth the money', emoji: '💵' },
];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Build a history summary from dates + ratings.
export function buildHistory(dates, ratings, ideasById) {
  const byDate = {};
  for (const r of ratings) (byDate[r.data.dateId] ||= []).push(r.data);
  const done = dates.filter((d) => d.data.status === 'done');
  const tagScores = {};
  const ideaScores = {};
  const lastDone = {};
  const triedIds = new Set();
  for (const d of done) {
    const rs = byDate[d.id] || [];
    const overall = avg(rs.map((r) => r.scores?.overall).filter(Boolean));
    const ideaId = d.data.ideaId;
    if (ideaId) {
      triedIds.add(ideaId);
      const when = d.data.when || '';
      if (!lastDone[ideaId] || when > lastDone[ideaId]) lastDone[ideaId] = when;
      if (overall) (ideaScores[ideaId] ||= []).push(overall);
      const idea = ideasById[ideaId];
      if (overall && idea) for (const t of idea.tags || []) (tagScores[t] ||= []).push(overall);
    }
  }
  const lastLeans = done
    .slice()
    .sort((a, b) => (b.data.when || '').localeCompare(a.data.when || ''))
    .map((d) => ideasById[d.data.ideaId]?.leans)
    .find(Boolean);
  return {
    byDate,
    triedIds,
    lastDone,
    lastLeans,
    tagAvg: Object.fromEntries(Object.entries(tagScores).map(([t, xs]) => [t, avg(xs)])),
    ideaAvg: Object.fromEntries(Object.entries(ideaScores).map(([t, xs]) => [t, avg(xs)])),
  };
}

// How good is this idea right now? Returns a weight and plain-language reasons.
export function scoreIdea(idea, ctx) {
  let s = 1;
  const why = [];
  const seasonal = idea.seasons?.length && !idea.seasons.includes('Any');
  if (seasonal && inSeason(idea, ctx.season)) {
    s *= 1.4;
    why.push(`in season (${ctx.season.toLowerCase()})`);
  }
  if (isOutdoor(idea) && ctx.badWeather) {
    s *= 0.25;
    why.push(`weather looks rough for outside`);
  } else if (isOutdoor(idea) && ctx.niceWeather) {
    s *= 1.25;
    why.push('nice weather for outside');
  }
  const h = ctx.history;
  const tagVals = (idea.tags || []).map((t) => h.tagAvg[t]).filter((v) => v != null);
  if (tagVals.length) {
    const a = avg(tagVals);
    s *= 0.7 + 0.15 * (a - 1);
    if (a >= 4) why.push('like dates you rated high');
    if (a <= 2.5) why.push('like dates you rated low');
  }
  const own = h.ideaAvg[idea.id];
  const last = h.lastDone[idea.id];
  if (last) {
    const daysAgo = (Date.now() - Date.parse(`${last}T12:00:00`)) / 864e5;
    if (daysAgo < 21) {
      s *= 0.3;
      why.push('you just did this');
    }
  }
  if (own != null) {
    if (own >= 4) { s *= 1.2; why.push(`you rated it ${own.toFixed(1)}`); }
    if (own <= 2) { s *= 0.4; why.push(`you rated it ${own.toFixed(1)}`); }
  } else if (!h.triedIds.has(idea.id)) {
    s *= 1.1;
    why.push('new to you');
  }
  if (h.lastLeans && h.lastLeans !== 'Both' && idea.leans && idea.leans !== 'Both' && idea.leans !== h.lastLeans) {
    s *= 1.2;
    why.push(`${idea.leans}'s turn`);
  }
  if (idea.fav) {
    s *= 1.3;
    why.push('a favorite');
  }
  return { score: s, why };
}

export function weightedPick(list, weightOf) {
  const total = list.reduce((a, x) => a + weightOf(x), 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= weightOf(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

export function weightedSample(list, n, weightOf) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < n) {
    const x = weightedPick(pool, weightOf);
    out.push(x);
    pool.splice(pool.indexOf(x), 1);
  }
  return out;
}

// ---- Reveal ----

export function compareRatings(a, b) {
  const rows = RATING_PARAMS.map((p) => ({ ...p, a: a.scores?.[p.key] || 0, b: b.scores?.[p.key] || 0 }));
  const rated = rows.filter((r) => r.a && r.b);
  const gap = avg(rated.map((r) => Math.abs(r.a - r.b))) ?? 0;
  const sync = Math.round(100 - (gap / 4) * 100);
  const overall = ((a.scores?.overall || 0) + (b.scores?.overall || 0)) / 2;
  const biggest = rated.slice().sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
  let verdict;
  if (overall >= 4.5) verdict = { emoji: '🏆', text: 'Instant classic' };
  else if (overall >= 3.5) verdict = { emoji: '🥰', text: 'Solid date' };
  else if (overall >= 2.5) verdict = { emoji: '🤷', text: 'It was fine' };
  else verdict = { emoji: '📝', text: 'Learn from it' };
  let syncLine;
  if (sync >= 90) syncLine = 'Same brain. You two felt the same way.';
  else if (sync >= 70) syncLine = 'Pretty much on the same page.';
  else syncLine = 'You saw this one differently. Worth a chat!';
  const again = [a.again, b.again];
  let againLine;
  if (again.every((x) => x === 'yes')) againLine = 'You both want to do this again ❤️';
  else if (again.includes('no')) againLine = 'At least one of you would skip it next time.';
  else againLine = 'Maybe again, with some changes.';
  return { rows, sync, overall, biggest: biggest && Math.abs(biggest.a - biggest.b) >= 2 ? biggest : null, verdict, syncLine, againLine };
}

// ---- What to wear / bring ----

export function wearTips(idea, day, time = '17:30') {
  const tips = [];
  const tags = idea?.tags || [];
  const outside = tags.includes('outdoors') || tags.includes('walk') || tags.includes('picnic');
  if (day) {
    const t = day.hi;
    if (t < 35) tips.push(['🧤', 'Heavy coat, hat, and gloves']);
    else if (t < 50) tips.push(['🧥', 'Warm jacket']);
    else if (t < 65) tips.push(['🧶', 'Bring a light layer']);
    else if (t > 85) tips.push(['🩳', 'Light clothes and water']);
    if (day.pop >= 40 || ['Rain', 'Drizzle', 'Storms'].includes(day.label)) tips.push(['☔', `Umbrella or rain jacket (${day.pop}% chance)`]);
    if (day.label === 'Snow') tips.push(['🥾', 'Boots for snow']);
    if (outside && day.sunset && time && time >= `${day.sunset}`.slice(0, 5).replace(/^(\d):/, '0$1:')) tips.push(['🔦', `Dark by ${day.sunset}, bring a light`]);
  }
  if (tags.includes('walk')) tips.push(['👟', 'Comfy walking shoes']);
  if (tags.includes('active')) tips.push(['🏃', 'Clothes you can move in']);
  if (tags.includes('picnic')) tips.push(['🧺', 'Blanket and snacks']);
  if (tags.includes('drive') || (idea?.drive || 0) >= 30) tips.push(['🎶', 'A playlist for the drive']);
  if (idea?.special) tips.push(['✨', 'Dress up a little']);
  return tips;
}

// ---- Tonight: combine two check-ins ----

export const ENERGY = { 1: { emoji: '😴', label: 'Wiped' }, 2: { emoji: '🙂', label: 'Okay' }, 3: { emoji: '⚡', label: 'Excited' } };
export const VIBES = [
  ['cozy', '🛋️ Cozy'], ['hungry', '🍔 Hungry'], ['chatty', '💬 Want to talk'],
  ['out', '🚪 Get out of the house'], ['active', '🏃 Move around'], ['romantic', '🌹 Romantic'],
];
export const TIME_OPTS = [[60, '⏱️ About an hour'], [180, '🕒 2–3 hours'], [600, '🌙 All evening+']];
export const BUDGET_OPTS = [[15, '$ Cheap'], [35, '$$ Normal'], [60, '$$$ Treat'], [999, '💎 Splurge']];
export const NOVELTY_OPTS = [['new', '✨ Something new'], ['fav', '🔁 An old favorite'], ['any', '🤷 Either']];

const ENERGY_RANK = { Low: 1, Med: 2, High: 3 };

export function combineCheckins(list) {
  const cs = list.filter(Boolean);
  if (!cs.length) return null;
  return {
    energy: Math.min(...cs.map((c) => c.energy || 2)),
    time: Math.min(...cs.map((c) => c.time || 180)),
    budget: Math.min(...cs.map((c) => c.budget || 35)),
    vibes: [...new Set(cs.flatMap((c) => c.vibes || []))],
    novelty: cs.every((c) => c.novelty === 'new') ? 'new' : cs.some((c) => c.novelty === 'fav') && !cs.some((c) => c.novelty === 'new') ? 'fav' : 'any',
    bothNew: cs.length >= 2 && cs.every((c) => c.novelty === 'new'),
  };
}

function fitsTime(idea, minutes) {
  const tags = idea.tags || [];
  const est = (idea.drive || 0) * 2 + (tags.includes('day-trip') ? 300 : idea.special ? 150 : tags.includes('at-home') ? 90 : 100);
  return est <= minutes + 30;
}

const VIBE_TAGS = {
  cozy: ['at-home', 'indoors', 'show', 'treats', 'drive'],
  hungry: ['burgers', 'chinese', 'steak', 'greek', 'diner', 'cook-at-home'],
  chatty: ['walk', 'diner', 'drive', 'picnic', 'cook-at-home'],
  out: ['outdoors', 'walk', 'games', 'show', 'museum', 'day-trip', 'active'],
  active: ['active', 'walk', 'games'],
  romantic: ['picnic', 'steak', 'holiday', 'show', 'drive'],
};

// Ideas that fit tonight, best first. `c` is a ctx() from the app, `t` a combined check-in.
export function tonightDeck(c, t, limit = 10) {
  const out = [];
  for (const idea of c.ideas) {
    if (idea.hidden) continue;
    if (!inSeason(idea, c.season)) continue;
    if ((idea.cost?.[0] || 0) > t.budget) continue;
    if (!fitsTime(idea, t.time)) continue;
    if ((ENERGY_RANK[idea.energy] || 1) > t.energy) continue;
    if (c.badWeather && isOutdoor(idea)) continue;
    const tried = c.triedIds.has(idea.id);
    if (t.novelty === 'new' && tried) continue;
    let { score, why } = scoreIdea(idea, c);
    const vibeHits = t.vibes.filter((v) => VIBE_TAGS[v]?.some((tag) => idea.tags?.includes(tag)));
    score *= 1 + 0.35 * vibeHits.length;
    if (t.novelty === 'fav' && tried) score *= (c.history.ideaAvg[idea.id] || 3) >= 4 ? 2 : 1.2;
    out.push({ idea, score, why, vibeHits });
  }
  out.sort((a, b) => b.score - a.score);
  // Keep the best, but shuffle a little so it isn't the same deck every night.
  const top = out.slice(0, limit * 2);
  return weightedSample(top, Math.min(limit, top.length), (x) => x.score);
}

export function ideaEmoji(idea) {
  const t = idea.tags || [];
  const map = [['holiday', '🎄'], ['picnic', '🧺'], ['burgers', '🍔'], ['chinese', '🥡'], ['steak', '🥩'], ['greek', '🥙'], ['diner', '🍳'],
    ['cook-at-home', '👩‍🍳'], ['show', '🎬'], ['games', '🎳'], ['museum', '🖼️'], ['day-trip', '🗺️'], ['active', '⛸️'], ['walk', '🌳'], ['treats', '🍦'], ['drive', '🚗'], ['at-home', '🛋️']];
  for (const [k, e] of map) if (t.includes(k)) return e;
  return '💕';
}

export function moodLine(checkins) {
  const [a, b] = checkins;
  if (!a || !b) return '';
  const ea = a.energy || 2;
  const eb = b.energy || 2;
  if (ea === 1 && eb === 1) return "You're both wiped. Keep it easy tonight. 🛋️";
  if (ea === 3 && eb === 3) return "You're both fired up. Make it count! ⚡";
  if (Math.abs(ea - eb) >= 2) {
    const tired = ea < eb ? a.by : b.by;
    const up = ea < eb ? b.by : a.by;
    return `${tired} is wiped and ${up} is excited, so these are low-effort but still feel like a date.`;
  }
  return 'You two are in a similar place tonight. 👌';
}

export function weatherHint(day) {
  if (!day) return '';
  if (badOutdoorDay(day)) return ' · rough weather';
  if (day.hi >= 60 && day.hi <= 85) return ' · nice out';
  return ` · ${day.hi}°`;
}
