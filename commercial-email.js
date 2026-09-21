'use strict';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function money(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' }).format(number);
}

function formatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (value || 'A concretar');
}

function looksTechnical(line) {
  const text = String(line || '').trim();
  if (!text) return false;
  if (/^(trafec_copy|company|restaurant|document|doc|menu|proposal|crm|commercial)_[A-Za-z0-9_-]{8,}$/i.test(text)) return true;
  if (/^[a-z][a-z0-9_-]*_[a-f0-9]{12,}$/i.test(text)) return true;
  if (/^[a-f0-9]{24,}$/i.test(text)) return true;
  return false;
}

function cleanMenuText(value, menuName = '') {
  const title = String(menuName || '').trim().toLowerCase();
  const seen = new Set();
  const result = [];
  for (const raw of String(value || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line || looksTechnical(line)) continue;
    const key = line.toLowerCase();
    if (key === title && result.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result.join('\n');
}

function brand(company = {}) {
  const sourceName = String(company.name || 'ARCADI GESTIO RESTAURANT').trim();
  const sarriera = /sarriera/i.test(sourceName);
  return {
    name: sarriera ? 'SARRIERA 1930' : sourceName.toUpperCase(),
    displayName: sarriera ? 'Sarriera 1930' : sourceName,
    tagline: company.tagline || (sarriera ? 'SIDRERIA · CUINA BASCO-CATALANA' : 'PROPOSTA GASTRONÒMICA'),
    primary: '#183e33',
    accent: '#9a3f34',
    warm: '#b08a55',
    paper: '#fbf7ef',
    ink: '#24332d',
    muted: '#746d63',
    logoUrl: company.logoUrl || ''
  };
}

function proposalSubject(proposal, companyName = 'ARCADI GESTIO') {
  const service = proposal.eventName ? ` · ${proposal.eventName}` : '';
  const date = proposal.eventDate ? ` · ${formatDate(proposal.eventDate)}` : '';
  return `Proposta comercial · ${companyName}${service}${date}`;
}

function proposalText(proposal, company = {}) {
  const b = brand(company);
  const menu = cleanMenuText(proposal.menuSummary, proposal.menuName);
  const lines = [
    `Bon dia${proposal.clientName ? ` ${proposal.clientName}` : ''},`,
    '',
    `Gràcies per comptar amb ${b.displayName}. Us fem arribar la proposta comercial ${proposal.code || ''}.`,
    '',
    proposal.eventName ? `Servei: ${proposal.eventName}` : '',
    `Data: ${formatDate(proposal.eventDate)}`,
    `Persones: ${Number(proposal.pax || 0)}`,
    `Menú: ${proposal.menuName || 'A concretar'}`,
    '',
    menu,
    '',
    `Preu per persona: ${money(proposal.pricePerPerson)}`,
    `Import total: ${money(proposal.totalAmount)}`,
    proposal.validUntil ? `Validesa de la proposta: fins al ${formatDate(proposal.validUntil)}.` : '',
    proposal.notes ? `Condicions / observacions: ${proposal.notes}` : '',
    '',
    'Per confirmar-la o comentar qualsevol ajust, podeu respondre directament aquest correu.',
    '',
    'Cordialment,',
    b.displayName,
    company.phone ? `Tel. ${company.phone}` : '',
    company.email ? company.email : ''
  ].filter(line => line !== '');
  return lines.join('\n');
}

function logoHtml(b) {
  if (b.logoUrl && /^https?:\/\//i.test(b.logoUrl)) {
    return `<img src="${esc(b.logoUrl)}" alt="${esc(b.displayName)}" style="display:block;max-width:210px;max-height:82px;border:0">`;
  }
  return `<div style="font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1;color:${b.primary};font-weight:700;letter-spacing:.04em">${esc(b.name)}</div><div style="margin-top:7px;font-size:10px;letter-spacing:.19em;color:${b.warm};font-weight:700">${esc(b.tagline)}</div>`;
}

function proposalHtml(proposal, company = {}) {
  const b = brand(company);
  const cleanMenu = cleanMenuText(proposal.menuSummary, proposal.menuName);
  const menuLines = cleanMenu.split('\n').filter(Boolean);
  const menu = menuLines.length
    ? menuLines.map(line => `<div style="padding:7px 0;border-bottom:1px solid #eee6da;font-size:15px;line-height:1.45">${esc(line)}</div>`).join('')
    : '<div style="padding:8px 0;color:#746d63">Menú seleccionat a la proposta.</div>';
  const notes = proposal.notes ? `<tr><td style="padding:20px 34px 0"><div style="font-size:11px;letter-spacing:.13em;color:${b.warm};font-weight:700;margin-bottom:7px">CONDICIONS I OBSERVACIONS</div><div style="font-size:14px;line-height:1.6;color:${b.ink}">${esc(proposal.notes).replace(/\n/g, '<br>')}</div></td></tr>` : '';
  const validity = proposal.validUntil ? `<div style="margin-top:8px;font-size:12px;color:${b.muted}">Proposta vàlida fins al <strong>${esc(formatDate(proposal.validUntil))}</strong>.</div>` : '';
  const contact = [company.phone ? `Tel. ${esc(company.phone)}` : '', company.email ? esc(company.email) : '', company.address ? esc(company.address) : ''].filter(Boolean).join(' · ');

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ece8df;font-family:Arial,Helvetica,sans-serif;color:${b.ink}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ece8df;padding:26px 10px"><tr><td align="center">
  <table role="presentation" width="760" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:760px;background:#fff;border-radius:4px;overflow:hidden;border:1px solid #ded5c8">
    <tr><td style="height:8px;background:${b.primary};font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:30px 34px 24px;background:${b.paper}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td valign="top">${logoHtml(b)}</td>
        <td valign="top" align="right" style="font-size:12px;color:${b.muted};line-height:1.6"><strong style="color:${b.ink}">PROPOSTA COMERCIAL</strong><br>${esc(proposal.code || '')}<br>${esc(formatDate(proposal.eventDate))}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 34px 12px">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${b.primary};margin-bottom:10px">Una proposta pensada per a vosaltres</div>
      <div style="font-size:15px;line-height:1.65;color:#4f554f">Bon dia${proposal.clientName ? ` <strong>${esc(proposal.clientName)}</strong>` : ''},<br>gràcies per comptar amb ${esc(b.displayName)}. A continuació trobareu la proposta per al vostre servei.</div>
    </td></tr>
    <tr><td style="padding:12px 34px 8px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#f7f3ec;border:1px solid #e5ddcf">
        <tr>
          <td width="50%" style="padding:15px 18px;border-bottom:1px solid #e5ddcf;border-right:1px solid #e5ddcf"><div style="font-size:10px;letter-spacing:.12em;color:${b.muted};font-weight:700">CLIENT</div><div style="font-size:15px;margin-top:5px"><strong>${esc(proposal.clientName || '—')}</strong></div></td>
          <td width="50%" style="padding:15px 18px;border-bottom:1px solid #e5ddcf"><div style="font-size:10px;letter-spacing:.12em;color:${b.muted};font-weight:700">DATA DEL SERVEI</div><div style="font-size:15px;margin-top:5px"><strong>${esc(formatDate(proposal.eventDate))}</strong></div></td>
        </tr>
        <tr>
          <td style="padding:15px 18px;border-right:1px solid #e5ddcf"><div style="font-size:10px;letter-spacing:.12em;color:${b.muted};font-weight:700">SERVEI / GRUP</div><div style="font-size:15px;margin-top:5px"><strong>${esc(proposal.eventName || 'A concretar')}</strong></div></td>
          <td style="padding:15px 18px"><div style="font-size:10px;letter-spacing:.12em;color:${b.muted};font-weight:700">PERSONES</div><div style="font-size:15px;margin-top:5px"><strong>${Number(proposal.pax || 0)}</strong></div></td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 34px 8px">
      <div style="font-size:11px;letter-spacing:.14em;color:${b.warm};font-weight:700;margin-bottom:8px">PROPOSTA GASTRONÒMICA</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;color:${b.primary};margin-bottom:10px">${esc(proposal.menuName || 'Menú')}</div>
      <div style="border-top:1px solid #e8e0d5">${menu}</div>
    </td></tr>
    <tr><td style="padding:20px 34px 4px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${b.primary};color:white"><tr>
        <td style="padding:18px 20px;font-size:13px;line-height:1.45">${Number(proposal.pax || 0)} persones · ${money(proposal.pricePerPerson)} / persona</td>
        <td align="right" style="padding:18px 20px;font-size:23px;font-weight:700">${money(proposal.totalAmount)}</td>
      </tr></table>
      ${validity}
    </td></tr>
    ${notes}
    <tr><td style="padding:28px 34px 30px">
      <div style="padding:18px 20px;border-left:4px solid ${b.accent};background:#faf7f2;font-size:14px;line-height:1.6">Per confirmar la proposta o comentar qualsevol ajust, només cal respondre aquest correu. Estarem encantats d’adaptar els detalls del servei.</div>
    </td></tr>
    <tr><td style="padding:20px 34px;background:${b.paper};border-top:1px solid #e5ddcf;color:${b.muted};font-size:12px;line-height:1.6"><strong style="color:${b.primary}">${esc(b.displayName)}</strong>${contact ? `<br>${contact}` : ''}</td></tr>
    <tr><td style="height:5px;background:${b.accent};font-size:0">&nbsp;</td></tr>
  </table>
  </td></tr></table></body></html>`;
}

module.exports = { esc, money, formatDate, looksTechnical, cleanMenuText, brand, proposalSubject, proposalText, proposalHtml };