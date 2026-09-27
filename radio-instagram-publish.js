'use strict';

const fs = require('fs');
const path = require('path');
const instagram = require('./instagram-graph.js');

const APP_URL = String(process.env.APP_BASE_URL || 'https://casa-mestres-restaurant-app.onrender.com').replace(/\/$/, '');
const SOURCE_URL = `${APP_URL}/social/radio-vilafranca.jpg`;
const STORY_URL = `https://images.weserv.nl/?url=${encodeURIComponent(SOURCE_URL)}&w=540&h=960&fit=contain&bg=000000&output=jpg`;
const DATA_DIR = String(process.env.DATA_DIR || '/var/data');
const MARKER = path.join(DATA_DIR, 'instagram-radio-vilafranca-20260927.json');
const IMAGE_B64 = path.join(__dirname, 'public', 'social', 'radio-vilafranca-540x675.b64');
const IMAGE_FILE = path.join(__dirname, 'public', 'social', 'radio-vilafranca.jpg');
const CAPTION = 'A Ràdio Vilafranca. Joan Ramon i Arcadi Font Mestres, compartint projecte, cuina i territori. 🎙️\n\n#Sarriera1930 #RadioVilafranca #VilafrancaDelPenedes';

function ensureAsset() {
  const encoded = fs.readFileSync(IMAGE_B64, 'utf8').trim();
  fs.writeFileSync(IMAGE_FILE, Buffer.from(encoded, 'base64'));
  console.log('[Instagram][Radio] Asset preparat per Feed i Story.');
}

function readState() {
  try { return JSON.parse(fs.readFileSync(MARKER, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MARKER, JSON.stringify(state, null, 2));
}

async function probe(url) {
  const response = await fetch(url, { method: 'GET' });
  console.log(`[Instagram][Radio] PROBE ${response.status} ${url}`);
  if (!response.ok) throw new Error(`asset públic no disponible (HTTP ${response.status})`);
}

function logMetaError(label, error) {
  console.error(`[Instagram][Radio] ${label}_FAILED ${JSON.stringify({
    message: error.message,
    stage: error.metaStage || null,
    httpStatus: error.metaHttpStatus || error.statusCode || null,
    type: error.metaType || null,
    code: error.metaCode ?? null,
    errorSubcode: error.metaSubcode ?? null,
    fbtraceId: error.metaFbtraceId || null
  })}`);
}

async function publishMissing() {
  ensureAsset();

  if (!process.env.META_SYSTEM_USER_TOKEN || !process.env.IG_USER_ID) {
    console.log('[Instagram][Radio] Publicació pendent: configuració Meta incompleta.');
    return;
  }

  const state = readState();

  if (!state.feed?.mediaId) {
    try {
      await probe(SOURCE_URL);
      const feed = await instagram.publishImage({ imageUrl: SOURCE_URL, caption: CAPTION, mediaType: 'FEED' });
      state.feed = { ...feed, publishedAt: new Date().toISOString(), imageUrl: SOURCE_URL };
      saveState(state);
      console.log(`[Instagram][Radio] FEED_PUBLISHED mediaId=${feed.mediaId}`);
    } catch (error) {
      logMetaError('FEED', error);
    }
  }

  if (!state.story?.mediaId) {
    try {
      await probe(STORY_URL);
      const story = await instagram.publishImage({ imageUrl: STORY_URL, mediaType: 'STORY' });
      state.story = { ...story, publishedAt: new Date().toISOString(), imageUrl: STORY_URL };
      saveState(state);
      console.log(`[Instagram][Radio] STORY_PUBLISHED mediaId=${story.mediaId}`);
    } catch (error) {
      logMetaError('STORY', error);
    }
  }

  if (state.feed?.mediaId && state.story?.mediaId) {
    console.log('[Instagram][Radio] PUBLICATION_COMPLETE feed+story');
  }
}

function scheduleRadioVilafrancaInstagram() {
  setTimeout(() => {
    publishMissing().catch(error => logMetaError('UNHANDLED', error));
  }, 15000);
}

module.exports = { scheduleRadioVilafrancaInstagram, publishMissing };
