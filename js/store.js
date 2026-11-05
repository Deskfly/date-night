// Data layer: every record is { id, kind, data, deleted, updated_at }.
// Records are cached in localStorage and, when Supabase is configured,
// synced to one shared table so both phones see the same thing.
import { CONFIG } from './config.js';

const LS_ITEMS = 'dn.items';
const LS_PENDING = 'dn.pending';
const LS_ME = 'dn.me';

const items = new Map();
const pending = new Set();
const listeners = new Set();

export const status = { online: false, syncing: false, lastSync: null, error: null };
export let me = null; // { couple, name }

export const remoteEnabled = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

function load() {
  try {
    me = JSON.parse(localStorage.getItem(LS_ME) || 'null');
    for (const it of JSON.parse(localStorage.getItem(LS_ITEMS) || '[]')) items.set(it.id, it);
    for (const id of JSON.parse(localStorage.getItem(LS_PENDING) || '[]')) pending.add(id);
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
}

function save() {
  localStorage.setItem(LS_ITEMS, JSON.stringify([...items.values()]));
  localStorage.setItem(LS_PENDING, JSON.stringify([...pending]));
}

function emit() {
  for (const fn of listeners) fn();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMe(value) {
  const coupleChanged = !me || !value || me.couple !== value.couple;
  me = value;
  if (value) localStorage.setItem(LS_ME, JSON.stringify(value));
  else localStorage.removeItem(LS_ME);
  if (coupleChanged) {
    items.clear();
    pending.clear();
    save();
  }
  emit();
}

export function list(kind) {
  return [...items.values()].filter((it) => it.kind === kind && !it.deleted);
}

export function get(id) {
  const it = items.get(id);
  return it && !it.deleted ? it : null;
}

export function put(kind, id, data) {
  items.set(id, { id, kind, data, deleted: false, updated_at: new Date().toISOString() });
  pending.add(id);
  save();
  emit();
  scheduleSync();
}

export function putMany(records) {
  const now = new Date().toISOString();
  for (const r of records) {
    items.set(r.id, { id: r.id, kind: r.kind, data: r.data, deleted: false, updated_at: now });
    pending.add(r.id);
  }
  save();
  emit();
  scheduleSync();
}

export function remove(id) {
  const it = items.get(id);
  if (!it) return;
  items.set(id, { ...it, deleted: true, updated_at: new Date().toISOString() });
  pending.add(id);
  save();
  emit();
  scheduleSync();
}

// ---- Supabase REST ----

async function api(path, opts = {}) {
  const key = CONFIG.supabaseAnonKey;
  const headers = {
    apikey: key,
    'x-couple': me.couple,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`Sync failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

let syncTimer = null;
let syncPromise = null;

function scheduleSync(delay = 400) {
  if (!remoteEnabled() || !me) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync(), delay);
}

export function sync() {
  if (!remoteEnabled() || !me) return Promise.resolve();
  if (syncPromise) return syncPromise.then(() => sync());
  syncPromise = doSync().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function doSync() {
  status.syncing = true;
  emit();
  try {
    // 1. Push local changes.
    const ids = [...pending];
    if (ids.length) {
      const sent = ids.map((id) => items.get(id)).filter(Boolean);
      const rows = sent.map((it) => ({
        couple: me.couple, id: it.id, kind: it.kind, data: it.data, deleted: !!it.deleted, updated_at: it.updated_at,
      }));
      await api('items?on_conflict=couple,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      for (const it of sent) {
        // Only clear if it wasn't edited again while we were sending.
        if (items.get(it.id)?.updated_at === it.updated_at) pending.delete(it.id);
      }
    }
    // 2. Pull everything for this couple and keep the newest copy of each record.
    const rows = await api(`items?select=id,kind,data,deleted,updated_at&couple=eq.${encodeURIComponent(me.couple)}`);
    for (const row of rows) {
      const local = items.get(row.id);
      const remoteTime = Date.parse(row.updated_at);
      const localTime = local ? Date.parse(local.updated_at) : -Infinity;
      if (!local || remoteTime > localTime || (!pending.has(row.id) && remoteTime >= localTime)) {
        items.set(row.id, { id: row.id, kind: row.kind, data: row.data, deleted: row.deleted, updated_at: row.updated_at });
      }
    }
    save();
    status.online = true;
    status.error = null;
    status.lastSync = new Date();
  } catch (e) {
    status.online = false;
    status.error = e.message || String(e);
    console.warn(e);
  } finally {
    status.syncing = false;
    emit();
  }
}

// Check whether a couple code already has data (used when joining).
export async function remoteHasCouple(code) {
  if (!remoteEnabled()) return false;
  const prev = me;
  me = { couple: code };
  try {
    const rows = await api(`items?select=id&couple=eq.${encodeURIComponent(code)}&kind=eq.couple&limit=1`);
    return rows.length > 0;
  } finally {
    me = prev;
  }
}

export function resetLocal() {
  items.clear();
  pending.clear();
  localStorage.removeItem(LS_ITEMS);
  localStorage.removeItem(LS_PENDING);
  localStorage.removeItem(LS_ME);
  me = null;
  emit();
}

load();
