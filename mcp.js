'use strict';

const crypto = require('crypto');

const READ_SCOPE = 'arcadi.read';
const WRITE_SCOPE = 'arcadi.write';
const ENTRY_TYPES = [
  'opening', 'closing', 'cash_close', 'invoicing', 'purchase', 'goods_receipt',
  'group_service', 'incident', 'task', 'next_purchase_forecast', 'note'
];
const ENTRY_STATUSES = ['Pendent', 'En curs', 'Completat'];
const PRODUCT_UNITS = ['kg', 'g', 'L', 'ml', 'unitat', 'ració', 'caixa', 'paquet', 'ampolla', 'sac'];

let sdkPromise;

function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('@modelcontextprotocol/sdk/server/mcp.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
      import('zod')
    ]).then(([mcp, transport, zod]) => ({
      McpServer: mcp.McpServer,
      StreamableHTTPServerTransport: transport.StreamableHTTPServerTransport,
      z: zod.z
    }));
  }
  return sdkPromise;
}

function madridDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDate(value) {
  return String(value || madridDate());
}

function inDateRange(itemDate, from, to) {
  const value = String(itemDate || '');
  return value && value >= from && value <= to;
}

function byDateAndTime(left, right) {
  return `${left.date || ''}T${left.time || left.actualTime || ''}`
    .localeCompare(`${right.date || ''}T${right.time || right.actualTime || ''}`);
}

function cleanText(value, maximum = 1000) {
  return String(value || '').trim().slice(0, maximum);
}

function cleanOptionalText(value, maximum = 1000) {
  const cleaned = cleanText(value, maximum);
  return cleaned || undefined;
}

function cleanAmount(value) {
  return value === undefined || value === null || value === '' ? undefined : Number(value);
}

function sanitizeReservation(item) {
  return {
    id: String(item.id || ''), date: String(item.date || ''), time: String(item.time || ''),
    pax: Number(item.pax || 0), zone: String(item.zone || ''), name: String(item.name || ''),
    phone: String(item.phone || ''), email: String(item.email || ''), menuTitle: String(item.menuTitle || ''),
    depositAmount: Number(item.depositAmount || 0), status: String(item.status || ''),
    paymentStatus: String(item.paymentStatus || ''), notes: String(item.notes || '')
  };
}

function sanitizeGroup(item) {
  return {
    id: String(item.id || ''), name: String(item.name || ''), date: String(item.date || ''),
    pax: Number(item.pax || 0), contact: String(item.contact || ''), menu: String(item.menu || ''),
    amount: Number(item.amount || 0), status: String(item.status || ''), notes: String(item.notes || '')
  };
}

function sanitizePurchase(item) {
  return {
    id: String(item.id || ''), code: String(item.code || ''), date: String(item.date || ''),
    supplier: String(item.supplier || ''), status: String(item.status || ''),
    responsible: String(item.responsible || ''), lines: String(item.lines || ''), notes: String(item.notes || '')
  };
}

function sanitizeReceipt(item) {
  return {
    id: String(item.id || ''), code: String(item.code || ''), purchaseCode: String(item.purchaseCode || ''),
    date: String(item.date || ''), supplier: String(item.supplier || ''), lot: String(item.lot || ''),
    expiry: String(item.expiry || ''),
    temperature: item.temperature === undefined || item.temperature === '' ? null : Number(item.temperature),
    packaging: String(item.packaging || ''), status: String(item.status || ''),
    lines: String(item.lines || ''), correctiveAction: String(item.correctiveAction || '')
  };
}

function sanitizeDailyEntry(item) {
  const result = {
    id: String(item.id || ''), requestId: String(item.requestId || ''), date: String(item.date || ''),
    type: String(item.type || ''), description: String(item.description || ''), status: String(item.status || ''),
    createdAt: String(item.createdAt || ''), updatedAt: String(item.updatedAt || '')
  };
  for (const key of ['supplier', 'responsible', 'actualTime', 'closingNotes']) {
    if (item[key]) result[key] = String(item[key]);
  }
  if (item.amount !== undefined && item.amount !== null && item.amount !== '') result.amount = Number(item.amount);
  return result;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ca').trim();
}

