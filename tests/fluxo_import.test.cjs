/* Pedido AT · Programação Financeira Quadrimestral: a importação lê SÓ as abas de base (“Prog. Financeira (Protheus)” e “Prog. Fin. (Outras Fontes)”).
   Saldo inicial (Investimento e Contamax) de cada mês (pedido AV), entradas, aportes, Informe Nº e período publicado ficam como estão no site a cada nova importação; “Limpar base” (AV) recomeça do zero.
   A planilha abaixo é SINTÉTICA (valores fictícios; planilhas com valores reais não ficam no repositório) e imita a estrutura da Fluxo_de_Caixa_Quadrimestral.xlsm:
   as duas abas de base com o cabeçalho na linha 4 e as abas “Fluxo de Caixa - Mensal / Quadrimestral” com saldo inicial, Período, Informe Nº e ENTRADAS — aqui com valores DIFERENTES dos lançados no site,
   para provar que a importação não os lê mais. O resultado do cálculo é conferido contra uma soma feita à parte, em centavos inteiros. */
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),SRC=process.env.FLUXO_SRC||path.join(root,'js/modulos/fluxo_caixa.js');
const N=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const dup=o=>JSON.parse(JSON.stringify(o)),pad=n=>String(n).padStart(2,'0');
const CATS=['Folha e Benefícios','Seguros','Materiais/Peças/Ferramentas','Serviços de Terceiros','Impostos/Tributos e Taxas','Contas de Consumo'];

/* ---------- planilha sintética ---------- */
const HP=['FORNECEDOR','LOJA','RAZÃO SOCIAL','BANCO','TÍTULO','PARCELA','TP','FILIAL','DATA DE EMISSÃO','VENCIMENTO REAL','VALOR ORIGINAL','TÍTULOS A VENCER\nVALOR NOMINAL','Primeiro Aprovador','APROVADOR FINAL','DATA LIBERAÇÃO','Incluido por','REB  (S/N)?','HISTÓRICO','Natureza','Desc Natureza','Porta- dor','C. de Custo','CATEGORIA'];
const HO=['FORNECEDOR','SETOR RESPONSÁVEL','COLABORADOR RESPONSÁVEL','PERIODO DE MEDIÇÃO','EMISSÃO DA NF','VENCIMENTO','DATA PREVISTA DE PAGAMENTO','VALOR','STATUS','CATEGORIA'];
const dt=s=>new Date(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10)));
const mes=(a,n)=>Array.from({length:n},(_,i)=>{const t=(+a.slice(5)-1)+i,y=+a.slice(0,4)+Math.floor(t/12);return y+'-'+pad(t%12+1)});
const eom=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0)).getUTCDate();
/* lançamentos do Protheus: [fornecedor, título, tp, data, valor, categoria, histórico] — 6 por mês, valores com centavos */
function mkP(ms,k0=0){const o=[];ms.forEach((m,mi)=>[2,9,16,23,28,30].forEach((d,i)=>{const dia=Math.min(d,eom(m)),c=CATS[(i+mi+k0)%CATS.length];o.push(['FORN '+mi+'-'+i,'T'+mi+i,i%2?'NF':'PA',m+'-'+pad(dia),Math.round((1000+137.31*(i+1)*(mi+1)+k0)*100)/100,c,'hist '+mi+'/'+i])}));return o}
/* Outras Fontes: [fornecedor, setor, colaborador, data prevista, valor, categoria, status] — 5 por mês */
function mkO(ms,k0=0){const o=[];ms.forEach((m,mi)=>[1,8,15,22,29].forEach((d,i)=>{const dia=Math.min(d,eom(m)),c=CATS[(i*2+mi+k0)%CATS.length];o.push(['OF '+mi+'-'+i,'SETOR '+i,'COLAB '+i,m+'-'+pad(dia),Math.round((50000+9876.54*(i+1)+333.33*mi+k0)*100)/100,c,i==3?'PREVISTO':''])}));return o}
const rowP=(r,x)=>{const a=Array(23).fill('');a[0]=String(100+x);a[1]='01';a[2]=r[0];a[4]=r[1];a[6]=r[2];a[7]='01';a[9]=dt(r[3]);a[10]=r[4];a[11]=r[4];a[17]=r[6];a[22]=r[5];return a};
const rowO=r=>{const a=Array(10).fill('');a[0]=r[0];a[1]=r[1];a[2]=r[2];a[6]=dt(r[3]);a[7]=r[4];a[8]=r[6];a[9]=r[5];return a};
/* P/O: listas acima (+ linhas que a importação ignora: sem data, valor zero, categoria de fora das 15). fluxo: abas Mensal/Quadrimestral com parâmetros que NÃO podem valer */
function wbk({P,O,fluxo=true,periodo='01/11/2026 a 30/11/2026',baseFluxo='2026-11'}){
 const ap=[['','','PROGRAMAÇÃO FINANCEIRA QUADRIMESTRAL'],[],[],HP];P.forEach((r,i)=>ap.push(rowP(r,i)));ap.push(rowP(['SEM DATA','S1','NF','',777,CATS[0],'x'],900));ap[ap.length-1][9]='';ap.push(rowP(['ZERADO','Z1','NF','2026-11-05',0,CATS[0],'x'],901));
 const ao=[['PROGRAMAÇÃO FINANCEIRA QUADRIMESTRAL'],[],[],HO];O.forEach(r=>ao.push(rowO(r)));
 const sheets={'Prog. Financeira (Protheus)':ap,'Prog. Fin. (Outras Fontes)':ao,'Memorial de Calculo':[['x']]};
 if(fluxo){const mz=[[],[],[],[],[],['','Saldo inicial de caixa',1111.11,'','','Período: ',periodo],['','Saldo inicial de aplicações',2222222.22,'','','Informe Nº: ','009/2099'],['','SALDO TOTAL',2223333.33],[],['','CATEGORIA (R$)','Semana 1','Semana 2','Semana 3','Semana 4'],['','(+) ENTRADAS (NF líquida de sinal e retenção)',9e6,9e6,9e6,9e6],['','NECESSIDADE DE APORTE',5e5,5e5,5e5,5e5]];
  const m4=mes(baseFluxo,4),qd=[[],[],[],[],[],['','Saldo inicial de caixa',1111.11],['','Saldo inicial de aplicações',2222222.22],['','SALDO TOTAL',2223333.33],[],['','CATEGORIA (R$)'].concat(m4.map(m=>dt(m+'-01'))),['','(+) ENTRADAS (NF líquida de sinal e retenção)',7e6,7e6,7e6,7e6],['','NECESSIDADE DE APORTE',4e5,4e5,4e5,4e5]];
  sheets['Fluxo de Caixa - Mensal']=mz;sheets['Fluxo de Caixa - Quadrimestral']=qd;sheets['Fluxo de Caixa - Quadrimestral1']=[['oculta']]}
 const wb={SheetNames:Object.keys(sheets),Sheets:{}};wb.SheetNames.forEach(n=>wb.Sheets[n]={'!ref':'A1','__a':sheets[n]});return wb}

