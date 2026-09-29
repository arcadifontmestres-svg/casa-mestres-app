'use strict';

const http = require('http');

const originalCreateServer = http.createServer;

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function readFormBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) {
        const error = new Error('Petició massa gran');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params.entries()));
    });
    req.on('error', reject);
  });
}

function sendTwiml(res, inner, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/xml; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`);
}

function say(text) {
  return `<Say language="ca-ES" voice="Google.ca-ES-Standard-B">${xmlEscape(text)}</Say>`;
}

function gather(prompt, action) {
  return `<Gather input="speech" language="ca-ES" speechTimeout="auto" action="${xmlEscape(action)}" method="POST">${say(prompt)}</Gather>${say('No he sentit cap resposta. Tornem a començar.')}` + '<Redirect method="POST">/twilio/voice</Redirect>';
}

function centreFrom(text) {
  const t = normalize(text);
  const centres = [
    ['sarriera', 'Sarriera 1930'],
    ['granada', 'La Granada'],
    ['arboc', "L'Arboç"],
    ['sitges', 'Sitges'],
    ['hospitalet', "L'Hospitalet"],
    ['piscina', 'Piscina La Granada'],
    ['cartró', 'Can Cartró'],
    ['cartro', 'Can Cartró']
  ];
  for (const [key, label] of centres) if (t.includes(normalize(key))) return { key: normalize(key), label };
  return null;
}

function isLargeGroup(text) {
  const nums = String(text || '').match(/\d+/g) || [];
  return nums.some(n => Number(n) > 10) || /grup|empresa|celebracio|esdeveniment/i.test(String(text || ''));
}

async function handleTwilioDemo(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (!path.startsWith('/twilio/')) return false;

  if (!['GET', 'POST'].includes(req.method)) {
    sendTwiml(res, say('Mètode no permès.'), 405);
    return true;
  }

  let form = {};
  if (req.method === 'POST') {
    try { form = await readFormBody(req); }
    catch { form = {}; }
  }
  const speech = String(form.SpeechResult || url.searchParams.get('speech') || '');
  const t = normalize(speech);

  if (path === '/twilio/voice') {
    sendTwiml(res, gather('Bon dia. Grup Tràfec. Sóc l’assistent virtual de recepció. Vol fer una reserva, parlar amb un restaurant, o parlar amb un departament?', '/twilio/intent'));
    return true;
  }

  if (path === '/twilio/intent') {
    if (/reserva|reservar|taula|sopar|dinar/.test(t)) {
      const c = centreFrom(t);
      if (c) {
        sendTwiml(res, gather(`Perfecte. Reserva a ${c.label}. Digui'm per a quin dia, a quina hora i per a quantes persones.`, `/twilio/reserva-detall?centre=${encodeURIComponent(c.label)}`));
      } else {
        sendTwiml(res, gather('Perfecte. A quin restaurant del Grup Tràfec vol fer la reserva?', '/twilio/reserva-centre'));
      }
      return true;
    }

    if (/direccio|direccio general|director|joan ramon|gerencia|gerencia/.test(t)) {
      const target = String(process.env.TRAFEC_DIRECCIO_PHONE || '').trim();
      if (target) {
        sendTwiml(res, `${say('D’acord. El derivo ara amb Direcció.')}<Dial>${xmlEscape(target)}</Dial>${say('No ha estat possible completar la derivació. Deixo constància perquè el contactin.')}`);
      } else {
        sendTwiml(res, `${say('D’acord. Aquesta trucada correspon a Direcció. En el prototip la derivació està preparada, però encara no hi ha número de destinació configurat.')}<Hangup/>`);
      }
      return true;
    }

    if (/comercial|grup|esdeveniment|empresa/.test(t)) {
      sendTwiml(res, gather('Perfecte. L’atén el circuit de Grups i Comercial. Digui’m el restaurant, la data aproximada i el nombre de persones.', '/twilio/grup'));
      return true;
    }

    const c = centreFrom(t);
    if (c || /restaurant|centre|local/.test(t)) {
      if (c) {
        sendTwiml(res, gather(`Ha demanat ${c.label}. Vol fer una reserva o vol parlar directament amb el centre?`, `/twilio/centre-opcio?centre=${encodeURIComponent(c.label)}`));
      } else {
        sendTwiml(res, gather('Amb quin restaurant vol parlar?', '/twilio/centre'));
      }
      return true;
    }

    sendTwiml(res, gather('No ho he acabat d’entendre. Pot dir reserva, un restaurant concret, Comercial o Direcció.', '/twilio/intent'));
    return true;
  }

  if (path === '/twilio/reserva-centre') {
    const c = centreFrom(speech);
    if (!c) {
      sendTwiml(res, gather('No he identificat el restaurant. Pot repetir el nom del centre?', '/twilio/reserva-centre'));
      return true;
    }
    sendTwiml(res, gather(`D’acord. ${c.label}. Digui’m el dia, l’hora i el nombre de persones.`, `/twilio/reserva-detall?centre=${encodeURIComponent(c.label)}`));
    return true;
  }

  if (path === '/twilio/reserva-detall') {
    const centre = url.searchParams.get('centre') || 'el restaurant';
    if (isLargeGroup(speech)) {
      sendTwiml(res, `${say(`He recollit la petició per a ${centre}. Com que és un grup de més de deu persones, no la confirmaré com una reserva normal. La passo a Grups i Comercial com a pendent de confirmar, i quedarà visible a l’Agenda del centre.`)}<Hangup/>`);
    } else {
      sendTwiml(res, `${say(`Perfecte. He recollit la petició per a ${centre}: ${speech}. En la versió final, ara ARCADI comprovarà disponibilitat a la miniapp de Reserves abans de confirmar-la.`)}<Hangup/>`);
    }
    return true;
  }

  if (path === '/twilio/grup') {
    sendTwiml(res, `${say(`Gràcies. He recollit: ${speech}. Ho registro com a oportunitat de Grup i Comercial pendent de confirmar. El centre ho veurà com una alerta de previsió a l’Agenda Centre.`)}<Hangup/>`);
    return true;
  }

  if (path === '/twilio/centre') {
    const c = centreFrom(speech);
    if (!c) {
      sendTwiml(res, gather('No he identificat el restaurant. Pot repetir el nom?', '/twilio/centre'));
      return true;
    }
    sendTwiml(res, gather(`D’acord, ${c.label}. Vol fer una reserva o parlar directament amb el centre?`, `/twilio/centre-opcio?centre=${encodeURIComponent(c.label)}`));
    return true;
  }

  if (path === '/twilio/centre-opcio') {
    const centre = url.searchParams.get('centre') || 'el centre';
    if (/reserva|reservar|taula/.test(t)) {
      sendTwiml(res, gather(`Perfecte. Reserva a ${centre}. Digui’m dia, hora i nombre de persones.`, `/twilio/reserva-detall?centre=${encodeURIComponent(centre)}`));
    } else {
      sendTwiml(res, `${say(`D’acord. En el sistema final, ara derivaria la trucada directament a ${centre}. Per aquesta demostració encara no hi ha configurats els números de tots els centres.`)}<Hangup/>`);
    }
    return true;
  }

  sendTwiml(res, `${say('Ruta de demostració no trobada.')}<Hangup/>`, 404);
  return true;
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    Promise.resolve(handleTwilioDemo(req, res))
      .then(handled => { if (!handled) listener(req, res); })
      .catch(() => sendTwiml(res, `${say('Hi ha hagut un error temporal en la recepció virtual.')}<Hangup/>`, 500));
  });
};

module.exports = { handleTwilioDemo };
