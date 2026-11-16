/* Pedido AP · gráfico “Saldo total · real × Projetado Engenharia”: leitura da planilha da Engenharia (FLUXO_CAIXA_TECON) e junção com o saldo real.
   O fixture (tests/fixtures/fluxo_caixa_tecon_r6.json, valores FICTÍCIOS — planilhas com valores reais não ficam no repositório) imita a aba FLUXO 01 como o SheetJS a entrega (data = número de série do Excel):
   J1 “PERIODOS ==>”, datas na linha 1 e “SALDO ACUMULADO DO CONTRATO” na linha 53, de K a AJ (jul/2026 a ago/2028), e a coluna AK (“RETENÇÃO”) repetindo a data de ago/2028.
   Como a planilha real, está no SISTEMA DE DATAS DE 1904 (wb.Workbook.WBProps.date1904 = true): K1 guarda 44742 = 01/07/2026 (pedido AS). */
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),FX=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','fluxo_caixa_tecon_r6.json'),'utf8'));
const N=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
function load(ls={}){const ctx={window:{},document:{querySelector:()=>({style:{},classList:{contains:()=>false},innerHTML:''}),documentElement:{classList:{contains:()=>false}},getElementById:()=>null,addEventListener(){}},localStorage:{getItem:k=>ls[k]==null?null:ls[k],setItem(){},removeItem(){}},setInterval(){},setTimeout(){},N,PERM:{tem:()=>true,admin:false}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);return ctx.window.dash.calc}
const dup=o=>JSON.parse(JSON.stringify(o)),serial=s=>Math.round(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/864e5)+25569,serial94=s=>serial(s)-1462;   /* serial = sistema de 1900 · serial94 = sistema de 1904 (1462 dias a menos) */
const cel=(v,t)=>({t:t||(typeof v=='number'?'n':'s'),v});
/* monta uma aba: cols = [[data, valor], ...] a partir da coluna K; ld/lv = linha da data e do valor */
function aba(cols,{ld=1,lv=53,dt,d94,rot='SALDO ACUMULADO DO CONTRATO',nome='FLUXO 01'}={}){dt=dt||(d94===true||d94===1||d94==='1'||d94==='true'?serial94:serial);const ws={'!ref':'A1:AZ'+(lv+5)};ws['J'+ld]=cel('PERIODOS ==>');ws['B'+lv]=cel(rot);
 const L=i=>{let t='';for(i++;i>0;i=Math.floor((i-1)/26))t=String.fromCharCode(65+(i-1)%26)+t;return t};
 cols.forEach(([d,v],i)=>{if(d!=null)ws[L(10+i)+ld]=cel(typeof d=='string'&&/^\d{4}-/.test(d)&&dt?dt(d):d);if(v!=null)ws[L(10+i)+lv]=typeof v=='object'?v:cel(v)});const wbk={SheetNames:[nome],Sheets:{[nome]:ws}};if(d94!==undefined)wbk.Workbook={WBProps:{date1904:d94}};return wbk}

test('parsePE: lê a planilha — K1 a AK1 (datas) × linha 53 (saldo acumulado do contrato), centavos exatos',()=>{
 const c=load(),x=c.parsePE(dup(FX));
 assert.equal(x.aba,'FLUXO 01');assert.equal(x.ld,1);assert.equal(x.lv,53);assert.equal(x.p.length,27);
 assert.deepEqual([x.p[0].c,x.p[0].d,x.p[0].m,x.p[0].v],['K','2026-07-01','2026-07',100000000]);
 assert.deepEqual([x.p[1].c,x.p[1].d,x.p[1].v],['L','2026-08-01',101234567.89]);
 assert.deepEqual([x.p[25].c,x.p[25].m,x.p[25].v],['AJ','2028-08',130864197.28]);   /* 130864197,280850 → centavo */
 assert.deepEqual([x.p[26].c,x.p[26].m,x.p[26].v],['AK','2028-08',111111111.12]);   /* 111111111,116 → centavo */
 assert.equal(x.p[26].d,x.p[25].d);
 /* cada valor é o da célula arredondado ao centavo — nada de somar ou recalcular */
 x.p.forEach(q=>assert.equal(q.v,Math.round(FX.Sheets['FLUXO 01'][q.c+'53'].v*100)/100,q.c));
 /* as colunas AL..AP (sem data nem valor) ficam de fora */
 assert.ok(!x.p.some(q=>/^A[L-P]$/.test(q.c)))});