function sanitizeProduct(item) {
  return {
    id: String(item.id || ''), code: String(item.code || ''), name: String(item.name || ''),
    family: String(item.family || ''), unit: String(item.unit || ''),
    price: Number(item.price || 0), stock: Number(item.stock || 0), min: Number(item.min || 0),
    supplierId: String(item.supplierId || ''), notes: String(item.notes || ''),
    active: item.active !== false, pricePending: item.pricePending === true,
    purchasable: item.purchasable !== false
  };
}

function sanitizeIngredient(item) {
  return {
    productId: String(item.productId || ''), name: String(item.name || ''),
    qty: Number(item.qty || 0), unit: String(item.unit || ''),
    asNeeded: item.asNeeded === true, qtyText: String(item.qtyText || '')
  };
}

function sanitizeBaseUse(item) {
  return {
    baseId: String(item.baseId || ''), name: String(item.name || ''),
    qty: Number(item.qty || 0), unit: String(item.unit || '')
  };
}

function sanitizeKitchenBase(item) {
  return {
    id: String(item.id || ''), name: String(item.name || ''), type: String(item.type || ''),
    station: String(item.station || ''), yield: optionalNumber(item.yield),
    yieldMin: optionalNumber(item.yieldMin), yieldMax: optionalNumber(item.yieldMax),
    yieldUnit: String(item.yieldUnit || ''), yieldPending: item.yieldPending === true,
    yieldApproximate: item.yieldApproximate === true, life: String(item.life || ''),
    initialQtyText: String(item.initialQtyText || (item.initialQty !== undefined ? `${item.initialQty} ${item.initialUnit || ''}`.trim() : '')),
    packText: String(item.packText || ''), conservation: String(item.conservation || ''),
    ingredients: (item.ingredients || []).map(sanitizeIngredient),
    baseUses: (item.baseUses || []).map(sanitizeBaseUse),
    process: String(item.process || ''), source: String(item.source || ''),
    sourceFile: String(item.sourceFile || ''), transcriptionNotes: String(item.transcriptionNotes || '')
  };
}

