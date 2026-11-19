const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
function load(){const ctx={window:{},document:{querySelector:()=>({classList:{contains:()=>false}}),addEventListener(){}},localStorage:{getItem:()=>null},setInterval(){},N:v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),PERM:{tem:()=>true}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);return ctx.window.dash.calc}
test('Saldo Disponível soma Saldo em Caixa e Aplicado',()=>{const c=load();assert.equal(c.disponivel({sfd:1200.10,ivn:800.20}),2000.30)});
test('Entradas horizontais incluem somente TECON SALVADOR S/A',()=>{const c=load();assert.equal(c.tecon(['','','TECON SALVADOR S/A']),true);assert.equal(c.tecon(['','','tecon salvador s/a']),true);assert.equal(c.tecon(['','','OUTRA EMPRESA']),false);assert.equal(c.tecon(['','','TECON SALVADOR S/A FILIAL']),false)});
test('Categoria Tipo ordena mês por magnitude maior e menor, incluindo zero',()=>{const c=load(),o={A:{t:200,m:{'2026-01':10}},B:{t:300,m:{'2026-01':90}},C:{t:400,m:{}}};assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'2026-01',d:1})),['B','A','C']);assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'2026-01',d:-1})),['C','A','B'])});
test('Categoria Tipo ordena total sem alterar ordem cronológica dos meses',()=>{const c=load(),o={A:{t:200,m:{}},B:{t:300,m:{}}};assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'TOTAL',d:1})),['B','A']);assert.deepEqual(Array.from(c.fsort(o,['2026-01'],{c:'TOTAL',d:-1})),['A','B'])});
test('Saldos: Conta corrente + Contamax = Saldo em C/C; + Aplicado (só CDB e Compromissada) = Caixa total (antes Saldo em Caixa e Disponibilidades, pedido BM), sem duplicar produtos',()=>{
 const row=(side,name,value,account,label='',kind='')=>[side,'2026-10-01',name,name,'',value,'','','',account,label,kind];
 const data={v:2,r:[row('R','Receita',1000,'123')],p:{},x:{},c:[{c:'123',n:'Principal'}],i:[row('R','CDB',200,'1231','Aplicação','ap'),row('R','COMPROMISSADA',300,'1232','Aplicação','ap'),row('R','CONTAMAX',50,'1233','Aplicação','ap')]};
 const view={style:{},classList:{contains:()=>false},innerHTML:''},ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>JSON.stringify(data)},setInterval(){},setTimeout(){},N:v=>String(v||'').toLowerCase(),PERM:{tem:()=>true,admin:false}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/core/periodo.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);ctx.window.dash.t('sal');
 const values=[...view.innerHTML.matchAll(/<td[^>]*>([\d.,]+)<\/td>/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.')));
 assert.deepEqual(values.slice(0,5),[1000,50,1050,500,1550]);assert.deepEqual(values.slice(-5),[1000,50,1050,500,1550]); /* CONTA CORRENTE · + CONTAMAX · = SALDO EM C/C · + APLICADO · = CAIXA TOTAL (linha da conta e linha TOTAL) */
 const h=view.innerHTML.match(/<thead[\s\S]*?<\/thead>/)[0].replace(/<[^>]+>/g,'|').replace(/\|+/g,'|');
 for(const t of ['CONTA CORRENTE','+ CONTAMAX','= SALDO EM C/C','+ APLICADO','= CAIXA TOTAL'])assert.ok(h.includes(t),'cabeçalho sem '+t);
 assert.deepEqual(h.split('|').filter(x=>/^[=+] |^CONTA CORRENTE$/.test(x)),['CONTA CORRENTE','+ CONTAMAX','= SALDO EM C/C','+ APLICADO','= CAIXA TOTAL'],'as cinco colunas de valor, nesta ordem');
 for(const t of ['SALDO EM CAIXA','DISPONIBILIDADES','DISPONÍVEL','CAIXA + APLICADO','Saldo em Caixa'])assert.ok(!view.innerHTML.includes(t),'a aba Saldos não tem mais "'+t+'"');
 assert.equal((view.innerHTML.match(/data-sal-frame/g)||[]).length,0,'a moldura é desenhada no navegador, não no HTML');
});

