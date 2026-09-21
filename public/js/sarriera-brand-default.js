(function () {
  'use strict';

  function install(attempt = 0) {
    const A = window.ArcadiERP;
    if (!A?.state) {
      if (attempt < 60) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    const logo = new URL('/assets/sarriera-1930-logo.png', window.location.origin).href;
    for (const centre of A.state.restaurants || []) {
      if (!/sarriera/i.test(String(centre?.name || ''))) continue;
      if (!centre.logoUrl) centre.logoUrl = logo;
      if (!centre.tagline) centre.tagline = 'SIDRERIA · CUINA BASCO-CATALANA';
    }
    return true;
  }

  window.ArcadiSarrieraBrand = { install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  else install();
})();
