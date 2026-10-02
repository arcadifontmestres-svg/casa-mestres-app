'use strict';

function createCenterLinks(store) {
  function add(entity, recordId, centerId) {
    if (!centerId) return null;
    let saved = null;
    store.update(data => {
      let row = data.recordAssignments.find(item => item.entity === entity && item.recordId === recordId);
      if (!row) {
        row = { entity, recordId, centerIds: [] };
        data.recordAssignments.push(row);
      }
      if (!row.centerIds.includes(centerId)) row.centerIds.push(centerId);
      saved = { ...row, centerIds: [...row.centerIds] };
    });
    return saved;
  }

  function has(entity, recordId, centerId) {
    if (!centerId) return true;
    const row = store.read().recordAssignments.find(item => item.entity === entity && item.recordId === recordId);
    return Boolean(row && row.centerIds.includes(centerId));
  }

  return { add, has };
}

module.exports = { createCenterLinks };