const meses=(a,n)=>Array.from({length:n},(_,i)=>{const t=(+a.slice(5)-1)+i,y=+a.slice(0,4)+Math.floor(t/12);return y+'-'+String(t%12+1).padStart(2,'0')});
test('pePts: um ponto por COLUNA (nada é fundido); AK repete a data de AJ (ago/2028) → vai para set/2028; ordem cronológica',()=>{
 const c=load(),x=c.parsePE(dup(FX)),p=c.pePts(x);
 assert.equal(p.length,27);assert.deepEqual(Array.from(p.map(q=>q.m)),meses('2026-07',27));assert.equal(p[26].m,'2028-09');assert.equal(p[25].m,'2028-08');
 assert.deepEqual([p[25].c,p[25].v,p[25].mo],['AJ',130864197.28,'2028-08']);   /* AJ continua com o SEU saldo — antes ele sumia atrás do de AK */
 assert.deepEqual([p[26].c,p[26].v,p[26].mo,p[26].d],['AK',111111111.12,'2028-08','2028-08-14']);   /* mo = mês que a planilha traz; d = data original */
 assert.deepEqual(Array.from(p.slice(0,25).map(q=>q.mo==q.m)),Array(25).fill(true));assert.equal(p[0].v,100000000);
 /* x.p não é alterado (a base publicada guarda o que a planilha trouxe) */
 assert.equal(x.p[26].m,'2028-08');
 assert.deepEqual(Array.from(c.pePts(null)),[]);assert.deepEqual(Array.from(c.pePts({p:[]})),[]);
 const emb=c.pePts({p:[{c:'M',m:'2026-09',d:'2026-09-05',v:3},{c:'L',m:'2026-08',d:'2026-08-05',v:2},{c:'N',m:'2026-09',d:'2026-09-20',v:4}]});
 assert.deepEqual(Array.from(emb.map(q=>[q.c,q.m,q.v])),[['L','2026-08',2],['M','2026-09',3],['N','2026-10',4]])});

test('pePts: base JÁ publicada pela versão anterior (AJ e AK em ago/2028) é consertada na leitura, sem reenviar a planilha; vira o ano; repetição em cadeia; lacuna real é mantida',()=>{
 const c=load(),leg=dup(FX),x=c.parsePE(leg),pub=JSON.parse(JSON.stringify(x));   /* o que está no Supabase: p com AJ e AK iguais em m */
 const p=c.pePts(pub);assert.deepEqual(Array.from(p.slice(-2).map(q=>[q.c,q.m,q.v])),[['AJ','2028-08',130864197.28],['AK','2028-09',111111111.12]]);
 const q=(c_,m,v,d)=>({c:c_,m,d:d||m+'-10',v});
 assert.deepEqual(Array.from(c.pePts({p:[q('K','2026-12',1),q('L','2026-12',2),q('M','2027-02',3)]}).map(r=>r.m)),['2026-12','2027-01','2027-02']);   /* dez repetido → jan do ano seguinte; fev/2027 continua fev (sem lacuna) */
 assert.deepEqual(Array.from(c.pePts({p:[q('K','2026-08',1),q('L','2026-08',2),q('M','2026-09',3),q('N','2026-10',4)]}).map(r=>r.m)),['2026-08','2026-09','2026-10','2026-11']);   /* cadeia: a coluna seguinte também não pode repetir */
 assert.deepEqual(Array.from(c.pePts({p:[q('K','2026-07',1),q('L','2026-09',2)]}).map(r=>r.m)),['2026-07','2026-09']);   /* lacuna que a planilha trouxe de propósito fica como está */
 assert.deepEqual(Array.from(c.pePts({p:[q('K','2026-07',1,'2026-07-01'),q('L','2026-07',2,'2026-07-31')]}).map(r=>r.m)),['2026-07','2026-08']);
 /* mesma data em duas colunas: a ordem das COLUNAS decide (AJ antes de AK), mesmo que a base guarde AK primeiro */
 const rv=c.pePts({p:[{c:'AK',m:'2028-08',d:'2028-08-14',v:2},{c:'AJ',m:'2028-08',d:'2028-08-14',v:1}]});assert.deepEqual(Array.from(rv.map(r=>[r.c,r.m,r.v])),[['AJ','2028-08',1],['AK','2028-09',2]])});

