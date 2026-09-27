'use strict';

const assert = require('assert');
const instagram = require('../instagram-graph.js');

async function run() {
  const oldFetch = global.fetch;
  const oldUser = process.env.IG_USER_ID;
  const oldToken = process.env.META_SYSTEM_USER_TOKEN;
  const oldPortfolio = process.env.META_BUSINESS_PORTFOLIO_ID;

  process.env.IG_USER_ID = '17841400000000000';
  process.env.META_SYSTEM_USER_TOKEN = 'system-user-token-test';
  process.env.META_BUSINESS_PORTFOLIO_ID = '1751863422765388';

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: String(options.body) });
    if (calls.length === 1) return { ok: true, status: 200, json: async () => ({ id: 'creation_123' }) };
    return { ok: true, status: 200, json: async () => ({ id: 'media_456' }) };
  };

  try {
    const result = await instagram.publishImage({
      imageUrl: 'https://example.com/story.jpg',
      mediaType: 'STORY'
    });

    assert.equal(result.ok, true);
    assert.equal(result.creationId, 'creation_123');
    assert.equal(result.mediaId, 'media_456');
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/v20\.0\/17841400000000000\/media$/);
    assert.match(calls[1].url, /\/v20\.0\/17841400000000000\/media_publish$/);
    assert.match(calls[0].body, /image_url=https%3A%2F%2Fexample\.com%2Fstory\.jpg/);
    assert.match(calls[0].body, /media_type=STORIES/);
    assert.match(calls[0].body, /access_token=system-user-token-test/);
    assert.match(calls[1].body, /creation_id=creation_123/);
    assert.match(calls[1].body, /access_token=system-user-token-test/);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'systemUserToken'), false);

    console.log('OK instagram-graph: crea contenidor i publica sense exposar el token');
  } finally {
    global.fetch = oldFetch;
    if (oldUser === undefined) delete process.env.IG_USER_ID; else process.env.IG_USER_ID = oldUser;
    if (oldToken === undefined) delete process.env.META_SYSTEM_USER_TOKEN; else process.env.META_SYSTEM_USER_TOKEN = oldToken;
    if (oldPortfolio === undefined) delete process.env.META_BUSINESS_PORTFOLIO_ID; else process.env.META_BUSINESS_PORTFOLIO_ID = oldPortfolio;
  }
}

run().catch(error => { console.error(error); process.exit(1); });
