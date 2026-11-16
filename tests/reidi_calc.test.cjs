/* Pedido AX · calculadora do "Incluir compra" da Projeção REIDI: regime de PIS/COFINS (pedido AZ: Lucro Presumido 3,65% · Lucro Real 9,25%, antes Cumulativo / Não Cumulativo) e valor original ↔ valor negociado.
   Valor negociado = valor original × (1 − alíquota × 90%) · valor original = valor negociado ÷ (1 − alíquota × 90%), em centavos inteiros (meio centavo para cima).
   As tabelas de referência abaixo foram calculadas à parte (Python, Decimal, ROUND_HALF_UP), não pelo código do site. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const unesc=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

function load({admin=true,L=[]}={}){
 const els={},view={innerHTML:'',classList:{contains:()=>true,toggle(){}},dataset:{}},inc=[];
 const El=function(v){this.value=v||'';this.dataset={};this.innerHTML='';this.textContent='';this.disabled=false;this.className='';this.style={};this.classList={add(){},remove(){}};this.focus=()=>{};this.select=()=>{}};
 const ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener(){},activeElement:null},localStorage:{getItem:()=>null,setItem(){}},
  PERM:{tem:()=>true},ROLE:admin?'admin':'lanc',PF:{id:'u1',nome:'Fulano',login:'fulano'},f:n=>String(n),br:s=>s,N:s=>String(s||'').toLowerCase(),uLog(){},closeMd(){},setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},
  mo:h=>{ /* cria um elemento falso para cada id lf-… do formulário, com o value inicial que o HTML traz */
   for(const k of Object.keys(els))if(k.startsWith('lf-'))delete els[k];
   (h.match(/<(input|select|div|p|button)[^>]*\sid="lf-[a-z]+"[^>]*>/g)||[]).forEach(t=>{const id=t.match(/id="(lf-[a-z]+)"/)[1],v=t.match(/\svalue="([^"]*)"/);els[id]=new El(v?unesc(v[1]):'');});
   els.mdb=els.mdb||new El();els.mdb.innerHTML=h;ctx.__html=h}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};rdb.L=rdb.anexar(L,[]);
 rdb.incluir=async x=>{inc.push(x)};rdb.editar=async(id,x)=>{inc.push({id,...x})};
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8'),ctx);
 const lanc=ctx.window.lanc;
 const T={lanc,rdb,els,ctx,inc,
  digita(id,v){els[id].value=v;lanc.cc(id=='lf-vo'?'vo':'vn')},   /* a pessoa digitou no campo */
  regime(k){els['lf-rg'].value=k;lanc.rg()},
  get vo(){return els['lf-vo'].value},get vn(){return els['lf-vn'].value},get hint(){return els['lf-h'].innerHTML},get html(){return ctx.__html}};
 return T;
}
const NC=0.0925,CU=0.0365;

test('RDB: regimes — Lucro Presumido 3,65% = PIS 0,65% + COFINS 3,00% · Lucro Real 9,25% = PIS 1,65% + COFINS 7,60% (nesta ordem: a da alíquota)',()=>{
 const {rdb}=load();assert.deepEqual(Array.from(rdb.REGIMES,r=>r.k),['c','nc']);assert.deepEqual(Array.from(rdb.REGIMES,r=>r.nome),['Lucro Presumido','Lucro Real']);
 const nc=rdb.regime('nc'),c=rdb.regime('c');assert.deepEqual([nc.nome,nc.al,nc.pis,nc.cof],['Lucro Real',0.0925,0.0165,0.076]);assert.deepEqual([c.nome,c.al,c.pis,c.cof],['Lucro Presumido',0.0365,0.0065,0.03]);
 assert.equal(Math.round((nc.pis+nc.cof)*1e6),Math.round(nc.al*1e6));assert.equal(Math.round((c.pis+c.cof)*1e6),Math.round(c.al*1e6));
 assert.equal(nc.uso,'regime não cumulativo (regra geral)');assert.equal(c.uso,'regime cumulativo · vale também para Lucro Arbitrado e para atividades específicas da construção civil');
 assert.ok(!Array.from(rdb.REGIMES).some(r=>/^(Não )?Cumulativo$/.test(r.nome)),'os nomes antigos saíram da lista');
 assert.deepEqual(Array.from(rdb.ALIQ).sort(),[c.al,nc.al]);   /* as mesmas alíquotas que a identificação reversa já usava */
 assert.equal(rdb.regime('x'),null);assert.equal(rdb.regime(''),null);
 assert.equal(rdb.fat(NC),91675);assert.equal(rdb.fat(CU),96715)});

