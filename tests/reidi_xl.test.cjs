/* Pedido BF-2 · Projeção de Compras REIDI: botão "⬇ Exportar lançamentos (Excel)" — uma linha por compra, as que estão na tabela (busca, categoria, responsável, meses e status marcados), na ordem da tela.
   O teste grava o que o módulo manda para o gerador de planilha (XR.dados) e para o download (saveAs): título, subtítulo, linhas, colunas, valores célula a célula e totais. O arquivo .xlsx de verdade é conferido no teste de navegador (h/t_bf.py). */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const SALVOS=[],DADOS=[];
const XRS={C:{},serial:iso=>'D:'+iso,hoje:()=>'AGORA',dados:(wb,nome,o)=>{DADOS.push({wb,nome,o})}};
function load({admin=true,L=[],PG=[]}={}){
 let html='',desenhos=0;const els={},focos=[],ls={},lv={},on=(m,t,f)=>{(m[t]=m[t]||[]).push(f)},view={get innerHTML(){return html},set innerHTML(v){html=v;desenhos++},classList:{contains:()=>true,toggle(){}},dataset:{},focus(){focos.push('view')},addEventListener:(t,f)=>on(lv,t,f)};
 const El=function(v){this.value=v||'';this.dataset={};this.innerHTML='';this.textContent='';this.disabled=false;this.className='';this.style={};this.classList={add(){},remove(){}};this.focus=()=>{};this.select=()=>{}};
 const ctx={XP:{book:o=>({o,save:async()=>'BYTES'})},XR:XRS,saveAs:async(n,b)=>{SALVOS.push([n,b])},window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener:(t,f)=>on(ls,t,f),activeElement:null},localStorage:{getItem:()=>null,setItem(){}},
  PERM:{tem:()=>true},ROLE:admin?'admin':'lanc',PF:{id:'u1',nome:'Fulano',login:'fulano'},f:n=>String(n),br:s=>s,N:s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(),uLog(){},closeMd(){},setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},mo:h=>{}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};rdb.L=rdb.anexar(L.map(r=>rdb.de(r)),PG);rdb.carregar=async()=>{};rdb.cli=()=>({from:()=>({select:()=>({order:async()=>({data:[],error:null})})})});
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8'),ctx);
 els['lanc-t']=new El();ctx.window.lanc._r();
 return {lanc:ctx.window.lanc,rdb,els,view,focos,ls,lv,get tab(){return els['lanc-t'].innerHTML},get tela(){return view.innerHTML},get desenhos(){return desenhos}};
}

const compra=(id,f,i,cat,ped,dt,rp,vo,vn,cp='u1')=>({id,fornecedor:f,item:i,categoria:cat,pedido:ped,data_prevista:dt,data_base:dt,responsavel:rp,valor_original:vo,valor_negociado:vn,status:'A pagar',criado_por:cp});
const pag=(id,cid,d,v)=>({id,compra_id:cid,data_pagamento:d,valor:v,obs:'',criado_por:'u1'});
/* 4 compras: parcial (9,25%), zerada, paga (3,65%), minúscula; fora de ordem de data de propósito */
const DB=()=>{const rdb=null;return [compra('c4','F-D','Item 4','Doc Faturado','P4','2027-01-10','Ana',1,0.97),compra('c1','F-A','Item 1','Previsão','P1','2026-11-03','Ana',1000.01,900.01),compra('c3','F-C','Item 3','Previsão','P3','2026-12-15','Bia',250.5,240),compra('c2','F-B','Item 2','Cotação','','2026-10-05','',0,0)]};
const PGS=()=>[pag('p1','c1','2026-11-20',400),pag('p3','c3','2026-12-20',240)];
function T0(o){const T=load(o);SALVOS.length=0;DADOS.length=0;return T}
const exporta=async T=>{await T.lanc.xl();return DADOS[DADOS.length-1]};
const HDR=['Nº','FORNECEDOR','ITEM / DESCRIÇÃO','CATEGORIA','Nº PEDIDO / PROCESSO / NF','DATA PREVISTA DE PAGAMENTO','RESPONSÁVEL','VALOR ORIGINAL','VALOR NEGOCIADO','VALOR PAGO','% PAGO DO NEGOCIADO','SALDO A PAGAR','ECONOMIA REIDI REAL','% ECONOMIA REAL (SOBRE O ORIGINAL)','ECONOMIA REIDI TEÓRICA','% TEÓRICO (ALÍQUOTA × 90%)','STATUS'];
const lin=(o,i)=>o.cols.map(c=>c.g(o.rows[i],i));
const J=x=>JSON.stringify(x),eq=(a,b,m)=>assert.equal(J(a),J(b),m);

