const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
function load(){const ctx={window:{},document:{querySelector:()=>({classList:{contains:()=>false}}),addEventListener(){}},localStorage:{getItem:()=>null},setInterval(){},N:v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),PERM:{tem:()=>true}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);return ctx.window.dash.calc}
test('Saldo Disponível soma Saldo em Caixa e Aplicado',()=>{const c=load();assert.equal(c.disponivel({sfd:1200.10,ivn:800.20}),2000.30)});
test('Entradas horizontais incluem somente TECON SALVADOR S/A',()=>{const c=load();assert.equal(c.tecon(['','','TECON SALVADOR S/A']),true);assert.equal(c.tecon(['','','tecon salvador s/a']),true);assert.equal(c.tecon(['','','OUTRA EMPRESA']),false);assert.equal(c.tecon(['','','TECON SALVADOR S/A FILIAL']),false)});
test('Categoria Tipo ordena mês por magnitude maior e menor, incluindo zero',()=>{const c=load(),o={A:{t:200,m:{'2026-01':10}},B:{t:300,m:{'2026-01':90}},C:{t:400,m:{}}};assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'2026-01',d:1})),['B','A','C']);assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'2026-01',d:-1})),['C','A','B'])});
test('Categoria Tipo ordena total sem alterar ordem cronológica dos meses',()=>{const c=load(),o={A:{t:200,m:{}},B:{t:300,m:{}}};assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'TOTAL',d:1})),['B','A']);assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'TOTAL',d:-1})),['A','B'])});
test('Saldos: Aplicado só CDB e Compromissada; Caixa inclui Contamax; Total não duplica produtos',()=>{
 const row=(side,name,value,account,label='',kind='')=>[side,'2026-10-01',name,name,'',value,'','','',account,label,kind];
 const data={v:2,r:[row('R','Receita',1000,'123')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[row('R','CDB',200,'1231','Aplicação','ap'),row('R','COMPROMISSADA',300,'1232','Aplicação','ap'),row('R','CONTAMAX',50,'1233','Aplicação','ap')]};
 const view={style:{},classList:{contains:()=>false},innerHTML:''},ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>JSON.stringify(data)},setInterval(){},setTimeout(){},N:v=>String(v||'').toLowerCase(),PERM:{tem:()=>true,admin:false}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/core/periodo.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);ctx.window.dash.t('sal');
 const values=[...view.innerHTML.matchAll(/<td[^>]*>([\d.,]+)<\/td>/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.')));
 assert.deepEqual(values.slice(0,4),[1000,500,1050,1550]);assert.deepEqual(values.slice(-4),[1000,500,1050,1550]);
});