test('parsePE: acha a linha pelo TEXTO, não pelo número (linha inserida pela Engenharia); aceita data como Date, ISO e dd/mm/aaaa',()=>{
 const c=load(),cols=[['2026-07-01',100.005],['2026-08-01',200],['2026-09-01',300.1]];
 let x=c.parsePE(aba(cols,{ld:3,lv:58}));assert.deepEqual([x.ld,x.lv,x.p.length],[3,58,3]);assert.equal(x.p[0].v,100.01);
 x=c.parsePE(aba(cols,{dt:s=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))}));assert.deepEqual(Array.from(x.p.map(q=>q.d)),['2026-07-01','2026-08-01','2026-09-01']);
 x=c.parsePE(aba(cols,{dt:s=>s}));assert.deepEqual(Array.from(x.p.map(q=>q.d)),['2026-07-01','2026-08-01','2026-09-01']);
 x=c.parsePE(aba(cols,{dt:s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}));assert.deepEqual(Array.from(x.p.map(q=>q.d)),['2026-07-01','2026-08-01','2026-09-01']);
 const w=aba(cols);w.SheetNames.unshift('Capa');w.Sheets.Capa={'!ref':'A1:B2',A1:cel('nada aqui')};x=c.parsePE(w);assert.equal(x.aba,'FLUXO 01'); /* outra aba na frente: acha a certa */
 const q=aba(cols,{nome:'Projeção'});q.SheetNames.push('FLUXO 01');q.Sheets['FLUXO 01']={'!ref':'A1:A1'};assert.equal(c.parsePE(q).aba,'Projeção')});

test('parsePE: planilha no sistema de datas de 1904 (a da Engenharia): K1 = 44742 é 01/07/2026, não 01/07/2022; a marca vem em Workbook.WBProps.date1904',()=>{
 const c=load(),x=c.parsePE(dup(FX));
 assert.equal(FX.Sheets['FLUXO 01'].K1.v,44742);assert.equal(FX.Workbook.WBProps.date1904,true);   /* o fixture traz o número CRU, como o SheetJS entrega */
 assert.deepEqual([x.p[0].d,x.p[0].m,x.p[26].d,x.p[26].m],['2026-07-01','2026-07','2028-08-14','2028-08']);assert.equal(x.v,2);assert.equal(x.ep,1904);
 assert.deepEqual(Array.from(c.pePts(x).map(q=>q.m)),meses('2026-07',27));
 /* o MESMO número de série, sem a marca (sistema de 1900), é outra data: 4 anos antes — é isso que a leitura sem a marca fazia */
 const w=dup(FX);delete w.Workbook;const y=c.parsePE(w);assert.deepEqual([y.p[0].d,y.ep],['2022-06-30',1900]);
 /* a marca vale para número de série de data; Date, texto ISO e dd/mm/aaaa já são datas absolutas e não deslocam */
 const cols=[['2026-07-01',1],['2026-08-01',2]];
 assert.deepEqual(Array.from(c.parsePE(aba(cols,{d94:true})).p.map(q=>q.d)),['2026-07-01','2026-08-01']);
 assert.deepEqual(Array.from(c.parsePE(aba(cols,{d94:false})).p.map(q=>q.d)),['2026-07-01','2026-08-01']);
 [['Date',s=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))],['ISO',s=>s],['dd/mm/aaaa',s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4)]].forEach(([n,dt])=>{
  const z=c.parsePE(aba(cols,{dt,d94:true}));assert.deepEqual([n,...z.p.map(q=>q.d)],[n,'2026-07-01','2026-08-01'],n)});
 /* formas da marca: true/1/'1'/'true' ligam; false/0/'0'/'false'/ausente desligam */
 [true,1,'1','true','TRUE'].forEach(v=>assert.equal(c.parsePE(aba(cols,{d94:v})).ep,1904,String(v)));
 [false,0,'0','false',undefined,null].forEach(v=>{const w2=aba(cols,{d94:false});if(v!==undefined)w2.Workbook={WBProps:{date1904:v}};assert.equal(c.parsePE(w2).ep,1900,String(v))});
 assert.equal(c.parsePE(Object.assign(aba(cols),{Workbook:{}})).ep,1900);assert.equal(c.parsePE(Object.assign(aba(cols),{Workbook:{WBProps:{}}})).ep,1900)});

