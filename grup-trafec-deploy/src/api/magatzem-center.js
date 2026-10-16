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
 return router;
}
module.exports={createMagatzemRouter};
