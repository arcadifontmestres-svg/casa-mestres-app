'use strict';

const fs = require('fs');
const path = require('path');
const instagram = require('./instagram-graph.js');

const APP_URL = String(process.env.APP_BASE_URL || 'https://casa-mestres-restaurant-app.onrender.com').replace(/\/$/, '');
const SOURCE_IMAGE_URL = `${APP_URL}/social/sarriera-ja-hi-som.jpg`;
const IMAGE_URL = `https://images.weserv.nl/?url=${encodeURIComponent(SOURCE_IMAGE_URL)}&w=1080&h=1920&fit=cover&output=jpg`;
const DATA_DIR = String(process.env.DATA_DIR || '/var/data');
const MARKER = path.join(DATA_DIR, 'instagram-first-story-sarriera-20260927.json');
const IMAGE_B64 = path.join(__dirname, 'public', 'social', 'sarriera-ja-hi-som-360x640.b64');
const IMAGE_FILE = path.join(__dirname, 'public', 'social', 'sarriera-ja-hi-som.jpg');

function ensureMetaCompatibleImage() {
  if (!fs.existsSync(IMAGE_B64)) return;
  const encoded = fs.readFileSync(IMAGE_B64, 'utf8').trim();
  if (!encoded) return;
  fs.writeFileSync(IMAGE_FILE, Buffer.from(encoded, 'base64'));
  console.log('[Instagram] Origen Story preparat; Meta rebrà JPEG 1080x1920 via URL pública.');
}

function scheduleFirstStory() {
  ensureMetaCompatibleImage();

  if (!process.env.META_SYSTEM_USER_TOKEN || !process.env.IG_USER_ID) {
    console.log('[Instagram] Primera story pendent: configuració incompleta.');
    return;
  }
  if (fs.existsSync(MARKER)) {
    console.log('[Instagram] Primera story ja publicada; no es repeteix.');
    return;
  }

  let attempts = 0;
  const run = async () => {
    attempts += 1;
    try {
      const probe = await fetch(IMAGE_URL, { method: 'GET' });
      const probeInfo = {
        status: probe.status,
        ok: probe.ok,
        contentType: probe.headers.get('content-type'),
        contentLength: probe.headers.get('content-length'),
        imageUrl: IMAGE_URL
      };
      console.log(`[Instagram] IMAGE_PROBE ${JSON.stringify(probeInfo)}`);
      if (!probe.ok) throw new Error(`imatge pública no disponible (HTTP ${probe.status})`);

      const result = await instagram.publishImage({ imageUrl: IMAGE_URL, mediaType: 'STORY' });
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MARKER, JSON.stringify({ publishedAt: new Date().toISOString(), imageUrl: IMAGE_URL, ...result }, null, 2));
      console.log(`[Instagram] FIRST_STORY_PUBLISHED mediaId=${result.mediaId}`);
    } catch (error) {
      const diagnostic = {
        event: 'FIRST_STORY_FAILED',
        intent: attempts,
        message: error.message,
        stage: error.metaStage || null,
        httpStatus: error.metaHttpStatus || error.statusCode || null,
        type: error.metaType || null,
        code: error.metaCode ?? null,
        errorSubcode: error.metaSubcode ?? null,
        fbtraceId: error.metaFbtraceId || null
      };
      console.error(`[Instagram] META_ERROR ${JSON.stringify(diagnostic)}`);
      if (attempts < 3) setTimeout(run, 30000);
    }
  };

  setTimeout(run, 15000);
}

module.exports = { scheduleFirstStory, ensureMetaCompatibleImage };
