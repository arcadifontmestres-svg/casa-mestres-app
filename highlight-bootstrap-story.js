'use strict';

const fs = require('fs');
const path = require('path');
const instagram = require('./instagram-graph.js');

const APP_URL = String(process.env.APP_BASE_URL || 'https://casa-mestres-restaurant-app.onrender.com').replace(/\/$/, '');
const SOURCE_IMAGE_URL = `${APP_URL}/social/coca-enramada-story-clean.svg`;
const IMAGE_URL = `https://images.weserv.nl/?url=${encodeURIComponent(SOURCE_IMAGE_URL)}&w=1080&h=1920&fit=cover&output=jpg&q=90`;
const DATA_DIR = String(process.env.DATA_DIR || '/var/data');
const MARKER = path.join(DATA_DIR, 'instagram-highlight-bootstrap-story-clean-v2-20260927.json');

function scheduleHighlightBootstrapStory() {
  if (!process.env.META_SYSTEM_USER_TOKEN || !process.env.IG_USER_ID) {
    console.log('[Instagram] Story Destacades pendent: configuració incompleta.');
    return;
  }
  if (fs.existsSync(MARKER)) {
    console.log('[Instagram] Story Destacades neta ja publicada; no es repeteix.');
    return;
  }

  let attempts = 0;
  const run = async () => {
    attempts += 1;
    try {
      const probe = await fetch(IMAGE_URL, { method: 'GET' });
      console.log(`[Instagram] CLEAN_STORY_PROBE ${JSON.stringify({status:probe.status,ok:probe.ok,contentType:probe.headers.get('content-type'),contentLength:probe.headers.get('content-length'),imageUrl:IMAGE_URL})}`);
      if (!probe.ok) throw new Error(`imatge pública no disponible (HTTP ${probe.status})`);
      if (!String(probe.headers.get('content-type') || '').startsWith('image/jpeg')) throw new Error('la conversió no ha retornat JPEG');

      const result = await instagram.publishImage({ imageUrl: IMAGE_URL, mediaType: 'STORY' });
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(MARKER, JSON.stringify({ publishedAt: new Date().toISOString(), imageUrl: IMAGE_URL, ...result }, null, 2));
      console.log(`[Instagram] CLEAN_STORY_PUBLISHED mediaId=${result.mediaId}`);
    } catch (error) {
      console.error(`[Instagram] CLEAN_STORY_ERROR ${JSON.stringify({attempt:attempts,message:error.message,stage:error.metaStage||null,httpStatus:error.metaHttpStatus||error.statusCode||null,code:error.metaCode??null,fbtraceId:error.metaFbtraceId||null})}`);
      if (attempts < 3) setTimeout(run, 30000);
    }
  };

  setTimeout(run, 15000);
}

module.exports = { scheduleHighlightBootstrapStory };
