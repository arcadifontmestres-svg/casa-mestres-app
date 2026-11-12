/* Reuse the existing TPV entry point; do not replace core order handlers. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (params.get('miniapp') === '1') { document.body.classList.add('tpv-service-mode'); return; }
  if (typeof window.openTPVBack !== 'function') return;
  window.openTPVBack = function () {
    let context = {};
    try { context = JSON.parse(localStorage.getItem('arcadi_work_context_v1') || '{}'); } catch {}
    const target = new URL('/tpv-botons.html', location.origin);
    if (context.companyId) target.searchParams.set('companyId', context.companyId);
    if (context.centreId) target.searchParams.set('centreId', context.centreId);
    location.assign(target.pathname + target.search);
  };
})();