/* ---------- carrega o módulo numa VM com o mínimo do site em volta ---------- */
function load({admin=true,pub=null,lerErro=false,gravarErro=false}={}){
 const L={pub:[],ler:0,mo:[],timers:[],uLog:[],dlg:[],xl:[]};let lastRead=Promise.resolve();
 const els={},view={dataset:{},classList:{contains:()=>false,add(){},remove(){}},innerHTML:''};
 const doc={querySelector:s=>s=='[data-view="fluxo"]'?view:null,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener(){},hidden:false,activeElement:null};
 const ctx={window:{},document:doc,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setInterval(){},setTimeout:(fn)=>{L.timers.push(fn)},N,
  PERM:{tem:()=>admin},CRT:{kpi:o=>`<div class="kpi" data-t="${o.t}" data-s="${o.s||''}">${o.v}</div>`,titulo:t=>'<h3>'+t+'</h3>'},f:v=>'R$ '+(+v||0).toFixed(2),br:i=>String(i).split('-').reverse().join('/'),$:()=>null,
  Chart:Object.assign(function(){this.destroy=()=>{}},{defaults:{color:'#000'}}),FXLS:{serial:(y,m)=>y*100+m,exportar:async o=>{L.xl.push(o);return 'xlsx'}},saveAs:async()=>{},uLog:e=>{L.uLog.push(e)},mo:h=>{L.mo.push(h)},closeMd(){},dlg:(t,x,fn)=>{L.dlg.push({t,x,fn})},
  XLSX:{read:r=>r.wb,utils:{decode_range:()=>({s:{c:0,r:0},e:{c:0,r:0}}),encode_range:()=>'A1',sheet_to_json:ws=>ws.__a}},
  FileReader:function(){this.readAsArrayBuffer=f=>{this.result=f;lastRead=Promise.resolve().then(()=>this.onload())}},
  BASE:{ler:async()=>{L.ler++;if(lerErro)throw new Error('sem rede');return pub?{dados:dup(pub),arquivo:'pub.xlsm',atualizado_em:'2026-11-10T10:00:00Z'}:null},
   gravar:async(chave,dados,arq)=>{if(gravarErro)throw new Error('sem rede');L.pub.push({chave,dados:dup(dados),arq});return{atualizado_em:'2026-11-11T10:00:00Z'}},cli:()=>null,fdh:s=>String(s)}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(SRC,'utf8'),ctx);
 const fx=ctx.window.fluxo;
 return{fx,L,els,view,ctx,
  async up(wb,nome='Fluxo.xlsm'){const inp={files:[{name:nome,wb}],value:'x'};fx.up(inp);await lastRead},
  async flush(){for(let i=0;i<5;i++){const t=L.timers.splice(0);t.forEach(fn=>fn());await new Promise(r=>setImmediate(r))}},
  get B(){return fx._.B},set B(v){fx._.B=dup(v)},par(){return dup(fx._.B.par)},text(){return view.innerHTML}}}

/* parâmetros que o admin lançou no site (os que a importação NÃO pode mexer) */
const PAR0=()=>({base:'2026-10',cx:29949.5,ap:57201845.08,inv:57201845.08,cmx:29949.5,ent:{'2026-10':[0,0,0,9424517.33],'2026-11':[1000000.1,2000000.2,3000000.3,2236489.61],'2026-12':[0,0,0,12105210.81],'2027-01':[0,0,0,14526252.97]},apo:{'2026-12':[0,0,0,4663543.25]},ok:true,man:true,inf:'001/2026',per:{de:'2026-10',ate:'2026-12',em:'2026-11-09T10:00:00Z'}});
const PUB0=()=>({v:2,P:mkP(mes('2026-10',4)),O:mkO(mes('2026-10',6)),par:PAR0(),RP:[],RO:[]});
/* PAR0 é o formato ANTIGO (base / inv / cmx); o módulo o converte em saldo lançado POR MÊS (par.sal) e mantém base / inv / cmx só como espelho do 1º saldo lançado (telas abertas antes do pedido AV).
   core() tira o espelho para comparar só o que vale; EXP0 = o que PAR0 vira. */
const core=p=>{const q=dup(p);['base','cx','ap','inv','cmx'].forEach(k=>delete q[k]);return q};
const EXP0=()=>core({...PAR0(),sal:{'2026-10':{inv:57201845.08,cmx:29949.5}}}),semPer=p=>{const q=dup(p);delete q.per;return q};   /* semPer: bases que avançam tiram o período publicado (out–dez) da lista: ele cai, o resto fica */
/* campos do ⚙ Parâmetros: prepara os da tela (entradas e saldo inicial de cada mês) vazios e devolve a lista de meses */
function campos(T){const ML=Array.from(T.fx._.ML);ML.forEach((m,i)=>{[0,1,2,3].forEach(w=>{T.els['fp-e'+i+'-'+w]={value:''}});T.els['fp-si'+i]={value:''};T.els['fp-sc'+i]={value:''}});T.els['fp-inf']={value:'001/2026'};T.els['fp-e']={textContent:'',classList:{remove(){}}};return ML}

/* ---------- soma à parte, em centavos inteiros ---------- */
const cent=v=>Math.round(v*100);
function oracle(P,O){const t={};const add=(s,r)=>{const k=r[3].slice(0,7);t[k]=t[k]||{tot:0,cat:{},P:0,O:0,sem:{}};const c=cent(r[4]);t[k].tot+=c;t[k][s]+=c;t[k].cat[r[5]]=(t[k].cat[r[5]]||0)+c;const w=Math.min(3,Math.floor((+r[3].slice(8)-1)/7));t[k].sem[w]=(t[k].sem[w]||0)+c};P.forEach(r=>add('P',r));O.forEach(r=>add('O',r));return t}

test('parse: lê SÓ as duas bases — saldo, Período, Informe Nº e entradas das abas de fluxo são ignorados; centavos exatos',()=>{
 const P=mkP(mes('2026-11',4)),O=mkO(mes('2026-11',6)),T=load(),x=dup(T.fx.parse(wbk({P,O})));
 assert.equal(x.v,2);assert.equal(x.P.length,P.length);assert.equal(x.O.length,O.length);   /* a linha sem data e a de valor zero ficam de fora */
 assert.deepEqual(x.P.map(r=>[r[3],r[4],r[5]]),P.map(r=>[r[3],r[4],r[5]]));assert.deepEqual(x.O.map(r=>[r[3],r[4],r[5]]),O.map(r=>[r[3],r[4],r[5]]));
 assert.deepEqual(x.par,{base:'2026-11',cx:0,ap:0,inv:0,cmx:0,sal:{},ent:{},apo:{},ok:false,inf:''});   /* nada do que as abas de fluxo trazem (1.111,11 · 2.222.222,22 · Informe 009/2099 · entradas) entra */
 assert.ok(x.RP.every(r=>r.length==23)&&x.RO.every(r=>r.length==10));assert.equal(x.RP.length,P.length+2);   /* as linhas completas das bases (com as ignoradas) seguem para o Excel */
 /* sem as abas de fluxo o resultado é o mesmo; sem uma das bases, erro claro */
 assert.deepEqual(dup(T.fx.parse(wbk({P,O,fluxo:false}))),x);
 const sem=wbk({P,O});sem.SheetNames=sem.SheetNames.filter(n=>!/Outras/.test(n));assert.throws(()=>T.fx.parse(sem),/não encontrei as abas/)});

test('up: bases que AVANÇAM um mês não desfazem o que foi lançado (saldo inicial de cada mês, entradas, aportes, Informe Nº, período) — e as bases são trocadas pelas novas',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();const antes=T.par();
 const P=mkP(mes('2026-11',4)),O=mkO(mes('2026-11',6));await T.up(wbk({P,O}));
 const b=dup(T.fx._.B);
 assert.deepEqual(core(b.par),semPer(core(antes)));assert.deepEqual(core(b.par),semPer(EXP0()));   /* igual ao que estava no site (só o período publicado cai: out/26 não existe mais) */   /* IGUAL ao que estava no site: mesmo com Período 01/11/2026, saldo 1.111,11 e entradas 9.000.000 nas abas de fluxo */
 assert.deepEqual(b.P.map(r=>r[3]),P.map(r=>r[3]));assert.deepEqual(b.O.map(r=>r[3]),O.map(r=>r[3]));   /* as bases são as novas (Nov…Fev e Nov…Abr) */
 assert.deepEqual(b.par.sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.equal(b.par.inf,'001/2026');assert.equal(b.par.per,undefined);assert.match(T.text(),/O período publicado \(out\/26 a dez\/26\) não existe nesta planilha/);
 assert.equal(T.L.pub.length,0);   /* só vira rascunho: nada é publicado sozinho */
 assert.equal(T.L.ler,0)});   /* havia base em tela: não precisa reler a publicada */

test('up: o mesmo arquivo reimportado muitas vezes não muda mais nada nos parâmetros (antes, as entradas eram trocadas pelas da planilha a cada importação)',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();const antes=T.par(),P=mkP(mes('2026-10',4)),O=mkO(mes('2026-10',6));
 for(let i=0;i<3;i++){await T.up(wbk({P,O,periodo:'01/10/2026 a 31/10/2026',baseFluxo:'2026-10'}));assert.deepEqual(T.par(),antes)}});   /* (aqui até o espelho é igual: as bases não mudaram de mês) */

