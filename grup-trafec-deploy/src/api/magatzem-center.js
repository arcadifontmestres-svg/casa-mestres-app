'use strict';
const express=require('express');
const crypto=require('crypto');
function createMagatzemRouter(govern,miniappState){
 const router=express.Router();
 function session(req){
  const s=govern.centerByDeviceToken(String(req.headers['x-center-device-token']||''));
  if(!s){const e=new Error('Sessió no autoritzada');e.status=401;throw e;}
  if(s.permissions?.gestio_magatzem!==true){const e=new Error('Sense permís de Magatzem');e.status=403;throw e;}
  return s;
 }
 const empty=()=>({products:[],updatedAt:null});
 router.get('/bootstrap',async(req,res,next)=>{try{
  const s=session(req);
  const catalog=await miniappState.read('magatzem','direction_global',empty);
  res.json({center:s.center,scope:s.scope||'center',state:catalog,persistent:miniappState.hasPersistentBackend()});
 }catch(e){next(e)}});
 router.post('/products',async(req,res,next)=>{try{
  const s=session(req);
  if(s.scope!=='direction')return res.status(403).json({error:'Només Direcció pot crear productes mestres'});
  const name=String(req.body?.name||'').trim().slice(0,200);
  if(!name)return res.status(400).json({error:'Cal el nom del producte'});
  let item;
  await miniappState.update('magatzem','direction_global',empty,state=>{
   if(!Array.isArray(state.products))state.products=[];
   const existing=state.products.find(x=>x.name.toLocaleLowerCase('ca')===name.toLocaleLowerCase('ca'));
   if(existing){const e=new Error('Producte ja existent');e.status=409;throw e;}
   const now=new Date().toISOString();
   item={id:'product_'+crypto.randomUUID(),name,unit:String(req.body?.unit||'kg').slice(0,30),family:String(req.body?.family||'').slice(0,100),cost:Number(req.body?.cost)||0,createdAt:now,updatedAt:now};
   state.products.push(item);state.updatedAt=now;
  });
  res.status(201).json(item);
 }catch(e){next(e)}});

 const stockEmpty=()=>({movements:[],updatedAt:null});
 router.get('/stock',async(req,res,next)=>{try{
  const s=session(req);
  if(s.center.id==='direction_global')return res.status(400).json({error:'Seleccioneu un centre real per consultar existències'});
  const state=await miniappState.read('magatzem-stock',s.center.id,stockEmpty);
  const quantities={};
  for(const m of state.movements||[])quantities[m.productId]=(quantities[m.productId]||0)+Number(m.delta||0);
  res.json({center:s.center,quantities,movements:state.movements||[]});
 }catch(e){next(e)}});
 router.post('/receptions',async(req,res,next)=>{try{
  const s=session(req);
  if(s.center.id==='direction_global')return res.status(400).json({error:'La recepció necessita un centre real'});
  const productId=String(req.body?.productId||'');
  const quantity=Number(req.body?.quantity);
  const lot=String(req.body?.lot||'').trim().slice(0,120);
  const supplier=String(req.body?.supplier||'').trim().slice(0,200);
  const expiry=String(req.body?.expiry||'').slice(0,30);
  const requestId=String(req.body?.requestId||'').trim().slice(0,120);
  if(!productId||!Number.isFinite(quantity)||quantity<=0||!lot||!supplier||!expiry||!requestId)
   return res.status(400).json({error:'Cal producte, quantitat positiva, proveïdor, lot, caducitat i identificador de recepció'});
  const catalog=await miniappState.read('magatzem','direction_global',empty);
  const product=(catalog.products||[]).find(x=>x.id===productId);
  if(!product)return res.status(404).json({error:'Producte mestre no trobat'});
  let movement;
  await miniappState.update('magatzem-stock',s.center.id,stockEmpty,state=>{
   if(!Array.isArray(state.movements))state.movements=[];
   movement=state.movements.find(x=>x.requestId===requestId);
   if(movement)return;
   const now=new Date().toISOString();
   movement={id:'movement_'+crypto.randomUUID(),requestId,centerId:s.center.id,productId,productName:product.name,delta:quantity,unit:product.unit,type:'reception',lot,supplier,expiry,createdAt:now};
   state.movements.push(movement);state.updatedAt=now;
  });
  await miniappState.update('appcc',s.center.id,()=>({centerId:s.center.id,receptions:[],productions:[],cleaning:[],incidents:[]}),state=>{
   if(!Array.isArray(state.receptions))state.receptions=[];
   if(state.receptions.some(x=>x.sourceId===movement.id&&x.sourceApp==='magatzem'))return;
   state.receptions.push({id:'receptions_'+crypto.randomUUID(),centerId:s.center.id,sourceApp:'magatzem',sourceId:movement.id,name:product.name,quantity,unit:product.unit,lot,supplier,expiry,date:movement.createdAt.slice(0,10),createdAt:movement.createdAt,updatedAt:new Date().toISOString()});
   state.updatedAt=new Date().toISOString();
  });
  res.status(201).json(movement);
 }catch(e){next(e)}});
 return router;
}
module.exports={createMagatzemRouter};
