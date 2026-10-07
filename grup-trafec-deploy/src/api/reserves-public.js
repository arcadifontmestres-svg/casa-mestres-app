'use strict';

const express = require('express');
const crypto = require('crypto');

function createReservesPublicRouter(govern, miniappState) {
  const router = express.Router();

  function publicCenters() {
    return govern.listCenters({ includeInactive:false })
      .filter(center => govern.getPermissions(center.id).functions.reservations === true)
      .map(center => ({ id:center.id, code:center.code, name:center.name, company:center.company || '' }));
  }

  function emptyReservations(center) {
    return {
      config: {
        centerId:center.id,
        maxPax:10,
        groupPhone:'',
        cancellationPolicy:'',
        currency:'EUR',
        stripe:{ enabled:false, mode:'disabled' },
        updatedAt:null
      },
      reservations:[],
      occupancyBlocks:[],
      offers:[]
    };
  }

  async function centerState(center) {
    const reserves = await miniappState.read('reserves', center.id, () => emptyReservations(center));
    const tpv = await miniappState.read('tpv', center.id, () => ({ config:{ zones:[] } }));
    return { reserves, tpv };
  }

  router.get('/centers', async (_req,res,next)=>{
    try {
      const items=[];
      for(const center of publicCenters()){
        const {reserves,tpv}=await centerState(center);
        items.push({
          ...center,
          online:true,
          configured:Boolean((tpv.config?.zones||[]).length),
          offers:(reserves.offers||[]).filter(x=>x.active!==false).length
        });
      }
      res.json({items});
    } catch(error){next(error)}
  });

  router.get('/config', async (req,res,next)=>{
    try {
      const centerId=String(req.query.centerId||'');
      const center=publicCenters().find(x=>x.id===centerId);
      if(!center)return res.status(404).json({error:'Centre no disponible per reserves online.'});
      const {reserves,tpv}=await centerState(center);
      const config=reserves.config||{};
      res.json({
        center,
        config:{
          maxPax:Math.max(1,Number(config.maxPax||10)),
          groupPhone:String(config.groupPhone||''),
          cancellationPolicy:String(config.cancellationPolicy||''),
          currency:String(config.currency||'EUR'),
          stripeEnabled:config.stripe?.enabled===true
        },
        layout:{
          zones:(tpv.config?.zones||[]).map(z=>({
            id:z.id,
            name:z.name,
            tables:(z.tables||[]).map(t=>({id:t.id,name:t.name,min:t.min,max:t.max}))
          }))
        },
        offers:(reserves.offers||[]).filter(x=>x.active!==false).map(x=>({
          id:x.id,
          type:x.type||'MENU',
          name:x.name||'',
          description:x.description||'',
          price:Number(x.price||0),
          depositType:x.depositType||'fixed',
          depositValue:Number(x.depositValue||0)
        }))
      });
    } catch(error){next(error)}
  });

  router.get('/availability', async (req,res,next)=>{
    try {
      const centerId=String(req.query.centerId||'');
      const date=String(req.query.date||'');
      const time=String(req.query.time||'');
      const pax=Math.max(1,Math.trunc(Number(req.query.pax)||1));
      const zoneId=String(req.query.zoneId||'');
      const center=publicCenters().find(x=>x.id===centerId);
      if(!center)return res.status(404).json({error:'Centre no disponible per reserves online.'});
      const {reserves,tpv}=await centerState(center);
      const blocked=new Set((reserves.reservations||[])
        .filter(r=>r.date===date && r.time===time && !['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')))
        .map(r=>String(r.tableId||''))
        .filter(Boolean));
      const zones=(tpv.config?.zones||[])
        .filter(z=>!zoneId||z.id===zoneId)
        .map(z=>({
          id:z.id,name:z.name,
          tables:(z.tables||[]).filter(t=>Number(t.max||999)>=pax && !blocked.has(String(t.id)))
            .map(t=>({id:t.id,name:t.name,min:t.min,max:t.max}))
        }));
      res.json({zones});
    } catch(error){next(error)}
  });

  router.post('/reservations', async (req,res,next)=>{
    try {
      const input=req.body||{};
      const centerId=String(input.centerId||'');
      const center=publicCenters().find(x=>x.id===centerId);
      if(!center)return res.status(404).json({error:'Centre no disponible per reserves online.'});

      const date=String(input.date||'').trim();
      const time=String(input.time||'').trim();
      const name=String(input.name||'').trim();
      const phone=String(input.phone||'').trim();
      const email=String(input.email||'').trim();
      const pax=Math.max(1,Math.trunc(Number(input.pax)||1));
      if(!date||!time||!name||!phone||!email)return res.status(400).json({error:'Completa data, hora, nom, telèfon i email.'});
      if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'L’email no és vàlid.'});
      if(input.termsAccepted!==true)return res.status(400).json({error:'Cal acceptar les condicions de reserva.'});

      let created;
      await miniappState.update('reserves',center.id,()=>emptyReservations(center),state=>{
        state.config=state.config||emptyReservations(center).config;
        state.reservations=Array.isArray(state.reservations)?state.reservations:[];
        const maxPax=Math.max(1,Number(state.config.maxPax||10));
        if(pax>maxPax){
          const error=new Error('Per a més de '+maxPax+' persones cal contactar directament amb el restaurant.');
          error.status=400;throw error;
        }
        const duplicate=state.reservations.find(r=>r.date===date && String(r.name||'').trim().toLowerCase()===name.toLowerCase() && !['CANCEL_LADA','Cancel·lada'].includes(r.status));
        if(duplicate){
          const error=new Error('Ja existeix una reserva amb aquest nom per aquest dia.');
          error.status=409;throw error;
        }
        const requestedTable=String(input.tableId||'');
        if(requestedTable){
          const occupied=state.reservations.find(r=>r.date===date && r.time===time && String(r.tableId||'')===requestedTable && !['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
          if(occupied){
            const error=new Error('Aquesta taula ja no està disponible per aquesta data i hora.');
            error.status=409;throw error;
          }
        }
        const offer=(state.offers||[]).find(o=>o.id===String(input.offerId||'') && o.active!==false)||null;
        const now=new Date().toISOString();
        created={
          id:'reservation_'+crypto.randomUUID(),
          code:'RES-'+new Date().getFullYear()+'-'+String(state.reservations.length+1).padStart(4,'0'),
          centerId:center.id,date,time,pax,name,phone,email,
          zoneId:String(input.zoneId||''),
          tableId:String(input.tableId||''),
          offerId:offer?.id||'',
          offerName:offer?.name||'',
          notes:String(input.notes||'').slice(0,1000),
          source:'ONLINE',
          status:'CONFIRMADA',
          paymentStatus:'NO_REQUERIT',
          termsAcceptedAt:now,
          marketing:input.marketing===true,
          createdAt:now,updatedAt:now
        };
        state.reservations.push(created);
      });
      res.status(201).json({
        ok:true,
        reservation:created,
        checkoutUrl:'',
        message:'Reserva registrada.'
      });
    } catch(error){next(error)}
  });

  return router;
}

module.exports={createReservesPublicRouter};