const TAB=[['0.01','0.01','0.01'],['0.05','0.05','0.05'],['1.00','0.92','1.09'],['123.45','113.17','134.66'],['1234.56','1131.78','1346.67'],['99999.99','91674.99','109080.98'],['100000.00','91675.00','109080.99'],['2500000.37','2291875.34','2727025.22'],['1000000000.00','916750000.00','1090809926.37'],['12345678901.23','11317901132.70','13466789093.24'],['0.00','0.00','0.00']];
const TAC=[['0.01','0.01','0.01'],['0.05','0.05','0.05'],['1.00','0.97','1.03'],['123.45','119.39','127.64'],['1234.56','1194.00','1276.49'],['99999.99','96714.99','103396.57'],['100000.00','96715.00','103396.58'],['2500000.37','2417875.36','2584914.82'],['1000000000.00','967150000.00','1033965775.73'],['12345678901.23','11940123349.32','12765009462.06'],['0.00','0.00','0.00']];
test('RDB: valor negociado a partir do original e original a partir do negociado, ao centavo (tabela calculada à parte, inclusive valores de bilhões)',()=>{
 const {rdb}=load();
 for(const [al,tab] of [[NC,TAB],[CU,TAC]])for(const [v,vn,vo] of tab){assert.equal(rdb.vnDe(+v,al),+vn,'negociado de '+v+' @'+al);assert.equal(rdb.voDe(+v,al),+vo,'original de '+v+' @'+al)}});
test('RDB: meio centavo arredonda para cima (20,00 @9,25% = 18,335 → 18,34 · 100,00 @3,65% = 96,715 → 96,72) e o ciclo original → negociado → original erra no máximo 1 centavo',()=>{
 const {rdb}=load();assert.equal(rdb.vnDe(20,NC),18.34);assert.equal(rdb.vnDe(100,CU),96.72);
 let s=7,bad=0;for(let i=0;i<4000;i++){s=(s*1103515245+12345)%2147483648;const c=1+s%900000000,vo=c/100;for(const al of [NC,CU]){const vn=rdb.vnDe(vo,al),b=rdb.voDe(vn,al);if(Math.abs(Math.round(b*100)-c)>1)bad++}}
 assert.equal(bad,0);
 /* resultado já com a conta do site: negociado de 100.000,00 pelo regime = economia teórica da planilha (valor × alíquota × 90%) */
 assert.equal(Math.round((100000-rdb.vnDe(100000,NC))*100),Math.round(rdb.teor(100000,NC)*100));assert.equal(Math.round((100000-rdb.vnDe(100000,CU))*100),Math.round(rdb.teor(100000,CU)*100))});
test('RDB: a identificação reversa devolve a mesma alíquota do regime usado na conta (ida e volta)',()=>{
 const {rdb}=load();for(const al of [NC,CU])for(const vo of [1000,123456.78,2500000.37,99999.99]){const I=rdb.ident(vo,rdb.vnDe(vo,al));assert.equal(I.al,al,vo+' @'+al)}});
test('RDB: valor inválido ou negativo não calcula',()=>{const {rdb}=load();assert.ok(isNaN(rdb.vnDe(NaN,NC)));assert.ok(isNaN(rdb.voDe(-1,NC)));assert.ok(isNaN(rdb.vnDe('abc',CU)));assert.ok(isNaN(rdb.vnDe(-1,NC)));assert.ok(isNaN(rdb.vnDe(-0.01,CU)));assert.ok(isNaN(rdb.voDe(NaN,CU)));assert.equal(rdb.vnDe(0,NC),0);assert.equal(rdb.voDe(0,CU),0)});
/* acima de R$ 10 bi o produto passa de 2^53: em ponto flutuante a meia-casa cai do lado errado (3,65%); BigInt tem de bater com o Decimal (referência em Python) */
test('RDB: valores muito altos continuam exatos ao centavo (sem ponto flutuante)',()=>{const {rdb}=load();for(const [vo,vn] of [[10000000577.93,9671500558.94],[10000001977.93,9671501912.95],[10000003377.93,9671503266.96]])assert.equal(rdb.vnDe(vo,CU),vn,String(vo))});

