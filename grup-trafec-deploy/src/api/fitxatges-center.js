'use strict';

const express = require('express');
const crypto = require('crypto');

function createFitxatgesCenterRouter(govern, miniappState) {
  const router = express.Router();

  function session(req) {
    const token = String(req.headers['x-center-device-token'] || '');
    const s = govern.centerByDeviceToken(token);
    if (!s) {
      const error = new Error('Dispositiu no vinculat.');
      error.status = 401;
      throw error;
    }
    if (s.permissions?.fitxatges !== true) {
      const error = new Error('Aquest centre no té permís de Fitxatges.');
      error.status = 403;
      throw error;
    }
    return s;
  }

  function empty(center) {
    return { centerId: center.id, profiles: [], punches: [], config: { requirePin: true }, updatedAt: null };
  }

  async function state(center) {
    return miniappState.read('fitxatges', center.id, () => empty(center));
  }

  function employeesFor(centerId) {
    return govern.listEmployees({ includeInactive: false })
      .filter(e => Array.isArray(e.centerIds) && e.centerIds.includes(centerId))
      .map(e => ({ id:e.id, name:e.name, role:e.role || '', active:e.active !== false }));
  }

  router.get('/bootstrap', async (req,res,next)=>{
    try {
      const s=session(req), own=await state(s.center), employees=employeesFor(s.center.id);
      const byId=new Map((own.profiles||[]).map(x=>[x.employeeId,x]));
      res.json({
        center:s.center,
        employees:employees.map(e=>({...e,pinConfigured:Boolean(byId.get(e.id)?.pinHash)})),
        punches:own.punches||[],
        config:own.config||{},
        persistent:miniappState.hasPersistentBackend()
      });
    } catch(error){next(error)}
  });

  router.put('/profiles/:employeeId', async (req,res,next)=>{
    try {
      const s=session(req);
      const employee=employeesFor(s.center.id).find(e=>e.id===req.params.employeeId);
      if(!employee) return res.status(404).json({error:'Empleat no assignat a aquest centre.'});
      const pin=String(req.body?.pin||'').trim();
      if(!/^\d{4,8}$/.test(pin)) return res.status(400).json({error:'El PIN ha de tenir entre 4 i 8 dígits.'});
      await miniappState.update('fitxatges',s.center.id,()=>empty(s.center),st=>{
        st.profiles=st.profiles||[];
        const hash=crypto.createHash('sha256').update(pin).digest('hex');
        const i=st.profiles.findIndex(x=>x.employeeId===employee.id);
        const profile={employeeId:employee.id,pinHash:hash,updatedAt:new Date().toISOString()};
        if(i<0)st.profiles.push(profile);else st.profiles[i]=profile;
        st.updatedAt=new Date().toISOString();
      });
      res.json({ok:true});
    } catch(error){next(error)}
  });

  router.post('/punch', async (req,res,next)=>{
    try {
      const s=session(req), input=req.body||{};
      const employee=employeesFor(s.center.id).find(e=>e.id===String(input.employeeId||''));
      if(!employee) return res.status(404).json({error:'Empleat no assignat a aquest centre.'});
      const action=String(input.action||'').toUpperCase();
      if(!['ENTRAR','PAUSA','TORNAR','SORTIR'].includes(action)) return res.status(400).json({error:'Acció de fitxatge no vàlida.'});
      let record;
      await miniappState.update('fitxatges',s.center.id,()=>empty(s.center),st=>{
        st.profiles=st.profiles||[];st.punches=st.punches||[];
        const profile=st.profiles.find(x=>x.employeeId===employee.id);
        if(st.config?.requirePin!==false){
          if(!profile?.pinHash) {
            const error=new Error('Aquest empleat encara no té PIN configurat.');
            error.status=400;throw error;
          }
          const given=crypto.createHash('sha256').update(String(input.pin||'')).digest('hex');
          if(given!==profile.pinHash){
            const error=new Error('PIN incorrecte.');
            error.status=403;throw error;
          }
        }
        record={
          id:'punch_'+crypto.randomUUID(),
          centerId:s.center.id,
          employeeId:employee.id,
          employeeName:employee.name,
          action,
          lat:Number.isFinite(Number(input.lat))?Number(input.lat):null,
          lng:Number.isFinite(Number(input.lng))?Number(input.lng):null,
          accuracy:Number.isFinite(Number(input.accuracy))?Number(input.accuracy):null,
          createdAt:new Date().toISOString()
        };
        st.punches.push(record);st.updatedAt=record.createdAt;
      });
      res.status(201).json(record);
    } catch(error){next(error)}
  });

  return router;
}

module.exports={createFitxatgesCenterRouter};
