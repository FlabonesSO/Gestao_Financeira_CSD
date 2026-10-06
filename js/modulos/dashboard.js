/* Módulo Dashboard — Fluxo de Caixa Realizado (interativo).
   MÓDULO ISOLADO: tudo dentro da função; expõe só window.dash. Usa do núcleo: N, saveAs, ROLE.
   Base (Upload, só administrador): planilha com abas "Contas a Receber (Realizado)", "Contas a Pagar (Realizado)" e "Plano de Naturezas".
   Parâmetro de CONTA: o painel usa por padrão a conta principal (1ª linha da aba CONTA_BANCARIA); cada lançamento carrega 'Conta Banco'.
   Aba INVESTIMENTO alimenta a aba Saldos (CDB / Compromissadas / Contamax): aplicações e rendimentos somam; resgates e IR sobre resgate (nat. 2.9905) DEDUZEM o saldo.
   Regras (conferidas com o Power BI): Entradas = Receber; Saídas = Pagar; Investimentos (CDB/COMPROMISSADA/CONTAMAX)
   e Transferências entre contas ficam fora de Entradas/Saídas. Saldo Final = Saldo Inicial + Entradas − Saídas − variação aplicada + transferências.
   Interação: clique em cartões, células da tabela e barras dos gráficos abre a janela de lançamentos (com histórico);
   na aba Fornecedores, clique em fornecedor/categoria filtra tudo (clique de novo para limpar). */
