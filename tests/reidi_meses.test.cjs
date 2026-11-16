/* Pedidos BB e BC · Projeção REIDI: o filtro de mês deixa de ser uma lista ("Todos os meses" ou um mês): dá para marcar VÁRIOS meses (BB), numa LISTA SUSPENSA "Ano e mês" com os meses agrupados por ano (BC).
   Nenhum mês marcado = todos; a caixinha do ano marca todos os meses dele; "limpar" desmarca tudo; mês marcado que deixa de existir sai do filtro; os cartões e o TOTAL seguem o que está na tela;
   o painel fica aberto enquanto se marca e fecha ao clicar fora, com Esc ou ao sair dele pelo teclado. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function load({admin=true,L=[]}={}){
 let html='',desenhos=0;const els={},focos=[],ls={},lv={},on=(m,t,f)=>{(m[t]=m[t]||[]).push(f)},view={get innerHTML(){return html},set innerHTML(v){html=v;desenhos++},classList:{contains:()=>true,toggle(){}},dataset:{},focus(){focos.push('view')},addEventListener:(t,f)=>on(lv,t,f)};
 const El=function(v){this.value=v||'';this.dataset={};this.innerHTML='';this.textContent='';this.disabled=false;this.className='';this.style={};this.classList={add(){},remove(){}};this.focus=()=>{};this.select=()=>{}};
 const ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener:(t,f)=>on(ls,t,f),activeElement:null},localStorage:{getItem:()=>null,setItem(){}},
  PERM:{tem:()=>true},ROLE:admin?'admin':'lanc',PF:{id:'u1',nome:'Fulano',login:'fulano'},f:n=>String(n),br:s=>s,N:s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(),uLog(){},closeMd(){},setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},mo:h=>{}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};rdb.L=rdb.anexar(L,[]);rdb.carregar=async()=>{};rdb.cli=()=>({from:()=>({select:()=>({order:async()=>({data:[],error:null})})})});
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8'),ctx);
 els['lanc-t']=new El();ctx.window.lanc._r();
 return {lanc:ctx.window.lanc,rdb,els,view,focos,ls,lv,get tab(){return els['lanc-t'].innerHTML},get tela(){return view.innerHTML},get desenhos(){return desenhos}};
}
const compra=(id,f,dt,vo,vn,cat='Previsão',rp='Ana')=>({id,f,i:'Item '+id,cat,ped:'P'+id,dt,vo,vn,rp,cp:'u1',ba:'2026-11-01',st:'A pagar'});
/* 8 compras em 4 meses (out/26 · nov/26 · dez/26 · jan/27), valores com centavos */
const L8=()=>[compra('o1','F-OUT1','2026-10-05',1000.01,900.01),compra('o2','F-OUT2','2026-10-28',2000.02,1800.02,'Cotação'),
 compra('n1','F-NOV1','2026-11-03',3000.03,2700.03),compra('n2','F-NOV2','2026-11-15',4000.04,3600.04,'Cotação'),compra('n3','F-NOV3','2026-11-30',5000.05,4500.05,'Previsão','Bia'),
 compra('d1','F-DEZ1','2026-12-01',6000.06,5400.06),compra('d2','F-DEZ2','2026-12-31',7000.07,6300.07,'Cotação'),compra('j1','F-JAN1','2027-01-15',8000.08,7200.08,'Previsão','Bia')];
