'use strict';

const { createClient } = require('redis');

function createMiniappState({ legacyStore } = {}) {
  const url = String(process.env.MINIAPPS_REDIS_URL || '').trim();
  let client = null;
  let connecting = null;
  const memory = new Map();

  async function connection() {
    if (!url) return null;
    if (client?.isReady) return client;
    if (!client) {
      client = createClient({ url });
      client.on('error', error => console.error('MINIAPPS REDIS:', error.message));
    }
    if (!connecting) connecting = client.connect().finally(() => { connecting = null; });
    await connecting;
    return client;
  }

  function key(app, centerId) {
    return 'arcadi:miniapp:' + String(app) + ':' + String(centerId);
  }

  async function read(app, centerId, fallbackFactory = () => ({})) {
    const k = key(app, centerId);
    const redis = await connection();
    if (redis) {
      const raw = await redis.get(k);
      if (raw) return JSON.parse(raw);
    }
    if (memory.has(k)) return JSON.parse(JSON.stringify(memory.get(k)));
    const fallback = await fallbackFactory();
    memory.set(k, JSON.parse(JSON.stringify(fallback)));
    if (redis) await redis.set(k, JSON.stringify(fallback));
    return JSON.parse(JSON.stringify(fallback));
  }

  async function write(app, centerId, value) {
    const k = key(app, centerId);
    const clean = JSON.parse(JSON.stringify(value || {}));
    memory.set(k, clean);
    const redis = await connection();
    if (redis) await redis.set(k, JSON.stringify(clean));
    return JSON.parse(JSON.stringify(clean));
  }

  async function update(app, centerId, fallbackFactory, mutator) {
    const current = await read(app, centerId, fallbackFactory);
    const result = await mutator(current);
    await write(app, centerId, current);
    return result;
  }

  async function probe() {
    const redis = await connection().catch(() => null);
    if (!redis) return false;
    const k = 'arcadi:miniapp:health';
    const v = String(Date.now());
    await redis.set(k, v, { EX: 60 });
    return (await redis.get(k)) === v;
  }

  return { read, write, update, probe, hasPersistentBackend: () => Boolean(url) };
}

module.exports = { createMiniappState };
