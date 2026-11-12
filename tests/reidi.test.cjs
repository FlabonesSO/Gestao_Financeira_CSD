const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function load(){
 const view={innerHTML:'',classList:{contains:()=>true,toggle(){}},dataset:{}}, els={},ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},PERM:{tem:()=>true},ROLE:'viewer',f:n=>String(n),p:n=>String(n*100)+'%',br:s=>s,N:s=>String(s||'').toLowerCase(),CRT:{kpi:o=>`<div>${o.t}: ${o.v}</div>`},Chart:function(){this.destroy=()=>{}},BASE:{fdh:s=>s},mo:s=>{els.rap={};els.mdb.innerHTML=s},closeMd(){},setTimeout(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi.js'),'utf8'),ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};
 rdb.L=rdb.anexar([
 {id:'a',f:'Mesmo fornecedor',i:'Pendente',dt:'2026-11-01',vo:110,vn:100},
 {id:'b',f:'Mesmo fornecedor',i:'Parcial',dt:'2026-11-15',vo:220,vn:200},
 {id:'c',f:'Quitado',i:'Quitada',dt:'2026-11-15',vo:330,vn:300},
 {id:'d',f:'Fora',i:'Outra compra',dt:'2026-11-16',vo:440,vn:400}
 ],[{id:'pb',compra_id:'b',data_pagamento:'2026-11-01',valor:50},{id:'pc',compra_id:'c',data_pagamento:'2026-11-01',valor:300}]);
 ctx.window.reidi.montar();return {r:ctx.window.reidi,rdb,view,els};
}
test('01/11/2026 a 15/11/2026 tem 15 dias inclusivos e exclui dia 16',()=>{const {r}=load();r.per('de','2026-11-01');r.per('ate','2026-11-15');const c=r.calc();assert.equal(c.q.hor,15);assert.equal(c.fim,'2026-11-15');assert.deepEqual(Array.from(c.I,x=>x.id),['a','b','c'])});
test('Mesmo dia inicial e final conta 1 dia',()=>{const {r}=load();r.per('de','2026-11-01');r.per('ate','2026-11-01');assert.equal(r.calc().q.hor,1);assert.equal(r.calc().I.length,1)});
test('Sem período e após limpar considera todas as 4 compras',()=>{const {r}=load();assert.equal(r.calc().I.length,4);r.per('de','2026-11-01');r.per('ate','2026-11-15');r.pre('limpar');assert.equal(r.calc().I.length,4)});
test('Próximos 30 dias conta exatamente 30 dias',()=>{const {r}=load();r.pre('30');assert.equal(r.calc().q.hor,30)});
test('Janela da quinzena exclui quitadas e soma somente 250 a pagar em 2 compras',()=>{const {r,els}=load();els.mdb={innerHTML:'',style:{}};r.ap('res','2026-11-15');const h=els.mdb.innerHTML;assert.equal(h.includes('data-f="Quitado"'),false);assert.match(h,/data-k="apagar"[\s\S]*?>250<\/div>/);assert.match(h,/data-k="forn"[\s\S]*?>2<\/div>/)});
test('Projeção de Compras (pedido AH) traz só compras com saldo a pagar > 0, sem alterar registros',()=>{const {r,rdb,els}=load();els['reidi-t']={};els['reidi-n']={};const before=JSON.stringify(rdb.L);r.t('proj');const h=()=>els['reidi-t'].innerHTML;
 assert.match(h(),/TOTAL \(3\)/);assert.equal(h().includes('Quitada'),false);assert.match(h(),/data-total="sd">650</);assert.match(h(),/data-total="pago">50</);assert.equal(els['reidi-n'].textContent,'3 de 4 compras');
 r.per('de','2026-11-01');r.per('ate','2026-11-15');assert.match(h(),/TOTAL \(2\)/);assert.equal(h().includes('Quitada'),false);assert.match(h(),/data-total="sd">250</);assert.equal(JSON.stringify(rdb.L),before)});