test('Incluir compra: a lista “Regime de PIS/COFINS” (em branco, Lucro Presumido · 3,65%, Lucro Real · 9,25%) fica antes dos valores e os dois campos chamam a calculadora',()=>{
 const T=load();T.lanc.f();const h=T.html;
 assert.match(h,/<select id="lf-rg"[^>]*onchange="lanc\.rg\(\)"><option value="">Selecione o regime…<\/option><option value="c">Lucro Presumido · 3,65%<\/option><option value="nc">Lucro Real · 9,25%<\/option><\/select>/);
 assert.doesNotMatch(h,/Cumulativo/);   /* “Cumulativo” / “Não Cumulativo” saíram da lista */
 assert.ok(h.indexOf('id="lf-rg"')<h.indexOf('id="lf-vo"')&&h.indexOf('id="lf-vo"')<h.indexOf('id="lf-vn"'));assert.match(h,/id="lf-vo"[^>]*oninput="lanc\.cc\('vo'\)"/);assert.match(h,/id="lf-vn"[^>]*oninput="lanc\.cc\('vn'\)"/);
 assert.match(h,/Regime de PIS\/COFINS/);assert.equal(T.els['lf-rg'].value,'')});

test('Incluir compra: sem regime escolhido nada é calculado (como antes) — e nenhum botão de calcular aparece',()=>{
 const T=load();T.lanc.f();T.digita('lf-vo','100.000,00');assert.equal(T.vn,'');T.digita('lf-vn','95.000,00');assert.equal(T.vo,'100.000,00');
 assert.doesNotMatch(T.hint,/Calcular valor/);assert.match(T.hint,/aplicado = \(1 − valor negociado ÷ valor original\) ÷ 90% = \(1 − 95\.000,00 ÷ 100\.000,00\) ÷ 90% = <b[^>]*>5,56%<\/b>/)});

test('Incluir compra: regime + valor original → calcula o valor negociado; trocar o regime refaz; digitar de novo atualiza',()=>{
 const T=load();T.lanc.f();T.regime('nc');T.digita('lf-vo','100.000,00');assert.equal(T.vn,'91.675,00');assert.equal(T.els['lf-vn'].dataset.auto,'1');
 assert.match(T.hint,/Lucro Real · 9,25%<\/b> = PIS 1,65% \+ COFINS 7,60% · regime não cumulativo \(regra geral\)\./);assert.doesNotMatch(T.hint,/Não Cumulativo|Empresas no Lucro Real/);assert.match(T.hint,/Valor negociado = valor original × 91,675% · valor original = valor negociado ÷ 91,675% \(1 − 9,25% × 90%\)\./);
 assert.match(T.hint,/Alíquota de referência identificada: <b[^>]*>9,25%<\/b>/);assert.doesNotMatch(T.hint,/⚠/);
 assert.match(T.els['lf-pv'].innerHTML,/Economia REIDI real: <b[^>]*>R\$\s8\.325,00<\/b>.*teórica <b>R\$\s8\.325,00<\/b>/s);
 T.regime('c');assert.equal(T.vn,'96.715,00');assert.match(T.hint,/Lucro Presumido · 3,65%<\/b> = PIS 0,65% \+ COFINS 3,00% · regime cumulativo · vale também para Lucro Arbitrado e para atividades específicas da construção civil\./);assert.match(T.hint,/× 96,715%/);assert.doesNotMatch(T.hint,/⚠/);
 T.digita('lf-vo','250.000,50');assert.equal(T.vn,'241.787,98');   /* 250.000,50 × 96,715% = 241.787,98 (…,4858…) */
 T.digita('lf-vo','');assert.equal(T.vn,'');   /* apagou o original: o calculado some junto */
 T.digita('lf-vo','abc');assert.equal(T.vn,'')});

test('Incluir compra: regime + valor negociado → calcula o valor original (o caminho inverso)',()=>{
 const T=load();T.lanc.f();T.regime('c');T.digita('lf-vn','96.715,00');assert.equal(T.vo,'100.000,00');assert.equal(T.els['lf-vo'].dataset.auto,'1');
 T.regime('nc');assert.equal(T.vo,'105.497,68');   /* 96.715,00 ÷ 91,675% */
 T.digita('lf-vn','91.675,00');assert.equal(T.vo,'100.000,00');assert.doesNotMatch(T.hint,/⚠/);
 T.digita('lf-vn','');assert.equal(T.vo,'');
 const U=load();U.lanc.f();U.digita('lf-vn','1.000,00');U.regime('c');assert.equal(U.vo,'1.033,97')});   /* o regime escolhido DEPOIS do valor: também calcula */

