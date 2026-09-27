'use strict';

const fs = require('fs');
const path = require('path');
const instagram = require('./instagram-graph.js');

const APP_URL = String(process.env.APP_BASE_URL || 'https://casa-mestres-restaurant-app.onrender.com').replace(/\/$/, '');
const IMAGE_URL = `${APP_URL}/social/sarriera-ja-hi-som.jpg`;
const DATA_DIR = String(process.env.DATA_DIR || '/var/data');
const MARKER = path.join(DATA_DIR, 'instagram-first-story-sarriera-20260927.json');
const IMAGE_B64 = path.join(__dirname, 'public', 'social', 'sarriera-ja-hi-som-360x640.b64');
const IMAGE_FILE = path.join(__dirname, 'public', 'social', 'sarriera-ja-hi-som.jpg');

function ensureMetaCompatibleImage() {
  if (!fs.existsSync(IMAGE_B64)) return;
  const encoded = fs.readFileSync(IMAGE_B64, 'utf8').trim();
  if (!encoded) return;
  fs.writeFileSync(IMAGE_FILE, Buffer.from(encoded, 'base64'));
  console.log('[Instagram] Story preparada en JPEG 360x640 compatible amb Meta.');
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
      if (!probe.ok) throw new Error(`imatge pública no disponible (HTTP ${probe.status})`);

      const result = await instagram.publishImage({ imageUrl: IMAGE_URL, mediaType: 'STORY' });
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MARKER, JSON.stringify({ publishedAt: new Date().toISOString(), imageUrl: IMAGE_URL, ...result }, null, 2));
      console.log(`[Instagram] FIRST_STORY_PUBLISHED mediaId=${result.mediaId}`);
    } catch (error) {
      console.error(`[Instagram] FIRST_STORY_FAILED intent=${attempts}: ${error.message}`);
      if (attempts < 3) setTimeout(run, 30000);
    }
  };

  setTimeout(run, 15000);
}

module.exports = { scheduleFirstStory, ensureMetaCompatibleImage };
