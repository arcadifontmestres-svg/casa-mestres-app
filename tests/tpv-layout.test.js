'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {store,validate}=require('../tpv-layout-store');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tpv-layout-'));
const context={companyId:'test_company',centreId:'test_a'};
const layout={categories:[{id:'cat1',name:'Cafès',color:'#164e63',size:1}],buttons:[{id:'button1',name:'Cafè curt',color:'#334455',size:2,categoryId:'cat1',type:'product',itemId:'p1',code:'TEST-001',price:2.5}]};
const a=store(dir,context),b=store(dir,{...context,centreId:'test_b'});
assert.equal(a.read().published,null);a.save({revision:0,draft:layout});assert.equal(a.read().published,null);a.save({revision:1,draft:layout,publish:true});assert.deepEqual(a.read().published,layout);assert.equal(b.read().draft.buttons.length,0);
assert.throws(()=>a.save({revision:0,draft:layout}),/canviat/);assert.throws(()=>validate({...layout,buttons:[{...layout.buttons[0],color:'red'}]}),/Color/);
assert.throws(()=>store(dir,{...context,centreId:'../escape'}),/Selecciona/);
// Execute the real UI handlers against a small DOM adapter. No production fixtures.
function ui(saved,request){
 const elements=new Map();let dragRows=[];const el=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}},options:[]});return elements.get(id)};
 const ctx={addEventListener(){},console,URLSearchParams,location:{search:'',hash:''},localStorage:{getItem:()=>JSON.stringify(context)},document:{readyState:'loading',addEventListener(){},getElementById:el,querySelector:()=>el('modal'),querySelectorAll:selector=>dragRows=selector==='[data-layout-id]'?(el('view').innerHTML.match(/data-layout-kind="([^"]+)" data-layout-id="([^"]+)"/g)||[]).map(value=>{const [,kind,id]=value.match(/data-layout-kind="([^"]+)" data-layout-id="([^"]+)"/);return {dataset:{layoutKind:kind,layoutId:id}}}):[]},innerWidth:1100,alert:m=>{throw new Error(m)},confirm:()=>true,fetch:request};ctx.window=ctx;
 let code=fs.readFileSync(path.join(root,'public/app.js'),'utf8');code=code.replace("let appBooted=false;",`window.testTPV={init(state,layout){data=state;fullData=state;tpvLayout=layout;tpvLayoutKey=layoutKey();active='tpv';tpvBack=true;tpvEditCategory=layout.draft.categories[0]?.id||'';},layout:()=>tpvLayout,items:layoutItems,front:renderOrderModal,order(id){tpvOrderId=id},data:()=>data};let appBooted=false;`);vm.createContext(ctx);vm.runInContext(code,ctx);
 const state={products:[{id:'p1',code:'TEST-001',name:'Article de prova',price:99}],dishes:[],saleItems:[],tpvConfig:{zones:[{id:'sala',name:'Sala',tables:[]}],orders:[{id:'o1',zone:'sala',tableName:'Prova',lines:[]}]}};
 ctx.testTPV.init(state,JSON.parse(JSON.stringify(saved)));return {ctx,el,rows:()=>dragRows};
}
(async()=>{
 const stateFile=path.join(dir,'data.json');fs.writeFileSync(stateFile,JSON.stringify({organizations:[{id:context.companyId}],restaurants:[{id:'test_a',organizationId:context.companyId},{id:'test_b',organizationId:context.companyId}],products:[],dishes:[],saleItems:[]}));
 const port=39000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`,auth='Basic '+Buffer.from('test:password').toString('base64');
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_USER:'test',ADMIN_PASSWORD:'password',NO_OPEN:'1'},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}assert.ok(ready,'Server ready');
  const original=fs.readFileSync(stateFile,'utf8');
  const request=(url,opt={})=>fetch(base+url,{...opt,headers:{...opt.headers,Authorization:auth,'Content-Type':'application/json','X-Arcadi-Company-Id':context.companyId,'X-Arcadi-Centre-Id':context.centreId}});
  assert.equal((await fetch(base+'/api/tpv-layout')).status,401);
  const current=await (await request('/api/tpv-layout')).json();const {ctx,el}=ui(current,request);
  ctx.editTPVTile('categories','');el('tl_name').value='Postres';el('tl_color').value='#123456';el('tl_size').value='1';el('tl_apply').onclick();assert.equal(ctx.testTPV.layout().draft.categories.length,2);
  ctx.editTPVTile('buttons','');el('tl_name').value='Botó prova';el('tl_color').value='#123456';el('tl_size').value='2';el('tl_source').value='0';el('tl_price').value='3.25';el('tl_apply').onclick();
  ctx.editTPVTile('buttons',ctx.testTPV.layout().draft.buttons[1].id);el('tl_name').value='Botó prova';el('tl_price').value='3.25';el('tl_apply').onclick();
  await ctx.saveTPVLayout(false);assert.equal(ctx.testTPV.items().length,1,'Only old publication is visible');
  await ctx.saveTPVLayout(true);const reloaded=await (await request('/api/tpv-layout')).json();const second=ui(reloaded,request);assert.equal(second.ctx.testTPV.items().length,2);second.ctx.testTPV.order('o1');second.ctx.testTPV.front();assert.match(second.el('modalBody').innerHTML,/Botó prova/);assert.match(second.el('modalBody').innerHTML,/3,25/);
  const buttons=second.ctx.testTPV.layout().draft.buttons;second.ctx.moveTPVTile('buttons',buttons[1].id,-1);await second.ctx.saveTPVLayout(true);const final=await (await request('/api/tpv-layout')).json();assert.equal(final.published.buttons[0].name,'Botó prova');
  const rows=second.rows().filter(r=>r.dataset.layoutKind==='buttons');rows[0].ondragstart({dataTransfer:{setData(){}}});rows[1].ondrop({preventDefault(){}});await second.ctx.saveTPVLayout(true);const dragged=await (await request('/api/tpv-layout')).json();assert.equal(dragged.published.buttons[0].name,'Cafè curt');
  assert.equal(fs.readFileSync(stateFile,'utf8'),original,'Existing JSON preserved byte for byte');
  const other=await fetch(base+'/api/tpv-layout',{headers:{Authorization:auth,'X-Arcadi-Company-Id':context.companyId,'X-Arcadi-Centre-Id':'test_b'}});assert.equal((await other.json()).published,null);
  console.log('OK TPV: create/edit, save/reload, draft/publish, FRONT markup, drag/drop, ordering, isolation, conflict, auth, JSON preservation');
 }finally{child.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});