test('parsePE: no sistema de 1904 a busca da linha de datas (sem o rótulo) e a ordem por data também funcionam',()=>{
 const c=load(),cols=[['2026-07-01',100],['2026-08-01',200],['2026-09-01',300]],w=aba(cols,{ld:23,d94:true});delete w.Sheets['FLUXO 01'].J23;
 const x=c.parsePE(w);assert.deepEqual([x.ld,x.ep,x.p[2].d],[23,1904,'2026-09-01']);
 const y=c.parsePE(aba([['2026-09-01',3],['2026-07-01',1],['2026-08-01',2]],{d94:true}));assert.deepEqual(Array.from(y.p.map(q=>q.d)),['2026-07-01','2026-08-01','2026-09-01'])});

test('base publicada por versão anterior (v1: datas 4 anos fora do lugar) NÃO é usada: peData = null; a v2 vale; cache sem versão também é ignorado',()=>{
 const row=['R','2026-07-10','X','X','',100,'','','','123','',''],data={v:2,r:[row],p:{},x:{},c:[{c:'123',n:'P'}],i:[]},pt=[{c:'K',d:'2026-07-01',m:'2026-07',v:7.5}];
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:1,p:pt})}).peData(),null);
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({p:pt})}).peData(),null);
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:2,ep:1904,p:pt})}).peData().rows[0].proj,7.5);
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:3,p:pt})}).peData().rows[0].proj,7.5)});

test('parsePE: só vale a linha “SALDO ACUMULADO DO CONTRATO” — outra linha parecida (saldo acumulado do período) acima dela é ignorada',()=>{
 const c=load(),w=aba([['2026-07-01',100],['2026-08-01',200]]),ws=w.Sheets['FLUXO 01'];
 ws.B40=cel('SALDO ACUMULADO DO PERÍODO');ws.K40=cel(999);ws.L40=cel(888);
 const x=c.parsePE(w);assert.equal(x.lv,53);assert.deepEqual(Array.from(x.p.map(q=>q.v)),[100,200])});

test('parsePE: colunas fora de ordem cronológica saem em ordem de data; data com dia/mês de 2 dígitos dd/mm/aaaa lê o dia primeiro',()=>{
 const c=load(),x=c.parsePE(aba([['2026-09-01',3],['2026-07-01',1],['2026-08-01',2]]));
 assert.deepEqual(Array.from(x.p.map(q=>q.d)),['2026-07-01','2026-08-01','2026-09-01']);assert.deepEqual(Array.from(x.p.map(q=>q.v)),[1,2,3]);assert.deepEqual(Array.from(x.p.map(q=>q.c)),['L','M','K']);
 const y=c.parsePE(aba([['2026-07-31',1],['2026-08-03',2]],{dt:s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4)}));assert.deepEqual(Array.from(y.p.map(q=>q.d)),['2026-07-31','2026-08-03'])});

test('parsePE: datas à frente sem valor ainda não entram; erros claros (sem rótulo, valor sem data, data sem número, nada lido)',()=>{
 const c=load(),cols=[['2026-07-01',1],['2026-08-01',2],['2026-09-01',null],['2026-10-01',null]];
 assert.equal(c.parsePE(aba(cols)).p.length,2);
 assert.throws(()=>c.parsePE(aba(cols,{rot:'OUTRA LINHA'})),/SALDO ACUMULADO DO CONTRATO/);
 assert.throws(()=>c.parsePE(aba([['2026-07-01',1],[null,2]])),/coluna L.*não tem data/);
 assert.throws(()=>c.parsePE(aba([['2026-07-01',1],['2026-08-01',null],['2026-09-01',3]])),/coluna L.*não tem um número/);
 assert.throws(()=>c.parsePE(aba([['2026-07-01',1],['2026-08-01',cel('#REF!','e')]])),/coluna L.*não tem um número/);
 assert.throws(()=>c.parsePE(aba([['2026-07-01',1],['2026-08-01',cel(36,'e')]])),/coluna L.*não tem um número/); /* o SheetJS entrega o erro como t:'e' com o código numérico em v (36 = #REF!): não pode virar saldo */
 assert.throws(()=>c.parsePE(aba([['2026-07-01',1],['2026-08-01',cel(true,'b')]])),/coluna L.*não tem um número/);
 assert.throws(()=>c.parsePE(aba([['2026-07-01',cel('abc')]])),/coluna K.*não tem um número/);
 assert.throws(()=>c.parsePE(aba([])),/não achei períodos/);
 assert.throws(()=>c.parsePE({SheetNames:['x'],Sheets:{x:{'!ref':'A1:B2'}}}),/SALDO ACUMULADO DO CONTRATO/)});

