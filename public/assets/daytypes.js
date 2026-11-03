// Kennzeichnungen für Kenntage (Definitionen kommen vom Server, src/daytypes.js)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Kenntage als Chips. types: [{ key, label, plural, hint, group, count? }]
 * Mit count (Zeitraum) „12 Sommertage“, ohne (einzelner Tag) „Sommertag“.
 * href(t): optionaler Link je Chip
 */
export function dayTypeChips(types, { href } = {}) {
  return types.map((t) => {
    const text = t.count == null ? t.label : `<b>${t.count}</b> ${t.count === 1 ? t.label : t.plural}`;
    const attrs = `class="daytype" data-group="${t.group ?? ''}" title="${esc(t.hint ?? '')}"`;
    return href ? `<a ${attrs} href="${href(t)}">${text}</a>` : `<span ${attrs}>${text}</span>`;
  }).join('');
}

/** Link zur Tagesliste mit Zeitraum und Filter */
export const daysLink = (from, to, key) =>
  `/tage?${new URLSearchParams({ von: from, bis: to, ...(key ? { kenntag: key } : {}) })}`;