test('Botão: "⬇ Exportar lançamentos (Excel)" fica no topo, depois de "Importar planilha"; aparece para o administrador e para quem só lança',()=>{
 for(const admin of [true,false]){const T=T0({admin,L:DB(),PG:PGS()});
  const m=T.tela.match(/<button id="lanc-xl" class="btn2" title="([^"]*)" onclick="lanc\.xl\(\)">([^<]*)<\/button>/);assert.ok(m,'botão com id lanc-xl e onclick lanc.xl()');
  assert.equal(m[2],'⬇ Exportar lançamentos (Excel)');assert.match(m[1],/uma compra por linha/);
  const i1=T.tela.indexOf('lanc.imp()'),i2=T.tela.indexOf('lanc.xl()'),i3=T.tela.indexOf('lanc.exp()');assert.ok(i1>0&&i2>i1,'depois de Importar');
  if(admin)assert.ok(i3>i2,'o "Exportar planilha (modelo)" do administrador vem depois');else assert.equal(i3,-1,'o modelo segue só do administrador');
  assert.equal((T.tela.match(/id="lanc-xl"/g)||[]).length,1);assert.equal(typeof T.lanc.xl,'function')}});

test('Exportar: uma linha por compra, na ordem da tela (data prevista), com título, subtítulo, formato e totais',async()=>{
 const T=T0({L:DB(),PG:PGS()}),d=await exporta(T),o=d.o;
 assert.equal(DADOS.length,1,'uma chamada ao gerador');assert.equal(d.nome,'Lançamentos');assert.equal(d.wb.o.titulo,'REIDI · Projeção de Compras · lançamentos');
 assert.equal(o.titulo,'Projeção de Compras REIDI · lançamentos');assert.equal(o.sub,'Projeção de Compras REIDI · sem filtros (todas as compras) · 4 de 4 compra(s) · Gerado em AGORA');assert.equal(o.rod,'Consórcio Santa Dulce · REIDI · Projeção de Compras');
 assert.equal(o.cent,true,'valores em reais ao centavo (ROUND nos totais)');assert.equal(o.fz,2,'Nº e Fornecedor congelados');
 eq(o.rows.map(r=>r.id),['c2','c1','c3','c4'],'mesma ordem da tela (data prevista crescente)');
 eq(o.cols.map(c=>c.h),HDR);
 assert.equal(J(o.cols.map(c=>c.nf||null)),J([ 'int',null,null,null,null,'data',null,'moedaZ','moedaZ','moeda','pct2','moeda','moedaZ','pct2','moedaZ','pct2',null]));
 assert.equal(J(o.cols.map(c=>c.tot==null?null:c.tot)),J(['TOTAL (4)',null,null,null,null,null,null,'sum','sum','sum',null,'sum','sum',null,'sum',null,null]),'só os valores em R$ somam; o rótulo traz a quantidade');
 assert.equal(J(lin(o,0)),J([1,'F-B','Item 2','Cotação','-','D:2026-10-05','-',0,0,0,null,0,0,null,0,null,'A pagar']),'compra zerada: pedido e responsável "-", % em branco');
 assert.equal(J(lin(o,1)),J([2,'F-A','Item 1','Previsão','P1','D:2026-11-03','Ana',1000.01,900.01,400,0.4444,500.01,100,0.1,83.2508325,0.0833,'Parcial']),'parcial: % pago 44,44%, economia real 100,00 (10,00%), teórica exata 83,2508325 (9,25% × 90% = 8,33%)');
 assert.equal(J(lin(o,2)),J([3,'F-C','Item 3','Previsão','P3','D:2026-12-15','Bia',250.5,240,240,1,0,10.5,0.0419,8.228925,0.0329,'Pago']),'paga');
 assert.equal(J(lin(o,3)),J([4,'F-D','Item 4','Doc Faturado','P4','D:2027-01-10','Ana',1,0.97,0,null,0.97,0.03,0.03,0.03285,0.0329,'A pagar']),'minúscula');
 assert.equal(SALVOS.length,1);assert.equal(SALVOS[0][0],'projecao_compras_reidi_lancamentos.xlsx');assert.equal(SALVOS[0][1],'BYTES','salva o que o gerador devolveu');
 assert.equal(T.tela.includes('id="lanc-msg"'),false,'sem mensagem quando dá certo')});