test('Incluir compra: valor digitado nunca é sobrescrito — trocar o regime com os dois preenchidos não mexe e avisa se a alíquota identificada difere',()=>{
 const T=load();T.lanc.f();T.regime('nc');T.digita('lf-vo','100.000,00');T.digita('lf-vn','95.000,00');   /* negociou mais barato que o teórico */
 assert.equal(T.vn,'95.000,00');assert.equal(T.els['lf-vn'].dataset.auto,undefined);assert.equal(T.vo,'100.000,00');
 assert.match(T.hint,/⚠ Pelos valores informados a alíquota identificada é 3,65%, diferente do regime escolhido \(9,25%\)\./);
 T.regime('c');assert.equal(T.vn,'95.000,00');assert.doesNotMatch(T.hint,/⚠/);   /* 3,65% = a identificada */
 T.digita('lf-vo','120.000,00');assert.equal(T.vn,'95.000,00');   /* digitar o original também não toca no negociado digitado */
 T.regime('');assert.equal(T.vn,'95.000,00');assert.equal(T.vo,'120.000,00');assert.doesNotMatch(T.hint,/Calcular valor/)});

test('Incluir compra: sem regime, os campos que a calculadora havia preenchido são limpos; os digitados ficam',()=>{
 const T=load();T.lanc.f();T.regime('nc');T.digita('lf-vo','100.000,00');assert.equal(T.vn,'91.675,00');T.regime('');assert.equal(T.vn,'');assert.equal(T.vo,'100.000,00');assert.equal(T.els['lf-vn'].dataset.auto,undefined)});

test('Incluir compra: botões “↻ Calcular valor negociado / original” forçam a conta mesmo com valor digitado; ficam desabilitados sem o valor de origem',()=>{
 const T=load();T.lanc.f();T.regime('nc');assert.match(T.hint,/onclick="lanc\.cv\('vn'\)" disabled/);assert.match(T.hint,/onclick="lanc\.cv\('vo'\)" disabled/);
 T.digita('lf-vo','100.000,00');T.digita('lf-vn','95.000,00');assert.match(T.hint,/onclick="lanc\.cv\('vn'\)" >/);assert.match(T.hint,/onclick="lanc\.cv\('vo'\)" >/);
 T.lanc.cv('vn');assert.equal(T.vn,'91.675,00');assert.equal(T.vo,'100.000,00');assert.doesNotMatch(T.hint,/⚠/);
 T.digita('lf-vn','95.000,00');T.lanc.cv('vo');assert.equal(T.vo,'103.626,94');assert.equal(T.vn,'95.000,00');   /* 95.000,00 ÷ 91,675% */
 const U=load();U.lanc.f();U.lanc.cv('vn');assert.equal(U.vn,'');   /* sem regime e sem valor: nada */
 U.regime('c');U.lanc.cv('vn');assert.equal(U.vn,'');U.lanc.cv('vo');assert.equal(U.vo,'');
 /* os botões usam o regime ESCOLHIDO (Lucro Presumido 3,65%), não sempre o mesmo da lista */
 const W=load();W.lanc.f();W.regime('c');W.digita('lf-vo','100.000,00');W.digita('lf-vn','95.000,00');W.lanc.cv('vn');assert.equal(W.vn,'96.715,00');W.digita('lf-vn','95.000,00');W.lanc.cv('vo');assert.equal(W.vo,'98.226,75');assert.equal(W.vn,'95.000,00');
 /* e com Lucro Real (9,25%): o outro regime da lista também vale — o botão nunca usa sempre o mesmo */
 const W2=load();W2.lanc.f();W2.regime('nc');W2.digita('lf-vo','100.000,00');W2.digita('lf-vn','95.000,00');W2.lanc.cv('vn');assert.equal(W2.vn,'91.675,00');W2.digita('lf-vn','95.000,00');W2.lanc.cv('vo');assert.equal(W2.vo,'103.626,94')});

test('Incluir compra: o valor que os botões “↻ Calcular…” preencheram segue a calculadora (muda com o outro campo e com o regime); digitar nele passa a valer como digitado',()=>{
 const T=load();T.lanc.f();T.regime('nc');T.digita('lf-vo','100.000,00');T.digita('lf-vn','95.000,00');T.lanc.cv('vn');assert.equal(T.vn,'91.675,00');
 T.digita('lf-vo','200.000,00');assert.equal(T.vn,'183.350,00');   /* o negociado calculado pelo botão acompanha o original */
 T.regime('c');assert.equal(T.vn,'193.430,00');   /* e o regime */
 T.digita('lf-vn','190.000,00');T.digita('lf-vo','300.000,00');assert.equal(T.vn,'190.000,00')});   /* digitou no negociado: nunca mais é sobrescrito */
