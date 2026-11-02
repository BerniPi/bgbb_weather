// Kopf- und Fußzeile für alle Seiten der Homepage
const PAGES = [
  { href: '/', label: 'Aktuell' },
  { href: '/verlauf', label: 'Verlauf' },
  { href: '/klima', label: 'Klima', soon: true },
  { href: '/bodensee', label: 'Bodensee', soon: true },
  { href: '/export', label: 'Export', soon: true },
  { href: '/api', label: 'API', soon: true },
  { href: '/station', label: 'Station', soon: true },
];

export function renderLayout() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  const header = document.querySelector('header.site');
  header.innerHTML = `
    <div class="bar">
      <a class="brand" href="/">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="26" r="11" fill="#ffd43b"/><path d="M22 50a10 10 0 0 1 1-20 14 14 0 0 1 27 4 8 8 0 0 1-1 16z" fill="#fff"/></svg>
        <span><b>Wetterstation</b> BG Blumenstraße Bregenz</span>
      </a>
      <span class="loc">47,499° N · 9,740° O · 434 m ü. A.</span>
    </div>
    <nav aria-label="Hauptnavigation">
      ${PAGES.map((p) => (p.soon
        ? `<span class="soon" title="in Arbeit">${p.label}</span>`
        : `<a href="${p.href}"${p.href === path ? ' aria-current="page"' : ''}>${p.label}</a>`)).join('')}
    </nav>`;

  const footer = document.querySelector('footer.site');
  footer.innerHTML = `
    <span>Wetterstation des BG Bregenz Blumenstraße · Davis Vantage Pro2 · Messdaten seit Februar 2018</span>
    <span>Bodensee: <a href="https://vowis.vorarlberg.at/stationswrapper/bodensee">Land Vorarlberg</a> ·
      Sturmwarnung: <a href="https://www.kttg.ch/kapo/htm/stwarn.shtml">Kantonspolizei Thurgau</a> ·
      <a href="https://bgblumenstrasse.at/datenschutzerklaerung">Datenschutz</a></span>`;
}