test('up: sem base em tela, usa a PUBLICADA agora (a tela ainda não carregou) — nunca publica parâmetros zerados por cima do que foi lançado',async()=>{
 const T=load({pub:PUB0()});assert.equal(T.fx._.B,null);
 await T.up(wbk({P:mkP(mes('2026-11',4)),O:mkO(mes('2026-11',6))}));
 assert.equal(T.L.ler,1);assert.deepEqual(core(T.par()),semPer(EXP0()));assert.match(T.text(),/o saldo inicial de cada mês, as entradas e os aportes continuam como estão no site/)});

test('up: se não dá para conferir a base publicada, NÃO segue (publicar zerado apagaria o que foi lançado)',async()=>{
 const T=load({pub:PUB0(),lerErro:true});
 await T.up(wbk({P:mkP(mes('2026-11',4)),O:mkO(mes('2026-11',6))}));
 assert.equal(T.fx._.B,null);assert.match(T.text(),/Não foi possível ler a planilha: .*não consegui conferir a base publicada/);assert.equal(T.L.pub.length,0)});

test('up: PRIMEIRA importação (nada publicado): parâmetros zerados, nenhum saldo inicial lançado (aviso no rascunho e no relatório), e a mensagem diz isso',async()=>{
 const T=load({pub:null});await T.up(wbk({P:mkP(mes('2026-11',4)),O:mkO(mes('2026-11',6))}));
 assert.deepEqual(core(T.par()),{sal:{},ent:{},apo:{},ok:false,inf:''});
 assert.match(T.text(),/Primeira importação: o saldo inicial e as entradas começam zerados/);assert.deepEqual(Array.from(T.fx._.ML),mes('2026-11',6));
 assert.deepEqual(Object.keys(T.fx._.OP),[]);   /* sem saldo lançado não há abertura em mês nenhum */
 assert.match(T.text(),/⚠ Sem saldo inicial lançado para nov\/26, dez\/26, jan\/27, fev\/27, mar\/27, abr\/27: informe o Investimento e o Contamax do mês/);   /* na mensagem do rascunho */
 assert.match(T.text(),/Sem <b>saldo inicial<\/b> lançado para nov\/26, dez\/26, jan\/27, fev\/27: o saldo acumulado e o saldo final ficam em branco nesses meses\. Informe/)});   /* e na lista de alertas (período = os 4 primeiros meses) */

test('up: não-admin não importa',async()=>{
 const T=load({admin:false,pub:PUB0()});T.B=PUB0();const inp={files:[{name:'x',wb:wbk({P:mkP(['2026-11']),O:mkO(['2026-11'])})}],value:'x'};T.fx.up(inp);await Promise.resolve();assert.equal(inp.value,'');assert.deepEqual(core(T.par()),EXP0());assert.equal(T.fx._.B.P.length,24)});

test('cálculo: saldo de abertura a partir da data-base (centavos exatos) e entradas de meses anteriores à data-base não entram na lista',()=>{
 const T=load();const B=PUB0();B.par.base='2026-11';B.par.inv=1000000;B.par.cmx=50000.5;B.P=mkP(mes('2026-11',3));B.O=mkO(mes('2026-11',5));T.B=B;   /* as bases já não têm out/26 */
 const o=oracle(B.P,B.O),ML=Array.from(T.fx._.ML);assert.deepEqual(ML,mes('2026-11',5));   /* a entrada lançada para out/26 fica guardada, mas out/26 não entra na lista */
 assert.ok(B.par.ent['2026-10']);
 let ab=cent(1050000.5);const ent=m=>(B.par.ent[m]||[0,0,0,0]).reduce((s,v)=>s+cent(v),0),apo=m=>(B.par.apo[m]||[0,0,0,0]).reduce((s,v)=>s+cent(v),0);
 ML.forEach(m=>{assert.equal(cent(T.fx._.OP[m]),ab,'abertura '+m);ab=ab+ent(m)-((o[m]||{tot:0}).tot)+apo(m)})});

test('cálculo: saídas por mês, categoria, origem e semana batem com a soma à parte, centavo a centavo (inclui categoria fora das 15)',()=>{
 const T=load();const B=PUB0();B.P.push(['FORN X','TX','NF','2026-11-10',1234.56,'Categoria Nova','x']);T.B=B;
 const o=oracle(B.P,B.O),ms=mes('2026-10',6),R=T.fx._.flow(T.fx._.colsPer(ms));
 ms.forEach((m,i)=>{assert.equal(cent(R.sai[i]),o[m].tot,'saídas '+m);Object.keys(o[m].cat).forEach(k=>assert.equal(cent(R.cat[k][i]),o[m].cat[k],m+' '+k));assert.equal(cent(R.TC['Categoria Nova'].t),123456)});
 ms.slice(0,4).forEach(m=>{const W=T.fx._.flow(T.fx._.colsMes(m));[0,1,2,3].forEach(w=>assert.equal(cent(W.sai[w]),(o[m].sem[w]||0),'semana '+(w+1)+' de '+m))});
 assert.equal(cent(R.T.sai),ms.reduce((s,m)=>s+o[m].tot,0))});

test('Parâmetros: salvar guarda o Informe Nº, as entradas e o saldo inicial de cada mês e NÃO apaga o que está em meses fora da lista (antes do 1º mês das bases); o diálogo diz que a importação não altera os valores',async()=>{
 const T=load({pub:PUB0()});const B=PUB0();B.P=mkP(mes('2026-11',3));B.O=mkO(mes('2026-11',5));B.par.sal={'2026-10':{inv:111,cmx:22},'2026-11':{inv:1000,cmx:500}};T.B=B;   /* as bases já não têm out/26: o que foi lançado para out/26 fica fora da lista */
 T.fx.parm();const h=T.L.mo.pop();assert.match(h,/Saldo inicial e entradas por mês/);assert.match(h,/a importação da planilha não altera estes valores/);assert.match(h,/id="fp-inf"[^>]*value="001\/2026"/);
 const ML=campos(T);assert.deepEqual(ML,mes('2026-11',5));
 T.els['fp-inf'].value=' 002/2026 ';T.els['fp-e0-0'].value='1.234,56';T.els['fp-e0-3'].value='10';T.els['fp-e1-2'].value='0,01';
 T.els['fp-si1'].value='2.000,50';   /* dez/26: só o Investimento; o Contamax em branco vale 0 */
 T.els['fp-si3'].value='0';T.els['fp-sc3'].value='7,5';   /* fev/27: zero também é um lançamento */
 await T.fx.parmOk();
 const p=T.par();assert.equal(p.inf,'002/2026');assert.deepEqual(p.ent['2026-11'],[1234.56,0,0,10]);assert.deepEqual(p.ent['2026-12'],[0,0,0.01,0]);
 assert.deepEqual(p.ent['2026-10'],PAR0().ent['2026-10']);assert.deepEqual(p.sal['2026-10'],{inv:111,cmx:22});   /* out/26 está fora da lista: continua como estava */
 assert.equal(p.sal['2026-11'],undefined);   /* nov/26: os dois campos em branco = sem lançamento (volta ao automático) */
 assert.deepEqual(p.sal['2026-12'],{inv:2000.5,cmx:0});assert.deepEqual(p.sal['2027-02'],{inv:0,cmx:7.5});assert.equal(p.sal['2027-01'],undefined);
 assert.equal(T.fx._.OP['2026-11'],undefined);assert.equal(T.fx._.OP['2026-12'],2000.5);assert.equal(T.fx._.OP['2027-02'],7.5);   /* a abertura de cada mês é a lançada */
 assert.equal(T.L.pub.length,1);assert.equal(T.L.pub[0].dados.par.inf,'002/2026');assert.deepEqual(T.L.pub[0].dados.par.sal['2026-12'],{inv:2000.5,cmx:0})});
