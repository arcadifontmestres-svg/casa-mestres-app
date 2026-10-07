'use strict';

const express = require('express');
const crypto = require('crypto');
const { stripeRequest, createCheckoutSession, verifyStripeSignature } = require('../funcions/reserves-stripe');

function createReservesPublicRouter(govern, miniappState) {
  const router = express.Router();

  function publicCenters() {
    return govern.listCenters({ includeInactive:false })
      .filter(center => govern.getPermissions(center.id).functions.reservations === true)
      .map(center => ({ id:center.id, code:center.code, name:center.name, company:center.company || '' }));
  }

  function centerCriteria(center) {
    const criteria = center?.operatingCriteria || {};
    const openingHours = criteria.openingHours || {};
    const reservations = criteria.reservations || {};
    return {
      openingHours,
      reservations: {
        maxPax: Math.max(1, Number(reservations.maxPax || 10)),
        slotMinutes: Math.max(5, Number(reservations.slotMinutes || 10)),
        oneReservationPerSlot: reservations.oneReservationPerSlot !== false,
        groupPhone: String(reservations.groupPhone || ''),
        cancellationPolicy: String(reservations.cancellationPolicy || '')
      }
    };
  }

  function dayKey(dateString) {
    const parts = String(dateString || '').split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return '';
    const day = new Date(Date.UTC(parts[0], parts[1]-1, parts[2])).getUTCDay();
    return ['sun','mon','tue','wed','thu','fri','sat'][day] || '';
  }

  function scheduleForDate(center, dateString) {
    const criteria = centerCriteria(center);
    const key = dayKey(dateString);
    const day = criteria.openingHours?.[key] || {};
    return { key, ...day };
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
      const criteria=centerCriteria(center);
      res.json({
        center,
        config:{
          maxPax:criteria.reservations.maxPax,
          groupPhone:criteria.reservations.groupPhone,
          cancellationPolicy:criteria.reservations.cancellationPolicy,
          currency:String(config.currency||'EUR'),
          stripeEnabled:config.stripe?.enabled===true && Boolean(process.env.STRIPE_SECRET_KEY),
          openingHours:criteria.openingHours,
          bookingRules:{
            slotMinutes:criteria.reservations.slotMinutes,
            oneReservationPerSlot:criteria.reservations.oneReservationPerSlot
          }
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
          depositValue:Number(x.depositValue||0),
          dateFrom:String(x.dateFrom||''),
          dateTo:String(x.dateTo||''),
          special:x.special===true
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
      const criteria=centerCriteria(center),rules=criteria.reservations,schedule=scheduleForDate(center,date);
      if(schedule.open!==true)return res.status(400).json({error:'Aquest centre està tancat aquest dia.'});
      const slotMinutes=rules.slotMinutes;
      const normalizeMinutes=value=>{const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null};
      const requestedMinutes=normalizeMinutes(time);
      const windows=[[schedule.lunchStart||'',schedule.lunchEnd||''],[schedule.dinnerStart||'',schedule.dinnerEnd||'']]
        .map(([a,b])=>[normalizeMinutes(a),normalizeMinutes(b)]).filter(([a,b])=>a!=null&&b!=null&&b>=a);
      if(requestedMinutes==null || !windows.some(([a,b])=>requestedMinutes>=a&&requestedMinutes<=b) || requestedMinutes%slotMinutes!==0){
        return res.status(400).json({error:'Hora fora dels torns de reserva configurats.'});
      }
      if(rules.oneReservationPerSlot!==false){
        const slotTaken=(reserves.reservations||[]).some(r=>r.date===date&&r.time===time&&!['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
        if(slotTaken)return res.json({zones:[]});
      }
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

      const {reserves}=await centerState(center);
      const config=reserves.config||emptyReservations(center).config;
      const rules=config.bookingRules||{};
      const maxPax=Math.max(1,Number(config.maxPax||10));
      const toMinutes=value=>{const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null};
      const requestedMinutes=toMinutes(time);
      const slotMinutes=Math.max(5,Number(rules.slotMinutes||10));
      const windows=[[rules.lunchStart||'13:00',rules.lunchEnd||'15:30'],[rules.dinnerStart||'',rules.dinnerEnd||'']]
        .map(([a,b])=>[toMinutes(a),toMinutes(b)]).filter(([a,b])=>a!=null&&b!=null&&b>=a);
      if(requestedMinutes==null || !windows.some(([a,b])=>requestedMinutes>=a&&requestedMinutes<=b) || requestedMinutes%slotMinutes!==0){
        return res.status(400).json({error:'Hora fora dels torns de reserva configurats.'});
      }
      if(pax>maxPax)return res.status(400).json({error:'Per a més de '+maxPax+' persones cal contactar directament amb el restaurant.'});

      if(rules.oneReservationPerSlot!==false){
        const slotTaken=(reserves.reservations||[]).some(r=>r.date===date&&r.time===time&&!['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
        if(slotTaken)return res.status(409).json({error:'Aquest interval de reserva ja està ocupat. Tria una altra hora.'});
      }

      const duplicate=(reserves.reservations||[]).find(r=>r.date===date && String(r.name||'').trim().toLowerCase()===name.toLowerCase() && !['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
      if(duplicate)return res.status(409).json({error:'Ja existeix una reserva amb aquest nom per aquest dia.'});

      const requestedTable=String(input.tableId||'');
      if(requestedTable){
        const occupied=(reserves.reservations||[]).find(r=>r.date===date && r.time===time && String(r.tableId||'')===requestedTable && !['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
        if(occupied)return res.status(409).json({error:'Aquesta taula ja no està disponible per aquesta data i hora.'});
      }

      const offer=(reserves.offers||[]).find(o=>o.id===String(input.offerId||'') && o.active!==false)||null;
      const depositType=offer?.depositType||'fixed';
      const depositValue=Math.max(0,Number(offer?.depositValue||0));
      const offerPrice=Math.max(0,Number(offer?.price||0));
      const depositAmount=Math.round((depositType==='percent' ? offerPrice*pax*depositValue/100 : pax*depositValue)*100)/100;
      const now=new Date().toISOString();
      const reservation={
        id:'reservation_'+crypto.randomUUID(),
        code:'RES-'+new Date().getFullYear()+'-'+String((reserves.reservations||[]).length+1).padStart(4,'0'),
        centerId:center.id,date,time,pax,name,phone,email,
        zoneId:String(input.zoneId||''),
        tableId:requestedTable,
        offerId:offer?.id||'',
        offerName:offer?.name||'',
        offerPrice,
        depositType,
        depositValue,
        depositAmount,
        notes:String(input.notes||'').slice(0,1000),
        source:'ONLINE',
        status:depositAmount>0?'PENDENT_PAGAMENT':'CONFIRMADA',
        paymentStatus:depositAmount>0?'PENDENT':'NO_REQUERIT',
        manageToken:depositAmount>0?crypto.randomBytes(18).toString('hex'):'',
        termsAcceptedAt:now,
        marketing:input.marketing===true,
        createdAt:now,updatedAt:now
      };

      let checkoutUrl='';
      if(depositAmount>0){
        if(config.stripe?.enabled!==true || !process.env.STRIPE_SECRET_KEY){
          return res.status(503).json({error:'Aquest menú requereix fiança, però el pagament online encara no està configurat per aquest centre.'});
        }
        const session=await createCheckoutSession(req,reservation,config.currency||'EUR');
        reservation.stripeSessionId=session.id;
        checkoutUrl=session.url||'';
      }

      await miniappState.update('reserves',center.id,()=>emptyReservations(center),state=>{
        state.reservations=Array.isArray(state.reservations)?state.reservations:[];
        const conflict=state.reservations.find(r=>r.date===date && r.time===time && requestedTable && String(r.tableId||'')===requestedTable && !['CANCEL_LADA','Cancel·lada','CANCELLED'].includes(String(r.status||'')));
        if(conflict){
          const error=new Error('Aquesta taula acaba de quedar ocupada. Torna a seleccionar taula.');
          error.status=409;throw error;
        }
        state.reservations.push(reservation);
      });

      res.status(201).json({
        ok:true,
        reservation,
        checkoutUrl,
        message:checkoutUrl?'Reserva creada. Continua amb el pagament segur.':'Reserva confirmada.'
      });
    } catch(error){next(error)}
  });

  router.get('/stripe/confirm', async (req,res,next)=>{
    try {
      if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Stripe no està configurat.'});
      const sessionId=String(req.query.session_id||'');
      if(!sessionId)return res.status(400).json({error:'Falta session_id.'});
      const session=await stripeRequest('GET','/checkout/sessions/'+encodeURIComponent(sessionId));
      const centerId=String(session.metadata?.center_id||'');
      const reservationId=String(session.metadata?.reservation_id||'');
      const center=publicCenters().find(x=>x.id===centerId);
      if(!center)return res.status(404).json({error:'Centre no trobat.'});
      let saved=null;
      await miniappState.update('reserves',center.id,()=>emptyReservations(center),state=>{
        state.reservations=Array.isArray(state.reservations)?state.reservations:[];
        const found=state.reservations.find(r=>r.id===reservationId || r.stripeSessionId===sessionId);
        if(!found)return;
        if(session.payment_status==='paid'){
          found.paymentStatus='PAGAT';
          found.status='CONFIRMADA';
          found.paidAt=found.paidAt||new Date().toISOString();
          found.stripeSessionId=session.id;
          found.stripePaymentIntentId=String(session.payment_intent||'');
          found.manageToken='';
          found.updatedAt=new Date().toISOString();
        }
        saved={...found};
      });
      if(!saved)return res.status(404).json({error:'Reserva no trobada.'});
      res.json({ok:true,paid:session.payment_status==='paid',reservation:saved});
    } catch(error){next(error)}
  });

  router.post('/stripe/resume', async (req,res,next)=>{
    try {
      if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Stripe no està configurat.'});
      const reservationId=String(req.body?.reservationId||'');
      const token=String(req.body?.token||'');
      let found=null,center=null,config=null;
      for(const c of publicCenters()){
        const {reserves}=await centerState(c);
        const r=(reserves.reservations||[]).find(x=>x.id===reservationId && x.manageToken===token);
        if(r){found=r;center=c;config=reserves.config||{};break}
      }
      if(!found||!center)return res.status(404).json({error:'Reserva pendent no trobada.'});
      if(found.paymentStatus==='PAGAT')return res.status(409).json({error:'Aquesta reserva ja està pagada.'});
      const session=await createCheckoutSession(req,found,config.currency||'EUR');
      await miniappState.update('reserves',center.id,()=>emptyReservations(center),state=>{
        const r=(state.reservations||[]).find(x=>x.id===found.id);
        if(r){r.stripeSessionId=session.id;r.updatedAt=new Date().toISOString()}
      });
      res.json({ok:true,checkoutUrl:session.url});
    } catch(error){next(error)}
  });


  return router;
}

function createReservesStripeWebhookHandler(miniappState){
  return async function reservesStripeWebhook(req,res){
    try{
      const secret=String(process.env.STRIPE_WEBHOOK_SECRET||'');
      if(!secret)return res.status(503).json({error:'Webhook Stripe no configurat.'});
      const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from('');
      if(!verifyStripeSignature(raw,req.headers['stripe-signature'],secret))return res.status(400).json({error:'Signatura Stripe no vàlida.'});
      const event=JSON.parse(raw.toString('utf8'));
      if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
        const session=event.data?.object||{};
        const centerId=String(session.metadata?.center_id||'');
        const reservationId=String(session.metadata?.reservation_id||'');
        if(centerId&&reservationId){
          await miniappState.update('reserves',centerId,()=>({reservations:[]}),state=>{
            state.reservations=Array.isArray(state.reservations)?state.reservations:[];
            const found=state.reservations.find(r=>r.id===reservationId || r.stripeSessionId===session.id);
            if(found&&session.payment_status==='paid'){
              found.paymentStatus='PAGAT';found.status='CONFIRMADA';found.paidAt=found.paidAt||new Date().toISOString();
              found.stripeSessionId=session.id;found.stripePaymentIntentId=String(session.payment_intent||'');found.manageToken='';found.updatedAt=new Date().toISOString();
            }
          });
        }
      }
      res.json({received:true});
    }catch(error){
      res.status(500).json({error:error.message||'Error webhook Stripe'});
    }
  };
}

module.exports={createReservesPublicRouter,createReservesStripeWebhookHandler};