(() => {
 'use strict';
 const VIEW=document.querySelector('[data-view="dash"]'),KEY='csd_dash_v4',INV=['CDB','COMPROMISSADA','CONTAMAX'],
  MN=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
 let PL={},PX={},RA=[],IV0=[],CTA=[],R=[],IV=[],CT='',CTP='',SKS=[],MT={},CH={},tab='exe',Y='',M='',FQ='',FC='',FS='',MSG='',OPEN={},EX={ent:1,sai:1,tr:1,p_TOTAL:1},SK='v',SD=1,DRL=[],KEYS=[],DCUR=null,TBL=[],TL=false,TM=[];
 /* linha: [origem R/P, data, nome, histórico, natureza, valor, tipo(TP), título, parcela, conta]
    linha de INVESTIMENTO (IV): R=entra no produto (aplicação/rendimento), P=sai (resgate/IR); [..., conta, rótulo, tipo(ap|rs|rd|ir), produto pela conta] */
 try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.r&&s.r.length){RA=s.r;PL=s.p||PL;PX=s.x||PX;IV0=s.i||[];CTA=s.c&&s.c.length?s.c:CTA}}catch(e){}
 const $$=id=>document.getElementById(id),mes=d=>d.slice(0,7),lab=m=>MN[+m.slice(5)-1]+'/'+m.slice(0,4),brd=d=>d.split('-').reverse().join('/'),
  z=n=>Math.abs(+n||0)<.005?0:+n,fm=n=>z(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),fr=n=>z(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
  mi=n=>Math.abs(n)>=1e6?(n/1e6).toFixed(2).replace('.',',')+' Mi':(+n||0).toLocaleString('pt-BR',{maximumFractionDigits:0}),sum=(a,k)=>a.reduce((t,x)=>t+x[k],0),
  esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  nc=v=>String(v==null?'':v).replace(/\D/g,'').replace(/^0+/,''),ivc=r=>nc(r[9]).startsWith(CT),
  flt=()=>{R=CT?RA.filter(r=>r[9]==CT):RA.slice();IV=CT?IV0.filter(ivc):IV0.slice()},
  PR=['CDB','COMPROMISSADA','CONTAMAX'],PC={CDB:'#1565c0',COMPROMISSADA:'#2e7d32',CONTAMAX:'#f9a825'},
  og=r=>r[10]?(r[0]=='R'?'Entrada':'Saída')+' (invest.)':r[0]=='R'?'Receber':'Pagar',
  cat=r=>r[10]||PL[r[4]]||'Sem categoria',nome=r=>r[2]||r[3]||'(sem descrição)',sv=r=>r[0]=='R'?r[5]:-r[5],
  isTr=r=>cat(r).startsWith('Transfer'),
  /* Classe do fluxo: investimentos e (só se o Plano de Naturezas disser 'Transferências') transferências ficam fora; o resto segue a origem Receber=Entrada / Pagar=Saída.
     Com 'CATEGORIA FLUXO DE CAIXA' = Entrada/Saídas para Transferência de Entrada/Saída, elas contam como Entrada e Saída. */
  cls=r=>{const c=cat(r),f=PX[r[4]];return INV.includes(c)||f=='Investimentos'?'inv':(f?f=='Transferências':c.startsWith('Transfer'))?'tr':r[0]=='R'?'ent':'sai'},
  NOFOR=r=>cat(r)=='Distribuição Antecipada'||r[4]=='2.9008'||isTr(r),FOR=r=>cls(r)=='sai'&&!NOFOR(r),specF=(t,f,s)=>(DRL.push({t,f,s}),DRL.length-1),src=s=>s=='I'?IV:R,K=s=>(KEYS.push(s),KEYS.length-1),neg=v=>z(v)<0?' text-rose-600':'';
 /* série mensal acumulada (independe dos filtros) */
 function posAt(m){const o={CDB:0,COMPROMISSADA:0,CONTAMAX:0};IV.forEach(r=>{if(mes(r[1])<=m)o[r[2]]=(o[r[2]]||0)+sv(r)});return o}
 function serie(){const by={};IV.forEach(r=>{by[mes(r[1])]??={ent:0,sai:0,inv:0,tr:0}});R.forEach(r=>{const m=mes(r[1]),k=cls(r),b=by[m]??={ent:0,sai:0,inv:0,tr:0};
   if(k=='ent'||k=='sai')b[k]+=r[5];else if(k=='inv')b.inv+=r[0]=='P'?r[5]:-r[5];else b.tr+=r[0]=='R'?r[5]:-r[5]});
  let si=0,pos=0;return Object.keys(by).sort().map(m=>{const b=by[m];pos+=b.inv;const sf=si+b.ent-b.sai-b.inv+b.tr,o={m,si,ent:b.ent,sai:b.sai,inv:IV.length?Object.values(posAt(m)).reduce((t,v)=>t+v,0):pos,sf,dinv:b.inv,tr:b.tr};si=sf;return o})}
 const tlOn=()=>tab=='exe'&&TM.length>0,scope=()=>serie().filter(x=>tlOn()?TM.includes(x.m):(!Y||x.m.startsWith(Y))&&(!M||x.m.slice(5)==M)),inS=(r,ms)=>ms.includes(mes(r[1])),
  maxD=()=>R.concat(IV).reduce((t,r)=>r[1]>t?r[1]:t,'');
 function kpis(){const s=scope();if(!s.length)return null;const l=s[s.length-1];return{si:s[0].si,ent:sum(s,'ent'),sai:sum(s,'sai'),inv:l.inv,sf:l.sf}}
 const grp=(a,f,v)=>{const o={};a.forEach(r=>{const k=f(r);o[k]=(o[k]||0)+v(r)});return Object.entries(o).sort((x,y)=>Math.abs(y[1])-Math.abs(x[1]))};
 function posInv(){const s=scope();if(!s.length)return[];const fim=s[s.length-1].m;if(IV.length)return grp(IV.filter(r=>mes(r[1])<=fim),nome,sv).filter(x=>Math.abs(x[1])>.005);return grp(R.filter(r=>cls(r)=='inv'&&mes(r[1])<=fim),cat,r=>r[0]=='P'?r[5]:-r[5]).filter(x=>Math.abs(x[1])>.005)}
 const cor=()=>document.documentElement.classList.contains('dark')?'#cbd5e1':'#334155',G='#2e7d32',V='#c62828';
 function mk(id,cfg){const c=$$(id);if(!c)return;if(CH[id])CH[id].destroy();CH[id]=new Chart(c,cfg)}
 const dl=(f,sz)=>({display:true,color:cor(),font:{size:sz||10,weight:'bold'},formatter:f||(v=>mi(v)),anchor:'end',align:'end',clip:false}),
  hov=(e,els)=>{if(e&&e.native&&e.native.target)e.native.target.style.cursor=els.length?'pointer':'default'},
  baseO=(o={})=>({responsive:true,maintainAspectRatio:false,onHover:hov,...o,plugins:{legend:{display:false},datalabels:{display:false},tooltip:{callbacks:{label:c=>' '+fr(c.raw)}},...(o.plugins||{})}});
 const kp=(t,v,c,i)=>i==null?`<div class="card text-center"><div class="text-xs text-slate-500">${t}</div><div class="text-xl font-bold mt-1 ${c||''}">${v}</div></div>`:
  `<button class="card text-center cursor-pointer hover:ring-2 hover:ring-indigo-500 transition" title="Clique para ver os lançamentos" onclick="dash.dr(${i})"><div class="text-xs text-slate-500">${t} ↗︎</div><div class="text-xl font-bold mt-1 ${c||''}">${v}</div></button>`;
 const tbl=(h,b,st)=>`<div ${st?'style="max-height:520px;overflow:auto"':'class="overflow-x-auto"'}><table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left ${st?'sticky top-0 bg-white dark:bg-slate-900':''}"><tr>${h}</tr></thead><tbody>${b}</tbody></table></div>`;
 const fi=v=>Math.round(+v||0).toLocaleString('pt-BR'),NG={grid:{display:false},border:{display:false}},
  bar=(a,col,n,oc,sel,full,sz)=>({type:'bar',data:{labels:a.slice(0,n).map(x=>x[0]),datasets:[{data:a.slice(0,n).map(x=>Math.abs(x[1])),backgroundColor:a.slice(0,n).map(x=>sel&&x[0]!=sel?col+'55':col)}]},
  options:baseO({indexAxis:'y',layout:{padding:{right:full?(sz&&sz<12?85:125):70}},onClick:(e,els)=>{if(els.length&&oc)oc(a[els[0].index][0])},plugins:{datalabels:dl(full?fi:undefined,sz||(full?13:10))},scales:{x:{display:false,...NG},y:{...NG,ticks:{font:{size:10},callback(v){const l=String(this.getLabelForValue(v));return l.length>30?l.slice(0,29)+'…':l}}}}})});
 const per=s=>tlOn()?s.map(x=>lab(x.m)).join(' + '):s.length==1?lab(s[0].m):'ano '+Y;
 /* ---------- cabeçalho ---------- */
 const allM=()=>[...new Set(RA.concat(IV0).map(r=>mes(r[1])))].sort(),
  CY=String(new Date().getFullYear()),
  dM=()=>{const m=allM().filter(x=>x.startsWith(Y));return tab=='exe'||tab=='for'?'':(m[m.length-1]||'').slice(5)},
  lastPer=()=>{const m=allM(),ys=[...new Set(m.map(x=>x.slice(0,4)))];Y=ys.includes(CY)?CY:(ys[ys.length-1]||'');MT={};M=dM()},
  DK=['Principal','Fundo Reserva','Beop'],
  ctl=c=>{const a=CTA.find(x=>x.c==c);return c+(a&&a.k?' - '+a.k:'')},
  cn=c=>{const a=CTA.find(x=>x.c==c);return a&&a.n?a.n:(c||'conta não identificada')},
  trLab=r=>{const o=RA.find(x=>isTr(x)&&x[0]!=r[0]&&x[1]==r[1]&&x[5]==r[5]&&x[9]!=r[9]);return (r[0]=='P'?'Para: ':'De: ')+(o?ctl(o[9]):'conta não identificada')},
  BK={'033':'Santander','001':'Banco do Brasil','237':'Bradesco','341':'Itaú','104':'Caixa','260':'Nubank','077':'Inter'},
  ctaTxt=()=>{const a=CTA.find(x=>x.c==CT);return a?'<b>Conta '+a.c+(a.n?' · '+esc(a.n):'')+'</b> · '+(BK[a.b]||'Banco '+a.b)+' ag. '+a.a+(a==CTA[0]?' (principal)':''):'<b>Todas as contas</b>'};
 function head(){const ms=allM(),ys=[...new Set(ms.map(m=>m.slice(0,4)))];if(!Y||!ys.includes(Y))Y=ys[ys.length-1]||'';
  const mo=ms.filter(m=>m.startsWith(Y));
  return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Dashboard · Fluxo de Caixa</h1><p class="text-sm text-slate-500">Realizado · atualizado até a data-base: <b>${R.length||IV.length?brd(maxD()):'—'}</b> · ${ctaTxt()}</p></div>
  ${tab=='sal'?'':`<label class="text-xs text-slate-500">Conta <select class="inp ml-1" title="Conta bancária usada como parâmetro" onchange="dash.f('CT',this.value)">${CTA.map((a,i)=>`<option value="${a.c}" ${a.c==CT?'selected':''}>${a.c}${a.n?' · '+esc(a.n):''}${a.k?' · '+esc(a.k):i==0?' · principal':''}</option>`).join('')}<option value="" ${CT?'':'selected'}>Todas as contas</option></select></label>`}
  <label class="text-xs text-slate-500">Ano <select class="inp ml-1" ${tlOn()?'disabled title="A linha do tempo está filtrando os meses"':''} onchange="dash.f('Y',this.value)">${ys.map(y=>`<option ${y==Y?'selected':''}>${y}</option>`).join('')}</select></label>
  <label class="text-xs text-slate-500">Mês <select class="inp ml-1" ${tlOn()?'disabled title="A linha do tempo está filtrando os meses"':''} onchange="dash.f('M',this.value)"><option value="">Todos</option>${mo.map(m=>`<option value="${m.slice(5)}" ${m.slice(5)==M?'selected':''}>${lab(m)}</option>`).join('')}</select></label>
  ${tab=='exe'?`<button class="${TL||TM.length?'btn':'btn2'}" title="Filtra 2 meses numa linha do tempo" onclick="dash.tl()">🕒 Linha do tempo${TM.length?' · '+TM.map(lab).join(' + '):''}</button>`:''}
  <button class="btn2 adm" title="Lê a planilha e publica a base para todos os usuários" onclick="document.getElementById('dash-fi').click()">⬆ Atualizar base</button><input id="dash-fi" type="file" accept=".xlsx,.xls" class="hidden" onchange="dash.up(this)"><button class="btn2" onclick="dash.xl()">Excel</button></div>
  ${NUV?`<div class="text-xs text-slate-500">Base publicada em ${esc(NUV)}</div>`:''}
  ${!RA.length&&!IV0.length?`<div class="text-sm rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2">Nenhuma base carregada ainda. ${ROLE=='admin'?'Clique em “Atualizar base” e escolha a planilha BASE_FLUXO_DE_CAIXA_REALIZADO.xlsx.':'Peça ao administrador para publicar a planilha.'}</div>`:''}
  ${MSG?`<div class="text-sm rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-2">${esc(MSG)}</div>`:''}
  <div class="flex flex-wrap gap-2">${[['exe','📊','Visão executiva'],['sal','🏦','Saldos'],['for','🧾','Saída · Fornecedores']].map(t=>`<button class="${tab==t[0]?'btn':'btn2'}" onclick="dash.t('${t[0]}')"><span class="mr-1">${t[1]}</span>${t[2]}</button>`).join('')}</div>`}
 /* ---------- filtro: linha do tempo (até 2 meses) ---------- */
 function tlPanel(){const ms=allM(),ys=[...new Set(ms.map(m=>m.slice(0,4)))],chip=m=>{const on=TM.includes(m);return `<button class="px-2.5 py-1 rounded-md text-xs font-medium border ${on?'bg-indigo-600 text-white border-indigo-600':'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}" title="${lab(m)}" onclick="dash.tm('${m}')">${MN[+m.slice(5)-1]}</button>`};
  return `<section class="card space-y-2"><div class="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Linha do tempo · selecione até <b>2 meses</b> para filtrar o relatório${TM.length?' · filtrando: <b class="text-indigo-500">'+TM.map(lab).join(' + ')+'</b>':' · sem seleção, vale o filtro de Ano/Mês'}</span>${TM.length?'<button class="btn2 ml-auto" onclick="dash.tc()">Limpar</button>':''}</div>
   <div class="space-y-1.5">${ys.map(y=>`<div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs text-slate-500 w-10">${y}</span>${ms.filter(m=>m.startsWith(y)).map(chip).join('')}</div>`).join('')}</div></section>`}
 /* ---------- Visão executiva ---------- */
 function exe(){const k=kpis(),s=scope();if(!k)return '<div class="card">Sem dados no período.</div>';DRL=[];KEYS=[];
  const ms=s.map(x=>x.m),last=ms[ms.length-1],P=per(s),ent=grp(R.filter(r=>cls(r)=='ent'&&inS(r,ms)),nome,r=>r[5]);
  const dI=IV.length?specF('Aplicado (líquido de IR) · movimentação até '+lab(last),r=>mes(r[1])<=last,'I'):specF('Investimentos · movimentação até '+lab(last),r=>cls(r)=='inv'&&mes(r[1])<=last);
  const cell=(i,v,b)=>z(v)==0?`<td class="px-2 py-1.5 text-right ${b?'font-bold':''}">0,00</td>`:`<td class="px-2 py-1.5 text-right cursor-pointer hover:bg-indigo-500/10 ${b?'font-bold':''}${neg(v)}" onclick="event.stopPropagation();dash.dr(${i})">${fm(v)}</td>`;
  const tl=r=>isTr(r)?cat(r)+' · '+trLab(r):cat(r),
  blk=(t,cl,sg,key,lf)=>{const gc=r=>lf?lf(r):cat(r),o={};R.filter(r=>cls(r)==cl&&inS(r,ms)).forEach(r=>{const c=gc(r),b=o[c]??={},m=mes(r[1]);b[m]=(b[m]||0)+sg(r)});
   const cs=Object.keys(o).sort((a,b)=>a.localeCompare(b,'pt')),tot=ms.map(m=>cs.reduce((a,c)=>a+(o[c][m]||0),0));
   let h=`<tr class="bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer" onclick="dash.x('${key}')"><td class="px-2 py-1.5 whitespace-nowrap">${EX[key]?'▾':'▸'} ${t}</td>${tot.map((v,j)=>cell(specF(t+' · '+lab(ms[j]),r=>cls(r)==cl&&mes(r[1])==ms[j]),v,1)).join('')}${cell(specF(t+' · '+P,r=>cls(r)==cl&&inS(r,ms)),tot.reduce((a,v)=>a+v,0),1)}</tr>`;
   if(EX[key])h+=cs.map(c=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1.5 pl-7 cursor-pointer hover:underline" onclick="dash.dr(${specF(c+' · '+P,r=>cls(r)==cl&&gc(r)==c&&inS(r,ms))})">${esc(c)}</td>${ms.map(m=>cell(specF(c+' · '+lab(m),r=>cls(r)==cl&&gc(r)==c&&mes(r[1])==m),o[c][m]||0)).join('')}${cell(specF(c+' · '+P,r=>cls(r)==cl&&gc(r)==c&&inS(r,ms)),ms.reduce((a,m)=>a+(o[c][m]||0),0))}</tr>`).join('');return h};
  const hd='<th class="px-2 py-1.5">TIPO</th>'+ms.map(m=>`<th class="px-2 py-1.5 text-right cursor-pointer hover:text-indigo-500 ${M&&m.slice(5)==M?'text-indigo-500':''}" title="Clique para filtrar o mês" onclick="dash.f('M','${m.slice(5)}')">${lab(m).toUpperCase()}</th>`).join('')+'<th class="px-2 py-1.5 text-right">TOTAL</th>';
  const sfl=`<tr class="border-t-2 border-slate-400 font-bold"><td class="px-2 py-1.5">SALDO FINAL</td>${s.map(x=>cell(specF('Movimentação · '+lab(x.m)+' (todas as classes)',r=>mes(r[1])==x.m),x.sf,1)).join('')}${cell(specF('Movimentação · '+P+' (todas as classes)',r=>inS(r,ms)),k.sf,1)}</tr>`;
  setTimeout(()=>{
   mk('dc1',{type:'bar',data:{labels:s.map(x=>lab(x.m)),datasets:[{label:'Entradas',data:s.map(x=>x.ent),backgroundColor:G},{label:'Saídas',data:s.map(x=>x.sai),backgroundColor:V},...(s.some(x=>x.tr)?[{label:'Transferências',data:s.map(x=>x.tr),backgroundColor:'#f9a825',datalabels:{display:c=>c.dataset.data[c.dataIndex]!=0}}]:[])]},
    options:baseO({layout:{padding:{top:20}},onClick:(e,els)=>{if(!els.length)return;const m=ms[els[0].index],d=els[0].datasetIndex,k=['ent','sai','tr'][d];dash.o2(['Entradas · ','Saídas · ','Transferências entre contas · '][d]+lab(m),r=>cls(r)==k&&mes(r[1])==m)},plugins:{legend:{display:true,position:'top',align:'start',labels:{color:cor(),font:{size:10},boxWidth:10,boxHeight:10,padding:8}},datalabels:dl()},scales:{x:{...NG},y:{display:false,grace:'20%',...NG}}})});
   mk('dc2',{type:'line',data:{labels:s.map(x=>lab(x.m)),datasets:[{data:s.map(x=>x.inv),borderColor:G,backgroundColor:'rgba(46,125,50,.35)',fill:true,tension:.3,pointRadius:5,pointHoverRadius:8}]},
    options:baseO({layout:{padding:{top:22,right:20}},onClick:(e,els)=>{if(!els.length)return;const m=ms[els[0].index];IV.length?dash.o2('Aplicado (líquido de IR) · movimentação até '+lab(m),r=>mes(r[1])<=m,'I'):dash.o2('Investimentos · movimentação até '+lab(m),r=>cls(r)=='inv'&&mes(r[1])<=m)},plugins:{datalabels:{...dl(),align:'top'}},scales:{x:{...NG},y:{display:false,...NG}}})});
   mk('dc3',bar(posInv(),G,8,c=>IV.length?dash.o2('Investimento · '+c+' (até '+lab(last)+')',r=>r[2]==c&&mes(r[1])<=last,'I'):dash.o2('Investimento · '+c+' (até '+lab(last)+')',r=>cls(r)=='inv'&&cat(r)==c&&mes(r[1])<=last),null,true));
   mk('dc4',bar(ent,G,8,n=>dash.o2('Entradas · '+n,r=>cls(r)=='ent'&&nome(r)==n&&inS(r,ms)),null,true))},0);
  return `${TL?tlPanel():''}<section class="grid grid-cols-2 lg:grid-cols-5 gap-3">${kp('Saldo Inicial',fr(k.si))}${kp('Entradas',fr(k.ent),'text-emerald-600',specF('Entradas · '+P,r=>cls(r)=='ent'&&inS(r,ms)))}${kp('Saídas',fr(-k.sai),'text-rose-600',specF('Saídas · '+P,r=>cls(r)=='sai'&&inS(r,ms)))}${kp(IV.length?'Aplicado (líq. de IR)':'Disponível Aplicado',fr(k.inv),'text-emerald-600',dI)}${kp('Saldo Final',fr(k.sf))}</section>
  <section class="grid lg:grid-cols-2 gap-4"><div class="card"><h2 class="font-semibold mb-2">Entradas e Saídas <span class="text-xs font-normal text-slate-500">· clique numa barra</span></h2><div class="relative h-72"><canvas id="dc1"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Saldo Acumulado <span class="text-xs font-normal text-slate-500">· detalhe na aba Saldos</span></h2><div class="relative h-72"><canvas id="dc2"></canvas></div></div></section>
  <section class="grid lg:grid-cols-3 gap-4"><div class="card lg:col-span-2"><h2 class="font-semibold mb-2">Fluxo de caixa <span class="text-xs font-normal text-slate-500">· clique em uma categoria ou valor para ver os lançamentos</span></h2>${tbl(hd,blk('ENTRADA','ent',r=>r[5],'ent',tl)+blk('SAÍDAS','sai',r=>-r[5],'sai',tl)+(R.some(r=>cls(r)=='tr')?blk('TRANSFERÊNCIAS ENTRE CONTAS','tr',sv,'tr',trLab):'')+sfl)}</div>
   <div class="space-y-4"><div class="card"><h2 class="font-semibold mb-2">Posição dos investimentos <span class="text-xs font-normal text-slate-500">· líquida de IR</span></h2><div class="relative h-44"><canvas id="dc3"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Entradas</h2><div class="relative h-44"><canvas id="dc4"></canvas></div></div></div></section>
  `}
 /* ---------- Saldos (conta + investimentos) ---------- */
 function ivSerie(){const all=[...new Set(IV.map(r=>mes(r[1])).concat(R.map(r=>mes(r[1]))))].sort(),o={};
  PR.concat(['TOTAL']).forEach(p=>{let si=0;o[p]=all.map(m=>{const b={m,si,ap:0,rs:0,rd:0,ir:0};IV.forEach(r=>{if(mes(r[1])==m&&(p=='TOTAL'||r[2]==p))b[r[11]]+=r[5]});b.sf=si+b.ap+b.rd-b.rs-b.ir;si=b.sf;return b})});return o}
 const confer=()=>{const g={},dup=[],mm=IV.filter(r=>r[12]&&r[12]!=r[2]);IV.forEach(r=>{const k=[r[2],r[11],r[5],N(r[3])].join('|');(g[k]??=[]).push(r)});Object.values(g).forEach(a=>{if(a.length>1)dup.push(...a)});return{dup,mm}};
