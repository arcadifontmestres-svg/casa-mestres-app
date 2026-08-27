import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const keys = [
  'config', 'suppliers', 'products', 'bases', 'dishes', 'documents',
  'employees', 'reservations', 'reservationConfig', 'saleItems', 'tpvConfig',
  'agoraImport'
];
const catalog = Object.fromEntries(keys.map(key => [key, source[key]]));
const targetDirectory = path.join(root, 'seed');
fs.mkdirSync(targetDirectory, { recursive: true });
fs.writeFileSync(path.join(targetDirectory, 'catalog.json'), JSON.stringify(catalog), 'utf8');
console.log(`Catàleg creat: ${catalog.products.length} productes, ${catalog.bases.length} bases, ${catalog.dishes.length} plats`);

