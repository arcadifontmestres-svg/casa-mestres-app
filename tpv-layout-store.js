const fs = require('fs');
const path = require('path');
function empty() { return { revision: 0, draft: { categories: [], buttons: [] }, published: null }; }
function validate(layout) {
  if (!layout || !Array.isArray(layout.categories) || !Array.isArray(layout.buttons)) throw new Error('Distribució no vàlida');
  if (layout.categories.length > 100 || layout.buttons.length > 2000) throw new Error('Massa botons o categories');
  const ids = new Set();
  for (const row of [...layout.categories, ...layout.buttons]) {
    if (!row || typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id) || ids.has(row.id)) throw new Error('Identificador no vàlid o duplicat');
    ids.add(row.id);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 100) throw new Error('Cal un nom de fins a 100 caràcters');
    if (!/^#[0-9a-f]{6}$/i.test(row.color) || ![1,2].includes(row.size)) throw new Error('Color o mida no vàlids');
  }
  for (const b of layout.buttons) {
    if (b.price != null && (typeof b.price !== 'number' || !Number.isFinite(b.price) || b.price < 0)) throw new Error('PVP no vàlid');
    if (!layout.categories.some(c => c.id === b.categoryId)) throw new Error('Categoria inexistent');
    if (!['product','dish','sale'].includes(b.type) || typeof b.itemId !== 'string' || !b.itemId || typeof b.code !== 'string' || !b.code.trim()) throw new Error('Cal assignar un article amb codi');
  }
  return JSON.parse(JSON.stringify(layout));
}
function store(root, context) {
  for (const id of [context.companyId, context.centreId]) if (!/^[\w-]+$/.test(id || '')) throw new Error('Selecciona empresa i centre');
  const dir = path.join(root, 'tpv-layouts', context.companyId);
  const file = path.join(dir, context.centreId + '.json');
  return {
    read() { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : empty(); },
    save(input) {
      const current = this.read();
      if (input.revision !== current.revision) throw Object.assign(new Error('La distribució ha canviat. Recarrega abans de guardar.'), { statusCode: 409 });
      const draft = validate(input.draft);
      const next = { ...current, revision: current.revision + 1, draft, published: input.publish === true ? JSON.parse(JSON.stringify(draft)) : current.published };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2));
      fs.renameSync(file + '.tmp', file);
      return next;
    }
  };
}
module.exports = { empty, validate, store };