function sal(){const sc=scope();if(!sc.length)return '<div class="card">Sem dados no período.</div>';DRL=[];KEYS=[];SKS=[];
  const ms=sc.map(x=>x.m),first=ms[0],last=ms[ms.length-1],upto=r=>mes(r[1])<=last,inP=r=>ms.includes(mes(r[1])),bef=r=>mes(r[1])<first,P=per(sc),
   dmax=a=>a.reduce((t,r)=>r[1]>t?r[1]:t,''),db=brd(dmax(RA.concat(IV0).filter(upto))),sm=(a,f)=>a.reduce((t,r)=>t+f(r),0),
   cell=(i,v,b)=>z(v)==0?`<td class="px-2 py-1.5 text-right ${b?'font-bold':''}">0,00</td>`:`<td class="px-2 py-1.5 text-right cursor-pointer hover:bg-indigo-500/10 ${b?'font-bold':''}${neg(v)}" onclick="event.stopPropagation();dash.dr(${i})">${fm(v)}</td>`,
   vz='<td class="px-2 py-1.5"></td>',
   acts=a=>{const mc=r=>r[9]==a.c,mi_=r=>nc(r[9]).startsWith(a.c),rr=RA.filter(r=>mc(r)&&upto(r)),ii=IV0.filter(r=>mi_(r)&&upto(r)),rp=rr.filter(inP),G=[];
    const byC=(pd,t,id,lf)=>{const rs=rp.filter(pd);if(!rs.length)return;const o={};rs.forEach(r=>{const c=lf?lf(r):cat(r);o[c]=(o[c]||0)+sv(r)});
     G.push({id,t,col:'c',v:sm(rs,sv),f:r=>mc(r)&&inP(r)&&pd(r),it:Object.keys(o).sort((x,y)=>x.localeCompare(y,'pt')).map(c=>({t:c,v:o[c],f:r=>mc(r)&&inP(r)&&pd(r)&&(lf?lf(r):cat(r))==c}))})};
    /* conta de destino/origem da transferência: lançamento oposto, mesma data e valor, em outra conta */
    const lt=trLab;
    byC(r=>cls(r)=='ent'&&!isTr(r),'Entradas','ent');byC(r=>cls(r)=='sai'&&!isTr(r),'Saídas','sai');byC(r=>cls(r)=='inv','Aplicação','inv');byC(isTr,'Transferências entre contas','tr',lt);
    if(ii.length){const o={};ii.forEach(r=>{o[r[2]]=(o[r[2]]||0)+sv(r)});
     G.push({id:'iv',t:'Saldo no Investimento',col:'a',v:sm(ii,sv),f:r=>mi_(r)&&upto(r),it:PR.filter(p=>o[p]!=null).map(p=>({t:p,v:o[p],f:r=>mi_(r)&&upto(r)&&r[2]==p}))})}
    return{G,mc,mi_,cc:sm(rr,sv),ap:sm(ii,sv),ci:sm(rr.filter(bef),sv),ai:sm(ii.filter(bef),sv)}};
  let TC=0,TA=0,TI=0,TJ=0;
  const rows=CTA.map((a,i)=>{const X=acts(a),G=X.G,cc=X.cc,ap=X.ap,k='a_'+a.c,ex=EX[k];TC+=cc;TA+=ap;TI+=X.ci;TJ+=X.ai;SKS.push(k);
   let h=`<tr class="bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer border-t border-slate-200 dark:border-slate-700" onclick="dash.x('${k}')"><td class="px-2 py-1.5 whitespace-nowrap">${ex?'▾':'▸'} ${a.c}${i==0?' ★':''}${a.n?' · '+esc(a.n):''}</td><td class="px-2 py-1.5">${a.k?`<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">${esc(a.k)}</span>`:'<span class="text-slate-400">—</span>'}</td><td class="px-2 py-1.5 font-normal whitespace-nowrap">${esc(BK[a.b]||a.b)} · ag. ${esc(a.a)} <button class="ml-2 text-xs text-indigo-500 hover:underline" title="Abrir a Visão executiva desta conta" onclick="event.stopPropagation();dash.go('${a.c}')">fluxo ↗︎</button></td>${cell(specF('Conta corrente · '+a.c+' · saldo em '+db,r=>X.mc(r)&&upto(r)),cc,1)}${cell(specF('Saldo no Investimento · conta '+a.c+' · em '+db,r=>X.mi_(r)&&upto(r),'I'),ap,1)}<td class="px-2 py-1.5 text-right${neg(cc+ap)}">${fm(cc+ap)}</td></tr>`;
   if(ex){h+=`<tr class="border-t border-slate-200 dark:border-slate-800 text-slate-500"><td class="px-2 py-1.5 pl-7" colspan="3">Saldo inicial do período</td>${cell(specF(a.c+' · saldo inicial de '+P,r=>X.mc(r)&&bef(r)),X.ci)}${cell(specF(a.c+' · saldo inicial no investimento',r=>X.mi_(r)&&bef(r),'I'),X.ai)}${vz}</tr>`;
    G.forEach(g=>{const gk=k+'_'+g.id,gx=EX[gk];SKS.push(gk);
    h+=`<tr class="border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onclick="dash.x('${gk}')"><td class="px-2 py-1.5 pl-7 font-semibold" colspan="3">${gx?'▾':'▸'} ${g.t}${g.col=='c'?' · '+P:' · saldo final'}</td>${g.col=='c'?cell(specF(a.c+' · '+g.t+' · '+P,g.f),g.v):vz}${g.col=='a'?cell(specF(a.c+' · '+g.t,g.f,'I'),g.v):vz}${vz}</tr>`;
    if(gx)h+=g.it.map(x=>`<tr class="border-t border-slate-100 dark:border-slate-800/60 text-xs"><td class="px-2 py-1 pl-12" colspan="3">${esc(x.t)}</td>${g.col=='c'?cell(specF(a.c+' · '+g.t+' · '+x.t+' · '+P,x.f),x.v):vz}${g.col=='a'?cell(specF(a.c+' · Saldo no Investimento · '+x.t,x.f,'I'),x.v):vz}${vz}</tr>`).join('')})}
   return h}).join('');
  const dCt=specF('Conta corrente · todas as contas · saldo em '+db,upto),dAt=specF('Saldo no Investimento · todas as contas · em '+db,upto,'I'),
   tt=`<tr class="border-t-2 border-slate-400 font-bold"><td class="px-2 py-1.5" colspan="3">TOTAL (saldo em ${db})</td>${cell(dCt,TC,1)}${cell(dAt,TA,1)}<td class="px-2 py-1.5 text-right${neg(TC+TA)}">${fm(TC+TA)}</td></tr>`;
  return `<section class="card"><div class="flex flex-wrap items-center gap-2 mb-2"><h2 class="font-semibold mr-auto">Contas bancárias <span class="text-xs font-normal text-slate-500">· período <b>${P}</b> · saldo em <b>${db}</b> · ★ principal · ▸ expande o que ocorreu na conta no período · clique no valor para ver os lançamentos</span></h2><button class="btn2" onclick="dash.xa(true)">Expandir tudo</button><button class="btn2" onclick="dash.xa(false)">Recolher tudo</button></div>
   ${tbl('<th class="px-2 py-1.5">CONTA / ATIVIDADE</th><th class="px-2 py-1.5">CLASSE</th><th class="px-2 py-1.5">BANCO / AGÊNCIA</th><th class="px-2 py-1.5 text-right">CONTA CORRENTE</th><th class="px-2 py-1.5 text-right">APLICADO</th><th class="px-2 py-1.5 text-right">SALDO TOTAL</th>',rows+tt)}
   </section>`}
 /* ---------- Saída · Fornecedores ---------- */
 function forn(){const ms=scope().map(x=>x.m),cs=[...new Set(R.filter(r=>FOR(r)&&inS(r,ms)).map(cat))].sort((a,b)=>a.localeCompare(b,'pt'));
  return `<section class="grid grid-cols-2 lg:grid-cols-4 gap-3"><div id="dkp" class="contents"></div>
   <div class="card col-span-2 flex flex-wrap items-end gap-3"><label class="text-xs text-slate-500 grow">🔎 Pesquise por fornecedor ou histórico<input id="dq" class="inp w-full mt-1" placeholder="Search" value="${esc(FQ)}" oninput="dash.q(this.value)"></label>
    <label class="text-xs text-slate-500">Categoria Tipo<select id="dfc" class="inp w-full mt-1" onchange="dash.fv('FC',this.value,1)"><option value="">Todos</option>${cs.map(c=>`<option ${c==FC?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    <button class="btn2" onclick="dash.clr()">Limpar filtros</button></div></section> <div id="dchips" class="flex flex-wrap gap-2"></div><div id="dres" class="space-y-4"></div>`}
 function fres(){DRL=[];KEYS=[];const s=scope(),ms=s.map(x=>x.m),base=R.filter(r=>FOR(r)&&inS(r,ms)),q=r=>!FQ||N(nome(r)+' '+r[3]).includes(N(FQ)),
  pv=base.filter(r=>q(r)&&(!FS||nome(r)==FS)),cv=base.filter(r=>q(r)&&(!FC||cat(r)==FC)),af=pv.filter(r=>!FC||cat(r)==FC),tot=-af.reduce((t,r)=>t+r[5],0);
  $$('dkp').innerHTML=`<button class="card text-center flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-indigo-500 transition" title="Ver lançamentos" onclick="dash.o3('Saídas filtradas')"><div class="text-xs font-bold text-slate-500 tracking-wide">TOTAL SAÍDAS ↗︎</div><div class="text-3xl font-bold text-rose-600 mt-1">${fr(tot)}</div><div class="text-xs text-slate-500 mt-1">${per(s)}</div></button><div class="card text-center flex flex-col items-center justify-center"><div class="text-xs font-bold text-slate-500 tracking-wide">PAGAMENTOS (COM TÍTULO)</div><div class="text-3xl font-bold mt-1">${af.filter(r=>r[7]).length}</div><div class="text-xs text-slate-500 mt-1">lançamentos com nº de título</div></div>`;
  $$('dchips').innerHTML=[['M',M?'Mês: '+lab(Y+'-'+M):''],['FC',FC?'Categoria: '+FC:''],['FS',FS?'Fornecedor: '+FS:''],['FQ',FQ?'Busca: '+FQ:'']].filter(x=>x[1]).map(x=>`<button class="px-2 py-1 rounded-full text-xs bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/30" onclick="dash.rm('${x[0]}')">${esc(x[1])} ✕</button>`).join('');
  /* pivot CATEGORIA TIPO */
  const ag=(rows,f)=>{const o={};rows.forEach(r=>{const k=f(r),b=o[k]??={t:0,m:{}},m=mes(r[1]);b.m[m]=(b.m[m]||0)+r[5];b.t+=r[5]});return o},ac=ag(af,cat),
   td=(i,v)=>z(v)==0?'<td class="px-3 py-1 text-right">0,00</td>':`<td class="px-3 py-1 text-right text-rose-600 cursor-pointer hover:bg-indigo-500/10" onclick="event.stopPropagation();dash.dr(${i})">${fm(-v)}</td>`;
  let pr=Object.keys(ac).sort((a,b)=>a.localeCompare(b,'pt')).map(c=>{const o=ac[c],op=OPEN[c],ki=K(c);
   let h=`<tr class="border-t border-slate-200 dark:border-slate-800 ${FC==c?'bg-indigo-500/10':''}"><td class="px-3 py-1 font-semibold whitespace-nowrap"><button class="mr-1 text-slate-500" onclick="dash.ok(${ki})">${op?'⊟':'⊞'}</button><span class="cursor-pointer hover:underline" title="Clique para filtrar" onclick="dash.fk('FC',${ki})">${esc(c)}</span></td>${ms.map(m=>td(specF(c+' · '+lab(m),r=>FOR(r)&&cat(r)==c&&mes(r[1])==m&&(!FS||nome(r)==FS)),o.m[m]||0)).join('')}${td(specF(c,r=>FOR(r)&&cat(r)==c&&inS(r,ms)&&(!FS||nome(r)==FS)),o.t)}</tr>`;
   if(op){const as=ag(pv.filter(r=>cat(r)==c),nome);h+=Object.keys(as).sort((a,b)=>as[b].t-as[a].t).map(n=>{const kn=K(n);return `<tr class="text-xs ${FS==n?'bg-indigo-500/10':''}"><td class="px-3 py-0.5 pl-10 cursor-pointer hover:underline" title="Clique para filtrar" onclick="dash.fk('FS',${kn})">${esc(n)}</td>${ms.map(m=>td(specF(n+' · '+lab(m),r=>FOR(r)&&cat(r)==c&&nome(r)==n&&mes(r[1])==m),as[n].m[m]||0)).join('')}${td(specF(n+' · '+c,r=>FOR(r)&&cat(r)==c&&nome(r)==n&&inS(r,ms)),as[n].t)}</tr>`}).join('')}return h}).join('');
  const pT=-af.reduce((t,r)=>t+r[5],0);
  pr+=`<tr class="border-t-2 border-slate-400 font-bold sticky bottom-0 bg-white dark:bg-slate-900"><td class="px-3 py-2">Total</td>${ms.map(m=>`<td class="px-3 py-2 text-right">${fm(-af.filter(r=>mes(r[1])==m).reduce((t,r)=>t+r[5],0))}</td>`).join('')}<td class="px-3 py-2 text-right">${fm(pT)}</td></tr>`;
  const cb=ag(cv,nome),sup=Object.entries(cb).map(([n,b])=>[n,b.t]).sort((a,b)=>b[1]-a[1]);
  /* tabela de lançamentos */
  const G={tp:r=>r[6],num:r=>r[7],prc:r=>r[8],n:r=>nome(r),v:r=>-r[5],h:r=>r[3],d:r=>r[1],c:r=>cat(r)};TBL=af.slice().sort((a,b)=>{const x=G[SK](a),y=G[SK](b);return(typeof x=='number'?x-y:String(x).localeCompare(String(y),'pt'))*SD});
  const cols=[['tp','TIPO'],['num','TÍTULO'],['prc','PARCELA'],['n','FORNECEDOR'],['v','VALOR'],['h','HISTÓRICO'],['d','DATA DO PAGAMENTO'],['c','CATEGORIA SERVIÇO']],
   th=cols.map(c=>`<th class="px-3 py-2 cursor-pointer select-none ${c[0]=='v'?'text-right':''}" onclick="dash.s('${c[0]}')">${c[1]} ${SK==c[0]?(SD>0?'▲':'▼'):''}</th>`).join(''),
   tr=TBL.map((r,i)=>`<tr class="border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-indigo-500/10" onclick="dash.det(${i})"><td class="px-3 py-1.5">${esc(r[6])}</td><td class="px-3 py-1.5">${esc(r[7])}</td><td class="px-3 py-1.5">${esc(r[8])}</td><td class="px-3 py-1.5">${esc(nome(r))}</td><td class="px-3 py-1.5 text-right text-rose-600 whitespace-nowrap">${fm(-r[5])}</td><td class="px-3 py-1.5">${esc(r[3])}</td><td class="px-3 py-1.5 whitespace-nowrap">${brd(r[1])}</td><td class="px-3 py-1.5">${esc(cat(r))}</td></tr>`).join('')||'<tr><td colspan="8" class="px-2 py-4 text-center text-slate-500">Nenhum lançamento para os filtros.</td></tr>';
  $$('dres').innerHTML=`<section class="grid lg:grid-cols-2 gap-4 items-stretch"><div class="card flex flex-col"><h2 class="font-semibold mb-2">CATEGORIA TIPO <span class="text-xs font-normal text-slate-500">· ⊞ expande fornecedores · clique no nome para filtrar · clique no valor para ver lançamentos</span></h2>${tbl('<th class="px-3 py-2">CATEGORIA TIPO</th>'+ms.map(m=>`<th class="px-3 py-2 text-right">${lab(m).toUpperCase()}</th>`).join('')+'<th class="px-3 py-2 text-right">TOTAL</th>',pr,1)}</div>
   <div class="card flex flex-col"><h2 class="font-semibold mb-2">FORNECEDORES <span class="text-xs font-normal text-slate-500">· clique numa barra para filtrar</span></h2><div style="max-height:520px;overflow-y:auto"><div style="height:${Math.max(340,sup.length*28+16)}px"><canvas id="dc6"></canvas></div></div></div></section>
   <section class="card"><h2 class="font-semibold mb-2">LANÇAMENTOS <span class="text-xs font-normal text-slate-500">· clique no cabeçalho para ordenar · clique na linha para ver o detalhe</span></h2><div style="max-height:440px;overflow:auto"><table class="w-full text-sm whitespace-nowrap"><thead class="text-xs text-slate-500 text-left sticky top-0 bg-white dark:bg-slate-900"><tr>${th}</tr></thead><tbody>${tr}</tbody><tfoot class="sticky bottom-0 bg-white dark:bg-slate-900 font-bold"><tr class="border-t-2 border-slate-400"><td class="px-3 py-2" colspan="4">TOTAL</td><td class="px-3 py-2 text-right text-rose-600">${fm(tot)}</td><td colspan="3"></td></tr></tfoot></table></div></section>`;
  mk('dc6',bar(sup,V,sup.length,n=>dash.fv('FS',n),FS,true,10))}
 function render(){VIEW.style.maxWidth=tab=='for'?'1900px':'';Object.values(CH).forEach(c=>c.destroy());CH={};VIEW.innerHTML=head()+(tab=='exe'?exe():tab=='sal'?sal():forn());if(tab=='for')fres()}
 /* ---------- janela de lançamentos (drill-through) ---------- */
 function modal(h){let m=$$('dash-md');if(!m){m=document.createElement('div');m.id='dash-md';m.className='hidden fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/60';m.onclick=e=>{if(e.target===m)dash.cl()};document.body.appendChild(m);
   document.addEventListener('keydown',e=>{if(e.key=='Escape')dash.cl()})}m.innerHTML=h;m.classList.remove('hidden')}
 const dcols=['DATA','ORIGEM','TIPO','TÍTULO','PARCELA','FORNECEDOR / CLIENTE','HISTÓRICO','CATEGORIA','VALOR'];
 function openD(t,rows){DCUR={t,rows:rows.slice().sort((a,b)=>b[1].localeCompare(a[1])||Math.abs(b[5])-Math.abs(a[5])),q:''};
  modal(`<div class="card w-full max-w-7xl flex flex-col" style="max-height:90vh"><div class="flex flex-wrap items-center gap-2 mb-3"><div class="mr-auto"><h2 class="text-lg font-bold">${esc(t)}</h2><p id="dd-sub" class="text-xs text-slate-500"></p></div>
   <input id="dd-q" class="inp" placeholder="🔍 Filtrar lançamentos..." oninput="dash.dq(this.value)"><button class="btn2" onclick="dash.dx()">Excel</button><button class="btn" onclick="dash.cl()">Fechar ✕</button></div>
   <div class="overflow-auto" style="flex:1"><table class="w-full text-sm"><thead class="text-xs text-slate-500 text-left sticky top-0 bg-white dark:bg-slate-900"><tr>${dcols.map((c,i)=>`<th class="px-2 py-1.5 whitespace-nowrap ${i==8?'text-right':''}">${c}</th>`).join('')}</tr></thead><tbody id="dd-body"></tbody></table></div></div>`);fillD()}
 function fillD(){const q=N(DCUR.q),rs=DCUR.rows.filter(r=>!q||N([nome(r),r[3],cat(r),r[6],r[7]].join(' ')).includes(q));DCUR.view=rs;
  $$('dd-body').innerHTML=rs.map(r=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 whitespace-nowrap">${brd(r[1])}</td><td class="px-2 py-1">${og(r)}</td><td class="px-2 py-1">${esc(r[6])}</td><td class="px-2 py-1">${esc(r[7])}</td><td class="px-2 py-1">${esc(r[8])}</td><td class="px-2 py-1">${esc(nome(r))}</td><td class="px-2 py-1">${esc(r[3])}</td><td class="px-2 py-1">${esc(cat(r))}</td><td class="px-2 py-1 text-right whitespace-nowrap${neg(sv(r))}">${fm(sv(r))}</td></tr>`).join('')||'<tr><td colspan="9" class="px-2 py-4 text-center text-slate-500">Nenhum lançamento.</td></tr>';
  $$('dd-sub').textContent=rs.length+' lançamento(s) · total '+fr(rs.reduce((t,r)=>t+sv(r),0))+' (entradas +, saídas −)'}
 /* ---------- leitura da planilha ---------- */
 const iso=v=>v instanceof Date?(isNaN(v)?'':v.toISOString().slice(0,10)):(typeof v=='string'&&/^\d{5}(\.\d+)?$/.test(v.trim()))?iso(+v):typeof v=='number'?new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10):/^\d{2}\/\d{2}\/\d{4}/.test(String(v))?String(v).slice(0,10).split('/').reverse().join('-'):/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10):'';
 const cn_=k=>N(k).replace(/[^a-z0-9]/g,''),
  AL={dtbaixa:'Dt Baixa',databaixa:'Dt Baixa',datadabaixa:'Dt Baixa',dtdabaixa:'Dt Baixa',dtpagamento:'Dt Baixa',datapagamento:'Dt Baixa',dtpagto:'Dt Baixa',
   totalbaixado:'Total Baixado',valorbaixado:'Total Baixado',vlrbaixado:'Total Baixado',vlbaixado:'Total Baixado',totalpago:'Total Baixado',
   valororiginal:'Valor Original',vlroriginal:'Valor Original',vloriginal:'Valor Original',valor:'Valor Original',
   natureza:'Natureza',historico:'Historico',nomeclifor:'NOME CLI/FOR',nomefornecedor:'NOME CLI/FOR',nomecliente:'NOME CLI/FOR',nomeforcli:'NOME CLI/FOR',
   tp:'TP',tipo:'TIPO',numero:'Numero',prc:'Prc',contabanco:'Conta Banco',classeconta:'CLASSE CONTA'},
  rw=rs=>rs.map(r=>{const o={};Object.keys(r).forEach(k=>{const a=AL[cn_(k)];if(a&&!(a in o))o[a]=r[k];o[k]=r[k]});return o}),
  num=v=>{if(typeof v=='number')return v;let s=String(v==null?'':v).trim();if(!s)return NaN;const ng=/^\(.*\)$/.test(s)||/^-/.test(s);s=s.replace(/[^0-9.,]/g,'');
   if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');
   else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=parseFloat(s);return isNaN(n)?NaN:ng?-Math.abs(n):n};
 function parse(wb){const sh=k=>wb.SheetNames.find(n=>N(n).includes(k)),js=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:'',raw:true}),sp=sh('plano'),pl={},out=[],t=x=>String(x==null?'':x).trim(),inv=[],cta=[];
  const px={};if(sp)js(sp).forEach(r=>{const k=t(r['NATUREZA']),c=t(r['CATEGORIA']),f=t(r['CATEGORIA FLUXO DE CAIXA']);if(k)pl[k]=c;if(k&&f)px[k]=f});
  [['R','receb'],['P','pag']].forEach(([s,k])=>{const n=sh(k);if(n)rw(js(n)).forEach(r=>{const d=iso(r['Dt Baixa']),v=r['Total Baixado']===''?r['Valor Original']:r['Total Baixado'];if(!d||v===''||isNaN(num(v)))return;
   out.push([s,d,t(r['NOME CLI/FOR']),t(r['Historico']).slice(0,120),t(r['Natureza']),Math.round(num(v)*100)/100,t(r['TP']),t(r['Numero']),t(r['Prc']),nc(r['Conta Banco'])])})});
  if(!out.length)throw new Error('Não encontrei as abas "Contas a Receber (Realizado)" e "Contas a Pagar (Realizado)" com as colunas Dt Baixa e Total Baixado. Abas deste arquivo: '+wb.SheetNames.join(' | ')+'. '+[['receb'],['pag']].map(([k])=>{const n=sh(k);if(!n)return '';const rs=js(n),r0=rw(rs)[0]||{};return '['+n+'] colunas: '+Object.keys(rs[0]||{}).slice(0,12).join(' | ')+' · 1ª linha: Dt Baixa='+JSON.stringify(r0['Dt Baixa'])+', Total Baixado='+JSON.stringify(r0['Total Baixado'])+', Valor Original='+JSON.stringify(r0['Valor Original'])}).join(' ; '));
  const sc=sh('bancaria');if(sc)js(sc).forEach(r=>{const c=nc(r['CONTA']);if(c){const nk=Object.keys(r).find(k=>/nome|titular|apelido|descri|identific|entidade|finalidade/.test(N(k)));const ck=Object.keys(r).find(k=>/classe|tipo/.test(N(k)));cta.push({c,b:t(r['BANCO']),a:t(r['AGENCIA']),n:nk?t(r[nk]):'',k:ck?t(r[ck]):''})}});
  const cm={};[['receb'],['pag']].forEach(([k])=>{const n=sh(k);if(n)rw(js(n)).forEach(r=>{const c=nc(r['Conta Banco']),v=t(r['CLASSE CONTA']);if(c&&v)cm[c]=v})});cta.forEach((a,i)=>{if(!a.k)a.k=cm[a.c]||DK[i]||''});
  if(!cta.length)[...new Set(out.map(r=>r[9]).filter(Boolean))].forEach((c,i)=>cta.push({c,b:'',a:'',n:'',k:DK[i]||''}));
  const si=sh('investimento');if(si)rw(js(si)).forEach(r=>{const d=iso(r['Dt Baixa']),v=r['Total Baixado']===''?r['Valor Original']:r['Total Baixado'];if(!d||v===''||isNaN(num(v)))return;
   const nt=t(r['Natureza']),h=t(r['Historico']),tp=N(r['TIPO']),kd=nt=='9.0102'?'ap':nt=='9.0101'?'rs':nt=='1.0301'?'rd':nt=='2.9905'?'ir':tp=='entrada'?'ap':'rs',cn=t(r['Conta Banco']),H=N(h),
    pc={'130105650':'CDB','1301056500':'COMPROMISSADA','013010565':'CONTAMAX'}[cn]||'',pr=/compr/.test(H)?'COMPROMISSADA':/cdb/.test(H)?'CDB':/contamax|automatico/.test(H)?'CONTAMAX':pc||'CONTAMAX';
   inv.push([kd=='ap'||kd=='rd'?'R':'P',d,pr,h.slice(0,120),nt,Math.round(num(v)*100)/100,'INV','','',cn,{ap:'Aplicação',rs:'Resgate',rd:'Rendimento',ir:'IR sobre resgate'}[kd],kd,pc])});
  return{r:out,p:Object.keys(pl).length?pl:PL,x:Object.keys(px).length?px:PX,i:inv,c:cta}}

 const TB='dashboard_dados',nv=()=>typeof sb_!='undefined'&&sb_?sb_:null;let NUV='',NST='';
 function aplica(x){TM=[];RA=x.r;PL=x.p;PX=x.x;IV0=x.i||[];CTA=x.c||[];CT=CTA[0]?CTA[0].c:'';flt();if(tab=='sal'){CTP=CT;CT='';flt()}lastPer();FC='';FS='';FQ=''}
 const fdh=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
 async function nuvem(){const c=nv();if(!c)return;try{const{data,error}=await c.from(TB).select('dados,arquivo,atualizado_em').eq('id',1).maybeSingle();if(error)throw error;
   if(data&&data.dados&&data.dados.r&&data.dados.r.length){NUV=fdh(data.atualizado_em)+(data.arquivo?' · '+data.arquivo:'');if(data.atualizado_em!=NST){NST=data.atualizado_em;aplica(data.dados);try{localStorage.setItem(KEY,JSON.stringify(data.dados))}catch(e){}}render()}
   else if(!RA.length)render()}catch(e){MSG='Não consegui carregar a base publicada: '+(e.message||e)+'. Confira se o SQL supabase/dashboard-dados.sql foi executado.';render()}}
 function ing(buf,orig){try{const x=parse(XLSX.read(buf,{type:'array'}));aplica(x);
   const sem=R.filter(r=>!PL[r[4]]).length;MSG=RA.length+' lançamentos + '+IV0.length+' de investimento lidos de '+orig+' (base até '+brd(maxD())+', conta '+(CT||'todas')+')'+(sem?' · '+sem+' sem natureza no Plano de Naturezas':'')+'.';
   try{localStorage.setItem(KEY,JSON.stringify(x))}catch(e){}
   const c=nv();if(c){const M0=MSG;MSG+=' Publicando para todos…';render();c.from(TB).upsert({id:1,dados:x,arquivo:orig}).select('atualizado_em').single().then(({data,error})=>{if(error){MSG=M0+' ⚠ Não publicou para os demais usuários: '+error.message;}else{NST=data.atualizado_em;NUV=fdh(data.atualizado_em)+' · '+orig;MSG=M0+' ✔ Publicado para todos os usuários.'}render()});return}
  }catch(e){MSG='Erro ao ler a planilha: '+e.message}render()}
 const refresh=()=>{if(tab=='for'){const e=$$('dfc');if(e)e.value=FC;fres()}else render()};
 CT=CTA[0]?CTA[0].c:'';CTP=CT;flt();lastPer();
 window.dash={show(){render();nuvem()},t(x){if(x=='sal'&&tab!='sal'){CTP=CT;CT='';flt()}else if(x!='sal'&&tab=='sal'){CT=CTP;flt()}MT[tab]=M;M=x in MT?MT[x]:(tab=x,dM());tab=x;render()},
  tl(){TL=!TL;render()},tm(m){TM=TM.includes(m)?TM.filter(x=>x!=m):TM.concat(m).slice(-2);TM.sort();render()},tc(){TM=[];render()},
  go(c){CT=c;CTP=c;tab='exe';flt();render()},
  f(k,v){if(k=='Y'){Y=v;M=''}else if(k=='CT'){CT=v;CTP=v;flt();FC='';FS=''}else if(k=='M')M=(v==M?'':v);render()},
  fv(k,v,set){if(k=='FC')FC=set?v:(FC==v?'':v);else FS=set?v:(FS==v?'':v);refresh()},fk(k,i){this.fv(k,KEYS[i])},
  rm(k){if(k=='M'){M='';render();return}if(k=='FC')FC='';else if(k=='FS')FS='';else{FQ='';const e=$$('dq');if(e)e.value=''}refresh()},
  clr(){FC='';FS='';FQ='';lastPer();render()},q(v){FQ=v;fres()},ok(i){OPEN[KEYS[i]]=!OPEN[KEYS[i]];fres()},x(k){EX[k]=!EX[k];render()},xa(v){SKS.concat(CTA.map(a=>'a_'+a.c)).forEach(k=>EX[k]=v);if(v)CTA.forEach(a=>['ent','sai','inv','tr','iv'].forEach(g=>EX['a_'+a.c+'_'+g]=true));else Object.keys(EX).filter(k=>k.startsWith('a_')).forEach(k=>EX[k]=false);render()},
  s(k){if(SK==k)SD=-SD;else{SK=k;SD=1}fres()},
  dr(i){const sp=DRL[i];if(sp)openD(sp.t,src(sp.s).filter(sp.f))},o2(t,f,s){openD(t,src(s).filter(f))},
  o3(t){const ms=scope().map(x=>x.m),q=r=>!FQ||N(nome(r)+' '+r[3]).includes(N(FQ));openD(t,R.filter(r=>FOR(r)&&inS(r,ms)&&q(r)&&(!FC||cat(r)==FC)&&(!FS||nome(r)==FS)))},
  det(i){const r=TBL[i];if(!r)return;const L=[['Tipo',r[6]],['Título',r[7]],['Parcela',r[8]],['Fornecedor / Cliente',nome(r)],['Valor',fr(sv(r))],['Data do pagamento',brd(r[1])],['Natureza',r[4]],['Categoria serviço',cat(r)],['Histórico',r[3]]];
   modal(`<div class="card w-full max-w-lg"><h2 class="text-lg font-bold mb-3">Detalhe do lançamento</h2><dl class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">${L.map(x=>`<dt class="text-slate-500 text-xs uppercase pt-0.5">${x[0]}</dt><dd class="col-span-2 break-words">${esc(x[1])||'—'}</dd>`).join('')}</dl><div class="flex justify-end mt-4"><button class="btn" onclick="dash.cl()">Fechar</button></div></div>`)},
  cl(){const m=$$('dash-md');if(m)m.classList.add('hidden')},dq(v){if(DCUR){DCUR.q=v;fillD()}},
  dx(){if(!DCUR)return;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((DCUR.view||DCUR.rows).map(r=>({DATA:brd(r[1]),ORIGEM:og(r),TIPO:r[6],'TÍTULO':r[7],PARCELA:r[8],'FORNECEDOR / CLIENTE':nome(r),'HISTÓRICO':r[3],CATEGORIA:cat(r),VALOR:sv(r)}))),'Lançamentos');saveAs('lancamentos_fluxo_caixa.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}))},
  up(i){if(ROLE!='admin'){i.value='';return}const fl=i.files[0];i.value='';if(!fl)return;const rd=new FileReader();rd.onload=()=>ing(rd.result,fl.name);rd.readAsArrayBuffer(fl)},
  xl(){const s=scope(),wb=XLSX.utils.book_new(),ms=s.map(x=>x.m);XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(s.map(x=>({'Mês/Ano':lab(x.m),'Saldo Inicial':x.si,'Entradas':x.ent,'Saídas':-x.sai,'Investimento (posição)':x.inv,'Saldo Final':x.sf}))),'Resumo');
   XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(R.filter(r=>inS(r,ms)).map(r=>({Data:brd(r[1]),Origem:og(r),Tipo:r[6],'Título':r[7],Parcela:r[8],Fornecedor_Cliente:nome(r),Histórico:r[3],Categoria:cat(r),Classe:{ent:'Entrada',sai:'Saída',inv:'Investimento',tr:'Transferência'}[cls(r)],Valor:r[5]}))),'Lançamentos');
   if(IV.length){const S=ivSerie(),rw=[];PR.concat(['TOTAL']).forEach(p=>S[p].filter(b=>ms.includes(b.m)).forEach(b=>rw.push({Produto:p,'Mês/Ano':lab(b.m),'Saldo inicial':b.si,'Aplicações':b.ap,'Resgates':-b.rs,'Rendimentos':b.rd,'IR sobre resgate':-b.ir,'Saldo final':b.sf})));
   XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rw),'Saldos');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(IV.filter(r=>inS(r,ms)).map(r=>({Data:brd(r[1]),Produto:r[2],Tipo:r[10],Histórico:r[3],Natureza:r[4],'Conta Banco':r[9],Valor:sv(r)}))),'Investimentos')}
   saveAs('dashboard_fluxo_caixa.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}))},calc:{serie,kpis:()=>kpis(),posInv,ivSerie,confer,posAt,setCT:v=>{CT=v;flt()},rows:()=>R,iv:()=>IV}};
})();