test('peData: real = saldo total (caixa + aplicado) do mês; mês sem movimento herda o anterior; antes e depois da base não há real',()=>{
 const row=(side,name,value,date,acc='123',label='',kind='')=>[side,date,name,name,'',value,'','','',acc,label,kind];
 /* base de jul a set/2026 com out/2026 ainda sem lançamento; a projeção vai de jun/2026 a dez/2026 */
 const data={v:2,r:[row('R','Receita',1000,'2026-07-10'),row('P','Despesa',250.55,'2026-07-20'),row('R','Receita',40,'2026-09-05')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[]};
 const pe={v:2,p:['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'].map((m,i)=>({c:'K',d:m+'-15',m,v:1000*(i+1)+.5}))};
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify(pe)}).peData();
 assert.deepEqual(Array.from(d.rows.map(r=>r.m)),['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']);
 assert.deepEqual(Array.from(d.rows.map(r=>r.proj)),[1000.5,2000.5,3000.5,4000.5,5000.5,6000.5,7000.5]);
 assert.deepEqual(Array.from(d.rows.map(r=>r.real)),[null,749.45,749.45,789.45,null,null,null]); /* jun: antes da base · ago: sem lançamento, herda jul · set: 749,45+40 · depois da base: sem real */
 assert.equal(d.ir,3);assert.equal(d.fim.m,'2026-12');assert.equal(d.fim.proj,7000.5)});

test('peData: sem projeção publicada devolve null; realizado ANTERIOR à projeção aparece inteiro (eixo começa no 1º mês da base, projetado null até a 1ª coluna)',()=>{
 const row=(side,name,value,date,acc='123')=>[side,date,name,name,'',value,'','','',acc,'',''],
  data={v:2,r:[row('R','Receita',10,'2026-03-10'),row('R','Receita',5.25,'2026-04-10')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[]};
 assert.equal(load({csd_dash_v4:JSON.stringify(data)}).peData(),null);
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:2,p:[{c:'K',d:'2026-07-01',m:'2026-07',v:5},{c:'L',d:'2026-08-01',m:'2026-08',v:6}]})}).peData();
 assert.deepEqual(Array.from(d.rows.map(r=>r.m)),['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']);   /* contínuo: mai e jun sem lançamento herdam o saldo de abr */
 assert.deepEqual(Array.from(d.rows.map(r=>r.real)),[10,15.25,null,null,null,null]);   /* depois do último mês da base (abr/2026) não se inventa real */
 assert.deepEqual(Array.from(d.rows.map(r=>r.proj)),[null,null,null,null,5,6]);
 assert.deepEqual([d.ir,d.ip,d.fim.m,d.fim.proj],[1,5,'2026-08',6])});

test('peData: eixo contínuo e real herdado até o último mês da base — base começa ANTES da projeção, termina DENTRO dela; saldo do mês sem lançamento = o do mês anterior',()=>{
 const row=(side,name,value,date,acc='123')=>[side,date,name,name,'',value,'','','',acc,'',''],
  data={v:2,r:[row('R','Receita',1000,'2026-05-10'),row('P','Despesa',100.10,'2026-05-20'),row('R','Receita',50,'2026-08-03')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[]};
 const pe={v:2,p:[{c:'K',d:'2026-07-01',m:'2026-07',v:100},{c:'L',d:'2026-08-01',m:'2026-08',v:200},{c:'M',d:'2026-09-01',m:'2026-09',v:300},{c:'N',d:'2026-10-02',m:'2026-10',v:400}]};
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify(pe)}).peData();
 assert.deepEqual(Array.from(d.rows.map(r=>r.m)),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
 assert.deepEqual(Array.from(d.rows.map(r=>r.real)),[899.9,899.9,899.9,949.9,null,null]);   /* mai: 1000 − 100,10 · jun e jul: sem lançamento, herdam mai · ago: +50 · depois da base: nada */
 assert.deepEqual(Array.from(d.rows.map(r=>r.proj)),[null,null,100,200,300,400]);assert.deepEqual([d.ir,d.ip],[3,5])});

