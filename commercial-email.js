'use strict';

const https = require('https');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function money(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${number.toFixed(2).replace('.', ',')} €`;
}

function proposalSubject(proposal, companyName = 'ARCADI GESTIO') {
  const service = proposal.eventName ? ` · ${proposal.eventName}` : '';
  return `${proposal.code || 'Proposta comercial'}${service}`;
}

function proposalText(proposal, company = {}) {
  const lines = [
    company.name || 'ARCADI GESTIO RESTAURANT',
    '',
    `Proposta comercial ${proposal.code || ''}`.trim(),
    `Client: ${proposal.clientName || ''}`,
    proposal.eventName ? `Servei / grup: ${proposal.eventName}` : '',
    proposal.eventDate ? `Data del servei: ${proposal.eventDate}` : '',
    `Persones: ${Number(proposal.pax || 0)}`,
    '',
    proposal.menuName || 'Menú',
    proposal.menuSummary || '',
    '',
    `Preu per persona: ${money(proposal.pricePerPerson)}`,
    `Import total: ${money(proposal.totalAmount)}`,
    proposal.validUntil ? `Proposta vàlida fins al ${proposal.validUntil}.` : '',
    proposal.notes ? `Observacions: ${proposal.notes}` : '',
    '',
    company.phone ? `Telèfon: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : ''
  ].filter(line => line !== '');
  return lines.join('\n');
}

function proposalHtml(proposal, company = {}) {
  const menu = esc(proposal.menuSummary || '').replace(/\n/g, '<br>');
  const notes = proposal.notes ? `<div style="margin-top:18px"><b>Observacions i condicions</b><p>${esc(proposal.notes).replace(/\n/g, '<br>')}</p></div>` : '';
  const validity = proposal.validUntil ? `<p style="color:#6b625a">Proposta vàlida fins al <b>${esc(proposal.validUntil)}</b>.</p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4eee3;font-family:Arial,sans-serif;color:#1f302a"><div style="max-width:760px;margin:24px auto;background:#fffaf2;border:1px solid #d9cbb9;border-radius:16px;padding:28px"><div style="display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #234d40;padding-bottom:16px"><div><div style="font-size:12px;letter-spacing:.08em;color:#6b625a">PROPOSTA COMERCIAL</div><h1 style="margin:5px 0 0;font-size:26px">${esc(proposal.code || '')}</h1></div><div style="text-align:right"><b>${esc(company.name || 'ARCADI GESTIO RESTAURANT')}</b></div></div><div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><small>CLIENT</small><br><b>${esc(proposal.clientName || '')}</b></div><div><small>DATA SERVEI</small><br><b>${esc(proposal.eventDate || '—')}</b></div><div><small>GRUP / SERVEI</small><br><b>${esc(proposal.eventName || '—')}</b></div><div><small>PERSONES</small><br><b>${Number(proposal.pax || 0)}</b></div></div><div style="margin-top:22px;border:1px solid #d9cbb9;border-radius:12px;padding:18px;background:#fff"><h2 style="margin-top:0">${esc(proposal.menuName || 'Menú')}</h2><div style="line-height:1.55">${menu || 'Menú seleccionat a l’aplicació.'}</div></div><div style="margin:22px 0;padding:16px 0;border-top:1px solid #d9cbb9;border-bottom:1px solid #d9cbb9;display:flex;justify-content:space-between"><span>${Number(proposal.pax || 0)} pax × ${money(proposal.pricePerPerson)}</span><strong style="font-size:22px">${money(proposal.totalAmount)}</strong></div>${notes}${validity}<div style="margin-top:26px;padding-top:16px;border-top:1px solid #e6ddd1;color:#6b625a;font-size:13px">${company.phone ? `Tel. ${esc(company.phone)} · ` : ''}${company.email ? esc(company.email) : ''}</div></div></body></html>`;
}

function sendResend({ apiKey, from, to, replyTo, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) });
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { message: body }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed.message || parsed.error || `Error d’enviament ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { esc, money, proposalSubject, proposalText, proposalHtml, sendResend };