test('Parâmetros: valor inválido (entrada ou saldo inicial) não salva',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();T.fx.parm();T.L.mo.pop();const ML=campos(T);
 T.els['fp-inf']={value:''};const er=T.els['fp-e'];T.els['fp-e1-1'].value='-5';await T.fx.parmOk();
 assert.match(er.textContent,/Valor inválido em nov\/26/);assert.equal(T.L.pub.length,0);assert.deepEqual(core(T.par()),EXP0());
 T.els['fp-e1-1'].value='';T.els['fp-si2'].value='-1';await T.fx.parmOk();assert.match(er.textContent,/Saldo inicial inválido em dez\/26/);
 T.els['fp-si2'].value='';T.els['fp-sc4'].value='abc';await T.fx.parmOk();assert.match(er.textContent,/Saldo inicial inválido em fev\/27/);
 assert.equal(T.L.pub.length,0);assert.deepEqual(core(T.par()),EXP0())});
test('cartão Saldo inicial: o admin vê Investimento e Contamax DO MÊS do cartão (para lançar); quem só visualiza vê SÓ o cartão com o total (pedidos AU e AV)',()=>{
 const A=load();const B=PUB0();A.B=B;A.fx.show();const ta=A.text();
 assert.doesNotMatch(ta,/fx-base|fluxo\.base|data-base|só o admin edita/);   /* a data-base saiu: o saldo é lançado mês a mês */
 assert.match(ta,/id="fx-sinv"[^>]*value="57\.201\.845,08"[^>]*onchange="fluxo\.sal\('2026-10','inv',this\.value\)"/);assert.match(ta,/id="fx-scmx"[^>]*value="29\.949,50"[^>]*onchange="fluxo\.sal\('2026-10','cmx',this\.value\)"/);assert.match(ta,/>Investimento<input/);assert.match(ta,/>Contamax<input/);
 assert.match(ta,/Investimento \+ Contamax de <b>out\/26<\/b> · lançado/);
 const V=load({admin:false});V.B=B;V.fx.show();const tv=V.text();
 const card=tv.match(/<div class="card py-3 w-full sm:w-fit">[\s\S]*?<\/div><\/div><\/div>/);assert.ok(card,'cartão compacto');
 assert.match(card[0],/<h3>Saldo inicial<\/h3>/);assert.match(card[0],/R\$ 57231794\.58</);   /* o total = Investimento + Contamax, ao centavo (o stub de f() não usa pontos) */
 assert.doesNotMatch(tv,/Investimento|Contamax|fx-base|fx-sinv|fx-scmx|57201845|29949/);assert.doesNotMatch(card[0],/data-base/);   /* (o “Limpar base” / ⬆ são botões que só o admin enxerga: data-perm) */
 assert.equal((tv.match(/<h3>Saldo inicial/g)||[]).length,1);assert.doesNotMatch(card[0],/<input|<select|<label/);assert.equal(card[0].replace(/<[^>]+>/g,''),'Saldo inicialR$ 57231794.58')});   /* o cartão tem SÓ o título e o total: nenhuma legenda */

