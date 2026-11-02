// Player settings, saved between visits. Everything else reads `prefs` and
// listens with onPrefs; set() saves and tells every listener.
const KEY = 'strata-settings';
const DEFAULTS = { sens: 1, invert: false, music: 0.8, sfx: 0.8, shake: 1, quality: 'high' };

export const prefs = { ...DEFAULTS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

const listeners = [];
export const onPrefs = fn => { listeners.push(fn); fn(prefs); };
export function set(k, v) {
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  for (const fn of listeners) fn(prefs, k);
}
export const reset = () => { for (const k of Object.keys(DEFAULTS)) set(k, DEFAULTS[k]); };