function nextProductCode(data, family) {
  const definition = (data.config?.families || []).find(item => item.name === family);
  const prefix = String(definition?.prefix || 'ALT').toUpperCase();
  let maximum = 0;
  for (const product of data.products || []) {
    const expression = new RegExp('^' + prefix + '-(\\d+)$', 'i');
    const match = String(product.code || '').match(expression);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return prefix + '-' + String(maximum + 1).padStart(3, '0');
}

function authFailure(context, scope) {
  const invalid = context.auth?.reason === 'invalid_token';
  return {
    isError: true,
    content: [{
      type: 'text',
      text: invalid
        ? 'La sessió d’ARCADI no és vàlida o ha caducat. Torna a iniciar sessió.'
        : 'Cal iniciar sessió a ARCADI GESTIO RESTAURANT per utilitzar aquesta eina.'
    }],
    _meta: {
      'mcp/www_authenticate': [context.challenge(
        scope,
        invalid ? 'invalid_token' : 'insufficient_scope',
        invalid ? 'La sessio ha caducat; torna a iniciar sessio' : 'Inicia sessio per continuar'
      )]
    }
  };
}

function requireScope(context, scope) {
  return Boolean(context.auth?.authenticated && context.auth.scopes?.includes(scope));
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function createArcadiMcpServer(context) {
  const { McpServer, z } = await loadSdk();
  const server = new McpServer({ name: 'arcadi-gestio-restaurant', version: '0.3.0' }, {
    instructions: 'Connector privat d’ARCADI GESTIO RESTAURANT. Permet consultar i mantenir productes, bases de cuina, reserves, grups, compres, recepcions i controls diaris amb autenticació.'
  });

  const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format requerit: YYYY-MM-DD');
  const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format requerit: HH:MM');
  const reservationSchema = z.object({
    id: z.string(), date: z.string(), time: z.string(), pax: z.number(), zone: z.string(),
    name: z.string(), phone: z.string(), email: z.string(), menuTitle: z.string(),
    depositAmount: z.number(), status: z.string(), paymentStatus: z.string(), notes: z.string()
  });
  const groupSchema = z.object({
    id: z.string(), name: z.string(), date: z.string(), pax: z.number(), contact: z.string(),
    menu: z.string(), amount: z.number(), status: z.string(), notes: z.string()
  });
  const purchaseSchema = z.object({
    id: z.string(), code: z.string(), date: z.string(), supplier: z.string(), status: z.string(),
    responsible: z.string(), lines: z.string(), notes: z.string()
  });
  const receiptSchema = z.object({
    id: z.string(), code: z.string(), purchaseCode: z.string(), date: z.string(), supplier: z.string(),
    lot: z.string(), expiry: z.string(), temperature: z.number().nullable(), packaging: z.string(),
    status: z.string(), lines: z.string(), correctiveAction: z.string()
  });
  const dailyEntrySchema = z.object({
    id: z.string(), requestId: z.string(), date: z.string(), type: z.string(), description: z.string(),
    status: z.string(), amount: z.number().optional(), supplier: z.string().optional(),
    responsible: z.string().optional(), actualTime: z.string().optional(), closingNotes: z.string().optional(),
    createdAt: z.string(), updatedAt: z.string()
  });
  const productSchema = z.object({
    id: z.string(), code: z.string(), name: z.string(), family: z.string(), unit: z.string(),
    price: z.number(), stock: z.number(), min: z.number(), supplierId: z.string(), notes: z.string(),
    active: z.boolean(), pricePending: z.boolean(), purchasable: z.boolean()
  });
  const ingredientSchema = z.object({
    productId: z.string(), name: z.string(), qty: z.number(), unit: z.string(),
    asNeeded: z.boolean(), qtyText: z.string()
  });
  const baseUseSchema = z.object({
    baseId: z.string(), name: z.string(), qty: z.number(), unit: z.string()
  });
  const kitchenBaseSchema = z.object({
    id: z.string(), name: z.string(), type: z.string(), station: z.string(),
    yield: z.number().nullable(), yieldMin: z.number().nullable(), yieldMax: z.number().nullable(),
    yieldUnit: z.string(), yieldPending: z.boolean(), yieldApproximate: z.boolean(),
    life: z.string(), initialQtyText: z.string(), packText: z.string(), conservation: z.string(),
    ingredients: z.array(ingredientSchema), baseUses: z.array(baseUseSchema),
    process: z.string(), source: z.string(), sourceFile: z.string(), transcriptionNotes: z.string()
  });
  const ingredientInputSchema = z.object({
    productId: z.string().max(160).optional(), productName: z.string().max(200).optional(),
    qty: z.number().finite().min(0).optional(), unit: z.enum(PRODUCT_UNITS),
    asNeeded: z.boolean().optional()
  });
  const baseUseInputSchema = z.object({
    baseId: z.string().max(160).optional(), baseName: z.string().max(200).optional(),
    qty: z.number().finite().positive(), unit: z.enum(PRODUCT_UNITS)
  });

  server.registerTool('get_system_status', {
    title: 'Comprovar connexió amb ARCADI',
    description: 'Comprova que ChatGPT pot comunicar-se amb el servidor d’ARCADI GESTIO RESTAURANT. No consulta ni modifica dades del restaurant.',
    inputSchema: {},
    outputSchema: { ok: z.boolean(), app: z.string(), connectorVersion: z.string(), serverTime: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'noauth' }],
    _meta: { securitySchemes: [{ type: 'noauth' }] }
  }, async () => {
    const status = context.getStatus();
    return {
      content: [{ type: 'text', text: status.ok ? 'Connexió correcta amb ARCADI GESTIO RESTAURANT.' : 'ARCADI GESTIO RESTAURANT no està disponible.' }],
      structuredContent: status
    };
  });

  server.registerTool('get_daily_status', {
    title: 'Veure resum operatiu del dia',
    description: 'Consulta el resum d’un dia: reserves, grups, comandes, recepcions i controls diaris. Si no s’indica data, utilitza avui a Europe/Madrid.',
    inputSchema: { date: dateSchema.optional() },
    outputSchema: {
      date: z.string(),
      totals: z.object({ reservations: z.number(), pax: z.number(), groups: z.number(), purchaseOrders: z.number(), goodsReceipts: z.number(), dailyOperations: z.number(), pendingOperations: z.number() }),
      reservations: z.array(reservationSchema), groups: z.array(groupSchema),
      purchaseOrders: z.array(purchaseSchema), goodsReceipts: z.array(receiptSchema),
      dailyOperations: z.array(dailyEntrySchema)
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }] }
  }, async ({ date }) => {
    if (!requireScope(context, READ_SCOPE)) return authFailure(context, READ_SCOPE);
    const targetDate = normalizeDate(date);
    const data = context.readData();
    const reservations = (data.reservations || []).filter(item => item.date === targetDate).map(sanitizeReservation).sort(byDateAndTime);
    const groups = (data.groupEvents || []).filter(item => item.date === targetDate).map(sanitizeGroup).sort(byDateAndTime);
    const purchaseOrders = (data.purchaseOrders || []).filter(item => item.date === targetDate).map(sanitizePurchase).sort(byDateAndTime);
    const goodsReceipts = (data.goodsReceipts || []).filter(item => item.date === targetDate).map(sanitizeReceipt).sort(byDateAndTime);
    const dailyOperations = (data.dailyOperations || []).filter(item => item.date === targetDate).map(sanitizeDailyEntry).sort(byDateAndTime);
    const result = {
      date: targetDate,
      totals: {
        reservations: reservations.length,
        pax: reservations.filter(item => !/cancel/i.test(item.status)).reduce((sum, item) => sum + item.pax, 0),
        groups: groups.length,
        purchaseOrders: purchaseOrders.length,
        goodsReceipts: goodsReceipts.length,
        dailyOperations: dailyOperations.length,
        pendingOperations: dailyOperations.filter(item => item.status !== 'Completat').length
      },
      reservations, groups, purchaseOrders, goodsReceipts, dailyOperations
    };
    return {
      content: [{ type: 'text', text: `Resum operatiu del ${targetDate}: ${result.totals.reservations} reserves (${result.totals.pax} pax), ${result.totals.groups} grups i ${result.totals.pendingOperations} controls pendents.` }],
      structuredContent: result
    };
  });

  server.registerTool('list_reservations', {
    title: 'Consultar reserves',
    description: 'Llista reserves reals dins un interval de dates, amb contacte, persones, menú, estat i fiança. No retorna tokens de gestió ni identificadors de Stripe.',
    inputSchema: {
      date_from: dateSchema, date_to: dateSchema, status: z.string().max(80).optional(),
      limit: z.number().int().min(1).max(100).optional()
    },
    outputSchema: { date_from: z.string(), date_to: z.string(), count: z.number(), items: z.array(reservationSchema) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }] }
  }, async ({ date_from, date_to, status, limit }) => {
    if (!requireScope(context, READ_SCOPE)) return authFailure(context, READ_SCOPE);
    if (date_from > date_to) return toolError('date_from no pot ser posterior a date_to.');
    const wantedStatus = cleanText(status, 80).toLocaleLowerCase('ca');
    const items = (context.readData().reservations || [])
      .filter(item => inDateRange(item.date, date_from, date_to))
      .filter(item => !wantedStatus || String(item.status || '').toLocaleLowerCase('ca') === wantedStatus)
      .map(sanitizeReservation).sort(byDateAndTime).slice(0, limit || 100);
    const result = { date_from, date_to, count: items.length, items };
    return { content: [{ type: 'text', text: `${items.length} reserves entre ${date_from} i ${date_to}.` }], structuredContent: result };
  });

  server.registerTool('list_purchases', {
    title: 'Consultar compres i recepcions',
    description: 'Consulta comandes GS-COMP i recepcions GS-REC dins un interval, opcionalment filtrades per proveïdor o estat.',
    inputSchema: {
      date_from: dateSchema, date_to: dateSchema, supplier: z.string().max(160).optional(),
      status: z.string().max(80).optional(), limit: z.number().int().min(1).max(100).optional()
    },
    outputSchema: { date_from: z.string(), date_to: z.string(), purchaseOrders: z.array(purchaseSchema), goodsReceipts: z.array(receiptSchema) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }] }
  }, async ({ date_from, date_to, supplier, status, limit }) => {
    if (!requireScope(context, READ_SCOPE)) return authFailure(context, READ_SCOPE);
    if (date_from > date_to) return toolError('date_from no pot ser posterior a date_to.');
    const wantedSupplier = cleanText(supplier, 160).toLocaleLowerCase('ca');
    const wantedStatus = cleanText(status, 80).toLocaleLowerCase('ca');
    const matches = item => inDateRange(item.date, date_from, date_to)
      && (!wantedSupplier || String(item.supplier || '').toLocaleLowerCase('ca').includes(wantedSupplier))
      && (!wantedStatus || String(item.status || '').toLocaleLowerCase('ca') === wantedStatus);
    const data = context.readData();
    const maximum = limit || 100;
    const result = {
      date_from, date_to,
      purchaseOrders: (data.purchaseOrders || []).filter(matches).map(sanitizePurchase).sort(byDateAndTime).slice(0, maximum),
      goodsReceipts: (data.goodsReceipts || []).filter(matches).map(sanitizeReceipt).sort(byDateAndTime).slice(0, maximum)
    };
    return {
      content: [{ type: 'text', text: `${result.purchaseOrders.length} comandes i ${result.goodsReceipts.length} recepcions entre ${date_from} i ${date_to}.` }],
      structuredContent: result
    };
  });

  server.registerTool('list_products', {
    title: 'Consultar productes de magatzem',
    description: 'Cerca productes reals del magatzem per nom, codi o família. Retorna preu, stock i si el preu encara s’ha de confirmar en una recepció.',
    inputSchema: {
      query: z.string().max(200).optional(), family: z.string().max(120).optional(),
      active: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional()
    },
    outputSchema: { count: z.number(), items: z.array(productSchema) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }] }
  }, async ({ query, family, active, limit }) => {
    if (!requireScope(context, READ_SCOPE)) return authFailure(context, READ_SCOPE);
    const wanted = normalizedName(query);
    const wantedFamily = normalizedName(family);
    const items = (context.readData().products || [])
      .filter(item => active === undefined || (item.active !== false) === active)
      .filter(item => !wantedFamily || normalizedName(item.family) === wantedFamily)
      .filter(item => !wanted || normalizedName(`${item.code || ''} ${item.name || ''}`).includes(wanted))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ca'))
      .slice(0, limit || 100)
      .map(sanitizeProduct);
    return {
      content: [{ type: 'text', text: `${items.length} productes trobats al magatzem.` }],
      structuredContent: { count: items.length, items }
    };
  });

  server.registerTool('upsert_product', {
    title: 'Crear o actualitzar un producte',
    description: 'Crea un producte si no existeix o actualitza el producte indicat. Si no s’envia preu en una alta, queda a 0 i pendent de confirmar a la recepció. No duplica noms ni requestId.',
    inputSchema: {
      requestId: z.string().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
      id: z.string().max(160).optional(), code: z.string().max(40).optional(),
      name: z.string().min(1).max(200), family: z.string().min(1).max(120),
      unit: z.enum(PRODUCT_UNITS), price: z.number().finite().min(0).optional(),
      stock: z.number().finite().min(0).optional(), min: z.number().finite().min(0).optional(),
      supplierId: z.string().max(160).optional(), notes: z.string().max(1000).optional(),
      active: z.boolean().optional(), purchasable: z.boolean().optional()
    },
    outputSchema: { created: z.boolean(), updated: z.boolean(), product: productSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }] }
  }, async input => {
    if (!requireScope(context, WRITE_SCOPE)) return authFailure(context, WRITE_SCOPE);
    const result = await context.mutateData(data => {
      data.products = data.products || [];
      let product = input.id ? data.products.find(item => item.id === input.id) : null;
      if (!product) product = data.products.find(item => normalizedName(item.name) === normalizedName(input.name));
      if (product?.lastRequestId === input.requestId) {
        return { created: false, updated: false, product: sanitizeProduct(product) };
      }
      const created = !product;
      if (!product) {
        product = {
          id: input.id || `product_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
          price: 0, stock: 0, min: 0, supplierId: '', notes: '', active: true,
          pricePending: input.price === undefined, purchasable: true
        };
        data.products.push(product);
      }
      product.name = cleanText(input.name, 200);
      product.family = cleanText(input.family, 120);
      product.unit = input.unit;
      product.code = cleanOptionalText(input.code, 40) || product.code || nextProductCode(data, product.family);
      if (input.price !== undefined) {
        product.price = input.price;
        product.pricePending = false;
      } else if (created) {
        product.price = 0;
        product.pricePending = true;
      }
      if (input.stock !== undefined) product.stock = input.stock;
      if (input.min !== undefined) product.min = input.min;
      if (input.supplierId !== undefined) product.supplierId = cleanText(input.supplierId, 160);
      if (input.notes !== undefined) product.notes = cleanText(input.notes, 1000);
      if (input.active !== undefined) product.active = input.active;
      if (input.purchasable !== undefined) product.purchasable = input.purchasable;
      product.lastRequestId = input.requestId;
      product.updatedAt = new Date().toISOString();
      product.updatedBy = context.auth.user;
      return { created, updated: !created, product: sanitizeProduct(product) };
    });
    return {
      content: [{
        type: 'text',
        text: result.created
          ? `Producte creat: ${result.product.name}. Preu ${result.product.pricePending ? 'pendent de recepció' : 'informat'}.`
          : result.updated ? `Producte actualitzat: ${result.product.name}.` : `La petició ja estava aplicada a ${result.product.name}.`
      }],
      structuredContent: result
    };
  });

  server.registerTool('list_kitchen_bases', {
    title: 'Consultar bases de cuina',
    description: 'Consulta les bases de cuina amb rendiments, productes directes, altres bases utilitzades i dades transcrites de la fitxa tècnica.',
    inputSchema: {
      query: z.string().max(200).optional(), sourceFile: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(100).optional()
    },
    outputSchema: { count: z.number(), items: z.array(kitchenBaseSchema) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [READ_SCOPE] }] }
  }, async ({ query, sourceFile, limit }) => {
    if (!requireScope(context, READ_SCOPE)) return authFailure(context, READ_SCOPE);
    const wanted = normalizedName(query);
    const wantedFile = cleanText(sourceFile, 120);
    const items = (context.readData().bases || [])
      .filter(item => !wanted || normalizedName(item.name).includes(wanted))
      .filter(item => !wantedFile || String(item.sourceFile || '') === wantedFile)
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ca'))
      .slice(0, limit || 100)
      .map(sanitizeKitchenBase);
    return {
      content: [{ type: 'text', text: `${items.length} bases de cuina trobades.` }],
      structuredContent: { count: items.length, items }
    };
  });

  server.registerTool('upsert_kitchen_base', {
    title: 'Crear o actualitzar una base de cuina',
    description: 'Crea o actualitza una base tècnica sense duplicar-la. Permet productes directes, dependències d’altres bases, rendiment exacte, rang o pendent, i quantitats SCP.',
    inputSchema: {
      requestId: z.string().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
      id: z.string().max(160).optional(), name: z.string().min(1).max(200),
      type: z.string().max(120).optional(), station: z.string().max(120).optional(),
      yield: z.number().finite().positive().nullable().optional(),
      yieldMin: z.number().finite().positive().nullable().optional(),
      yieldMax: z.number().finite().positive().nullable().optional(),
      yieldUnit: z.enum(PRODUCT_UNITS).optional(), life: z.string().max(200).optional(),
      initialQtyText: z.string().max(200).optional(), packText: z.string().max(200).optional(),
      conservation: z.string().max(300).optional(), process: z.string().max(6000).optional(),
      transcriptionNotes: z.string().max(1000).optional(),
      ingredients: z.array(ingredientInputSchema).max(100).optional(),
      baseUses: z.array(baseUseInputSchema).max(50).optional()
    },
    outputSchema: { created: z.boolean(), updated: z.boolean(), base: kitchenBaseSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }] }
  }, async input => {
    if (!requireScope(context, WRITE_SCOPE)) return authFailure(context, WRITE_SCOPE);
    const result = await context.mutateData(data => {
      data.products = data.products || [];
      data.bases = data.bases || [];
      let base = input.id ? data.bases.find(item => item.id === input.id) : null;
      if (!base) base = data.bases.find(item => normalizedName(item.name) === normalizedName(input.name));
      if (base?.lastRequestId === input.requestId) {
        return { created: false, updated: false, base: sanitizeKitchenBase(base) };
      }

      const resolveIngredients = () => {
        if (input.ingredients === undefined) return undefined;
        const items = [];
        for (const ingredient of input.ingredients) {
          const product = ingredient.productId
            ? data.products.find(item => item.id === ingredient.productId)
            : data.products.find(item => normalizedName(item.name) === normalizedName(ingredient.productName));
          if (!product) return { error: `No s’ha trobat el producte ${ingredient.productId || ingredient.productName || '(sense nom)'}.` };
          if (!ingredient.asNeeded && ingredient.qty === undefined) {
            return { error: `Falta la quantitat de ${product.name}; indica-la o marca-la com a SCP.` };
          }
          items.push({
            productId: product.id, name: product.name, qty: ingredient.asNeeded ? 0 : ingredient.qty,
            unit: ingredient.unit, asNeeded: ingredient.asNeeded === true,
            qtyText: ingredient.asNeeded ? 'SCP' : ''
          });
        }
        return items;
      };
      const resolveBaseUses = () => {
        if (input.baseUses === undefined) return undefined;
        const items = [];
        for (const use of input.baseUses) {
          const used = use.baseId
            ? data.bases.find(item => item.id === use.baseId)
            : data.bases.find(item => normalizedName(item.name) === normalizedName(use.baseName));
          if (!used) return { error: `No s’ha trobat la base ${use.baseId || use.baseName || '(sense nom)'}.` };
          if (base && used.id === base.id) return { error: 'Una base no es pot utilitzar a si mateixa.' };
          items.push({ baseId: used.id, name: used.name, qty: use.qty, unit: use.unit });
        }
        return items;
      };

      const ingredients = resolveIngredients();
      if (ingredients?.error) return ingredients;
      const baseUses = resolveBaseUses();
      if (baseUses?.error) return baseUses;

      const created = !base;
      if (!base) {
        base = {
          id: input.id || `base_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
          ingredients: [], baseUses: [], techniques: [], process: '', life: '', source: 'ChatGPT'
        };
        data.bases.push(base);
      }
      base.name = cleanText(input.name, 200);
      if (input.type !== undefined) base.type = cleanText(input.type, 120);
      if (input.station !== undefined) base.station = cleanText(input.station, 120);
      if (input.yield !== undefined) base.yield = input.yield;
      if (input.yieldMin !== undefined) base.yieldMin = input.yieldMin;
      if (input.yieldMax !== undefined) base.yieldMax = input.yieldMax;
      if (input.yieldUnit !== undefined) base.yieldUnit = input.yieldUnit;
      if (input.life !== undefined) base.life = cleanText(input.life, 200);
      if (input.initialQtyText !== undefined) base.initialQtyText = cleanText(input.initialQtyText, 200);
      if (input.packText !== undefined) base.packText = cleanText(input.packText, 200);
      if (input.conservation !== undefined) base.conservation = cleanText(input.conservation, 300);
      if (input.process !== undefined) base.process = cleanText(input.process, 6000);
      if (input.transcriptionNotes !== undefined) base.transcriptionNotes = cleanText(input.transcriptionNotes, 1000);
      if (ingredients !== undefined) base.ingredients = ingredients;
      if (baseUses !== undefined) base.baseUses = baseUses;
      base.yieldPending = optionalNumber(base.yield) === null
        && optionalNumber(base.yieldMin) === null && optionalNumber(base.yieldMax) === null;
      base.lastRequestId = input.requestId;
      base.updatedAt = new Date().toISOString();
      base.updatedBy = context.auth.user;
      return { created, updated: !created, base: sanitizeKitchenBase(base) };
    });
    if (result.error) return toolError(result.error);
    return {
      content: [{
        type: 'text',
        text: result.created
          ? `Base creada: ${result.base.name}.`
          : result.updated ? `Base actualitzada: ${result.base.name}.` : `La petició ja estava aplicada a ${result.base.name}.`
      }],
      structuredContent: result
    };
  });

  server.registerTool('record_daily_entry', {
    title: 'Guardar un control diari',
    description: 'Crea un registre operatiu al llibre únic d’ARCADI: obertura, tancament, caixa, facturació, compra, recepció, grup, incidència, tasca, previsió o nota. requestId evita duplicats si es repeteix la petició.',
    inputSchema: {
      requestId: z.string().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
      date: dateSchema.optional(), type: z.enum(ENTRY_TYPES), description: z.string().min(1).max(1000),
      status: z.enum(ENTRY_STATUSES).optional(), amount: z.number().finite().min(0).max(100000000).optional(),
      supplier: z.string().max(160).optional(), responsible: z.string().max(160).optional(), actualTime: timeSchema.optional()
    },
    outputSchema: { created: z.boolean(), entry: dailyEntrySchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }] }
  }, async input => {
    if (!requireScope(context, WRITE_SCOPE)) return authFailure(context, WRITE_SCOPE);
    const result = await context.mutateData(data => {
      data.dailyOperations = data.dailyOperations || [];
      const existing = data.dailyOperations.find(item => item.requestId === input.requestId);
      if (existing) return { created: false, entry: sanitizeDailyEntry(existing) };
      const timestamp = new Date().toISOString();
      const entry = {
        id: `daily_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
        requestId: input.requestId, date: normalizeDate(input.date), type: input.type,
        description: cleanText(input.description, 1000), status: input.status || 'Pendent',
        amount: cleanAmount(input.amount), supplier: cleanOptionalText(input.supplier, 160),
        responsible: cleanOptionalText(input.responsible, 160), actualTime: cleanOptionalText(input.actualTime, 5),
        source: 'ChatGPT', createdBy: context.auth.user, createdAt: timestamp, updatedAt: timestamp
      };
      for (const key of Object.keys(entry)) if (entry[key] === undefined) delete entry[key];
      data.dailyOperations.push(entry);
      return { created: true, entry: sanitizeDailyEntry(entry) };
    });
    return {
      content: [{ type: 'text', text: result.created ? `Control guardat: ${result.entry.description}` : `Aquest control ja existia i no s’ha duplicat: ${result.entry.description}` }],
      structuredContent: result
    };
  });

  server.registerTool('update_daily_entry', {
    title: 'Actualitzar un control diari',
    description: 'Canvia l’estat d’un control diari existent i hi pot afegir hora real o nota de tancament. Repetir el mateix requestId no duplica cap acció.',
    inputSchema: {
      requestId: z.string().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/), id: z.string().min(1).max(160),
      status: z.enum(ENTRY_STATUSES), actualTime: timeSchema.optional(), closingNotes: z.string().max(1000).optional()
    },
    outputSchema: { updated: z.boolean(), entry: dailyEntrySchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }],
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [WRITE_SCOPE] }] }
  }, async input => {
    if (!requireScope(context, WRITE_SCOPE)) return authFailure(context, WRITE_SCOPE);
    const result = await context.mutateData(data => {
      data.dailyOperations = data.dailyOperations || [];
      const entry = data.dailyOperations.find(item => item.id === input.id);
      if (!entry) return null;
      if (entry.lastRequestId === input.requestId) return { updated: false, entry: sanitizeDailyEntry(entry) };
      entry.status = input.status;
      if (input.actualTime) entry.actualTime = input.actualTime;
      if (input.closingNotes !== undefined) entry.closingNotes = cleanText(input.closingNotes, 1000);
      entry.updatedAt = new Date().toISOString();
      entry.updatedBy = context.auth.user;
      entry.lastRequestId = input.requestId;
      return { updated: true, entry: sanitizeDailyEntry(entry) };
    });
    if (!result) return toolError(`No s’ha trobat el control ${input.id}.`);
    return {
      content: [{ type: 'text', text: result.updated ? `Control ${result.entry.id} actualitzat a ${result.entry.status}.` : `El control ${result.entry.id} ja tenia aplicada aquesta petició.` }],
      structuredContent: result
    };
  });

  return server;
}

async function handleMcpRequest(req, res, context) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate'
    });
    res.end();
    return;
  }
  if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'POST, GET, DELETE, OPTIONS' });
    res.end('Method Not Allowed');
    return;
  }

  const { StreamableHTTPServerTransport } = await loadSdk();
  const mcpServer = await createArcadiMcpServer(context);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
  res.on('close', () => {
    transport.close();
    mcpServer.close();
  });
  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error MCP:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error intern del connector MCP' }));
    }
  }
}

module.exports = { createArcadiMcpServer, handleMcpRequest };