test('cartão Saldo inicial: o total é o mesmo para o admin e para quem só visualiza (também com outra data-base, sem mostrar Investimento nem Contamax)',()=>{
 const tot=h=>(h.match(/leading-tight">([^<]*)<\/div>/)||[])[1];
 const A=load(),V=load({admin:false}),B=PUB0();A.B=B;V.B=B;A.fx.show();V.fx.show();
 assert.equal(tot(A.text()),'R$ 57231794.58');assert.equal(tot(V.text()),tot(A.text()));
 const sem=PUB0();sem.par.base='2027-03';const W=load({admin:false});W.B=sem;W.fx.show();assert.doesNotMatch(W.text(),/Investimento|Contamax/);assert.ok(tot(W.text()))});

test('cartão Saldo inicial: com um mês filtrado o título leva o mês e o total é o saldo de abertura DESSE mês — para o admin e para quem só visualiza',()=>{
 const tit=h=>(h.match(/<h3>(Saldo inicial[^<]*)<\/h3>/)||[])[1],tot=h=>(h.match(/leading-tight">([^<]*)<\/div>/)||[])[1];
 const A=load(),V=load({admin:false}),B=PUB0();A.B=B;V.B=B;A.fx.show();V.fx.show();
 assert.equal(tit(V.text()),'Saldo inicial');assert.equal(tot(V.text()),'R$ 57231794.58');
 const op=A.fx._.OP;A.fx.fp(1);V.fx.fp(1);
 assert.equal(tit(V.text()),'Saldo inicial · nov/26');assert.equal(tit(A.text()),tit(V.text()));
 assert.equal(tot(V.text()),'R$ '+op['2026-11'].toFixed(2));assert.equal(tot(A.text()),tot(V.text()));assert.notEqual(tot(V.text()),'R$ 57231794.58');
 assert.doesNotMatch(V.text(),/Investimento|Contamax|fx-base/);
 V.fx.fp(1);assert.equal(tit(V.text()),'Saldo inicial')});   /* clicar de novo tira o filtro */

test('up: a lista “sem entradas lançadas” traz só meses da lista (a partir do 1º mês das bases); a entrada guardada de um mês anterior não conta',async()=>{
 const pub=PUB0();const T=load({pub});T.B=pub;
 await T.up(wbk({P:mkP(mes('2026-11',4)),O:mkO(mes('2026-11',6))}));   /* out/26 saiu das bases: a entrada de out/26 continua guardada, mas out/26 não faz parte da lista */
 assert.deepEqual(Array.from(T.fx._.ML),mes('2026-11',6));assert.equal(T.fx._.FM,'2026-11');assert.deepEqual(T.par().ent['2026-10'],PAR0().ent['2026-10']);
 assert.match(T.text(),/Sem entradas lançadas em fev\/27, mar\/27, abr\/27 \(/);assert.doesNotMatch(T.text(),/Sem entradas lançadas em [^(]*out\/26/)});
test('Parâmetros: Informe Nº guarda no máximo 20 caracteres',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();T.fx.parm();T.L.mo.pop();campos(T);T.els['fp-inf'].value='0123456789012345678901234';await T.fx.parmOk();assert.equal(T.par().inf,'01234567890123456789')});
test('botão ⬆ Atualizar base: a dica diz que só as duas abas de base são lidas e que nada do que foi lançado muda',()=>{
 const T=load();T.B=PUB0();T.fx.show();assert.match(T.text(),/title="Lê só as abas Prog\. Financeira \(Protheus\) e Prog\. Fin\. \(Outras Fontes\)[^"]*saldo inicial, entradas e aportes não mudam \(para recomeçar do zero use Limpar base\)/)});

test('cálculo (sem mudança): semana e mês com os limites certos, aporte entra no mês seguinte, saída reduz o saldo',()=>{
 const T=load();const B=PUB0();B.par.base='2026-10';B.par.inv=100;B.par.cmx=50;B.P=[['F','1','NF','2026-10-07',10,'Seguros','h'],['F','2','NF','2026-10-08',20,'Seguros','h'],['F','3','NF','2026-10-21',30,'Seguros','h'],['F','4','NF','2026-10-22',40,'Seguros','h'],['F','5','NF','2026-10-31',50,'Seguros','h']];B.O=[];B.par.ent={'2026-10':[1,2,3,4],'2026-11':[5,0,0,0]};B.par.apo={'2026-10':[0,0,0,7]};T.B=B;
 const W=T.fx._.flow(T.fx._.colsMes('2026-10'));assert.deepEqual(Array.from(W.sai),[10,20,30,90]);assert.deepEqual(Array.from(W.ent),[1,2,3,4]);
 assert.deepEqual(Array.from(W.acc).map(v=>Math.round(v*100)/100),[141,123,96,10]);   /* 150 −10+1 ; −20+2 ; −30+3 ; −90+4 */
 assert.equal(T.fx._.OP['2026-10'],150);assert.equal(T.fx._.OP['2026-11'],150+10-150+7)});

test('parse: data-base da 1ª importação = o MENOR mês entre as duas bases (a ordem das linhas não importa)',()=>{
 const T=load(),P=mkP(mes('2026-11',3)).reverse(),O=mkO(mes('2026-10',4)).reverse();   /* Outras Fontes começa em out/26, Protheus em nov/26; linhas em ordem invertida */
 assert.equal(T.fx.parse(wbk({P,O})).par.base,'2026-10');
 assert.equal(T.fx.parse(wbk({P:mkP(mes('2026-09',2)),O:mkO(mes('2026-11',2))})).par.base,'2026-09')});

test('rascunho: o período escolhido no rascunho continua valendo ao importar de novo e cai quando as bases novas deixam de ter esses meses',async()=>{
 const O4=()=>wbk({P:mkP(mes('2026-10',4)),O:mkO(mes('2026-10',6))});
 const T=load({pub:PUB0()});T.B=PUB0();await T.up(O4());   /* rascunho com as bases de out/26 */
 T.fx.per('de','2026-11');T.fx.per('ate','2027-01');T.fx.pubper();assert.equal(T.L.dlg.length,1);await T.L.dlg[0].fn();   /* escolhe nov–jan (o publicado era out–dez) e inclui no rascunho */
 assert.match(T.text(),/Período nov\/26 a jan\/27 incluído no rascunho/);assert.match(T.text(),/id="fx-pubrasc"/);assert.deepEqual([T.par().per.de,T.par().per.ate],['2026-11','2027-01']);
 await T.up(O4());   /* importar outra vez: o período do rascunho segue */
 assert.deepEqual([T.par().per.de,T.par().per.ate],['2026-11','2027-01']);assert.match(T.text(),/id="fx-pubrasc"/);
 T.fx.per('de','2026-10');T.fx.per('ate','2027-02');T.fx.pubper();assert.equal(T.L.dlg.length,2);await T.L.dlg[1].fn();assert.match(T.text(),/id="fx-pubrasc"/);   /* período out/26 a fev/27 no rascunho */
 await T.up(wbk({P:mkP(mes('2026-11',4)),O:mkO(mes('2026-11',6))}));   /* as bases avançam: out/26 sai da lista, o período cai e o rascunho deixa de dizer que tem período */
 assert.equal(T.par().per,undefined);assert.doesNotMatch(T.text(),/id="fx-pubrasc"/);assert.match(T.text(),/O período publicado \(out\/26 a fev\/27\) não existe nesta planilha/)});
test('cálculo: meses anteriores à data-base (que ainda têm lançamentos nas bases) não têm saldo; a abertura começa na data-base',()=>{
 const T=load();const B=PUB0();B.par.base='2026-11';B.par.inv=1000;B.par.cmx=500;T.B=B;   /* as bases ainda trazem out/26 */
 assert.ok(T.fx._.ML.includes('2026-10'));assert.equal(T.fx._.OP['2026-10'],undefined);assert.equal(T.fx._.OP['2026-11'],1500);
 const R=T.fx._.flow(T.fx._.colsPer(['2026-10','2026-11']));assert.equal(R.acc[0],null);assert.ok(R.acc[1]!=null)});
test('cálculo: saldo lançado num mês depois do último mês das bases e das entradas também entra na lista (nada do que foi lançado se perde)',()=>{
 const T=load();const B=PUB0();B.P=mkP(mes('2026-11',2));B.O=mkO(mes('2026-11',2));B.par={sal:{'2026-11':{inv:100,cmx:0},'2027-02':{inv:5,cmx:7}},ent:{},apo:{},ok:true};T.B=B;
 assert.deepEqual(Array.from(T.fx._.ML),['2026-11','2026-12','2027-01','2027-02']);assert.equal(T.fx._.OP['2027-02'],12);assert.equal(T.fx._.IV['2027-02'],5)});
test('fluxo.sal: o saldo lançado é guardado em centavos inteiros (arredondado), no cartão do mês',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();T.fx.sal('2026-11','inv','100,126');await T.flush();assert.equal(T.par().sal['2026-11'].inv,100.13);
 T.fx.sal('2026-11','cmx','0,004');await T.flush();assert.deepEqual(T.par().sal['2026-11'],{inv:100.13,cmx:0})});

/* =====================================================================================================================
   Pedido AV · saldo inicial POR MÊS, linha SALDO INICIAL, cartões sem legenda, Excel e “🗑 Limpar base”
   ===================================================================================================================== */
const br=v=>(+v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

test('cálculo: saldo inicial POR MÊS — o mês lançado manda; sem lançamento o mês começa com o saldo final do anterior (centavos exatos); antes do 1º lançamento não há saldo',()=>{
 const T=load();const B=PUB0();B.P=mkP(mes('2026-10',5));B.O=mkO(mes('2026-10',5));
 B.par={sal:{'2026-11':{inv:1000000.1,cmx:50000.25},'2027-01':{inv:900000,cmx:12345.67}},ent:{'2026-11':[100,200,300,400.5],'2026-12':[0,0,0,5000],'2027-01':[1,2,3,4],'2027-02':[10,0,0,0]},apo:{'2026-12':[0,0,0,77.77]},inf:'x',ok:true,man:true};T.B=B;
 const o=oracle(B.P,B.O),ML=Array.from(T.fx._.ML),OP=T.fx._.OP,IV=T.fx._.IV;assert.deepEqual(ML,mes('2026-10',5));
 const ent=m=>(B.par.ent[m]||[0,0,0,0]).reduce((s,v)=>s+cent(v),0),apo=m=>(B.par.apo[m]||[0,0,0,0]).reduce((s,v)=>s+cent(v),0),fim=(ab,m)=>ab+ent(m)-o[m].tot+apo(m);
 assert.equal(OP['2026-10'],undefined);assert.equal(IV['2026-10'],undefined);   /* antes do 1º saldo lançado: sem abertura */
 let ab=cent(1050000.35);assert.equal(cent(OP['2026-11']),ab);                                             /* nov/26: lançado (Investimento + Contamax) */
 ab=fim(ab,'2026-11');assert.equal(cent(OP['2026-12']),ab);                                                /* dez/26: sem lançamento = saldo final de nov/26 */
 const fimDez=fim(ab,'2026-12');assert.notEqual(fimDez,cent(912345.67));assert.equal(cent(OP['2027-01']),cent(912345.67));   /* jan/27: o lançado manda, mesmo diferente do saldo final de dez/26 */
 ab=fim(cent(912345.67),'2027-01');assert.equal(cent(OP['2027-02']),ab);                                   /* fev/27: segue do lançado */
 assert.deepEqual(['2026-11','2026-12','2027-01','2027-02'].map(m=>IV[m]),[1000000.1,1000000.1,900000,900000]);   /* Investimento vigente: o último lançado, até o próximo lançamento */
 /* saldo final de cada mês = abertura + entradas − saídas (+ aporte no mês seguinte) e a linha SALDO INICIAL traz a abertura */
 const R=T.fx._.flow(T.fx._.colsPer(ML));ML.forEach((m,i)=>{if(OP[m]==null){assert.equal(R.acc[i],null);assert.equal(R.ini[i],null);return}assert.equal(cent(R.ini[i]),cent(OP[m]),'inicial '+m);assert.equal(cent(R.acc[i]),cent(OP[m])+ent(m)-o[m].tot,'final '+m)});
 assert.equal(R.T.op,null);assert.equal(cent(T.fx._.flow(T.fx._.colsPer(ML.slice(1))).T.op),cent(OP['2026-11']))});   /* o total da linha SALDO INICIAL = a abertura do 1º mês mostrado */

test('cartão Saldo inicial (admin): lançar o saldo de um mês muda o saldo final dele e dos seguintes — não dos anteriores; grava uma vez; só admin; só mês da lista; inválido não grava',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();const ms=mes('2026-10',6),acc=()=>Array.from(T.fx._.flow(T.fx._.colsPer(ms)).acc).map(cent);
 const ac0=acc(),op0=T.fx._.OP['2026-12'],iv0=T.fx._.IV['2026-12'];assert.equal(T.par().sal['2026-12'],undefined);
 T.fx.sal('2026-12','inv','1.000.000,00');await T.flush();
 const p=T.par();assert.deepEqual(p.sal['2026-12'],{inv:1000000,cmx:Math.round((op0-iv0)*100)/100});   /* o outro campo começa na divisão calculada (a sugestão em cinza) */
 const d=cent(T.fx._.OP['2026-12'])-cent(op0),ac1=acc();assert.ok(d!=0);
 ms.forEach((m,i)=>assert.equal(ac1[i]-ac0[i],i<2?0:d,'saldo final de '+m));   /* out e nov iguais; de dez em diante mudam do mesmo valor */
 assert.equal(T.L.pub.length,1);assert.deepEqual(T.L.pub[0].dados.par.sal['2026-12'],p.sal['2026-12']);
 T.fx.sal('2026-12','inv','');await T.flush();assert.deepEqual(T.par().sal['2026-12'],{inv:0,cmx:p.sal['2026-12'].cmx});   /* apagar um campo = 0 no mês lançado */
 T.fx.sal('2026-12','cmx','');await T.flush();assert.equal(T.par().sal['2026-12'],undefined);assert.deepEqual(acc(),ac0);   /* apagar os dois = volta ao automático, ao centavo */
 const antes=dup(T.par());T.L.pub.length=0;
 ['abc','-5'].forEach(v=>T.fx.sal('2026-11','inv',v));await T.flush();assert.match(T.text(),/Saldo inválido/);
 T.fx.sal('2027-12','inv','5');T.fx.sal('2026-09','inv','5');T.fx.sal('2026-11','xx','5');T.fx.sal(null,'inv','5');await T.flush();
 assert.deepEqual(T.par(),antes);assert.equal(T.L.pub.length,0);   /* inválido, fora da lista ou campo desconhecido: nada */
 const V=load({admin:false,pub:PUB0()});V.B=PUB0();V.fx.sal('2026-12','inv','5');await V.flush();assert.equal(V.par().sal['2026-12'],undefined);assert.equal(V.L.pub.length,0)});

test('cartão Saldo inicial (admin): em rascunho o lançamento fica no rascunho (nada é publicado sozinho)',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();await T.up(wbk({P:mkP(mes('2026-10',4)),O:mkO(mes('2026-10',6))}));
 T.fx.sal('2026-11','cmx','10,00');await T.flush();assert.equal(T.par().sal['2026-11'].cmx,10);assert.equal(T.L.pub.length,0);assert.match(T.text(),/Rascunho atualizado/)});

test('cartão Saldo inicial: o cartão e as caixas são do mês da coluna filtrada (ou do 1º mês do período); sem lançamento mostra a divisão calculada como sugestão',()=>{
 const A=load();A.B=PUB0();A.fx.show();A.fx.fp(1);const h=A.text();   /* filtra nov/26 */
 assert.match(h,/<h3>Saldo inicial · nov\/26<\/h3>/);assert.match(h,/Investimento \+ Contamax de <b>nov\/26<\/b> · automático \(saldo final do mês anterior\)/);
 const op=A.fx._.OP['2026-11'],iv=A.fx._.IV['2026-11'];
 assert.match(h,new RegExp('id="fx-sinv"[^>]*value=""[^>]*placeholder="'+br(iv).replace(/\./g,'\\.')+'"'));assert.match(h,new RegExp('id="fx-scmx"[^>]*value=""[^>]*placeholder="'+br(Math.round((op-iv)*100)/100).replace(/\./g,'\\.')+'"'));
 assert.match(h,/onchange="fluxo\.sal\('2026-11','inv',this\.value\)"/);
 /* sem nenhum saldo lançado: o cartão diz isso */
 const S0=load();const B=PUB0();B.par.sal={};B.par.inv=0;B.par.cmx=0;S0.B=B;S0.fx.show();assert.match(S0.text(),/Investimento \+ Contamax de <b>out\/26<\/b> · sem saldo lançado/);assert.match(S0.text(),/leading-tight">—<\/div>/)});

test('Parâmetros: a tabela de saldo inicial mostra o lançado, o automático e a sugestão; o saldo usado de cada mês',()=>{
 const T=load();T.B=PUB0();T.fx.parm();const h=T.L.mo.pop();
 assert.match(h,/Saldo inicial de cada mês/);assert.match(h,/Saldo inicial usado/);
 assert.match(h,/id="fp-si0"[^>]*value="57\.201\.845,08"/);assert.match(h,/id="fp-sc0"[^>]*value="29\.949,50"/);   /* out/26: lançado */
 const iv=T.fx._.IV['2026-11'],op=T.fx._.OP['2026-11'];
 assert.match(h,new RegExp('id="fp-si1"[^>]*value=""[^>]*placeholder="'+br(iv).replace(/\./g,'\\.')+'"'));assert.match(h,new RegExp('id="fp-sc1"[^>]*value=""[^>]*placeholder="'+br(Math.round((op-iv)*100)/100).replace(/\./g,'\\.')+'"'));   /* nov/26: automático, com a sugestão */
 assert.match(h,new RegExp(br(op).replace(/\./g,'\\.')+'<span[^>]*>automático<'));assert.match(h,/57\.231\.794,58<span[^>]*>lançado</);
 const V=load({admin:false});V.B=PUB0();V.fx.parm();assert.equal(V.L.mo.length,0)});   /* quem só visualiza não abre os Parâmetros */

test('base antiga (par.base / inv / cmx) vira o saldo lançado do mês-base; o espelho base / inv / cmx acompanha o 1º saldo lançado da lista (telas abertas antes do pedido AV)',()=>{
 const T=load();T.B=PUB0();let p=T.par();
 assert.deepEqual(p.sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.deepEqual([p.base,p.inv,p.cmx],['2026-10',57201845.08,29949.5]);
 const B2=PUB0();B2.par.sal={'2026-12':{inv:5,cmx:6},'2026-11':{inv:1,cmx:2}};T.B=B2;p=T.par();assert.deepEqual([p.base,p.inv,p.cmx],['2026-11',1,2]);   /* o 1º da lista, não o último gravado */
 const B3=PUB0();B3.par.sal={};T.B=B3;p=T.par();assert.deepEqual([p.base,p.inv,p.cmx],['2026-10',0,0]);assert.deepEqual(p.sal,{});   /* sem saldo lançado: espelho zerado, data = 1º mês das bases */
 const B4=PUB0();B4.par.inv=0;B4.par.cmx=0;delete B4.par.sal;T.B=B4;assert.deepEqual(T.par().sal,{});   /* base antiga com saldo zero: nada lançado */
 const B5=PUB0();B5.par={base:'2026-10',cx:100,ap:200,ent:{},apo:{},ok:true};T.B=B5;assert.deepEqual(T.par().sal,{'2026-10':{inv:200,cmx:100}});   /* formato mais antigo: aplicações = Investimento, caixa = Contamax */
 const B6=PUB0();B6.par.sal={'2026-08':{inv:9,cmx:9}};T.B=B6;assert.deepEqual([T.par().base,T.par().inv],['2026-10',0]);assert.deepEqual(T.par().sal,{'2026-08':{inv:9,cmx:9}});   /* lançado antes do 1º mês das bases: guardado, fora da lista */
 assert.equal(T.fx._.OP['2026-10'],undefined)});

test('alerta: mês sem saldo inicial lançado — o relatório avisa (e o texto muda para quem só visualiza)',()=>{
 const B=PUB0();B.par.sal={'2026-11':{inv:1000,cmx:500}};B.par.inv=0;
 const A=load();A.B=B;A.fx.show();assert.match(A.text(),/Sem <b>saldo inicial<\/b> lançado para out\/26: o saldo acumulado e o saldo final ficam em branco nesse mês\. Informe o Investimento e o Contamax do mês no cartão Saldo inicial ou em ⚙ Parâmetros\./);
 const V=load({admin:false});V.B=B;V.fx.show();assert.match(V.text(),/Sem <b>saldo inicial<\/b> lançado para out\/26: .* Peça ao administrador para informar o saldo inicial\./);
 const C=load();C.B=PUB0();C.fx.show();assert.doesNotMatch(C.text(),/Sem <b>saldo inicial<\/b>/)});   /* com o saldo de out/26 lançado, sem aviso */

test('tabela: a linha SALDO INICIAL vem antes das ENTRADAS e traz a abertura de cada mês e de cada semana; abertura + saldo do período = saldo acumulado',()=>{
 const T=load();const B=PUB0();B.par={sal:{'2026-10':{inv:100,cmx:50}},ent:{'2026-10':[1,2,3,4],'2026-11':[5,0,0,0]},apo:{'2026-10':[0,0,0,7]},ok:true};B.P=[['F','1','NF','2026-10-07',10,'Seguros','h'],['F','2','NF','2026-10-08',20,'Seguros','h'],['F','3','NF','2026-10-21',30,'Seguros','h'],['F','4','NF','2026-10-22',40,'Seguros','h'],['F','5','NF','2026-10-31',50,'Seguros','h']];B.O=[];T.B=B;
 const W=T.fx._.flow(T.fx._.colsMes('2026-10'));assert.deepEqual(Array.from(W.ini),[150,141,123,96]);assert.equal(W.T.op,150);   /* semana 1 = abertura do mês; as demais = saldo acumulado da semana anterior (+ aporte que entra no mês seguinte, não nas semanas) */
 W.acc.forEach((a,i)=>assert.equal(cent(W.ini[i]+W.sal[i]),cent(a)));
 const R=T.fx._.flow(T.fx._.colsPer(['2026-10','2026-11']));assert.equal(R.ini[0],150);assert.equal(R.ini[1],T.fx._.OP['2026-11']);assert.equal(R.T.op,150);
 T.fx.show();const h=T.text();assert.ok(h.indexOf('>SALDO INICIAL<')>0&&h.indexOf('>SALDO INICIAL<')<h.indexOf('(+) ENTRADAS'));
 const ult=h2=>{const m=h2.match(/>SALDO INICIAL<\/td>((?:<td[^>]*>[^<]*<\/td>)+)/);const c=m[1].match(/<td[^>]*>([^<]*)<\/td>/g).map(x=>x.replace(/<[^>]+>/g,''));return c};
 const cq=ult(h);assert.equal(cq[cq.length-1],'150,00');assert.equal(cq[0],'150,00');assert.notEqual(cq[1],'150,00');   /* total da linha = a abertura do 1º mês do período (não o saldo final) */
 T.fx.t('m');const hm=T.text();assert.match(hm,/>SALDO INICIAL<\/td>(<td[^>]*>[^<]*<\/td>){5}/);   /* 4 semanas + o total do mês */
 const cm=ult(hm);assert.equal(cm.length,5);assert.equal(cm[4],'150,00');assert.deepEqual(cm.slice(0,4),['150,00','141,00','123,00','96,00'])});

test('cartões Entradas / Saídas / Saldo do período / Saldo final: sem legenda (nem “% das entradas”, nem “após aporte de…”), também com filtro de categoria e de mês',()=>{
 const T=load();T.B=PUB0();T.fx.show();
 const kp=h=>[...h.matchAll(/<div class="kpi" data-t="([^"]*)" data-s="([^"]*)">/g)].map(x=>[x[1],x[2]]);
 let k=kp(T.text());assert.deepEqual(k.map(x=>x[0]),['Entradas','Saídas','Saldo do período','Saldo final']);assert.ok(k.every(x=>x[1]===''),'sem legenda: '+JSON.stringify(k));
 T.fx.fcat('Seguros');k=kp(T.text());assert.equal(k[1][0],'Saídas · Seguros');assert.ok(k.every(x=>x[1]===''));   /* categoria filtrada: também sem “% das saídas…” nem “considera todas as categorias” */
 T.fx.fp(1);k=kp(T.text());assert.ok(k.length==4&&k.every(x=>x[1]===''));
 assert.doesNotMatch(T.text(),/das entradas|das saídas|após aporte|considera todas/)});

test('Excel: o saldo inicial de caixa (C6) e de aplicações (C7) de cada bloco vem do mês — Investimento vigente em aplicações e o restante em caixa',async()=>{
 const T=load();const B=T.fx.parse(wbk({P:mkP(mes('2026-10',6)),O:mkO(mes('2026-10',6))}));
 B.par={...B.par,sal:{'2026-10':{inv:1000,cmx:500},'2026-12':{inv:2000,cmx:100}},ent:{'2026-10':[1,2,3,4]},apo:{},ok:true,man:true};T.B=B;
 T.fx._.S.de='2026-10';T.fx._.S.ate='2027-03';T.fx._.S.tab='q';await T.fx.xl();
 const x=T.L.xl[0],OP=T.fx._.OP,IV=T.fx._.IV;assert.ok(x&&x.abas.length==3);
 const cx=a=>[a.c6.v,a.c7.v];
 assert.deepEqual(cx(x.abas[0]),[500,1000]);assert.deepEqual(cx(x.abas[1]),[500,1000]);   /* aba mensal (out/26) e 1º quadrimestre: Contamax e Investimento do mês lançado */
 const m2='2027-02';assert.equal(IV[m2],2000);assert.deepEqual(cx(x.abas[2]),[Math.round((OP[m2]-2000)*100)/100,2000]);   /* 2º quadrimestre abre em fev/27: Investimento = o último lançado (dez/26); o resto em caixa */
 assert.equal(cent(OP[m2]),cent(x.abas[2].c6.v)+200000);
 /* sem saldo lançado no mês: zeros (como antes) */
 const B0=T.fx.parse(wbk({P:mkP(mes('2026-10',2)),O:mkO(mes('2026-10',2))}));T.B=B0;T.L.xl.length=0;T.fx._.S.de='2026-10';T.fx._.S.ate='2026-11';await T.fx.xl();assert.deepEqual(cx(T.L.xl[0].abas[0]),[0,0])});

test('🗑 Limpar base (AW): apaga só as bases — o saldo inicial de cada mês (real de banco), as entradas, os aportes e o Informe Nº FICAM no registro; confirma, grava sem apagar linha e sem SQL novo, a tela volta a “nenhuma base publicada” e o aviso de auditoria fica; só admin',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();T.fx.show();assert.match(T.text(),/onclick="fluxo\.limpar\(\)"/);assert.match(T.text(),/data-perm="fluxo\.publicar"[^>]*title="Apaga a base importada \(Protheus e Outras Fontes\)[^"]*Os parâmetros \(saldo inicial de cada mês, entradas, aportes e Informe Nº\) são mantidos"/);
 const par0=T.par();assert.deepEqual(par0.sal['2026-10'],{inv:57201845.08,cmx:29949.5});
 T.fx.limpar();assert.equal(T.L.dlg.length,1);const d=T.L.dlg[0];assert.match(d.t,/Limpar a base para reimportar\?/);
 assert.match(d.x,/Apaga <b>para todos os usuários<\/b> a base publicada \(lançamentos do Protheus e de Outras Fontes\)\. <b>Os parâmetros são mantidos<\/b>: saldo inicial de cada mês \(Investimento e Contamax\), entradas, necessidade de aporte e Informe Nº\./);assert.match(d.x,/Não dá para desfazer/);assert.doesNotMatch(d.x,/rascunho|tudo o que foi lançado/);
 assert.equal(T.L.pub.length,0);   /* só pergunta: nada muda antes de confirmar */
 await d.fn();
 assert.equal(T.L.pub.length,1);const g=T.L.pub[0];assert.equal(g.chave,'fluxo_projetado');assert.equal(g.arq,'base limpa');
 assert.deepEqual(g.dados,{v:2,limpa:true,P:[],O:[],RP:[],RO:[],par:par0});   /* sem lançamentos, com TODOS os parâmetros como estavam */
 const q=g.dados.par;assert.deepEqual(q.sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.deepEqual(q.ent,PAR0().ent);assert.deepEqual(q.apo,PAR0().apo);assert.equal(q.inf,'001/2026');assert.deepEqual([q.per.de,q.per.ate],['2026-10','2026-12']);
 assert.equal(T.fx._.B,null);assert.deepEqual(Array.from(T.fx._.ML),[]);assert.match(T.text(),/Nenhuma base de fluxo de caixa publicada ainda/);assert.match(T.text(),/✔ Base limpa para todos os usuários: as bases \(Protheus e Outras Fontes\) foram apagadas; o saldo inicial de cada mês, as entradas, os aportes e o Informe Nº foram mantidos/);assert.doesNotMatch(T.text(),/onclick="fluxo\.limpar\(\)"/);
 assert.equal(T.L.uLog.length,1);assert.match(T.L.uLog[0],/limpou a base importada \(Protheus e Outras Fontes\), mantendo o saldo inicial, as entradas e os aportes/);
 const V=load({admin:false,pub:PUB0()});V.B=PUB0();V.fx.limpar();assert.equal(V.L.dlg.length,0);   /* quem só visualiza não limpa */
 const N=load({pub:PUB0()});N.fx.limpar();assert.equal(N.L.dlg.length,0);   /* sem base em tela: nada a limpar */
 const D=load({pub:PUB0()});D.B=PUB0();D.fx.limpar();D.fx._.B=null;await D.L.dlg[0].fn();assert.equal(D.L.pub.length,0);assert.doesNotMatch(D.text(),/NÃO limpou|Limpando a base/)});   /* a base já foi limpa por outra pessoa enquanto o aviso estava aberto: não grava de novo (não apaga os parâmetros guardados) */

test('🗑 Limpar base: com rascunho o aviso diz que ele também cai e o que foi lançado no rascunho (saldo, entradas) fica; se não conseguir gravar, a base continua como estava',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();await T.up(wbk({P:mkP(mes('2026-10',4)),O:mkO(mes('2026-10',6))}));assert.match(T.text(),/id="fx-pend"/);
 T.fx.sal('2026-11','inv','123,45');T.fx.sal('2026-11','cmx','10,01');await T.flush();assert.deepEqual(T.par().sal['2026-11'],{inv:123.45,cmx:10.01});   /* saldo de banco lançado de nov/26 no rascunho */
 T.fx.limpar();assert.match(T.L.dlg[0].x,/O rascunho ainda não publicado também é descartado \(os parâmetros mostrados na tela são mantidos\)/);await T.L.dlg[0].fn();assert.doesNotMatch(T.text(),/id="fx-pend"/);assert.equal(T.fx._.B,null);
 assert.deepEqual(T.L.pub[0].dados.par.sal,{'2026-10':{inv:57201845.08,cmx:29949.5},'2026-11':{inv:123.45,cmx:10.01}});
 const F=load({pub:PUB0(),gravarErro:true});F.B=PUB0();F.fx.limpar();await F.L.dlg[0].fn();assert.ok(F.fx._.B);assert.equal(F.fx._.B.P.length,24);assert.match(F.text(),/⚠ NÃO limpou a base: sem rede/);assert.equal(F.L.uLog.length,0)});

test('🗑 Limpar base: quem abre o relatório vê “nenhuma base” (sem erro de formato); a importação seguinte LÊ os parâmetros da base limpa — os meses com saldo real de banco lançado continuam com ele',async()=>{
 const vazia=(()=>{const T=load({pub:PUB0()});T.B=PUB0();return T})();vazia.fx.limpar();await vazia.L.dlg[0].fn();const cleared=vazia.L.pub[0].dados;
 const V=load({admin:false,pub:cleared});V.fx.show();await V.flush();assert.equal(V.fx._.B,null);assert.match(V.text(),/Nenhuma base de fluxo de caixa publicada ainda/);assert.doesNotMatch(V.text(),/formato antigo/);assert.doesNotMatch(V.text(),/Base publicada em/);
 /* a nova planilha traz os MESMOS meses de antes: o saldo lançado de out/26 volta a valer, junto com as entradas, o aporte e o Informe Nº */
 const T=load({pub:cleared});await T.up(wbk({P:mkP(mes('2026-10',4)),O:mkO(mes('2026-10',6))}));
 assert.equal(T.L.ler,1);const esp=core(cleared.par);assert.deepEqual(core(T.par()),esp);assert.deepEqual(T.par().sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.equal(T.fx._.OP['2026-10'],57231794.58);assert.equal(T.fx._.IV['2026-10'],57201845.08);
 assert.match(T.text(),/Só as duas abas de base foram lidas: o saldo inicial de cada mês, as entradas e os aportes continuam como estão no site/);assert.doesNotMatch(T.text(),/Primeira importação/);assert.doesNotMatch(T.text(),/Sem saldo inicial lançado para out\/26/);
 assert.equal(T.fx._.B.limpa,undefined);   /* e o rascunho já não é “limpa” */
 /* a nova planilha começa em dez/26: o saldo lançado de out/26 fica guardado (fora da lista) e dez/26 em diante avisa que falta saldo */
 const U=load({pub:cleared});await U.up(wbk({P:mkP(mes('2026-12',3)),O:mkO(mes('2026-12',3))}));
 assert.deepEqual(Array.from(U.fx._.ML),mes('2026-12',3));assert.deepEqual(U.par().sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.match(U.text(),/Sem saldo inicial lançado para dez\/26, jan\/27, fev\/27/);assert.equal(U.par().inf,'001/2026');assert.deepEqual(U.par().ent['2027-01'],PAR0().ent['2027-01']);
 await T.fx.pub();await T.flush();assert.equal(T.L.pub.length,1);assert.equal(T.L.pub[0].dados.P.length,24);assert.deepEqual(T.L.pub[0].dados.par.sal,{'2026-10':{inv:57201845.08,cmx:29949.5}});assert.equal(T.L.pub[0].dados.limpa,undefined)});

test('🗑 Limpar base: a importação seguinte lê qualquer parâmetro guardado, mesmo sozinho (só saldo, só entrada, só aporte, só Informe Nº ou só período)',async()=>{
 const zero=()=>({base:'',cx:0,ap:0,inv:0,cmx:0,sal:{},ent:{},apo:{},ok:false,inf:''});
 const casos={sal:p=>{p.sal={'2026-12':{inv:7,cmx:3}}},ent:p=>{p.ent={'2026-12':[1,0,0,0]}},apo:p=>{p.apo={'2026-12':[0,0,0,9]}},inf:p=>{p.inf='007/2026'},per:p=>{p.per={de:'2026-12',ate:'2027-01',em:'2026-11-09T10:00:00Z'}}};
 for(const k of Object.keys(casos)){const par=zero();casos[k](par);const T=load({pub:{v:2,limpa:true,P:[],O:[],RP:[],RO:[],par}});await T.up(wbk({P:mkP(mes('2026-12',3)),O:mkO(mes('2026-12',3))}));
  assert.match(T.text(),/continuam como estão no site/,k);assert.doesNotMatch(T.text(),/Primeira importação/,k);
  if(k=='per')assert.deepEqual([T.par().per.de,T.par().per.ate],['2026-12','2027-01'],k);else assert.deepEqual(T.par()[k],par[k],k)}});
test('🗑 Limpar base: um registro de base limpa SEM nenhum parâmetro (limpa de outra versão ou nunca lançada) é tratado como PRIMEIRA importação, tudo zerado',async()=>{
 const cleared={v:2,limpa:true,P:[],O:[],RP:[],RO:[],par:{base:'',cx:0,ap:0,inv:0,cmx:0,sal:{},ent:{},apo:{},ok:false,inf:''}};
 const T=load({pub:cleared});await T.up(wbk({P:mkP(mes('2026-12',3)),O:mkO(mes('2026-12',3))}));
 assert.equal(T.L.ler,1);assert.deepEqual(core(T.par()),{sal:{},ent:{},apo:{},ok:false,inf:''});assert.match(T.text(),/Primeira importação: o saldo inicial e as entradas começam zerados/);assert.deepEqual(Array.from(T.fx._.ML),mes('2026-12',3));assert.equal(T.fx._.B.limpa,undefined);
 await T.fx.pub();await T.flush();assert.equal(T.L.pub.length,1);assert.equal(T.L.pub[0].dados.P.length,18)});

test('base limpa pelo admin: outra tela já aberta recebe a base vazia pela conferência automática e avisa',async()=>{
 const T=load({pub:PUB0()});T.B=PUB0();T.fx.show();await T.flush();   /* a tela carrega a base publicada */
 assert.ok(T.fx._.B);
 const c=load({pub:{...PUB0(),limpa:true,P:[],O:[],RP:[],RO:[]}});c.B=PUB0();c.fx.show();await c.flush();assert.equal(c.fx._.B,null);assert.match(c.text(),/Nenhuma base de fluxo de caixa publicada ainda/)});