test('Exportar: acompanha a tela — busca, categoria, responsável, meses, status e ordem; o subtítulo diz quais filtros',async()=>{
 const T=T0({L:DB(),PG:PGS()});
 T.lanc.q('f-a');let o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1']);assert.match(o.sub,/ · busca: “f-a” · 1 de 4 compra\(s\)/);assert.equal(o.cols[0].tot,'TOTAL (1)');
 T.lanc.q('');T.lanc.fl('c','Previsão');o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1','c3']);assert.match(o.sub,/categoria: Previsão · 2 de 4/);
 T.lanc.fl('c','');T.lanc.fl('r','Ana');o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1','c4']);assert.match(o.sub,/responsável: Ana/);
 T.lanc.fl('r','');T.lanc.fm('2027-01',true);T.lanc.fm('2026-12',true);o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c3','c4']);assert.match(o.sub,/meses: dez\/26, jan\/27/);
 T.lanc.fmx();T.lanc.fs('Pago',true);T.lanc.fs('Parcial',true);o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1','c3']);assert.match(o.sub,/status: Parcial, Pago/,'status na ordem das caixinhas');
 T.lanc.fs('Pago',false);T.lanc.fs('Parcial',false);
 T.lanc.fl('c','Previsão');T.lanc.fl('r','Ana');T.lanc.fm('2026-11',true);T.lanc.fs('Parcial',true);o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1']);assert.match(o.sub,/categoria: Previsão · responsável: Ana · meses: nov\/26 · status: Parcial · 1 de 4/,'todos os filtros juntos, nesta ordem');
 T.lanc.fl('c','');T.lanc.fl('r','');T.lanc.fmx();T.lanc.fs('Parcial',false);
 T.lanc.s('vo');o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c2','c4','c3','c1'],'valor original crescente');T.lanc.s('vo');o=(await exporta(T)).o;eq(o.rows.map(r=>r.id),['c1','c3','c4','c2'],'e decrescente');
 assert.equal(o.cols[0].g(o.rows[0],0),1,'o Nº recomeça em 1 e segue a ordem exportada')});

test('Exportar: sem compra na tela não baixa nada e avisa (âmbar); base vazia tem aviso próprio',async()=>{
 let T=T0({L:DB(),PG:PGS()});T.lanc.q('zzz');await T.lanc.xl();assert.equal(DADOS.length,0);assert.equal(SALVOS.length,0);
 let m=T.tela.match(/<div id="lanc-msg" class="([^"]*)">([^<]*)<\/div>/);assert.ok(m);assert.match(m[1],/amber/);assert.doesNotMatch(m[1],/rose|emerald/);assert.equal(m[2],'Nenhuma compra na tabela para exportar: a busca ou os filtros não deixaram nenhuma.');
 T.lanc.q('');T.els['lanc-msg']={removido:false,remove(){this.removido=true}};await T.lanc.xl();assert.equal(T.els['lanc-msg'].removido,true,'exportar de novo tira o aviso antigo da tela');assert.equal(DADOS.length,1,'e agora exporta');
 T=T0({L:[]});await T.lanc.xl();assert.equal(DADOS.length,0);m=T.tela.match(/<div id="lanc-msg" class="([^"]*)">([^<]*)<\/div>/);assert.ok(m);assert.match(m[1],/amber/);assert.equal(m[2],'Ainda não há compras lançadas para exportar.')});

test('Exportar: enquanto a tela ainda carrega (RDB.ok falso) o botão não faz nada, nem aviso',async()=>{
 const T=T0({L:DB(),PG:PGS()});T.rdb.ok=false;const antes=T.desenhos;await T.lanc.xl();assert.equal(DADOS.length,0);assert.equal(SALVOS.length,0);assert.equal(T.desenhos,antes,'a tela não é redesenhada');assert.equal(T.tela.includes('id="lanc-msg"'),false)});

test('Exportar: falha do gerador ou do download vira mensagem vermelha, sem erro solto',async()=>{
 let T=T0({L:DB(),PG:PGS()});XRS.dados=()=>{throw new Error('planilha quebrou')};await T.lanc.xl();
 let m=T.tela.match(/<div id="lanc-msg" class="([^"]*)">([^<]*)<\/div>/);assert.ok(m);assert.match(m[1],/rose/);assert.equal(m[2],'⚠ Não consegui gerar o Excel: planilha quebrou');
 XRS.dados=(wb,nome,o)=>{DADOS.push({wb,nome,o})};
 const ctxOk=T0({L:DB(),PG:PGS()});assert.equal(typeof ctxOk.lanc.xl,'function')});

test('Exportar: teórica exata (sem resíduo de ponto flutuante) e percentuais na regra da tela',async()=>{
 const L=[compra('a','A','x','Previsão','','2026-11-01','',1.1,1.06),compra('b','B','x','Previsão','','2026-11-02','',3.7,3.5),compra('c','C','x','Previsão','','2026-11-03','',587507.15,538597.18),compra('d','D','x','Previsão','','2026-11-04','',206.8,200)],T=T0({L,PG:[pag('pd','d','2026-11-05',0.03)]}),o=(await exporta(T)).o;
 const col=k=>o.cols.findIndex(c=>c.h==k),ET=col('ECONOMIA REIDI TEÓRICA'),PR=col('% ECONOMIA REAL (SOBRE O ORIGINAL)');
 eq(o.rows.map((r,i)=>o.cols[ET].g(r,i)),[0.036135,0.121545,48909.9702375,6.79338],'valor exato');
 assert.equal(o.cols[col('% PAGO DO NEGOCIADO')].g(o.rows[3],3),0.0002,'0,015% (3 centavos de R$ 200,00; em ponto flutuante 1,4999…) aparece como 0,02%, igual à tela');
 assert.equal(o.cols[PR].g(o.rows[2],2),0.0832,'8,3249999596% aparece como 8,32% na tela e no Excel (nada de 8,33% por arredondar duas vezes)')});
