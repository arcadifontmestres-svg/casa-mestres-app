/* TPV buttons: pure helpers. No catalogue, order or stock writes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TpvButtons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const sourceKey = value => `${value.type}:${value.itemId ?? value.id}`;
  function sources(state) {
    const map = new Map();
    for (const [collection, type] of [['products', 'product'], ['dishes', 'dish'], ['saleItems', 'sale']]) {
      for (const item of state[collection] || []) {
        if (!item || !item.id || item.active === false) continue;
        const price = type === 'product' ? (item.sale ?? item.pvp) : (item.sale ?? item.price);
        const row = { id: String(item.id), type, code: typeof item.code === 'string' ? item.code : '',
          name: String(item.name || item.title || ''), unit: String(item.unit || ''),
          price: price == null || price === '' || !Number.isFinite(Number(price)) || Number(price) < 0 ? null : Number(price) };
        map.set(sourceKey(row), row);
      }
    }
    return [...map.values()];
  }
  function sanitizeLayout(value) {
    if (!value || !Array.isArray(value.categories) || !Array.isArray(value.buttons)) throw Error('La distribució rebuda no és vàlida. No s’ha substituït per una de buida.');
    return clone(value);
  }
  function effectivePrice(button, catalogue) {
    if (button.price != null && button.price !== '') return Number.isFinite(Number(button.price)) && Number(button.price) >= 0 ? Number(button.price) : null;
    return catalogue.find(row => sourceKey(row) === sourceKey(button) && row.code === button.code)?.price ?? null;
  }
  function issues(layout, catalogue, publish) {
    const errors = [], ids = new Set();
    if (layout.categories.length > 100 || layout.buttons.length > 2000) errors.push('S’ha superat el límit de categories o botons.');
    for (const row of [...layout.categories, ...layout.buttons]) {
      if (!row || typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id) || ids.has(row.id)) errors.push('Identificador no vàlid o repetit.');
      ids.add(row?.id);
      if (typeof row?.name !== 'string' || !row.name.trim() || row.name.length > 100) errors.push('Cada botó necessita un nom de fins a 100 caràcters.');
      if (!/^#[0-9a-f]{6}$/i.test(row?.color || '') || ![1, 2].includes(row?.size)) errors.push('Revisa el color i la mida dels botons.');
    }
    for (const b of layout.buttons) {
      if (!layout.categories.some(c => c.id === b.categoryId)) errors.push(`${b.name}: falta el grup de pantalla.`);
      if (!['product','dish','sale'].includes(b.type) || typeof b.itemId !== 'string' || !b.itemId || typeof b.code !== 'string' || !b.code.trim()) errors.push(`${b.name}: cal vincular un article amb codi.`);
      if (b.price != null && (typeof b.price !== 'number' || !Number.isFinite(b.price) || b.price < 0)) errors.push(`${b.name}: el PVP no és vàlid.`);
      if (publish && !catalogue.some(x => sourceKey(x) === sourceKey(b) && x.code === b.code)) errors.push(`${b.name}: l’article d’origen no està disponible amb aquest codi.`);
      if (publish && effectivePrice(b, catalogue) == null) errors.push(`${b.name}: indica el PVP de venda; el cost de Magatzem no és un preu de venda.`);
    }
    // The existing order engine groups lines by source type + item ID.
    // Do not publish ambiguous prices for the same source through two buttons.
    if (publish) {
      const pricing = new Map();
      for (const b of layout.buttons) {
        const key = sourceKey(b), signature = b.price == null ? 'source' : 'override:' + b.price;
        if (pricing.has(key) && pricing.get(key) !== signature) errors.push(`${b.name}: el mateix article ja té un altre criteri de PVP. Unifica el preu dels botons vinculats al mateix codi.`);
        pricing.set(key, signature);
      }
    }
    return [...new Set(errors)];
  }
  function reorder(layout, kind, id, target) {
    if (!['categories', 'buttons'].includes(kind)) return false;
    const rows = layout[kind], a = rows.findIndex(x => x.id === id), b = rows.findIndex(x => x.id === target);
    if (a < 0 || b < 0 || a === b) return false;
    if (kind === 'buttons' && rows[a].categoryId !== rows[b].categoryId) return false;
    rows.splice(b, 0, rows.splice(a, 1)[0]);
    return true;
  }
  function move(layout, kind, id, step) {
    if (!['categories', 'buttons'].includes(kind)) return false;
    const item = layout[kind].find(x => x.id === id);
    if (!item) return false;
    const visible = layout[kind].filter(x => kind === 'categories' || x.categoryId === item.categoryId);
    const i = visible.findIndex(x => x.id === id), target = visible[i + step];
    return target ? reorder(layout, kind, id, target.id) : false;
  }
  function ink(color) {
    const rgb = /^#[0-9a-f]{6}$/i.test(color || '') ? [1,3,5].map(i => parseInt(color.slice(i,i+2),16) / 255) : [0,0,0];
    const [r,g,b] = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126*r + .7152*g + .0722*b > .179 ? '#102a35' : '#ffffff';
  }
  return { clone, normalize, sourceKey, sources, sanitizeLayout, effectivePrice, issues, reorder, move, ink };
});