/* ---------- Pedido BD (Dashboard Financeiro) ---------- */
function monta({data,dark=false,oculto=false}){const els={},charts=[],cb=[],scroll=[],pend=[],st={dark,oculto};
 const view={style:{},classList:{contains:c=>c=='hidden'&&st.oculto},innerHTML:'',querySelector:()=>null},
  ctx={window:{scrollY:300,scrollTo:(x,y)=>scroll.push(y)},document:{querySelector:()=>view,documentElement:{classList:{contains:c=>c=='dark'&&st.dark}},getElementById:id=>els[id]??={id,innerHTML:'',value:'',style:{},classList:{add(){},remove(){}}},addEventListener(){}},
   localStorage:{getItem:k=>k=='csd_dash_v4'?JSON.stringify(data):null,setItem(){},removeItem(){}},setInterval(){},setTimeout:f=>pend.push(f),N:v=>String(v||'').toLowerCase(),PERM:{tem:()=>true,admin:false},
   Chart:class{constructor(c,cfg){charts.push({id:c.id,cfg})}destroy(){}},MutationObserver:class{constructor(f){cb.push(f)}observe(){}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/core/periodo.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8'),ctx);
 ctx.dash=ctx.window.dash; // o código chama dash.os(...) pelo nome global, como no navegador
 const flush=()=>{while(pend.length)pend.shift()()},d=ctx.window.dash,w=n=>(...a)=>{const r=d[n](...a);flush();return r};
 return {dash:{t:w('t'),x:w('x'),f:w('f'),pd:w('pd'),cts:w('cts'),cto:w('cto'),calc:d.calc},view,charts,st,els,scroll,mudou:()=>{cb.forEach(f=>f());flush()},txt:()=>view.innerHTML.replace(/<[^>]+>/g,'').replace(/&nbsp;|\u00a0/g,' ')};}
const linha=(side,d,nome,valor,conta,label='',kind='',hist,nat='',cls='')=>[side,d,nome,hist||nome,nat,valor,'','','',conta,label,kind,cls];
const BASE_BD={v:2,f:1,hc:true,p:{},x:{},c:[{c:'123',n:'Principal'},{c:'456',n:'Obras'}],
 r:[linha('R','2026-10-01','Receita',1000.10,'123'),linha('R','2026-10-02','Receita',500.20,'456'),linha('P','2026-10-03','FORN X',100.30,'123','','','FORN X','2.0101','FORNECEDORES'),linha('P','2026-10-04','FORN Y',50.05,'456','','','FORN Y','2.0101','FORNECEDORES')],
 i:[linha('R','2026-09-10','CDB',200.10,'1231','Aplicação','ap'),linha('R','2026-10-12','COMPROMISSADA',300.20,'1232','Aplicação','ap'),linha('R','2026-10-12','CONTAMAX',50.05,'1233','Aplicação','ap'),
    linha('R','2026-09-20','CDB',0.10,'1231','Rendimento','rd','RENDIMENTO RECEBIDO CDB'),linha('R','2026-10-20','CDB',0.20,'1231','Rendimento','rd','RENDIMENTO RECEBIDO CDB'),linha('R','2026-10-21','CDB',0.30,'4561','Rendimento','rd','RENDIMENTO RECEBIDO CDB'),
    linha('R','2026-10-22','CDB',7.77,'99991','Rendimento','rd','RENDIMENTO RECEBIDO CDB'),linha('R','2026-10-23','CONTAMAX',1.15,'4563','Rendimento','rd','RENDIMENTO RECEBIDO CONTAMAX')]};
test('BD · DISPONIBILIDADES traz o mês do fim do período e o total (Saldo em Caixa + Aplicado), sem perder centavo',()=>{
 const m=monta({data:BASE_BD});m.dash.t('exe');const t=m.txt();
 const tit=t.match(/DISPONIBILIDADES - ([a-z]{3}\/\d{4}): (-?R\$ [\d.,]+)/);assert.ok(tit,'título sem mês e total: '+t.slice(0,300));assert.equal(tit[1],'out/2026');
 const k=m.dash.calc.kpis(),total=Math.round(k.sf*100)+Math.round(k.inv*100);assert.equal(tit[2],'R$ '+(total/100).toLocaleString('pt-BR',{minimumFractionDigits:2}));
 assert.ok(/data-disp-mes>out\/2026</.test(m.view.innerHTML)&&/normal-case/.test(m.view.innerHTML.match(/<span[^>]*data-disp-mes/)[0]),'mês fora das maiúsculas');
 assert.ok(total>0&&Math.round(total)===total,'o total é em centavos inteiros: '+total);
 m.dash.pd('ate','2026-09');assert.ok(/DISPONIBILIDADES - set\/2026: /.test(m.txt()),'o mês acompanha o fim do período');
});
test('BD · aba Caixa Total x Projetado (pedido BL: o card saiu da Visão executiva): sem a legenda "Em out/2026… real − projetado" no card do Projetado Engenharia e sem a diferença na dica',()=>{
 const m=monta({data:BASE_BD});m.dash.t('pj');const h=m.view.innerHTML;assert.ok(/data-pe/.test(h),'o card do Projetado está na aba nova');
 assert.ok(!/data-pe-res/.test(h)&&!/real − projetado/.test(h)&&!/Fim do contrato/.test(h),'a legenda voltou');
 const src=fs.readFileSync(path.join(root,'js/modulos/dashboard.js'),'utf8');assert.ok(!/Real − projetado/.test(src),'a dica ainda calcula a diferença');
});
test('BD · Saída · Fornecedores abre em "Todas as contas" e a escolha volta ao sair da aba',()=>{
 const m=monta({data:BASE_BD});const sel=()=>{const s=m.view.innerHTML.match(/<select class="inp" title="Conta bancária[\s\S]*?<\/select>/);return s&&[...s[0].matchAll(/<option value="([^"]*)" selected/g)].map(x=>x[1])};
 m.dash.t('exe');assert.deepEqual(sel(),['123'],'a Visão executiva abre na conta principal');
 m.dash.t('for');assert.deepEqual(sel(),[''],'Fornecedores deve abrir em Todas as contas');
 m.dash.t('sal');assert.ok(/<span style="grid-area:1\/1">[^]*?Todas as contas[^]*?<\/span>/.test(m.view.innerHTML.slice(0,m.view.innerHTML.indexOf('aria-hidden'))),'Saldos segue em Todas as contas (o subtítulo visível, não as cópias escondidas)');m.dash.t('for');assert.deepEqual(sel(),['']);m.dash.t('ren');m.dash.t('for');assert.deepEqual(sel(),['']);
 m.dash.t('exe');assert.deepEqual(sel(),['123'],'ao sair, a conta volta');
});
test('BF · Rendimento: um gráfico por conta, colunas CDB e COMPROMISSADA = SALDO aplicado ao fim de cada mês, com centavos exatos; o total vai no título',()=>{
 const m=monta({data:BASE_BD});m.dash.t('ren');const gs=()=>['dcc0','dcc1','dcc2'].map(id=>m.charts.filter(c=>c.id==id).pop());
 assert.ok(!m.charts.some(c=>c.id=='dc9'),'o gráfico por produto do pedido BD saiu');assert.equal(m.charts.filter(c=>/^dcc/.test(c.id)).length,3,'uma conta com CDB/COMPROMISSADA = um gráfico (123, 456 e a não cadastrada)');
 const J=x=>JSON.stringify(x),dat=g=>g.cfg.data.datasets.map(d=>Array.from(d.data));
 assert.equal(J(gs().map(g=>Array.from(g.cfg.data.labels))),J([['set/2026','out/2026'],['set/2026','out/2026'],['set/2026','out/2026']]),'os meses do Ano');
 assert.equal(J(gs().map(g=>g.cfg.data.datasets.map(d=>d.label))),J([['CDB','COMPROMISSADA'],['CDB','COMPROMISSADA'],['CDB','COMPROMISSADA']]),'só CDB e COMPROMISSADA (o Contamax não entra)');
 assert.equal(J(dat(gs()[0])),J([[200.2,200.4],[0,300.2]]),'conta 123: CDB = 200,10 de aplicação + 0,10 (set) + 0,20 (out); COMPROMISSADA 300,20 só em out');assert.equal(J(dat(gs()[1])),J([[0,0.3],[0,0]]),'conta 456: CDB 0,30 em out (o Contamax dela não entra)');assert.equal(J(dat(gs()[2])),J([[0,7.77],[0,0]]),'conta não cadastrada: 7,77');
 assert.equal(J(gs()[0].cfg.data.datasets.map(d=>d.backgroundColor)),J(['#1565c0','#2e7d32']),'cor fixa por produto');
 const t=m.txt();assert.ok(t.includes('Conta Principal 123 · saldo aplicado por produto · 2026 · total em out/2026: R$ 500,60'),'título da conta 123 (CDB 200,40 + COMPROMISSADA 300,20): '+t.slice(t.indexOf('Conta Principal'),t.indexOf('Conta Principal')+160));
 assert.ok(t.includes('Conta Obras 456 · saldo aplicado por produto · 2026 · total em out/2026: R$ 0,30')&&t.includes('Conta 99991 · não cadastrada · saldo aplicado por produto · 2026 · total em out/2026: R$ 7,77'),'totais das outras contas');
 assert.equal(J([...m.view.innerHTML.matchAll(/data-rc="([^"]+)"/g)].map(x=>x[1])),J(['123','456','~99991']),'ordem do cadastro, não cadastrada por último');
 const d0=J(gs().map(dat));m.dash.f('CT','456');m.dash.t('ren');assert.equal(J(gs().map(dat)),d0,'trocar a Conta não muda os gráficos por conta (layout fixo)');
 const e=gs()[0].cfg.data.datasets[0].datalabels;assert.equal(J([0,1].map(i=>e.display({dataset:{data:[0,0.2]},dataIndex:i}))),J([false,true]),'zero não tem rótulo');assert.equal(e.rotation,-90);assert.equal(e.formatter(1234.56),'1.235');
 assert.equal(typeof gs()[0].cfg.options.onClick,'function');
 m.dash.f('Y','2025');
});
test('BD · Rendimento: cada produto expande por conta e a soma das contas fecha com o produto (inclui conta não cadastrada)',()=>{
 const m=monta({data:BASE_BD});m.dash.t('ren');assert.ok(!/data-rp-conta/.test(m.view.innerHTML),'começa recolhido');
 assert.equal([...m.view.innerHTML.matchAll(/data-rp="(\w+)"/g)].map(x=>x[1]).join(),'CDB,COMPROMISSADA,CONTAMAX');
 m.dash.x('rp_CDB');const h=m.view.innerHTML;
 const sub=[...h.matchAll(/data-rp-conta="CDB\|([^"]+)">([\s\S]*?)<\/tr>/g)].map(x=>({k:x[1],c:[...x[2].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(y=>y[1])}));
 assert.deepEqual(sub.map(x=>x.k),['123','456','~99991'],'ordem do cadastro, não cadastrada por último');
 const num=s=>Math.round(Number(s.replace(/\./g,'').replace(',','.'))*100);
 const col=c=>sub.reduce((a,x)=>a+num(x.c[c]),0),prod=h.match(/data-rp="CDB"[\s\S]*?<\/tr>/)[0],pv=[...prod.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(y=>num(y[1]));
 assert.deepEqual(pv,[10,827,837],'CDB: set 0,10 · out 0,20+0,30+7,77 · ano 8,37: '+JSON.stringify(pv));
 assert.deepEqual([col(1),col(2),col(3)],pv,'a soma das contas fecha com o produto, centavo a centavo (0,1+0,2 não vira 0,30000000000000004)');
 assert.deepEqual(sub.map(x=>x.c.slice(1).map(num)),[[10,20,30],[0,30,30],[0,777,777]]);
 assert.deepEqual(sub.map(x=>x.c[0]),['123 · Principal','456 · Obras','Conta 99991 · não cadastrada']);
 assert.ok(/aria-expanded="true"/.test(h)&&/Recolher CDB por conta/.test(h));assert.ok(/▾ CDB</.test(h)&&/▸ COMPROMISSADA</.test(h),'setas: ▾ aberto, ▸ fechado');
 m.dash.x('rp_CDB');assert.ok(!/data-rp-conta/.test(m.view.innerHTML),'recolhe');
});
test('BD · trocar o tema redesenha o painel aberto na hora, sem animação e no mesmo ponto da rolagem; fechado não redesenha',()=>{
 const m=monta({data:BASE_BD});m.dash.t('ren');const n0=m.charts.length,tick=()=>m.charts.filter(c=>c.id=='dcc0').pop().cfg.options.scales.x.ticks.color;
 assert.equal(tick(),'#334155');assert.equal(m.charts.filter(c=>c.id=='dcc0').pop().cfg.options.animation,undefined);
 m.st.dark=true;m.mudou();assert.ok(m.charts.length>n0,'não redesenhou');assert.equal(tick(),'#cbd5e1','tema escuro');
 assert.equal(m.charts.filter(c=>c.id=='dcc0').pop().cfg.options.animation,false,'sem animação');assert.deepEqual(m.scroll,[300],'rolagem preservada');
 m.dash.t('exe');assert.equal(m.charts.filter(c=>c.id=='dc1').pop().cfg.options.animation,undefined,'a flag de "sem animação" não pode ficar ligada');
 m.dash.x('ent');assert.equal(m.charts.filter(c=>c.id=='dc1').pop().cfg.options.animation,undefined,'expandir uma linha do fluxo de caixa não muda a animação dos gráficos');
 const n1=m.charts.length;m.mudou();assert.equal(m.charts.length,n1,'sem mudança de tema não se redesenha');
 m.st.oculto=true;m.st.dark=false;m.mudou();assert.equal(m.charts.length,n1,'com o painel fechado não se desenha nada');
 m.st.oculto=false;m.dash.t('exe');assert.equal(m.charts.filter(c=>c.id=='dc1').pop().cfg.options.plugins.legend.labels.color,'#334155','ao reabrir já vem no tema atual');
});

/* ---------- Pedido BG (Dashboard Financeiro) ---------- */
const ultimo=(m,id)=>m.charts.filter(c=>c.id==id).pop(),cents=v=>Math.round(v*100);
test('BG · Visão executiva: "Saldo Disponível" sai da linha de Entradas e Saídas e vira um gráfico de colunas ACIMA dele, com o saldo (caixa + aplicado) de cada mês em centavos exatos',()=>{
 const m=monta({data:BASE_BD});m.dash.t('exe');const h=m.view.innerHTML,c0=ultimo(m,'dc0'),c1=ultimo(m,'dc1');
 assert.ok(c0&&c1,'faltou um dos gráficos');assert.equal(m.charts.filter(c=>c.id=='dc0').length,1,'um gráfico só');
 assert.ok(h.indexOf('id="dc0"')>0&&h.indexOf('id="dc0"')<h.indexOf('id="dc1"'),'o Saldo Disponível fica ACIMA de Entradas e Saídas');
 assert.ok(m.charts.findIndex(c=>c.id=='dc0')<m.charts.findIndex(c=>c.id=='dc1'),'e é desenhado antes');
 assert.equal(c0.cfg.type,'bar','tipo coluna');assert.equal(c0.cfg.data.datasets.length,1,'uma série só');assert.equal(c0.cfg.data.datasets[0].label,'Saldo Disponível');assert.ok(!c0.cfg.data.datasets[0].type,'sem série de linha');
 assert.deepEqual(Array.from(c0.cfg.data.labels),['set/2026','out/2026']);
 const k=m.dash.calc.kpis(),d=Array.from(c0.cfg.data.datasets[0].data);
 assert.equal(cents(d[1]),cents(k.sf)+cents(k.inv),'out/2026 = Saldo em Caixa 949,85 + Aplicado 500,60 = 1.450,45 (não 1450.4499999…)');assert.equal(cents(d[0]),20020,'set/2026: só a aplicação em CDB (200,10) + rendimento (0,10) = 200,20');
 assert.ok(d.every(v=>cents(v)/100===v),'cada valor já vem arredondado ao centavo: '+d);
 assert.equal(c0.cfg.options.plugins.legend.display,false,'uma série só: sem legenda');assert.equal(c0.cfg.options.scales.y.display,false);assert.equal(c0.cfg.options.scales.y.grace,'20%','folga acima da maior coluna para o rótulo');
 assert.equal(c0.cfg.data.datasets[0].backgroundColor,'#1f65c0','cor do saldo (tema claro)');
 // Entradas e Saídas: SEM a linha Saldo Disponível
 const ls=Array.from(c1.cfg.data.datasets,x=>x.label);assert.ok(!ls.includes('Saldo Disponível'),'a linha saiu: '+ls);assert.deepEqual(ls,['Entradas','Saídas']);assert.ok(c1.cfg.data.datasets.every(x=>x.type!='line'&&x.type!=='line'),'nenhuma série de linha');
 assert.equal(c1.cfg.type,'bar');
 const t=m.txt();assert.ok(/Saldo Disponível · clique numa coluna/.test(t),'título do novo card');assert.ok(/Entradas e Saídas · clique numa barra/.test(t)&&!/ponto da linha/.test(t),'título de Entradas e Saídas sem "ponto da linha"');
});
test('BG · "Saldo Disponível": clicar numa coluna abre os lançamentos do mês; o valor no rótulo é o do mês; Entradas e Saídas segue abrindo Entradas/Saídas',()=>{
 const m=monta({data:BASE_BD});m.dash.t('exe');const c0=ultimo(m,'dc0'),c1=ultimo(m,'dc1');
 assert.equal(typeof c0.cfg.options.onClick,'function');c0.cfg.options.onClick({},[]);assert.ok(!((m.els['dash-md']||{}).innerHTML),'clique fora de qualquer coluna não abre janela nenhuma');
 c0.cfg.options.onClick({},[{index:1,datasetIndex:0}]);
 const md=(m.els['dash-md']||{}).innerHTML||'';assert.ok(/Saldo Disponível · out\/2026/.test(md),'o título da janela traz o mês: '+md.slice(0,300));
 const f=c0.cfg.data.datasets[0].datalabels.formatter;assert.equal(f(1450.45),'1.450');assert.equal(f(1234567.89),'1,23 Mi');
 c1.cfg.options.onClick({},[{index:1,datasetIndex:0}]);assert.ok(/Entradas · out\/2026/.test(m.els['dash-md'].innerHTML)&&!/Saldo Disponível · out\/2026/.test(m.els['dash-md'].innerHTML),'Entradas abre a própria janela (dataset 0 = Entradas, agora que a linha saiu)');
 c1.cfg.options.onClick({},[{index:1,datasetIndex:1}]);assert.ok(/Saídas · out\/2026/.test(m.els['dash-md'].innerHTML),'dataset 1 = Saídas');
});
test('BG · "Saldo Disponível": com muitos meses o rótulo aparece de N em N colunas (e na última se couber), nunca um por cima do outro',()=>{
 const serie=n=>{const ms=[];let a=2026,mm=10;for(let i=0;i<n;i++){ms.unshift(a+'-'+String(mm).padStart(2,'0'));if(--mm<1){mm=12;a--}}return ms};
 for(const [n,passo,ultimoMostrado] of [[26,3,false],[22,2,true],[13,2,true],[27,3,true],[25,3,true]]){ // 26: o último (25) fica a 1 do anterior mostrado (24) → some · 22: o último (21) é par de passo ≥ metade → aparece
  const meses=serie(n),r=meses.map(mm=>linha('R',mm+'-05','Receita',100,'123')),m=monta({data:{...BASE_BD,r,i:[]}});m.dash.t('exe');m.dash.pd('de',meses[0]);
  const c0=ultimo(m,'dc0'),dl=c0.cfg.data.datasets[0].datalabels.display;assert.equal(c0.cfg.data.labels.length,n);
  const esperado=i=>i%passo==0||(i==n-1&&(n-1)%passo>=passo/2),got=meses.map((_,i)=>!!dl({dataIndex:i}));
  assert.equal(Math.ceil(n/12),passo);assert.deepEqual(got,meses.map((_,i)=>esperado(i)),n+' meses · rótulos exibidos: '+got.map((x,i)=>x?i:'').filter(x=>x!=='').join());
  assert.equal(got[n-1],ultimoMostrado,n+' meses · o último mês '+(ultimoMostrado?'aparece':'some'));
  const mostrados=got.map((x,i)=>x?i:-1).filter(i=>i>=0);assert.ok(mostrados.every((x,k)=>k==0||x-mostrados[k-1]>=Math.ceil(passo/2)),'dois rótulos colados: '+mostrados);
 }
 const m2=monta({data:BASE_BD});m2.dash.t('exe');const d2=ultimo(m2,'dc0').cfg.data.datasets[0].datalabels.display;assert.deepEqual([0,1].map(i=>!!d2({dataIndex:i})),[true,true],'poucos meses: todos os rótulos');
});
test('BG · Rendimento: título da conta = "Conta {classe} {código}" (a classe do cadastro — Operacional, BEOP, Fundo —, senão o nome; sem nenhum só o código; "Conta " do próprio nome não duplica; nome escapado; não cadastrada mantém o aviso)',()=>{
 const data={...BASE_BD,c:[{c:'123',n:'Santander',k:'Operacional'},{c:'456',n:'Conta BEOP'},{c:'789',n:'Reserva',k:'<b>Fundo</b>'},{c:'555'}],i:[...BASE_BD.i,linha('R','2026-10-05','CDB',10.01,'7891','Aplicação','ap'),linha('R','2026-10-06','CDB',5.55,'5551','Aplicação','ap')]};
 const m=monta({data});m.dash.t('ren');const h=m.view.innerHTML,t=m.txt(),sufixo=' · saldo aplicado por produto · 2026 · total em out/2026';
 const tit=k=>(h.match(new RegExp('data-rc="'+k+'"[^>]*><h2[^>]*>([\\s\\S]*?)<span class="text-xs'))||[])[1];
 assert.equal(tit('123').trim(),'Conta Operacional 123','a classe (k) vale mais que o nome (n=Santander)');assert.equal(tit('456').trim(),'Conta BEOP 456','sem classe vale o nome; o "Conta " do cadastro não duplica');
 assert.equal(tit('789').trim(),'Conta &lt;b&gt;Fundo&lt;/b&gt; 789','nome vem escapado');assert.ok(!/<b>Fundo<\/b>/.test(h),'HTML do nome não pode virar marcação');
 assert.equal(tit('555').trim(),'Conta 555','sem nome no cadastro: só o código');assert.equal(tit('~99991').trim(),'Conta 99991 · não cadastrada','não cadastrada mantém o aviso');
 assert.ok(t.includes('Conta Operacional 123'+sufixo),'o resto do título (produtos, ano e total) segue igual');
 // o clique continua abrindo o lançamento da conta pelo CÓDIGO
 const g=ultimo(m,'dcc0');g.cfg.options.onClick({},[{datasetIndex:0,index:1}]);assert.ok(/Saldo aplicado · CDB · conta 123 · out\/2026/.test(m.els['dash-md'].innerHTML),'a janela de lançamentos usa o código: '+m.els['dash-md'].innerHTML.slice(0,200));
});
test('BG · Rendimento: valor da coluna em letra 13 e a escala dá folga (acima da maior coluna e abaixo da menor negativa) para o número em pé caber DENTRO do gráfico; negativo vai embaixo da coluna',()=>{
 const m=monta({data:BASE_BD});m.dash.t('ren');const g=ultimo(m,'dcc0'),dsl=g.cfg.data.datasets[0].datalabels,y=g.cfg.options.scales.y,PH=215,SZ=13;
 assert.equal(dsl.font.size,13,'letra do valor');assert.equal(dsl.font.weight,'bold');assert.equal(dsl.rotation,-90);
 assert.equal(y.min,0,'sem negativo o zero é a base');const dmax=Math.max(...g.cfg.data.datasets.flatMap(d=>Array.from(d.data)));assert.equal(dmax,300.2);
 const maior=Math.max(...g.cfg.data.datasets.flatMap(d=>Array.from(d.data).filter(v=>v).map(v=>dsl.formatter(v).length)));
 const gapPx=(y.max-dmax)/(y.max-y.min)*PH;assert.ok(gapPx>=maior*SZ*.62-1e-9,'folga de '+gapPx.toFixed(1)+' px não comporta o número em pé ('+maior*SZ*.62+' px)');assert.ok(gapPx<maior*SZ*.62+40,'e não sobra espaço demais: '+gapPx.toFixed(1));
 assert.equal(g.cfg.options.layout.padding.top,4,'a folga NÃO vem do padding (que ficaria por cima da legenda)');
 assert.equal(dsl.align({dataset:{data:[5]},dataIndex:0}),'end');assert.equal(dsl.align({dataset:{data:[-5]},dataIndex:0}),'bottom','negativo: rótulo embaixo da coluna');
 // com saldo negativo (resgate maior que a aplicação) e positivo na mesma conta: a escala abre para os dois lados
 const mista=monta({data:{...BASE_BD,i:[...BASE_BD.i,linha('P','2026-10-25','CDB',1000,'4561','Resgate','rg'),linha('R','2026-10-26','COMPROMISSADA',50,'4562','Aplicação','ap')]}});mista.dash.t('ren');
 const g2=ultimo(mista,'dcc1'),y2=g2.cfg.options.scales.y,v2=g2.cfg.data.datasets.flatMap(d=>Array.from(d.data)),f2=g2.cfg.data.datasets[0].datalabels.formatter;assert.ok(Math.min(...v2)<0&&Math.max(...v2)>0,'a conta 456 tem saldo positivo e negativo: '+v2);
 const L=Math.max(...v2.filter(v=>v).map(v=>f2(v).length))*SZ*.62,topo=(y2.max-Math.max(...v2))/(y2.max-y2.min)*PH,base=(Math.min(...v2)-y2.min)/(y2.max-y2.min)*PH;
 assert.ok(topo>=L-1e-9&&base>=L-1e-9,'folga acima ('+topo.toFixed(1)+') e abaixo ('+base.toFixed(1)+') comporta '+L.toFixed(1)+' px');
 // só negativo: o zero é o teto e a folga fica embaixo
 const neg=monta({data:{...BASE_BD,i:[...BASE_BD.i,linha('P','2026-10-25','CDB',1000,'4561','Resgate','rg')]}});neg.dash.t('ren');const g3=ultimo(neg,'dcc1'),y3=g3.cfg.options.scales.y,v3=g3.cfg.data.datasets.flatMap(d=>Array.from(d.data));
 assert.ok(Math.max(...v3)==0&&Math.min(...v3)<0);assert.equal(y3.max,0,'sem positivo o zero é o teto');assert.ok((Math.min(...v3)-y3.min)/(y3.max-y3.min)*PH>=g3.cfg.data.datasets[0].datalabels.formatter(Math.min(...v3)).length*SZ*.62-1e-9,'folga embaixo da coluna negativa');
 // todas as colunas zeradas: a escala não degenera
 const zero=monta({data:{...BASE_BD,i:[linha('R','2026-10-12','CDB',0,'1231','Aplicação','ap')]}});zero.dash.t('ren');const yz=ultimo(zero,'dcc0').cfg.options.scales.y;assert.ok(yz.max>yz.min,'escala degenerada: '+JSON.stringify([yz.min,yz.max]));
});
test('BG · "Saldo Disponível": a soma caixa + aplicado não carrega ruído de ponto flutuante (0,10 + 0,20 = 0,30, não 0,30000000000000004)',()=>{
 const data={...BASE_BD,r:[linha('R','2026-10-01','Receita',0.10,'123')],i:[linha('R','2026-10-02','CDB',0.20,'1231','Aplicação','ap')]};
 const m=monta({data});m.dash.t('exe');const c0=ultimo(m,'dc0'),d=Array.from(c0.cfg.data.datasets[0].data);
 assert.deepEqual(d,[0.3],'valor da coluna: '+d);assert.equal(0.1+0.2===0.3,false,'(o caso de teste de fato tem ruído)');assert.equal(c0.cfg.data.datasets[0].datalabels.formatter(d[0]),'0');
 assert.equal(c0.cfg.options.plugins.tooltip.callbacks.label({raw:d[0],dataset:{label:'Saldo Disponível'}}).replace(/ /g,' ').includes('R$ 0,30'),true,'a dica mostra R$ 0,30');
});

// ---------------------------------------------------------------- pedido BL
const chk=(h,c)=>new RegExp('data-cts="'+c+'" checked').test(h),todasChk=h=>/data-cts-todas checked/.test(h);
test('BL/BM · Visão executiva sem os gráficos e o botão do Projetado; a aba "Caixa Total x Projetado" (antes Saldo Total x Projetado) fica depois dela e tem os dois cards com os títulos novos',()=>{
 const m=monta({data:BASE_BD});m.dash.t('exe');let h=m.view.innerHTML;
 assert.ok(!/data-sim|data-pe[ =>]|id="dc5"|id="dc8"|dash-fpe/.test(h),'a Visão executiva não tem mais os cards, os canvas nem o botão do Projetado');
 const abas=Array.from(h.matchAll(/dash\.t\('(\w+)'\)/g),x=>x[1]);assert.deepEqual(abas.slice(0,5),['exe','pj','sal','for','ren'],'ordem das abas');
 m.dash.t('pj');h=m.view.innerHTML;assert.ok(/data-sim/.test(h)&&/data-pe/.test(h)&&/id="dash-fpe"/.test(h)&&/⬆ Projetado Engenharia/.test(h),'a aba nova tem os dois cards e o botão');
 assert.ok(h.indexOf('<section class="card" data-sim')>0&&h.indexOf('<section class="card" data-sim')<h.indexOf('<section class="card" data-pe'),'1º o da Distribuição Antecipada, depois o do Projetado');
 const tit=x=>(h.match(new RegExp('<section class="card" data-'+x+'><h2[^>]*>([\\s\\S]*?)</h2>'))||[])[1];
 assert.equal(tit('sim'),'Caixa total × Sem a Distribuição Antecipada');assert.equal(tit('pe'),'Caixa total × Projetado Engenharia');
 assert.ok(!/Saldo total ·|clique num ponto/.test(h),'sem os títulos antigos nem o "clique num ponto"');
 assert.ok(/Caixa Total x Projetado/.test(m.view.innerHTML)&&!/Saldo Total x Projetado/.test(m.view.innerHTML),'a aba se chama Caixa Total x Projetado');
});
test('BL · caixas de marcar: abre em Todas; marcar/desmarcar; a última não sai; as 4 viram Todas',()=>{
 const m=monta({data:BASE_BD});m.dash.t('pj');let h=m.view.innerHTML;
 assert.ok(todasChk(h)&&chk(h,'123')&&chk(h,'456'),'abre em Todas as contas, com todas marcadas');assert.ok(/data-cts-txt>Todas as contas</.test(h));
 m.dash.cts('123');h=m.view.innerHTML;assert.ok(!todasChk(h)&&!chk(h,'123')&&chk(h,'456'),'desmarcar a 123 deixa só a 456');assert.ok(/data-cts-txt>456 · Obras</.test(h),'o texto traz a conta e o apelido: '+h.match(/data-cts-txt>[^<]*/));
 m.dash.cts('456');h=m.view.innerHTML;assert.ok(chk(h,'456')&&!chk(h,'123'),'a última conta marcada não desmarca');
 m.dash.cts('123');h=m.view.innerHTML;assert.ok(todasChk(h)&&chk(h,'123')&&chk(h,'456'),'marcar as duas volta a "Todas as contas"');
 m.dash.cts('123');m.dash.cts('');h=m.view.innerHTML;assert.ok(todasChk(h)&&chk(h,'123')&&chk(h,'456'),'"Todas as contas" marca tudo');
});
test('BL · o real da aba nova é a SOMA das contas marcadas, em centavos; "todas" = soma de todas; a Visão executiva não é afetada',()=>{
 const m=monta({data:BASE_BD}),c=m.dash.calc;m.dash.t('exe');const k0=JSON.stringify(c.kpis()),n0=c.rows().length;
 const ser=sel=>{c.setCTS(sel);return Object.fromEntries(c.serieSel().map(x=>[x.m,Math.round(c.disponivel(x)*100)]))};
 const a=ser(['123']),b=ser(['456']),u=ser(['9999']),t=ser([]);   // 9999 = conta que não está cadastrada (rendimento de R$ 7,77 na base): "Todas as contas" a inclui, como nas outras abas
 const meses=Object.keys(t);assert.ok(meses.length>=2,'meses: '+meses);
 const ate=(o,mm)=>{const ks=Object.keys(o).filter(x=>x<=mm).sort();return ks.length?o[ks[ks.length-1]]:0};   // saldo herdado dos meses sem movimento
 meses.forEach(mm=>assert.equal(t[mm],ate(a,mm)+ate(b,mm)+ate(u,mm),'real de '+mm+' = soma das contas (centavos)'));assert.equal(ate(u,'2026-10'),777,'a conta não cadastrada só entra em "Todas"');
 assert.notDeepEqual(a,b,'contas diferentes dão séries diferentes');
 c.setCTS(['123']);m.dash.t('pj');m.dash.t('exe');assert.equal(JSON.stringify(c.kpis()),k0,'a Visão executiva voltou igual (comSel devolve R e IV)');assert.equal(c.rows().length,n0);
 c.setCTS(['456']);assert.equal(c.rows().length,n0,'escolher conta na aba nova não mexe nas linhas das outras abas');
});
test('BL/BN · Fornecedores: SAÍDA POR MÊS = saída do fornecedor/todos mês a mês (centavos), com QTDE PAG; o gráfico de fornecedores traz QTDE PAG no rótulo e na dica e o título é só FORNECEDORES',()=>{
 const m=monta({data:BASE_BD});m.dash.t('for');const g9=ultimo(m,'dc9'),g6=ultimo(m,'dc6');assert.ok(g9&&g6,'os dois gráficos');
 assert.equal(g9.cfg.type,'bar');assert.deepEqual(Array.from(g9.cfg.data.labels),['set/2026','out/2026'],'os meses do ano na base, sem buraco');
 assert.deepEqual(Array.from(g9.cfg.data.datasets[0].data,cents),[0,15035],'out/2026 = 100,30 + 50,05');
 const af=g9.cfg.options.plugins.tooltip.callbacks.afterLabel;assert.equal(af({dataIndex:0}),'QTDE PAG: 0');assert.equal(af({dataIndex:1}),'QTDE PAG: 2');
 const dlb=g9.cfg.options.plugins.datalabels.display;assert.equal(dlb({dataset:{data:[0,150.35]},dataIndex:0}),false,'mês zerado sem rótulo');assert.equal(dlb({dataset:{data:[0,150.35]},dataIndex:1}),true);
 const fm=g6.cfg.options.plugins.datalabels.formatter;assert.deepEqual(Array.from(g6.cfg.data.labels).sort(),['FORN X','FORN Y']);
 const i=Array.from(g6.cfg.data.labels).indexOf('FORN X');assert.equal(fm(g6.cfg.data.datasets[0].data[i],{dataIndex:i}),'100 · QTDE PAG: 1');
 assert.equal(g6.cfg.options.plugins.tooltip.callbacks.afterLabel({dataIndex:i}),'QTDE PAG: 1');
 const h=m.els.dres.innerHTML;assert.ok(/<div class="card flex flex-col" data-for-sup><h2 class="font-semibold mb-2">FORNECEDORES<\/h2>/.test(h),'o título do gráfico é só FORNECEDORES');
 assert.ok(!/nº de compras|[0-9] compras?\b|clique numa barra para filtrar/.test(h+JSON.stringify([g6.cfg.options.plugins.datalabels.formatter(1,{dataIndex:i}),g9.cfg.options.plugins.tooltip.callbacks.afterLabel({dataIndex:1})])),'nada de "compras" no gráfico, no rótulo nem na dica');
});