test('Projeção de Compras acompanha Projeção REIDI: quitar tira a linha, editar/excluir pagamento ou subir o valor negociado a devolve (centavos exatos)',()=>{
 const {r,rdb,els}=load();els['reidi-t']={};els['reidi-n']={};r.t('proj');const h=()=>els['reidi-t'].innerHTML,pg=[{id:'pb',compra_id:'b',data_pagamento:'2026-11-01',valor:50},{id:'pc',compra_id:'c',data_pagamento:'2026-11-01',valor:300}];
 const recarrega=(L,P)=>{rdb.L=rdb.anexar(L,P);r.montar();r.t('proj')};const base=()=>rdb.L.map(x=>({id:x.id,f:x.f,i:x.i,dt:x.dt,vo:x.vo,vn:x.vn}));
 recarrega(base(),[...pg,{id:'pb2',compra_id:'b',data_pagamento:'2026-11-05',valor:150}]);assert.match(h(),/TOTAL \(2\)/);assert.equal(h().includes('Parcial'),false,'b quitada some');
 recarrega(base(),[...pg,{id:'pb2',compra_id:'b',data_pagamento:'2026-11-05',valor:149.99}]);assert.match(h(),/TOTAL \(3\)/);assert.match(h(),/data-col="sd">0\.01</,'sobrou 1 centavo: continua listada');
 recarrega(base(),[pg[0]]);assert.match(h(),/TOTAL \(4\)/);assert.equal(h().includes('Quitada'),true,'pagamento de c excluído: c volta');assert.match(h(),/data-total="sd">950</);
 const L=base();L.find(x=>x.id==='c').vn=300.5;recarrega(L,pg);assert.match(h(),/TOTAL \(4\)/);assert.match(h(),/data-col="sd">0\.5</,'valor negociado maior: c volta com a diferença');
 const L2=base();L2.find(x=>x.id==='c').vn=300;recarrega(L2,[pg[0],{id:'pc',compra_id:'c',data_pagamento:'2026-11-01',valor:300.01}]);assert.equal(h().includes('Quitada'),false,'paga a maior (sd negativo) não é listada');
});
test('Realizado conta 2 processos distintos, mantém 350 pagos e 35 de economia',()=>{const {r,els}=load();els['reidi-rt']={};els['reidi-rk']={};r.t('real');assert.match(els['reidi-rk'].innerHTML,/Nº de processos Compras: 2/);assert.match(els['reidi-rk'].innerHTML,/Valor pago: 350/);assert.match(els['reidi-rk'].innerHTML,/Economia REIDI: 35/)});
test('Planilha modelo inclusiva de 1 dia não inclui compras do dia seguinte',async()=>{
 const {rdb}=load();rdb.L.push({...rdb.L[0],id:'next',dt:'2026-11-02'});
 const JSZip=require('../js/vendor/jszip.min.js'),ctx={RDB:rdb,JSZip};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_modelo.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_xlsx.js'),'utf8'),ctx);
 await rdb.exportar(async()=>{},{ref:'2026-11-01',hor:1,inclusivo:true,periodo:true});assert.equal(rdb.expInfo.n,1);
});
test('Projeção usa os mesmos valores negociados, pagos e saldos do lançamento, incluindo quitadas',()=>{
 const {r,rdb}=load(),rows=r.calc().L;
 assert.deepEqual(Array.from(rows,x=>[x.vn,x.pago,x.sd]),[[100,0,100],[200,50,150],[300,300,0],[400,0,400]]);
 for(const x of rows){const origin=rdb.L.find(y=>y.id===x.id);assert.equal(x.vn,origin.vn);assert.equal(x.pago,origin.pago);assert.equal(x.sd,origin.sd)}
 assert.equal(rows.reduce((t,x)=>t+x.pago,0),350);assert.equal(rows.reduce((t,x)=>t+x.sd,0),650);
});
test('Projeção reflete um novo pagamento registrado na mesma fonte',()=>{
 const {r,rdb}=load();rdb.L=rdb.anexar(rdb.L,[{id:'pa',compra_id:'a',data_pagamento:'2026-11-02',valor:25}]);r.montar();
 const x=r.calc().L.find(x=>x.id==='a');assert.equal(x.vn,100);assert.equal(x.pago,25);assert.equal(x.sd,75);
});
