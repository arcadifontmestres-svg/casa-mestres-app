'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {store}=require(process.env.TPV_LAYOUT_STORE_TEST_PATH || '../tpv-layout-store');
const M=require('../public/js/tpv-buttons-model');
test('editor payload saves, publishes and reloads through the existing real JSON store',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'trafec-buttons-'));
 try {
  fs.writeFileSync(path.join(root,'data.json'),'{"products":[{"id":"original"}]}');
  const before=fs.readFileSync(path.join(root,'data.json'),'utf8');
  const context={companyId:'company_test',centreId:'centre_one'},other={...context,centreId:'centre_two'};
  const s=store(root,context);assert.equal(s.read().revision,0);assert.equal(fs.existsSync(path.join(root,'tpv-layouts')),false);
  const state={products:[{id:'p1',code:'P001',name:'Article de prova',price:0.5}]};
  const draft={categories:[{id:'group_a',name:'Pantalla',color:'#159ea3',size:1}],buttons:[{id:'button_a',name:'Venda',color:'#159ea3',size:2,categoryId:'group_a',type:'product',itemId:'p1',code:'P001',price:3}]};
  assert.deepEqual(M.issues(draft,M.sources(state),true),[]);
  let result=s.save({revision:0,draft,publish:false});assert.equal(result.revision,1);assert.equal(result.published,null);
  assert.deepEqual(store(root,context).read().draft,draft);
  result=s.save({revision:1,draft,publish:true});assert.deepEqual(result.published,draft);
  const edited=M.clone(draft);edited.buttons[0].name='Esborrany nou';
  s.save({revision:2,draft:edited,publish:false});assert.equal(s.read().published.buttons[0].name,'Venda');
  assert.throws(()=>s.save({revision:1,draft,publish:true}),e=>e.statusCode===409);
  assert.deepEqual(store(root,other).read(),{revision:0,draft:{categories:[],buttons:[]},published:null});
  assert.equal(fs.readFileSync(path.join(root,'data.json'),'utf8'),before);
  assert.equal(s.read().revision,3);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
