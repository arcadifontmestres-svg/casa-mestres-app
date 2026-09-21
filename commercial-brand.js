'use strict';

// Capa de marca comercial: manté la lògica d'email separada i injecta
// el logotip públic de Sarriera només quan la proposta correspon a Sarriera.
const email = require('./commercial-email.js');

const SARRIERA_LOGO = 'https://casa-mestres-restaurant-app.onrender.com/assets/sarriera-1930-logo.png';

function brandedCompany(company = {}) {
  const name = String(company.name || '');
  if (!/sarriera/i.test(name)) return company;
  return {
    ...company,
    name: 'Sarriera 1930',
    tagline: company.tagline || 'SIDRERIA · CUINA BASCO-CATALANA',
    logoUrl: company.logoUrl || SARRIERA_LOGO
  };
}

const originalHtml = email.proposalHtml;
const originalText = email.proposalText;

email.proposalHtml = (proposal, company) => originalHtml(proposal, brandedCompany(company));
email.proposalText = (proposal, company) => originalText(proposal, brandedCompany(company));

module.exports = { brandedCompany, SARRIERA_LOGO };
