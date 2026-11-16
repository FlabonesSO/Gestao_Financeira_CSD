/* Pedido BA · Projeção REIDI: a coluna "Data prevista de pagamento" mostra SÓ a data que a pessoa salvou/alterou na compra.
   A linha pequena "Pagamento em dd/mm/aaaa" (o dia em que o calendário paga: 15 ou último dia do mês) saiu da tabela; o formulário continua mostrando o dia do calendário. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const unesc=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function load({admin=true,L=[]}={}){
 const els={},view={innerHTML:'',classList:{contains:()=>true,toggle(){}},dataset:{}};
 const El=function(v){this.value=v||'';this.dataset={};this.innerHTML='';this.textContent='';this.disabled=false;this.className='';this.style={};this.classList={add(){},remove(){}};this.focus=()=>{};this.select=()=>{}};
 const ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener(){},activeElement:null},localStorage:{getItem:()=>null,setItem(){}},
  PERM:{tem:()=>true},ROLE:admin?'admin':'lanc',PF:{id:'u1',nome:'Fulano',login:'fulano'},f:n=>String(n),br:s=>s,N:s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(),uLog(){},closeMd(){},setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},
  mo:h=>{for(const k of Object.keys(els))if(k.startsWith('lf-'))delete els[k];
   (h.match(/<(input|select|div|p|button)[^>]*\sid="lf-[a-z]+"[^>]*>/g)||[]).forEach(t=>{const id=t.match(/id="(lf-[a-z]+)"/)[1],v=t.match(/\svalue="([^"]*)"/);els[id]=new El(v?unesc(v[1]):'')});els.mdb=els.mdb||new El();els.mdb.innerHTML=h}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};rdb.L=rdb.anexar(L,[]);rdb.carregar=async()=>{};rdb.cli=()=>({from:()=>({select:()=>({order:async()=>({data:[],error:null})})})});
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8'),ctx);
 els['lanc-t']=new El();ctx.window.lanc._r();
 return {lanc:ctx.window.lanc,rdb,els,view,get tab(){return els['lanc-t'].innerHTML}};
}
const compra=(id,f,dt)=>({id,f,i:'Item '+id,cat:'Previsão',ped:'P'+id,dt,vo:100000,vn:95000,rp:'Ana',cp:'u1',ba:'2026-11-01',st:'A pagar'});
/* 10/11 e 22/11 NÃO são dia 15 nem último dia do mês (antes mostravam a linha “Pagamento em …”); 15/11 e 30/11 são */
const L4=()=>[compra('a1','ZZZ FORNECEDOR','2026-11-10'),compra('a2','AAA FORNECEDOR','2026-11-15'),compra('a3','MMM FORNECEDOR','2026-11-22'),compra('a4','BBB FORNECEDOR','2026-11-30')];
const linha=(h,id)=>(h.match(new RegExp('<tr[^>]*data-id="'+id+'"[\\s\\S]*?</tr>'))||[''])[0];
const cel=(r)=>(r.match(/<td[^>]*data-c="dt"[^>]*>([\s\S]*?)<\/td>/)||['',''])[1];
const txt=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

test('Tabela: a coluna da data mostra SÓ a data salva na compra — sem a linha “Pagamento em …” do calendário, em nenhuma linha',()=>{
 for(const admin of [true,false]){const T=load({admin,L:L4()});
  assert.doesNotMatch(T.tab,/Pagamento em/);assert.doesNotMatch(T.tab,/entra no pagamento de/);assert.doesNotMatch(T.tab,/calendário/);
  assert.equal(txt(cel(linha(T.tab,'a1'))),'10/11/2026');assert.equal(txt(cel(linha(T.tab,'a2'))),'15/11/2026');assert.equal(txt(cel(linha(T.tab,'a3'))),'22/11/2026');assert.equal(txt(cel(linha(T.tab,'a4'))),'30/11/2026');
  for(const id of ['a1','a2','a3','a4'])assert.doesNotMatch(cel(linha(T.tab,id)),/<div|<span|title=/,'célula só com o texto da data: '+id)}});

test('Tabela: a data da célula é a SALVA (x.dt), nunca a do calendário (RDB.pagto): 10/11 não vira 15/11 e 22/11 não vira 30/11',()=>{
 const T=load({L:L4()});assert.equal(T.rdb.pagto('2026-11-10'),'2026-11-15');assert.equal(T.rdb.pagto('2026-11-22'),'2026-11-30');   /* o calendário continua existindo para o relatório REIDI */
 assert.ok(!/15\/11\/2026/.test(cel(linha(T.tab,'a1'))));assert.ok(!/30\/11\/2026/.test(cel(linha(T.tab,'a3'))))});

test('Tabela: a ordem padrão segue a data SALVA (empate do calendário não embaralha) e o título da coluna não fala mais da linha de baixo',()=>{
 const T=load({L:L4()}),ord=()=>[...T.tab.matchAll(/data-id="(a\d)"/g)].map(m=>m[1]);
 assert.deepEqual(ord(),['a1','a2','a3','a4']);   /* 10, 15, 22, 30 — pelo calendário a1 e a2 empatariam em 15/11 e a ordem sairia a2, a1 (AAA antes de ZZZ) */
 T.lanc.s('dt');assert.deepEqual(ord(),['a4','a3','a2','a1']);
 assert.match(T.tab,/title="A data que você salvou na compra \(ordena por ela\)\. Os pagamentos reais ficam em “💰 pagamentos”\."/);assert.doesNotMatch(T.tab,/linha de baixo/)});

test('Tabela: a célula da data não quebra (uma linha só) e a altura da linha não ganha a linha extra',()=>{
 const T=load({L:L4()});assert.match(linha(T.tab,'a1'),/<td class="px-1\.5 py-1 whitespace-nowrap" data-c="dt">10\/11\/2026<\/td>/)});

test('Formulário: ao escolher a data, a linha com o dia do calendário e a transferência continua (só a tabela mudou)',()=>{
 const T=load();T.lanc.f();T.els['lf-d'].value='2026-11-10';T.lanc.pv();
 assert.equal(T.els['lf-pg'].textContent,'Pagamento em 15/11/2026 (dom) · transferência 3 dias antes');
 T.els['lf-d'].value='';T.lanc.pv();assert.equal(T.els['lf-pg'].textContent,'')});
