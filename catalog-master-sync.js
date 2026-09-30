'use strict';

const crypto = require('crypto');

const SOURCE_COMPANY_ID = 'company_casa_mestres';
const SOURCE_CENTRE_ID = 'restaurant_casa_mestres';
const TARGET_COMPANY_ID = 'company_grup_trafec';
const COLLECTIONS = ['products', 'bases', 'dishes'];

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function sourceRecord(item){
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  return (item.companyId || SOURCE_COMPANY_ID) === SOURCE_COMPANY_ID;
}
function sourceKey(collection, item, index){ return String(item.id || item.code || item.name || `${collection}_${index}`); }
function targetId(collection, key){
  const digest = crypto.createHash('sha1').update(`${collection}:${key}`).digest('hex').slice(0,18);
  return `trafec_copy_${digest}`;
}

function buildMaps(data){
  const idMap = new Map();
  for (const collection of COLLECTIONS) {
    const rows = Array.isArray(data[collection]) ? data[collection] : [];
    rows.forEach((item,index)=>{
      if (!sourceRecord(item) || !item.id) return;
      idMap.set(String(item.id), targetId(collection, sourceKey(collection,item,index)));
    });
  }
  return idMap;
}

function remap(value,idMap,key=''){
  if (Array.isArray(value)) return value.map(v=>remap(v,idMap,key));
  if (value && typeof value === 'object') {
    const out={};
    for (const [k,v] of Object.entries(value)) {
      if (k === 'companyId' || k === 'organizationId') { out[k]=TARGET_COMPANY_ID; continue; }
      if (k === 'centreId') { out[k]=''; continue; }
      if (k === 'centreIds' || k === 'optionalCentreIds') { out[k]=[]; continue; }
      if (k === 'scope') { out[k]='COMPANY'; continue; }
      out[k]=remap(v,idMap,k);
    }
    return out;
  }
  if (typeof value === 'string') return idMap.get(value) || value;
  return value;
}

function syncCollection(data, collection, idMap){
  data[collection] = Array.isArray(data[collection]) ? data[collection] : [];
  const rows = data[collection];
  const existingFromSource = new Set(rows
    .filter(x=>x?.companyId===TARGET_COMPANY_ID && x?.copiedFromCompanyId===SOURCE_COMPANY_ID)
    .map(x=>String(x.copiedFromId || '')));
  const existingTargetIds = new Set(rows.filter(x=>x?.companyId===TARGET_COMPANY_ID).map(x=>String(x.id||'')));
  const additions=[];
  rows.forEach((item,index)=>{
    if (!sourceRecord(item)) return;
    const key=sourceKey(collection,item,index);
    const sourceId=String(item.id || key);
    const id=targetId(collection,key);
    if (existingFromSource.has(sourceId) || existingTargetIds.has(id)) return;
    const copy=remap(clone(item),idMap);
    copy.id=id;
    copy.companyId=TARGET_COMPANY_ID;
    copy.centreId='';
    copy.scope='COMPANY';
    copy.copiedFromCompanyId=SOURCE_COMPANY_ID;
    copy.copiedFromCentreId=item.centreId || SOURCE_CENTRE_ID;
    copy.copiedFromId=item.id || key;
    copy.copiedAt=new Date().toISOString();
    additions.push(copy);
  });
  rows.push(...additions);
  return additions.length;
}

function syncCasaMestresMasterCatalog(data){
  if (!data || typeof data !== 'object') throw new Error('Dades no vàlides');
  const idMap=buildMaps(data);
  const copied={};
  let total=0;
  for (const collection of COLLECTIONS) {
    const n=syncCollection(data,collection,idMap);
    copied[collection]=n;
    total+=n;
  }
  return { applied: total>0, copiedByCollection: copied, total };
}

module.exports={syncCasaMestresMasterCatalog};
