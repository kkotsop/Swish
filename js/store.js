// Local-only storage (localStorage). Videos are never stored, only scores.
const K = { profiles: 'swish.profiles', sessions: 'swish.sessions', last: 'swish.lastProfile' };

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

export const listProfiles = () => read(K.profiles, []);
export function saveProfile(p) {
  const all = listProfiles();
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p; else all.push(p);
  return write(K.profiles, all);
}
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const lastProfileId = () => read(K.last, null);
export const setLastProfile = (id) => write(K.last, id);

export function addSession(s) {
  const all = read(K.sessions, []);
  all.push(s);
  return write(K.sessions, all);
}
export const sessionsFor = (profileId, move) => read(K.sessions, []).filter((s) => s.profileId === profileId && s.move === move).sort((a, b) => a.ts - b.ts);

/** Downscale a chosen photo to a small square data URL for the avatar. */
export function resizePhoto(file, size = 160) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function loadConfig() {
  const res = await fetch('config/settings.json', { cache: 'no-cache' });
  return res.json();
}