test('Editar compra: os valores gravados aparecem como estão, o regime começa em branco e escolher o regime NÃO muda os valores gravados',()=>{
 const T=load({L:[{id:'a',f:'FORN',i:'Item',cat:'Previsão',ped:'',dt:'2026-11-20',vo:100000,vn:95000,rp:'Fulano',cp:'u1',ba:'2026-11-01',st:'A pagar'}]});
 T.lanc.f('a');assert.equal(T.vo,'100.000,00');assert.equal(T.vn,'95.000,00');assert.equal(T.els['lf-rg'].value,'');
 T.regime('nc');assert.equal(T.vo,'100.000,00');assert.equal(T.vn,'95.000,00');assert.match(T.hint,/⚠ Pelos valores informados a alíquota identificada é 3,65%/);
 T.lanc.cv('vn');assert.equal(T.vn,'91.675,00');   /* só quando a pessoa pede */
 /* apagar o negociado e digitar de novo o original recalcula */
 T.digita('lf-vn','');T.digita('lf-vo','200.000,00');assert.equal(T.vn,'183.350,00')});

test('Salvar: com o regime a compra é gravada com os dois valores em reais ao centavo; o regime não é gravado e a alíquota de referência vem dos valores',async()=>{
 const T=load();T.lanc.f();T.els['lf-f'].value='FORNECEDOR X';T.els['lf-d'].value='2026-11-30';T.els['lf-b'].value='2026-11-12';T.els['lf-r'].value='Ana Paula';
 T.regime('nc');T.digita('lf-vo','1.234.567,89');assert.equal(T.vn,'1.131.790,11');   /* 1.234.567,89 × 91,675% */
 T.els['lf-ok']=T.els['lf-ok']||new (T.els['lf-vo'].constructor)();await T.lanc.sv();
 assert.equal(T.inc.length,1);const x=T.inc[0];assert.deepEqual([x.f,x.vo,x.vn,x.pc],['FORNECEDOR X',1234567.89,1131790.11,NC]);assert.equal(Object.keys(x).includes('regime'),false);
 const para=T.rdb.para(x);assert.deepEqual([para.valor_original,para.valor_negociado,para.pc],[1234567.89,1131790.11,NC]);assert.equal(Object.keys(para).some(k=>/regime/i.test(k)),false);
 /* o caminho inverso grava o original calculado */
 const U=load();U.lanc.f();U.els['lf-f'].value='Y';U.els['lf-d'].value='2026-11-30';U.els['lf-b'].value='2026-11-12';U.els['lf-r'].value='Ana Paula';U.regime('c');U.digita('lf-vn','96.715,00');U.els['lf-ok']=new (U.els['lf-vo'].constructor)();await U.lanc.sv();
 assert.deepEqual([U.inc[0].vo,U.inc[0].vn,U.inc[0].pc],[100000,96715,CU]);
 /* regime escolhido ≠ alíquota identificada pelos valores digitados: grava a IDENTIFICADA (o regime só alimenta a calculadora) */
 const V=load();V.lanc.f();V.els['lf-f'].value='Z';V.els['lf-d'].value='2026-11-30';V.els['lf-b'].value='2026-11-12';V.els['lf-r'].value='Ana Paula';V.regime('nc');V.digita('lf-vo','100.000,00');V.digita('lf-vn','95.000,00');V.els['lf-ok']=new (V.els['lf-vo'].constructor)();await V.lanc.sv();
 assert.deepEqual([V.inc[0].vo,V.inc[0].vn,V.inc[0].pc],[100000,95000,CU])});

test('Formulário: abrir outra compra reinicia a calculadora (nada do que foi digitado antes vaza para o novo formulário)',()=>{
 const T=load();T.lanc.f();T.regime('nc');T.digita('lf-vn','50.000,00');assert.equal(T.vo,'54.540,50');
 T.lanc.f();assert.equal(T.els['lf-rg'].value,'');assert.equal(T.vo,'');assert.equal(T.vn,'');T.digita('lf-vo','100,00');assert.equal(T.vn,'')});