test('peData: a coluna AK da Engenharia (data repetida) é um ponto próprio em set/2028 — AJ e AK aparecem os dois, com os saldos da planilha, 27 meses seguidos',()=>{
 const c=load(),x=c.parsePE(dup(FX));c.setPE(x);
 const row=['R','2026-08-10','X','X','',1000,'','','','123','',''],data={v:2,r:[row],p:{},x:{},c:[{c:'123',n:'P'}],i:[]};
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify(x)}).peData();
 assert.deepEqual(Array.from(d.rows.map(r=>r.m)),meses('2026-07',27));
 assert.equal(d.rows.length,27);assert.deepEqual([d.rows[25].m,d.rows[25].proj,d.rows[26].m,d.rows[26].proj],['2028-08',130864197.28,'2028-09',111111111.12]);
 assert.deepEqual([d.fim.m,d.fim.proj,d.ip,d.ir],['2028-09',111111111.12,26,1]);assert.deepEqual(Array.from(d.rows.slice(0,3).map(r=>r.real)),[null,1000,null])});

test('peData: realizado que passa do fim da projeção estende o eixo (real sem projetado)',()=>{
 const row=(side,name,value,date)=>[side,date,name,name,'',value,'','','','123','',''],
  data={v:2,r:[row('R','Receita',10,'2026-07-10'),row('R','Receita',1,'2026-10-10')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[]};
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:2,p:[{c:'K',d:'2026-07-01',m:'2026-07',v:5},{c:'L',d:'2026-08-01',m:'2026-08',v:6}]})}).peData();
 assert.deepEqual(Array.from(d.rows.map(r=>[r.m,r.proj,r.real])),[['2026-07',5,10],['2026-08',6,10],['2026-09',null,10],['2026-10',null,11]]);assert.deepEqual([d.ir,d.ip,d.fim.m],[3,1,'2026-08'])});