const unescH=h=>String(h).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const ids=T=>[...T.tab.matchAll(/<tr[^>]*data-id="([a-z]\d)"/g)].map(m=>m[1]).sort();
const btn=T=>{const m=T.tela.match(/<button type="button" id="lanc-fm-b" class="([^"]*)"([^>]*)><span class="truncate">([^<]*)<\/span>/);return m?{cls:m[1],attrs:m[2],rot:unescH(m[3]),title:unescH((m[2].match(/title="([^"]*)"/)||['',''])[1]),exp:(m[2].match(/aria-expanded="(\w+)"/)||['',''])[1],dis:/\sdisabled\s/.test(' '+m[2]+' ')}:null};
const painel=T=>(T.tela.match(/<div id="lanc-fm-p" class="([^"]*)"[^>]*>/)||['',''])[1];
const aberto=T=>!/^hidden /.test(painel(T));
const caixas=T=>[...T.tela.matchAll(/<input type="checkbox" id="lanc-fm-(\d+)" data-m="([\d-]+)"\s+(checked\s+)?onchange="lanc\.fm\(this\.dataset\.m,this\.checked\)"><span>([^<]*)<\/span>/g)].map(m=>({i:+m[1],m:m[2],on:!!m[3],ab:m[4]}));
const anos=T=>[...T.tela.matchAll(/<input type="checkbox" id="lanc-fa-(\d{4})" data-a="(\d{4})"\s+(checked)?\s*(data-p="1")?\s*onchange="lanc\.fa\(this\.dataset\.a,this\.checked\)"><span>(\d{4})<\/span>/g)].map(m=>({a:m[2],id:m[1],on:!!m[3],parcial:!!m[4],tit:m[5]}));
const marcados=T=>caixas(T).filter(c=>c.on).map(c=>c.m);
const txt=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tfoot=T=>txt((T.tab.match(/<tfoot[\s\S]*?<\/tfoot>/)||[''])[0]);
const brl=c=>{c=BigInt(c);const n=c<0n?-c:c,i=(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'),d=String(n%100n).padStart(2,'0');return (c<0n?'-':'')+'R$ '+i+','+d};   /* reais a partir de centavos inteiros, sem ponto flutuante */
const rx=s=>s.replace(/[$.]/g,'\\$&');
const kpi=(T,t)=>{const m=T.tela.match(new RegExp('>'+t+'</div><div class="text-xl font-bold mt-0\\.5">([\\s\\S]*?)</div>(?:<div class="text-xs text-slate-500">([\\s\\S]*?)</div>)?'));return m?{v:txt(m[1]),s:m[2]?txt(m[2]):''}:null};
const ALL=['d1','d2','j1','n1','n2','n3','o1','o2'];
/* o painel e o botão "de verdade" (o teste não tem DOM): gravam o que o código manda fazer com eles */
const reg=T=>{const r={cl:[],attr:[],ind:[]};T.els['lanc-fm-p']={scrollTop:0,classList:{toggle:(c,f)=>r.cl.push([c,f])},querySelectorAll:q=>{assert.equal(q,'input[data-a]');return anos(T).map(a=>({dataset:{a:a.a,p:a.parcial?'1':undefined},set indeterminate(v){r.ind.push([a.a,v])}}))}};
 T.els['lanc-fm-b']={setAttribute:(k,v)=>r.attr.push([k,v]),focus(){T.focos.push('btn')}};return r};
const clique=(T,dentro)=>T.ls.click.forEach(f=>f({target:{closest:q=>{assert.equal(q,'#lanc-fm');return dentro?{}:null}}}));

test('Tela: o filtro de mês é uma lista suspensa “Ano e mês” (botão + painel fechado), no lugar da lista “Todos os meses / um mês”',()=>{
 for(const admin of [true,false]){const T=load({admin,L:L8()}),b=btn(T);
  assert.ok(b);assert.equal(b.rot,'Todos os meses','nada marcado: o botão diz que são todos os meses');assert.equal(b.exp,'false');assert.ok(!b.dis);assert.doesNotMatch(b.cls,/ring-2/);assert.match(b.attrs,/aria-haspopup="true"/);assert.match(b.attrs,/onclick="lanc\.fo\(\)"/);
  assert.equal(b.title,'Escolha o ano e os meses (dá para marcar vários)');
  assert.ok(!aberto(T),'o painel começa fechado');assert.match(painel(T),/^hidden absolute z-30 /);assert.match(T.tela,/id="lanc-fm-p"[^>]*role="group" aria-label="Filtrar por ano e mês"/);
  assert.doesNotMatch(T.tela,/<option[^>]*>Todos os meses/);assert.doesNotMatch(T.tela,/lanc\.fl\('m'/);assert.doesNotMatch(T.tela,/lanc-fm-x/,'sem “limpar” enquanto nada está marcado');
  assert.match(T.tela,/<span class="text-slate-400" aria-hidden="true">▾<\/span><\/button>/,'a seta do botão');
  assert.deepEqual(ids(T),ALL);assert.deepEqual(kpi(T,'Compras'),{v:'8',s:'lançadas'})}});

test('Tela: o painel agrupa os meses por ano, em ordem de data, com a caixinha do ano e os meses abreviados; nada marcado',()=>{
 const T=load({L:L8()});assert.deepEqual(anos(T),[{a:'2026',id:'2026',on:false,parcial:false,tit:'2026'},{a:'2027',id:'2027',on:false,parcial:false,tit:'2027'}]);
 assert.deepEqual(caixas(T),[{i:0,m:'2026-10',on:false,ab:'out'},{i:1,m:'2026-11',on:false,ab:'nov'},{i:2,m:'2026-12',on:false,ab:'dez'},{i:3,m:'2027-01',on:false,ab:'jan'}]);
 const t=T.tela,i26=t.indexOf('id="lanc-fa-2026"'),i27=t.indexOf('id="lanc-fa-2027"'),im=['2026-10','2026-11','2026-12','2027-01'].map(m=>t.indexOf('data-m="'+m+'"'));
 assert.ok(i26<im[0]&&im[0]<im[1]&&im[1]<im[2]&&im[2]<i27&&i27<im[3],'cada mês aparece debaixo do seu ano');
 assert.match(t,/uppercase[^>]*>Ano e mês<\/span>/);assert.equal((t.match(/lanc\.fm\(this\.dataset\.m,this\.checked\)/g)||[]).length,4);assert.equal((t.match(/lanc\.fa\(this\.dataset\.a,this\.checked\)/g)||[]).length,2)});

test('Tela: ao lado da busca ficam três listas (categoria, responsável e o botão do ano e mês) na grade de 5 colunas',()=>{
 const T=load({L:L8()});assert.equal((T.tela.match(/<select class="inp" onchange="lanc\.fl\(/g)||[]).length,2);assert.match(T.tela,/lanc\.fl\('c',this\.value\)/);assert.match(T.tela,/lanc\.fl\('r',this\.value\)/);
 assert.match(T.tela,/grid grid-cols-2 md:grid-cols-5 gap-2 mb-2"><input id="lanc-q"/);assert.match(T.tela,/lanc\.fl\('r',this\.value\)">[\s\S]*?<\/select>\s*<div id="lanc-fm" class="relative col-span-2 md:col-span-1"><button/)});

test('Abrir e fechar o painel: o botão alterna sem redesenhar a tela; o painel aberto continua aberto quando a tela é redesenhada; sair da tela fecha',()=>{
 const T=load({L:L8()}),r=reg(T);
 T.lanc.fo();assert.deepEqual(r.cl,[['hidden',false]]);assert.deepEqual(r.attr,[['aria-expanded','true']]);assert.ok(!aberto(T),'só mexeu no elemento: a tela não foi redesenhada (o texto ainda é o de antes)');
 T.lanc.fm('2026-11',true);assert.ok(aberto(T),'redesenhada com o painel aberto');assert.equal(btn(T).exp,'true');assert.match(painel(T),/^absolute z-30 /);
 T.lanc.fo();assert.deepEqual(r.cl.at(-1),['hidden',true]);assert.deepEqual(r.attr.at(-1),['aria-expanded','false']);T.lanc.fm('2026-12',true);assert.ok(!aberto(T),'fechado: continua fechado depois de marcar (pelo teclado, por exemplo)');
 T.lanc.fo();T.lanc.show();assert.ok(!aberto(T),'ao voltar para a tela o painel está fechado');assert.deepEqual(marcados(T),['2026-11','2026-12'],'mas a escolha fica')});

test('Sem nenhuma compra o botão fica desativado (Todos os meses) e não abre; com uma compra aparece 1 ano e 1 mês',()=>{
 const V=load({L:[]}),r=reg(V);assert.ok(btn(V).dis);assert.equal(btn(V).rot,'Todos os meses');V.lanc.fo();assert.deepEqual(r.cl,[]);assert.ok(!aberto(V));assert.deepEqual(anos(V),[]);
 const U=load({L:[compra('a1','F','2026-11-10',100,90)]});assert.ok(!btn(U).dis,'com um mês só o botão continua ativo');assert.deepEqual(anos(U).map(a=>a.a),['2026']);assert.deepEqual(caixas(U).map(c=>c.m),['2026-11']);U.lanc.fm('2026-11',true);assert.deepEqual(ids(U),['a1']);assert.equal(btn(U).rot,'nov/26')});

test('Fechar: clicar fora fecha, clicar dentro não; Esc fecha e devolve o foco ao botão; outra tecla não; sair do painel pelo teclado fecha',()=>{
 const T=load({L:L8()}),r=reg(T);
 T.lanc.fo();clique(T,true);assert.deepEqual(r.cl,[['hidden',false]],'clique dentro do painel não fecha');clique(T,false);assert.deepEqual(r.cl.at(-1),['hidden',true]);assert.equal(r.cl.length,2);
 clique(T,false);assert.equal(r.cl.length,2,'com o painel fechado o clique fora não faz nada');
 T.lanc.fo();T.ls.keydown.forEach(f=>f({key:'Enter'}));assert.equal(r.cl.length,3,'Enter não fecha');T.focos.length=0;T.ls.keydown.forEach(f=>f({key:'Escape'}));assert.deepEqual(r.cl.at(-1),['hidden',true]);assert.deepEqual(T.focos,['btn']);
 T.ls.keydown.forEach(f=>f({key:'Escape'}));assert.equal(r.cl.length,4,'Esc com o painel fechado não faz nada');
 const sai=(para)=>T.lv.focusout.forEach(f=>f({relatedTarget:para}));
 T.lanc.fo();sai(null);assert.equal(r.cl.length,5,'sem destino (a tela foi redesenhada) não fecha');sai({closest:()=>({})});assert.equal(r.cl.length,5,'foco indo para outro item do painel não fecha');sai({closest:()=>null});assert.deepEqual(r.cl.at(-1),['hidden',true]);assert.equal(r.cl.length,6)});

test('Marcar UM mês mostra só as compras dele; o botão mostra o mês e ganha destaque; “limpar” aparece; cartões e TOTAL acompanham',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-11',true);
 assert.deepEqual(ids(T),['n1','n2','n3']);assert.deepEqual(marcados(T),['2026-11']);assert.equal(btn(T).rot,'nov/26');assert.match(btn(T).cls,/ring-2 ring-amber-500/);assert.equal(btn(T).title,'Meses marcados: nov/26');
 assert.match(T.tela,/<button type="button" id="lanc-fm-x"[^>]*onclick="lanc\.fmx\(\)">limpar<\/button>/);
 assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',false,true],['2027',false,false]],'2026 fica “pela metade” (só nov marcado); 2027 vazio');
 assert.deepEqual(kpi(T,'Compras'),{v:'3',s:'de 8 lançadas'});
 assert.match(tfoot(T),new RegExp('^TOTAL \\(3\\) '+rx(brl(1200012))+' '+rx(brl(1080012))));   /* 3000,03+4000,04+5000,05 = 12.000,12 · 2700,03+3600,04+4500,05 = 10.800,12 */
 assert.match(txt(T.tela.match(/>Valor original<\/div><div[^>]*>([\s\S]*?)<\/div>/)[1]),new RegExp(rx(brl(1200012))))});

test('Marcar VÁRIOS meses (de anos diferentes também) mostra as compras de todos eles; o botão lista os meses (até 3) ou conta',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-12',true);assert.deepEqual(ids(T),['d1','d2']);
 T.lanc.fm('2026-11',true);assert.deepEqual(ids(T),['d1','d2','n1','n2','n3']);assert.deepEqual(marcados(T),['2026-11','2026-12'],'as caixinhas seguem a ordem dos meses, não a do clique');assert.equal(btn(T).rot,'nov/26, dez/26');
 assert.deepEqual(kpi(T,'Compras'),{v:'5',s:'de 8 lançadas'});
 assert.match(tfoot(T),new RegExp('^TOTAL \\(5\\) '+rx(brl(2500025))+' '+rx(brl(2250025))));   /* 12.000,12 + 6000,06 + 7000,07 = 25.000,25 · 10.800,12 + 5400,06 + 6300,07 = 22.500,25 */
 T.lanc.fm('2027-01',true);assert.deepEqual(ids(T),['d1','d2','j1','n1','n2','n3']);assert.equal(btn(T).rot,'nov/26, dez/26, jan/27');assert.equal(btn(T).title,'Meses marcados: nov/26, dez/26, jan/27');
 T.lanc.fm('2026-10',true);assert.deepEqual(ids(T),ALL,'os quatro meses marcados = todas as compras');assert.deepEqual(kpi(T,'Compras'),{v:'8',s:'lançadas'});assert.equal(btn(T).rot,'4 meses');
 assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',true,false],['2027',true,false]],'todos os meses de cada ano marcados: caixinhas dos anos cheias')});

test('A caixinha do ANO marca e desmarca todos os meses dele (e só dele); “pela metade” quando só parte está marcada',()=>{
 const T=load({L:L8()});T.lanc.fa('2026',true);assert.deepEqual(marcados(T),['2026-10','2026-11','2026-12']);assert.deepEqual(ids(T),['d1','d2','n1','n2','n3','o1','o2']);assert.equal(btn(T).rot,'out/26, nov/26, dez/26');
 assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',true,false],['2027',false,false]]);
 T.lanc.fa('2027',true);assert.deepEqual(ids(T),ALL);T.lanc.fa('2026',false);assert.deepEqual(marcados(T),['2027-01']);assert.deepEqual(ids(T),['j1']);
 T.lanc.fm('2026-11',true);assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',false,true],['2027',true,false]]);
 T.lanc.fa('2026',true);assert.deepEqual(marcados(T),['2026-10','2026-11','2026-12','2027-01'],'marcar o ano completa os meses que faltavam');
 T.lanc.fm('2026-12',false);assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',false,true],['2027',true,false]]);
 T.lanc.fm('2026-10',false);T.lanc.fm('2026-11',false);assert.deepEqual(anos(T).map(a=>[a.a,a.on,a.parcial]),[['2026',false,false],['2027',true,false]],'sem nenhum mês do ano marcado: nem cheia nem pela metade')});

test('Ano inválido ou sem compras é ignorado (nem redesenha); o foco volta para a caixinha do ano que a pessoa mexeu',()=>{
 const T=load({L:L8()});T.focos.length=0;const d0=T.desenhos;for(const a of ['','2030','26','abc',undefined,null,'2026-11',' 2026',{}])T.lanc.fa(a,true);assert.deepEqual(marcados(T),[]);assert.deepEqual(ids(T),ALL);assert.deepEqual(T.focos,[]);assert.equal(T.desenhos,d0,'nenhum redesenho');
 T.els['lanc-fa-2026']={focus(){T.focos.push('ano')}};T.lanc.fa('2026',true);assert.deepEqual(T.focos,['ano'],'o foco vai para a caixinha do ano (lanc-fa-2026)')});

test('A caixinha “pela metade” do ano é ligada por script depois de cada redesenho (indeterminate); só a do ano parcial',()=>{
 const T=load({L:L8()}),r=reg(T);T.lanc.fm('2026-11',true);assert.deepEqual(r.ind,[['2026',true],['2027',false]]);
 r.ind.length=0;T.lanc.fa('2026',true);assert.deepEqual(r.ind,[['2026',false],['2027',false]]);r.ind.length=0;T.lanc.fm('2027-01',true);T.lanc.fm('2026-12',false);assert.deepEqual(r.ind.slice(-2),[['2026',true],['2027',false]])});

test('O painel aberto não volta ao topo quando a tela é redesenhada (a rolagem dele é guardada e devolvida)',()=>{
 const T=load({L:L8()});reg(T);const p=T.els['lanc-fm-p'];p.scrollTop=137;T.lanc.fm('2026-11',true);assert.equal(p.scrollTop,137);
 let vistos=[];Object.defineProperty(p,'scrollTop',{get(){return 55},set(v){vistos.push(v)},configurable:true});T.lanc.fm('2026-12',true);assert.deepEqual(vistos,[55],'leu 55 antes de redesenhar e devolveu 55 depois')});

test('Marcar mês, marcar ano e limpar levam a tabela de volta ao topo (a rolagem para o lado fica); só redesenhar (dados novos) mantém onde estava',()=>{
 const T=load({L:L8()}),sc=()=>{const e={scrollTop:50,scrollLeft:7,style:{},querySelectorAll:()=>[]};T.els['lanc-sc']=e;return e};
 let e=sc();T.lanc.fm('2026-11',true);assert.equal(T.els['lanc-sc'].scrollTop,0);assert.equal(T.els['lanc-sc'].scrollLeft,7);
 e=sc();T.lanc.fa('2026',true);assert.equal(e.scrollTop,0);e=sc();T.lanc.fm('2026-11',false);assert.equal(e.scrollTop,0);e=sc();T.lanc.fmx();assert.equal(e.scrollTop,0);
 e=sc();T.lanc._r();assert.equal(e.scrollTop,50,'só redesenhar (dados novos do banco) não leva ao topo')});

test('Desmarcar tira só aquele mês; desmarcar o último volta a mostrar tudo; marcar duas vezes não duplica',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-10',true);T.lanc.fm('2026-10',true);T.lanc.fm('2027-01',true);assert.deepEqual(ids(T),['j1','o1','o2']);
 T.lanc.fm('2026-10',false);assert.deepEqual(ids(T),['j1']);assert.deepEqual(marcados(T),['2027-01']);
 T.lanc.fm('2026-10',false);assert.deepEqual(ids(T),['j1'],'desmarcar quem não está marcado não muda nada');
 T.lanc.fm('2027-01',false);assert.deepEqual(ids(T),ALL);assert.deepEqual(marcados(T),[]);assert.doesNotMatch(T.tela,/lanc-fm-x/);assert.doesNotMatch(btn(T).cls,/ring-2/);assert.equal(btn(T).rot,'Todos os meses')});

test('“limpar” desmarca todos os meses de uma vez e some; o painel continua como estava; o foco vai para a primeira caixinha',()=>{
 const T=load({L:L8()});T.lanc.fo();T.lanc.fm('2026-11',true);T.lanc.fm('2026-12',true);T.focos.length=0;T.els['lanc-fm-0']={focus(){T.focos.push('cx0')}};
 T.lanc.fmx();assert.deepEqual(marcados(T),[]);assert.deepEqual(ids(T),ALL);assert.doesNotMatch(T.tela,/lanc-fm-x/);assert.doesNotMatch(btn(T).cls,/ring-2/);assert.equal(btn(T).rot,'Todos os meses');assert.deepEqual(T.focos,['cx0'],'o foco vai para a primeira caixinha (lanc-fm-0)');
 assert.deepEqual(anos(T).map(a=>[a.on,a.parcial]),[[false,false],[false,false]]);T.lanc.fmx();assert.deepEqual(ids(T),ALL,'limpar sem nada marcado não quebra')});

test('Marcar/desmarcar devolve o foco à caixinha que a pessoa mexeu (a tela é redesenhada)',()=>{
 const T=load({L:L8()});T.focos.length=0;T.lanc.fm('2026-11',true);assert.deepEqual(T.focos,['view']);T.lanc.fm('2026-11',false);assert.deepEqual(T.focos,['view','view'])});

test('Mês marcado que deixou de existir (última compra excluída ou mudou de mês) sai do filtro sozinho — não deixa a tabela vazia sem saída',()=>{
 for(const admin of [true,false]){const T=load({admin,L:L8()});T.lanc.fm('2026-11',true);assert.deepEqual(ids(T),['n1','n2','n3']);
  T.rdb.L=T.rdb.L.filter(x=>!x.dt.startsWith('2026-11'));T.lanc._r();
  assert.deepEqual(caixas(T).map(c=>c.m),['2026-10','2026-12','2027-01']);assert.deepEqual(marcados(T),[]);assert.deepEqual(ids(T),['d1','d2','j1','o1','o2'],'sem o mês marcado, volta a mostrar tudo');assert.doesNotMatch(T.tela,/lanc-fm-x/);assert.doesNotMatch(btn(T).cls,/ring-2/);assert.equal(btn(T).rot,'Todos os meses');assert.deepEqual(kpi(T,'Compras'),{v:'5',s:'lançadas'})}
 /* com dois meses marcados, só o que sumiu sai; o outro continua */
 const U=load({L:L8()});U.lanc.fm('2026-11',true);U.lanc.fm('2026-12',true);U.rdb.L=U.rdb.L.filter(x=>!x.dt.startsWith('2026-11'));U.lanc._r();assert.deepEqual(marcados(U),['2026-12']);assert.deepEqual(ids(U),['d1','d2']);assert.equal(btn(U).rot,'dez/26');
 /* um ano que ficou sem meses some do painel */
 const V=load({L:L8()});V.lanc.fa('2027',true);V.rdb.L=V.rdb.L.filter(x=>!x.dt.startsWith('2027'));V.lanc._r();assert.deepEqual(anos(V).map(a=>a.a),['2026']);assert.deepEqual(marcados(V),[]);assert.deepEqual(ids(V),['d1','d2','n1','n2','n3','o1','o2'])});

test('Um mês novo (compra incluída/editada para outro mês) aparece no painel, sem marcar nada; um ano novo também',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-11',true);T.rdb.L=T.rdb.anexar([...L8(),compra('f1','F-FEV','2027-02-10',10,9),compra('g1','F-28','2028-03-10',10,9)],[]);T.lanc._r();
 assert.deepEqual(caixas(T).map(c=>c.m),['2026-10','2026-11','2026-12','2027-01','2027-02','2028-03']);assert.deepEqual(anos(T).map(a=>a.a),['2026','2027','2028']);assert.deepEqual(marcados(T),['2026-11']);assert.deepEqual(ids(T),['n1','n2','n3'])});

test('Os meses combinam (E) com busca, categoria, responsável e status',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-11',true);T.lanc.fm('2027-01',true);
 T.lanc.fl('c','Cotação');assert.deepEqual(ids(T),['n2']);   /* nov/26 e jan/27 com categoria Cotação */
 T.lanc.fl('c','');T.lanc.fl('r','Bia');assert.deepEqual(ids(T),['j1','n3']);
 T.lanc.fl('r','');T.rdb.L.find(x=>x.id=='n1').st='Pago';T.rdb.L.find(x=>x.id=='j1').st='Pago';T.lanc._r();T.lanc.fs('Pago',true);assert.deepEqual(ids(T),['j1','n1']);
 T.lanc.fs('Pago',false);T.lanc.q('F-NOV2');assert.deepEqual(ids(T),['n2']);T.lanc.q('F-DEZ1');assert.deepEqual(ids(T),[],'F-DEZ1 é de dezembro, que não está marcado');
 T.lanc.q('');T.lanc.fm('2026-12',true);T.lanc.q('F-DEZ1');assert.deepEqual(ids(T),['d1']);assert.match(tfoot(T),/^TOTAL \(1\) /)});   /* a busca refaz só a tabela e o TOTAL (os cartões do topo seguem os filtros de lista/caixinhas, como antes) */

test('Marcação de mês inválida é ignorada: vazio, texto, formato errado, undefined (nem redesenha)',()=>{
 const T=load({L:L8()});T.focos.length=0;const d0=T.desenhos;for(const m of ['',undefined,null,'nov/26','2026-1','26-11','2026-11-01','2026/11',' 2026-11','abc',{}])T.lanc.fm(m,true);
 assert.deepEqual(marcados(T),[]);assert.deepEqual(ids(T),ALL);assert.deepEqual(T.focos,[],'nem pega foco');assert.equal(T.desenhos,d0,'nem redesenha a tela');
 T.lanc.fm('2026-99',true);assert.deepEqual(marcados(T),[]);assert.deepEqual(ids(T),ALL,'AAAA-MM que não é de nenhuma compra sai na hora (não esconde nada)')});

test('fl(): categoria e responsável seguem iguais; o antigo fl(\'m\',…) (uma lista de mês) não existe mais',()=>{
 const T=load({L:L8()});T.lanc.fl('m','2026-11');assert.deepEqual(ids(T),ALL);assert.deepEqual(marcados(T),[]);
 T.lanc.fl('c','Cotação');assert.deepEqual(ids(T),['d2','n2','o2']);T.lanc.fl('r','Bia');assert.deepEqual(ids(T),[]);T.lanc.fl('c','');assert.deepEqual(ids(T),['j1','n3'])});

test('A escolha de meses fica ao sair e voltar para a tela (como a de status) e a ordenação continua funcionando sobre os meses marcados',()=>{
 const T=load({L:L8()});T.lanc.fm('2026-10',true);T.lanc.fm('2026-12',true);T.lanc.show();assert.deepEqual(marcados(T),['2026-10','2026-12']);assert.deepEqual(ids(T),['d1','d2','o1','o2']);
 const ord=()=>[...T.tab.matchAll(/<tr[^>]*data-id="([a-z]\d)"/g)].map(m=>m[1]);assert.deepEqual(ord(),['o1','o2','d1','d2']);T.lanc.s('dt');assert.deepEqual(ord(),['d2','d1','o2','o1'])});

test('Meses de compras com o mesmo mês em anos diferentes ficam separados (nov/26 ≠ nov/27) e a virada de ano ordena certo',()=>{
 const T=load({L:[compra('a1','F1','2026-11-10',1,1),compra('a2','F2','2027-11-10',2,2),compra('a3','F3','2025-12-31',3,3),compra('a4','F4','2026-01-01',4,4)]});
 assert.deepEqual(anos(T).map(a=>a.a),['2025','2026','2027']);assert.deepEqual(caixas(T).map(c=>c.m),['2025-12','2026-01','2026-11','2027-11']);assert.deepEqual(caixas(T).map(c=>c.ab),['dez','jan','nov','nov']);
 T.lanc.fm('2026-11',true);assert.deepEqual(ids(T),['a1']);T.lanc.fm('2025-12',true);assert.deepEqual(ids(T),['a1','a3']);assert.equal(btn(T).rot,'dez/25, nov/26');
 T.lanc.fa('2026',true);assert.deepEqual(ids(T),['a1','a3','a4']);T.lanc.fa('2027',true);assert.deepEqual(ids(T),['a1','a2','a3','a4'])});
