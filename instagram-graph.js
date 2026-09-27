'use strict';

const GRAPH_VERSION = 'v20.0';
const GRAPH_ROOT = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_PORTFOLIO_ID = '1751863422765388';

function config() {
  return {
    graphVersion: GRAPH_VERSION,
    portfolioId: String(process.env.META_BUSINESS_PORTFOLIO_ID || DEFAULT_PORTFOLIO_ID).trim(),
    igUserId: String(process.env.IG_USER_ID || '').trim(),
    systemUserToken: String(process.env.META_SYSTEM_USER_TOKEN || '').trim()
  };
}

function status() {
  const current = config();
  return {
    configured: Boolean(current.igUserId && current.systemUserToken),
    graphVersion: current.graphVersion,
    portfolioId: current.portfolioId,
    igUserId: current.igUserId || null
  };
}

function validateHttpsUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); }
  catch { throw Object.assign(new Error('imageUrl no és una URL vàlida.'), { statusCode: 400 }); }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('imageUrl ha de ser una URL pública HTTPS.'), { statusCode: 400 });
  }
  return parsed.toString();
}

async function graphPost(pathname, params, stage = 'graph_post') {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
  }

  const response = await fetch(`${GRAPH_ROOT}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const meta = payload?.error || {};
    const message = meta.message || `Meta Graph API ha retornat HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
    error.metaStage = stage;
    error.metaType = meta.type || null;
    error.metaCode = meta.code ?? null;
    error.metaSubcode = meta.error_subcode ?? null;
    error.metaFbtraceId = meta.fbtrace_id || null;
    error.metaHttpStatus = response.status;
    throw error;
  }
  return payload;
}

async function publishImage({ imageUrl, caption = '', mediaType = 'FEED' }) {
  const current = config();
  if (!current.igUserId || !current.systemUserToken) {
    throw Object.assign(new Error('Falten IG_USER_ID o META_SYSTEM_USER_TOKEN al servidor.'), { statusCode: 503 });
  }

  const normalizedType = String(mediaType || 'FEED').trim().toUpperCase();
  if (!['FEED', 'STORY'].includes(normalizedType)) {
    throw Object.assign(new Error('mediaType ha de ser FEED o STORY.'), { statusCode: 400 });
  }

  const containerInput = {
    image_url: validateHttpsUrl(imageUrl),
    access_token: current.systemUserToken
  };
  if (normalizedType === 'STORY') containerInput.media_type = 'STORIES';
  else if (caption) containerInput.caption = String(caption).slice(0, 2200);

  const container = await graphPost(`/${encodeURIComponent(current.igUserId)}/media`, containerInput, 'media_create');
  if (!container.id) throw Object.assign(new Error('Meta no ha retornat cap creation_id.'), { statusCode: 502, metaStage: 'media_create' });

  if (normalizedType === 'STORY') {
    await new Promise(resolve => setTimeout(resolve, 12000));
  }

  const published = await graphPost(`/${encodeURIComponent(current.igUserId)}/media_publish`, {
    creation_id: container.id,
    access_token: current.systemUserToken
  }, 'media_publish');
  if (!published.id) throw Object.assign(new Error('Meta no ha retornat l’identificador de publicació.'), { statusCode: 502, metaStage: 'media_publish' });

  return {
    ok: true,
    mediaType: normalizedType,
    creationId: String(container.id),
    mediaId: String(published.id),
    igUserId: current.igUserId,
    portfolioId: current.portfolioId,
    graphVersion: current.graphVersion
  };
}

module.exports = { GRAPH_VERSION, status, publishImage };