test('parsePE: sem o rótulo “PERIODOS ==>” vale a linha com mais datas acima do saldo (ex.: datas na linha 23); números em reais não viram data; com rótulo, o rótulo manda',()=>{
 const c=load(),cols=[['2026-07-01',100],['2026-08-01',200],['2026-09-01',300]],w=aba(cols,{ld:23});delete w.Sheets['FLUXO 01'].J23;
 let x=c.parsePE(w);assert.deepEqual([x.ld,x.p.length,x.p[2].m],[23,3,'2026-09']);
 /* uma linha de VALORES entre 20000 e 80000 (valem como número de série de data) não pode ser tomada pela linha de datas: a célula não tem formato de data */
 const w2=aba(cols,{ld:23}),ws=w2.Sheets['FLUXO 01'];delete ws.J23;['K','L','M'].forEach((k,i)=>{ws[k+'10']={t:'n',v:30000+i*1000,z:'#,##0.00'};ws[k+'11']={t:'n',v:40000,z:'General'}});
 assert.equal(c.parsePE(w2).ld,23);
 /* cédula de data com formato de data (número de série + z): vale */
 const w3=aba(cols,{ld:23}),s3=w3.Sheets['FLUXO 01'];delete s3.J23;['K','L','M'].forEach(k=>{s3[k+'23'].z='dd/mm/yyyy'});['K','L','M'].forEach((k,i)=>{s3[k+'10']={t:'n',v:30000+i*1000,z:'#,##0.00'}});assert.equal(c.parsePE(w3).ld,23);
 /* com o rótulo na linha 23, essa linha é a das datas mesmo havendo outra linha de datas acima */
 const w4=aba(cols,{ld:23}),s4=w4.Sheets['FLUXO 01'];['K','L','M'].forEach((k,i)=>{s4[k+'1']=cel(serial(['2025-01-01','2025-02-01','2025-03-01'][i]))});assert.equal(c.parsePE(w4).p[0].m,'2026-07');
 /* rótulo “PERIODOS ==>” órfão (linha 1 sem datas) e as datas na linha 23: o rótulo sem datas não vale, a busca acha a linha 23 */
 const w6=aba(cols,{ld:23});delete w6.Sheets['FLUXO 01'].J23;w6.Sheets['FLUXO 01'].J1=cel('PERIODOS ==>');x=c.parsePE(w6);assert.deepEqual([x.ld,x.p.length],[23,3]);
 /* a linha das datas fica ACIMA do saldo: uma linha de datas mensais mais comprida ABAIXO dele não vale */
 const w7=aba(cols,{ld:23}),s7=w7.Sheets['FLUXO 01'];delete s7.J23;['K','L','M','N'].forEach((k,i)=>{s7[k+'60']=cel(serial(['2030-01-01','2030-02-01','2030-03-01','2030-04-01'][i]))});x=c.parsePE(w7);assert.deepEqual([x.ld,x.p.length,x.p[0].m],[23,3,'2026-07']);
 /* linha de datas fora de ordem (passo médio de 1 mês, mas desordenada) não é a linha de datas */
 const w8=aba(cols,{ld:23}),s8=w8.Sheets['FLUXO 01'];delete s8.J23;['K','L','M','N'].forEach((k,i)=>{s8[k+'20']=cel(serial(['2031-07-01','2031-09-01','2031-08-01','2031-10-01'][i]))});x=c.parsePE(w8);assert.deepEqual([x.ld,x.p[0].m],[23,'2026-07']);
 /* uma coluna só (projeção de um único período) com o rótulo na linha 5: o rótulo vale mesmo sem 2 datas */
 x=c.parsePE(aba([['2026-07-01',100]],{ld:5}));assert.deepEqual([x.ld,x.p.length,x.p[0].v],[5,1,100]);
 /* sem o rótulo, nenhuma linha com 2 datas: erro claro de data faltando (e não um gráfico errado) */
 const w5=aba([[null,100],[null,200]]);delete w5.Sheets['FLUXO 01'].J1;assert.throws(()=>c.parsePE(w5),/valor na linha 53 mas não tem data/)});

test('modo restrito (só “Saída · Fornecedores”): o projetado é apagado do navegador e não aparece (quem não tem dash.ver não vê o Dashboard completo)',()=>{
 const rem=[],ls={csd_dash_pe1:JSON.stringify({v:2,p:[{c:'K',d:'2026-07-01',m:'2026-07',v:5}]})},
  ctx={window:{},document:{querySelector:()=>({style:{},classList:{contains:()=>false},innerHTML:''}),documentElement:{classList:{contains:()=>false}},getElementById:()=>null,addEventListener(){}},localStorage:{getItem:k=>ls[k]==null?null:ls[k],setItem(){},removeItem:k=>rem.push(k)},setInterval(){},setTimeout(){},N,PERM:{tem:k=>k=='dash.fornecedores',admin:false}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);ctx.window.dash.pronto();
 assert.equal(ctx.window.dash.calc.peData(),null);assert.ok(rem.includes('csd_dash_pe1'),'cache do projetado não foi apagado: '+rem);assert.ok(rem.includes('csd_dash_v4'))});

test('peData: o projetado vem do cache do navegador mesmo antes da nuvem responder; cache sem períodos é ignorado',()=>{
 const row=['R','2026-07-10','X','X','',100,'','','','123','',''],data={v:2,r:[row],p:{},x:{},c:[{c:'123',n:'P'}],i:[]};
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:2,p:[]})}).peData(),null);
 assert.equal(load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:'{lixo'}).peData(),null);
 const d=load({csd_dash_v4:JSON.stringify(data),csd_dash_pe1:JSON.stringify({v:2,p:[{c:'K',d:'2026-07-01',m:'2026-07',v:7.5}]})}).peData();assert.deepEqual([d.rows.length,d.rows[0].proj,d.rows[0].real,d.ir],[1,7.5,100,0])});
