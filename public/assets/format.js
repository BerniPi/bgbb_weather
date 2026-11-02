// Formatierung für alle Seiten (Zahlen deutsch, Zeiten in Wiener Ortszeit)
export const TZ = 'Europe/Vienna';

const nf = (digits) => new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false,
});
const NF = [nf(0), nf(1), nf(2)];

export const num = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : NF[d].format(v));
export const signed = (v, d = 1) => (v == null ? '' : `${v > 0 ? '+' : ''}${num(v, d)}`);

export const timeFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
export const dayFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const longDateFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Unix-Sekunden → 'HH:MM' */
export const hm = (unix) => (unix == null ? '–' : timeFmt.format(unix * 1000));
/** Unix-Sekunden → 'TT.MM.JJJJ, HH:MM' */
export const dt = (unix) => (unix == null ? '–' : dateTimeFmt.format(unix * 1000));
/** Unix-Sekunden → 'TT.MM.JJJJ' */
export const date = (unix) => (unix == null ? '–' : dateFmt.format(unix * 1000));
/** Unix-Sekunden → 'TT.MM.' */
export const day = (unix) => (unix == null ? '–' : dayFmt.format(unix * 1000));
/** Heutiges Datum in Wien als 'YYYY-MM-DD' */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** 'YYYY-MM-DD' plus n Tage */
export function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 'Sonntag, 2. November 2025' */
export const longDate = (iso) => longDateFmt.format(new Date(`${iso}T12:00:00Z`));

/** Zeitpunkt relativ zu heute: 'heute 12:25', 'gestern 08:10' oder Datum */
export function relative(unix, now = Date.now() / 1000) {
  if (unix == null) return '–';
  const d = date(unix);
  if (d === date(now)) return `heute ${hm(unix)}`;
  if (d === date(now - 86400)) return `gestern ${hm(unix)}`;
  return dt(unix);
}

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16]);

export const ICONS = {
  sun: `<svg viewBox="0 0 64 64" aria-label="sonnig"><circle cx="32" cy="32" r="13" fill="#f59f00"/><g stroke="#f59f00" stroke-width="4" stroke-linecap="round">${
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="6" x2="32" y2="13" transform="rotate(${a} 32 32)"/>`).join('')}</g></svg>`,
  cloud: '<svg viewBox="0 0 64 64" aria-label="bewölkt"><path d="M18 48a11 11 0 0 1 1-22 15 15 0 0 1 29 4 9 9 0 0 1-1 18z" fill="#adb5bd"/></svg>',
  rain: `<svg viewBox="0 0 64 64" aria-label="Regen"><path d="M18 38a11 11 0 0 1 1-22 15 15 0 0 1 29 4 9 9 0 0 1-1 18z" fill="#868e96"/><g stroke="#1c7ed6" stroke-width="4" stroke-linecap="round">
    <line x1="22" y1="44" x2="19" y2="54"/><line x1="33" y1="44" x2="30" y2="54"/><line x1="44" y1="44" x2="41" y2="54"/></g></svg>`,
};

/** Wettersymbol aus aktuellen Werten */
export const weatherIcon = (w) => (w.rainRate > 0 ? ICONS.rain : w.sunny ? ICONS.sun : ICONS.cloud);

/** Kleine HTML-Hilfen */
export const $ = (id) => document.getElementById(id);

export function dl(el, items) {
  el.innerHTML = items.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** Getaktete Wiederholung; Fehler landen in der Konsole statt die Seite anzuhalten */
export function repeat(fn, ms) {
  const run = () => Promise.resolve().then(fn).catch((e) => console.error(e));
  run();
  return setInterval(run, ms);
}

export async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
