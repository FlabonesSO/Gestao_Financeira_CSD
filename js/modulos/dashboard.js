/* Módulo Dashboard Financeiro — Fluxo de Caixa Realizado (interativo).
   MÓDULO ISOLADO: tudo dentro da função; expõe só window.dash. Usa do núcleo: N, saveAs, PERM.
   Base (Upload, só administrador): planilha com abas "Contas a Receber (Realizado)", "Contas a Pagar (Realizado)" e "Plano de Naturezas".
   Parâmetro de CONTA: o painel usa por padrão a conta principal (1ª linha da aba CONTA_BANCARIA); cada lançamento carrega 'Conta Banco'.
   Aba INVESTIMENTO alimenta a aba Saldos (CDB / Compromissadas / Contamax): aplicações e rendimentos somam; resgates e IR sobre resgate (nat. 2.9905) DEDUZEM o saldo.
   O SENTIDO de cada linha (entra ou sai do produto) vem da coluna TIPO (ENTRADA / SAÍDA); a Natureza só decide quando o TIPO está vazio. A "Conferência" da aba Saldos pareia a aba INVESTIMENTO com o banco
   (Contas a Pagar/Receber) e aponta o que existe só de um lado.
   Regras (conferidas com o Power BI): Entradas = Receber; Saídas = Pagar; Investimentos (CDB/COMPROMISSADA/CONTAMAX)
   e Transferências entre contas ficam fora de Entradas/Saídas. Saldo Final = Saldo Inicial + Entradas − Saídas − variação aplicada + transferências.
   Interação: clique em cartões, células da tabela e barras dos gráficos abre a janela com os lançamentos do PERÍODO FILTRADO (Ano/Mês ou linha do tempo). Nos valores de posição (saldo, Aplicado) a janela traz a ponte
   "posição anterior + movimento do período = posição" e o botão "Acumulado" (tudo que compõe o saldo);
   na aba Fornecedores, clique em fornecedor/categoria filtra tudo (clique de novo para limpar). */
(() => {
 'use strict';
 const VIEW=document.querySelector('[data-view="dash"]'),KEY='csd_dash_v4',INV=['CDB','COMPROMISSADA','CONTAMAX'],
  MN=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
 let PL={},PX={},RA=[],IV0=[],CTA=[],R=[],IV=[],CT='',CTP='',SKS=[],MT={},CH={},tab='exe',Y='',M='',FQ='',FC='',FS='',MSG='',OPEN={},EX={ent:1,sai:1,tr:1,p_TOTAL:1},SK='v',SD=1,DRL=[],KEYS=[],DCUR=null,TBL=[],TL=false,TM=[],FMT=0;
 /* linha: [origem R/P, data, nome, histórico, natureza, valor, tipo(TP), título, parcela, conta]
    linha de INVESTIMENTO (IV): R=entra no produto (aplicação/rendimento), P=sai (resgate/IR); [..., conta, rótulo, tipo(ap|rs|rd|ir), produto pela conta] */
 try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.r&&s.r.length){RA=s.r;PL=s.p||PL;PX=s.x||PX;IV0=s.i||[];CTA=s.c&&s.c.length?s.c:CTA;FMT=s.v||1}}catch(e){}
 const $$=id=>document.getElementById(id),mes=d=>d.slice(0,7),lab=m=>MN[+m.slice(5)-1]+'/'+m.slice(0,4),brd=d=>d.split('-').reverse().join('/'),
  /* r2 = centavos exatos: soma de decimais em ponto flutuante deixa resíduo (ex.: saldo que fecha em 0,00 sai como -0,0000000037); todo total/saldo passa por aqui e o zero sai sem sinal (nunca -0) */
  r2=n=>{const a=Math.abs(+n||0),x=Math.round(+(a*100).toPrecision(15))/100;return x===0?0:n<0?-x:x},
  z=n=>Math.abs(+n||0)<.005?0:+n,fm=n=>z(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),fr=n=>z(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
  mi=n=>Math.abs(n)>=1e6?(n/1e6).toFixed(2).replace('.',',')+' Mi':(+n||0).toLocaleString('pt-BR',{maximumFractionDigits:0}),sum=(a,k)=>r2(a.reduce((t,x)=>t+x[k],0)),
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
  NOFOR=r=>cat(r)=='Distribuição Antecipada'||r[4]=='2.9008'||isTr(r),FOR=r=>cls(r)=='sai'&&!NOFOR(r),specF=(t,f,s,st)=>(DRL.push({t,f,s,st}),DRL.length-1),src=s=>s=='I'?IV:R,
  /* JANELA DE LANÇAMENTOS = SÓ O PERÍODO FILTRADO (Ano/Mês ou linha do tempo). Para valores de POSIÇÃO (saldo da conta, Aplicado, Saldo Final) a lista continua sendo a do período,
     mas a janela mostra a ponte "posição antes + movimento do período = posição até" (fecha com o número do cartão) e o botão "Acumulado" para ver tudo que compõe o saldo.
     g = filtro de conta/produto SEM data · s = 'I' (aba INVESTIMENTO) ou vazio (lançamentos bancários) · ms = meses do período · P = rótulo do período · n = nome da posição · sg = -1 só no fallback sem aba INVESTIMENTO */
  specS=(t,g,s,ms,P,n,sg)=>specF(t,r=>g(r)&&inS(r,ms),s,{g,ms,P,n,sg}),
  mkSt=(k,s)=>{const a=src(s),m0=k.ms[0],m1=k.ms[k.ms.length-1],sg=k.sg||1,sm=l=>r2(sg*l.reduce((t,r)=>t+sv(r),0)),
   ant=a.filter(r=>k.g(r)&&mes(r[1])<m0),mov=a.filter(r=>k.g(r)&&inS(r,k.ms)),mid=a.filter(r=>k.g(r)&&mes(r[1])>m0&&mes(r[1])<=m1&&!k.ms.includes(mes(r[1]))),all=a.filter(r=>k.g(r)&&mes(r[1])<=m1);
   return{all,na:ant.length,ant:sm(ant),mov:sm(mov),gap:sm(mid),fim:sm(all),n:k.n,P:k.P,a:lab(m0),z:lab(m1)}},K=s=>(KEYS.push(s),KEYS.length-1),neg=v=>z(v)<0?' text-rose-600':'';
 /* série mensal acumulada (independe dos filtros) */
 function posAt(m){const o={CDB:0,COMPROMISSADA:0,CONTAMAX:0};IV.forEach(r=>{if(mes(r[1])<=m)o[r[2]]=(o[r[2]]||0)+sv(r)});Object.keys(o).forEach(p=>o[p]=r2(o[p]));return o}
 function serie(){const by={};IV.forEach(r=>{by[mes(r[1])]??={ent:0,sai:0,inv:0,tr:0}});R.forEach(r=>{const m=mes(r[1]),k=cls(r),b=by[m]??={ent:0,sai:0,inv:0,tr:0};
   if(k=='ent'||k=='sai')b[k]+=r[5];else if(k=='inv')b.inv+=r[0]=='P'?r[5]:-r[5];else b.tr+=r[0]=='R'?r[5]:-r[5]});
  let si=0,pos=0;return Object.keys(by).sort().map(m=>{const b=by[m],ent=r2(b.ent),sai=r2(b.sai),dinv=r2(b.inv),tr=r2(b.tr);pos=r2(pos+dinv);const sf=r2(si+ent-sai-dinv+tr),o={m,si,ent,sai,inv:IV.length?r2(Object.values(posAt(m)).reduce((t,v)=>t+v,0)):pos,sf,dinv,tr};si=sf;return o})}
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
 /* cartões de valor: selo com ícone (SVG de traço, herda a cor do selo) + NOME em destaque (negrito, maiúsculas, cresce com a largura do cartão) + valor numa linha só que se ajusta à largura.
    i = índice de lançamentos (abre a janela de detalhe) ou texto com o comando do clique; sem i o cartão não é clicável. */
 const SV_=d=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
  IP={cofre:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
   sobe:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
   desce:'<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
   cofrinho:'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
   bandeira:'<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.3 2q2 0 3.1-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.5"/>',
   recibo:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>'},
  IC=Object.fromEntries(Object.entries(IP).map(([k,v])=>[k,SV_(v)])),
  TOM={azul:'bg-sky-500/15 text-sky-600 dark:text-sky-300',ver:'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',verm:'bg-rose-500/15 text-rose-600 dark:text-rose-400',amb:'bg-amber-500/15 text-amber-600 dark:text-amber-400',ind:'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'};
 const kp=(t,v,c,i,ic,tom,s,mx)=>{
  const body=`<div class="w-full" style="container-type:inline-size"><div class="flex items-center gap-2.5"><span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center ${TOM[tom]||TOM.ind}">${IC[ic]||''}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-[13px] text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,7.4cqw,1.04rem)">${t}${i==null?'':'&nbsp;<span class="font-normal text-slate-400">↗︎</span>'}</div></div>
   <div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl ${c||''}" style="font-size:clamp(.8rem,10.2cqw,${mx||1.6}rem)">${v}</div>${s?`<div class="text-xs text-slate-500 mt-1">${s}</div>`:''}</div>`;
  return i==null?`<div class="card py-4 min-w-0 flex flex-col justify-center">${body}</div>`:`<button type="button" class="card py-4 min-w-0 w-full text-left flex flex-col justify-center cursor-pointer hover:ring-2 hover:ring-indigo-500 transition" title="Clique para ver os lançamentos" onclick="${typeof i=='number'?'dash.dr('+i+')':i}">${body}</button>`};
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
  return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Dashboard Financeiro</h1><p class="text-sm text-slate-500">Fluxo de Caixa Realizado · atualizado até a data-base: <b>${R.length||IV.length?brd(maxD()):'—'}</b> · ${ctaTxt()}</p></div>
  ${tab=='sal'?'':`<label class="text-xs text-slate-500">Conta <select class="inp ml-1" title="Conta bancária usada como parâmetro" onchange="dash.f('CT',this.value)">${CTA.map((a,i)=>`<option value="${a.c}" ${a.c==CT?'selected':''}>${a.c}${a.n?' · '+esc(a.n):''}${a.k?' · '+esc(a.k):i==0?' · principal':''}</option>`).join('')}<option value="" ${CT?'':'selected'}>Todas as contas</option></select></label>`}
  <label class="text-xs text-slate-500">Ano <select class="inp ml-1" ${tlOn()?'disabled title="A linha do tempo está filtrando os meses"':''} onchange="dash.f('Y',this.value)">${ys.map(y=>`<option ${y==Y?'selected':''}>${y}</option>`).join('')}</select></label>
  <label class="text-xs text-slate-500">Mês <select class="inp ml-1" ${tlOn()?'disabled title="A linha do tempo está filtrando os meses"':''} onchange="dash.f('M',this.value)"><option value="">Todos</option>${mo.map(m=>`<option value="${m.slice(5)}" ${m.slice(5)==M?'selected':''}>${lab(m)}</option>`).join('')}</select></label>
  ${tab=='exe'?`<button class="${TL||TM.length?'btn':'btn2'}" title="Filtra 2 meses numa linha do tempo" onclick="dash.tl()">🕒 Linha do tempo${TM.length?' · '+TM.map(lab).join(' + '):''}</button>`:''}
  <button class="btn2" data-perm="dash.publicar" title="Lê a planilha e publica a base para todos os usuários" onclick="document.getElementById('dash-fi').click()">⬆ Atualizar base</button><input id="dash-fi" type="file" accept=".xlsx,.xls" class="hidden" onchange="dash.up(this)"><button class="btn2" onclick="dash.xl()">Excel</button></div>
  ${NUV?`<div class="text-xs text-slate-500">Base publicada em ${esc(NUV)}</div>`:''}
  ${!RA.length&&!IV0.length?`<div class="text-sm rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2">Nenhuma base carregada ainda. ${PERM.tem('dash.publicar')?'Clique em “Atualizar base” e escolha a planilha BASE_FLUXO_DE_CAIXA_REALIZADO.xlsx.':'Peça ao administrador para publicar a planilha.'}</div>`:''}
  ${MSG?`<div class="text-sm rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-2">${esc(MSG)}</div>`:''}
  ${IV0.length&&FMT<2?`<div class="text-sm rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2">⚠ Esta base foi publicada por uma versão anterior do cálculo de investimentos e o <b>Aplicado</b> pode estar errado. ${PERM.tem('dash.publicar')?'Clique em “⬆ Atualizar base” e envie a planilha de novo.':'Peça ao administrador para enviar a planilha de novo.'}</div>`:''}
  <div class="flex flex-wrap gap-2">${[['exe','📊','Visão executiva'],['sal','🏦','Saldos'],['for','🧾','Saída · Fornecedores']].map(t=>`<button class="${tab==t[0]?'btn':'btn2'}" onclick="dash.t('${t[0]}')"><span class="mr-1">${t[1]}</span>${t[2]}</button>`).join('')}</div>`}
 /* ---------- filtro: linha do tempo (até 2 meses) ---------- */
 function tlPanel(){const ms=allM(),ys=[...new Set(ms.map(m=>m.slice(0,4)))],chip=m=>{const on=TM.includes(m);return `<button class="px-2.5 py-1 rounded-md text-xs font-medium border ${on?'bg-indigo-600 text-white border-indigo-600':'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}" title="${lab(m)}" onclick="dash.tm('${m}')">${MN[+m.slice(5)-1]}</button>`};
  return `<section class="card space-y-2"><div class="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Linha do tempo · selecione até <b>2 meses</b> para filtrar o relatório${TM.length?' · filtrando: <b class="text-indigo-500">'+TM.map(lab).join(' + ')+'</b>':' · sem seleção, vale o filtro de Ano/Mês'}</span>${TM.length?'<button class="btn2 ml-auto" onclick="dash.tc()">Limpar</button>':''}</div>
   <div class="space-y-1.5">${ys.map(y=>`<div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs text-slate-500 w-10">${y}</span>${ms.filter(m=>m.startsWith(y)).map(chip).join('')}</div>`).join('')}</div></section>`}
 /* ---------- Visão executiva ---------- */
 function exe(){const k=kpis(),s=scope();if(!k)return '<div class="card">Sem dados no período.</div>';DRL=[];KEYS=[];
  const ms=s.map(x=>x.m),last=ms[ms.length-1],P=per(s),ent=grp(R.filter(r=>cls(r)=='ent'&&inS(r,ms)),nome,r=>r[5]);
  /* Aplicado: a janela lista os lançamentos de investimento do PERÍODO filtrado (e mostra a ponte posição anterior + movimento = posição); o botão "Acumulado" mostra tudo que compõe a posição */
  const apl=(m_,P_)=>IV.length?['Aplicado · movimentação · '+P_,()=>true,'I',m_,P_,'Aplicado',1]:['Investimentos · movimentação · '+P_,r=>cls(r)=='inv','',m_,P_,'Aplicado',-1],
   dI=specS(...apl(ms,P)),cf=PERM.admin?confBanco(last,CT):null,
   aviso=cf&&(cf.solo.length||Math.abs(cf.dif)>=.005)?`<span class="text-amber-600 dark:text-amber-400" title="A aba INVESTIMENTO e o banco (Contas a Pagar/Receber) não fecham. Veja a Conferência na aba Saldos.">⚠ ${dv(cf.dif)} · ver Conferência (aba Saldos)</span>`:'';
  const cell=(i,v,b)=>z(v)==0?`<td class="px-2 py-1.5 text-right ${b?'font-bold':''}">0,00</td>`:`<td class="px-2 py-1.5 text-right cursor-pointer hover:bg-indigo-500/10 ${b?'font-bold':''}${neg(v)}" onclick="event.stopPropagation();dash.dr(${i})">${fm(v)}</td>`;
  const tl=r=>isTr(r)?cat(r)+' · '+trLab(r):cat(r),
  blk=(t,cl,sg,key,lf)=>{const gc=r=>lf?lf(r):cat(r),o={};R.filter(r=>cls(r)==cl&&inS(r,ms)).forEach(r=>{const c=gc(r),b=o[c]??={},m=mes(r[1]);b[m]=(b[m]||0)+sg(r)});
   const cs=Object.keys(o).sort((a,b)=>a.localeCompare(b,'pt')),tot=ms.map(m=>cs.reduce((a,c)=>a+(o[c][m]||0),0));
   let h=`<tr class="bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer" onclick="dash.x('${key}')"><td class="px-2 py-1.5 whitespace-nowrap">${EX[key]?'▾':'▸'} ${t}</td>${tot.map((v,j)=>cell(specF(t+' · '+lab(ms[j]),r=>cls(r)==cl&&mes(r[1])==ms[j]),v,1)).join('')}${cell(specF(t+' · '+P,r=>cls(r)==cl&&inS(r,ms)),tot.reduce((a,v)=>a+v,0),1)}</tr>`;
   if(EX[key])h+=cs.map(c=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1.5 pl-7 cursor-pointer hover:underline" onclick="dash.dr(${specF(c+' · '+P,r=>cls(r)==cl&&gc(r)==c&&inS(r,ms))})">${esc(c)}</td>${ms.map(m=>cell(specF(c+' · '+lab(m),r=>cls(r)==cl&&gc(r)==c&&mes(r[1])==m),o[c][m]||0)).join('')}${cell(specF(c+' · '+P,r=>cls(r)==cl&&gc(r)==c&&inS(r,ms)),ms.reduce((a,m)=>a+(o[c][m]||0),0))}</tr>`).join('');return h};
  const hd='<th class="px-2 py-1.5">TIPO</th>'+ms.map(m=>`<th class="px-2 py-1.5 text-right cursor-pointer hover:text-indigo-500 ${M&&m.slice(5)==M?'text-indigo-500':''}" title="Clique para filtrar o mês" onclick="dash.f('M','${m.slice(5)}')">${lab(m).toUpperCase()}</th>`).join('')+'<th class="px-2 py-1.5 text-right">TOTAL</th>';
  const sfl=`<tr class="border-t-2 border-slate-400 font-bold"><td class="px-2 py-1.5">SALDO FINAL</td>${s.map(x=>cell(specS('Movimentação · '+lab(x.m)+' (todas as classes)',()=>true,'',[x.m],lab(x.m),'Saldo'),x.sf,1)).join('')}${cell(specS('Movimentação · '+P+' (todas as classes)',()=>true,'',ms,P,'Saldo'),k.sf,1)}</tr>`;
  setTimeout(()=>{
   mk('dc1',{type:'bar',data:{labels:s.map(x=>lab(x.m)),datasets:[{label:'Entradas',data:s.map(x=>x.ent),backgroundColor:G},{label:'Saídas',data:s.map(x=>x.sai),backgroundColor:V},...(s.some(x=>x.tr)?[{label:'Transferências',data:s.map(x=>x.tr),backgroundColor:'#f9a825',datalabels:{display:c=>c.dataset.data[c.dataIndex]!=0}}]:[])]},
    options:baseO({layout:{padding:{top:20}},onClick:(e,els)=>{if(!els.length)return;const m=ms[els[0].index],d=els[0].datasetIndex,k=['ent','sai','tr'][d];dash.o2(['Entradas · ','Saídas · ','Transferências entre contas · '][d]+lab(m),r=>cls(r)==k&&mes(r[1])==m)},plugins:{legend:{display:true,position:'top',align:'start',labels:{color:cor(),font:{size:10},boxWidth:10,boxHeight:10,padding:8}},datalabels:dl()},scales:{x:{...NG},y:{display:false,grace:'20%',...NG}}})});
   mk('dc2',{type:'line',data:{labels:s.map(x=>lab(x.m)),datasets:[{data:s.map(x=>x.inv),borderColor:G,backgroundColor:'rgba(46,125,50,.35)',fill:true,tension:.3,pointRadius:5,pointHoverRadius:8}]},
    options:baseO({layout:{padding:{top:22,right:20}},onClick:(e,els)=>{if(!els.length)return;const m=ms[els[0].index];dash.os(...apl([m],lab(m)))},plugins:{datalabels:{...dl(),align:'top'}},scales:{x:{...NG},y:{display:false,...NG}}})});
   mk('dc3',bar(posInv(),G,8,c=>dash.os('Investimento · '+c+' · '+P,IV.length?r=>r[2]==c:r=>cls(r)=='inv'&&cat(r)==c,IV.length?'I':'',ms,P,c,IV.length?1:-1),null,true));
   mk('dc4',bar(ent,G,8,n=>dash.o2('Entradas · '+n,r=>cls(r)=='ent'&&nome(r)==n&&inS(r,ms)),null,true))},0);
  return `${TL?tlPanel():''}<section class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">${kp('Saldo Inicial',fr(k.si),'',null,'cofre','azul')}${kp('Entradas',fr(k.ent),'text-emerald-600 dark:text-emerald-400',specF('Entradas · '+P,r=>cls(r)=='ent'&&inS(r,ms)),'sobe','ver')}${kp('Saídas',fr(-k.sai),'text-rose-600 dark:text-rose-400',specF('Saídas · '+P,r=>cls(r)=='sai'&&inS(r,ms)),'desce','verm')}${kp('Aplicado',fr(k.inv),'text-emerald-600 dark:text-emerald-400',dI,'cofrinho','amb',aviso)}${kp('Saldo Final',fr(k.sf),'',specS('Movimentação · '+P+' (todas as classes)',()=>true,'',ms,P,'Saldo'),'bandeira','ind')}</section>
  <section class="grid lg:grid-cols-2 gap-4"><div class="card"><h2 class="font-semibold mb-2">Entradas e Saídas <span class="text-xs font-normal text-slate-500">· clique numa barra</span></h2><div class="relative h-72"><canvas id="dc1"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Saldo Acumulado <span class="text-xs font-normal text-slate-500">· detalhe na aba Saldos</span></h2><div class="relative h-72"><canvas id="dc2"></canvas></div></div></section>
  <section class="grid lg:grid-cols-3 gap-4"><div class="card lg:col-span-2"><h2 class="font-semibold mb-2">Fluxo de caixa <span class="text-xs font-normal text-slate-500">· clique em uma categoria ou valor para ver os lançamentos</span></h2>${tbl(hd,blk('ENTRADA','ent',r=>r[5],'ent',tl)+blk('SAÍDAS','sai',r=>-r[5],'sai',tl)+(R.some(r=>cls(r)=='tr')?blk('TRANSFERÊNCIAS ENTRE CONTAS','tr',sv,'tr',trLab):'')+sfl)}</div>
   <div class="space-y-4"><div class="card"><h2 class="font-semibold mb-2">Posição dos investimentos</h2><div class="relative h-44"><canvas id="dc3"></canvas></div></div><div class="card"><h2 class="font-semibold mb-2">Entradas</h2><div class="relative h-44"><canvas id="dc4"></canvas></div></div></div></section>
  `}
 /* ---------- Saldos (conta + investimentos) ---------- */
 function ivSerie(){const all=[...new Set(IV.map(r=>mes(r[1])).concat(R.map(r=>mes(r[1]))))].sort(),o={};
  PR.concat(['TOTAL']).forEach(p=>{let si=0;o[p]=all.map(m=>{const b={m,si,ap:0,rs:0,rd:0,ir:0};IV.forEach(r=>{if(mes(r[1])==m&&(p=='TOTAL'||r[2]==p))b[r[11]]+=r[5]});['ap','rs','rd','ir'].forEach(q=>b[q]=r2(b[q]));b.sf=r2(si+b.ap+b.rd-b.rs-b.ir);si=b.sf;return b})});return o}
 const confer=()=>{const g={},dup=[],mm=IV.filter(r=>r[12]&&r[12]!=r[2]);IV.forEach(r=>{const k=[r[2],r[11],r[5],N(r[3])].join('|');(g[k]??=[]).push(r)});Object.values(g).forEach(a=>{if(a.length>1)dup.push(...a)});return{dup,mm}};
/* ---------- Conferência: aba INVESTIMENTO × lado do banco ----------
    O Aplicado vem da aba INVESTIMENTO. Cada aplicação/resgate dela tem um espelho no banco (Contas a Pagar = aplicação · Contas a Receber = resgate/vencimento, categorias CDB / COMPROMISSADA / CONTAMAX).
    Os dois lados são pareados (mesmo sentido, valor e data; 2ª passada: mesmo valor com até 5 dias de diferença). O que sobra de um lado só é duplicidade ou falta na planilha e soma na diferença.
    Aplicação e resgate de mesmo valor no mesmo dia, ambos sem par, são estorno um do outro: anulam-se e não entram na lista. Rendimento (1.0301) e IR (2.9905) não passam pelo banco e ficam fora do pareamento.
    O painel NÃO descarta linha nenhuma: o Aplicado segue a aba INVESTIMENTO; a conferência só aponta o que não fecha para a planilha-base ser corrigida. */
 const dv=d=>'R$\u00a0'+fm(Math.abs(d))+(d<0?' abaixo':' acima')+' do banco';
 function confBanco(last,conta){
  const inC=r=>conta?r[9]==conta:CTA.some(a=>r[9]==a.c),inI=r=>conta?nc(r[9]).startsWith(conta):CTA.some(a=>nc(r[9]).startsWith(a.c)),iv=IV0.filter(r=>inI(r)&&mes(r[1])<=last),bk=RA.filter(r=>INV.includes(cat(r))&&inC(r)&&mes(r[1])<=last),ai=iv.filter(r=>r[11]=='ap'||r[11]=='rs');
  if(!bk.length||!ai.length)return null;
  const ei=r=>r[0]=='R'?r[5]:-r[5],eb=r=>r[0]=='P'?r[5]:-r[5],ct=v=>Math.round(v*100),sg=v=>v<0?-1:1,key=(e,d,v)=>sg(e)+'|'+d+'|'+ct(v),dd=d=>Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))/864e5,mp=new Map();
  bk.forEach(b=>{const k=key(eb(b),b[1],b[5]);if(!mp.has(k))mp.set(k,[]);mp.get(k).push(b)});
  let a=[],tol=0,est=0;
  ai.forEach(x=>{const l=mp.get(key(ei(x),x[1],x[5]));if(l&&l.length)l.shift();else a.push(x)});
  const b=[...mp.values()].flat();
  a=a.filter(x=>{const j=b.findIndex(y=>sg(eb(y))==sg(ei(x))&&ct(y[5])==ct(x[5])&&Math.abs(dd(y[1])-dd(x[1]))<=5);if(j<0)return true;b.splice(j,1);tol++;return false});
  const canc=(l,ef)=>{for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++)if(l[i][1]==l[j][1]&&ct(l[i][5])==ct(l[j][5])&&sg(ef(l[i]))!=sg(ef(l[j]))){l.splice(j,1);l.splice(i,1);est++;i--;break}};
  canc(a,ei);canc(b,eb);
  const rdir=iv.filter(r=>r[11]=='rd'||r[11]=='ir').reduce((t,r)=>t+sv(r),0),aba=r2(iv.reduce((t,r)=>t+sv(r),0)),banco=r2(bk.reduce((t,r)=>t+eb(r),0)+rdir),
   solo=a.map(x=>({o:'aba',id:x[13]||'',d:x[1],p:x[2],h:x[3],e:ei(x)})).concat(b.map(y=>({o:'banco',id:'',d:y[1],p:cat(y),h:y[3],e:eb(y)}))).sort((x,y)=>x.d.localeCompare(y.d)||x.o.localeCompare(y.o));
  return{aba,banco,dif:r2(aba-banco),solo,est,tol,fl:iv.filter(r=>r[14]),n:ai.length}}
 function confHtml(cf,db){if(!cf)return '';
  const bad=cf.solo.length>0||Math.abs(cf.dif)>=.005,
   lin=cf.solo.slice(0,40).map(x=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 whitespace-nowrap">${x.o=='aba'?'Aba INVESTIMENTO':'Banco (Pagar/Receber)'}</td><td class="px-2 py-1">${esc(x.id||'—')}</td><td class="px-2 py-1 whitespace-nowrap">${brd(x.d)}</td><td class="px-2 py-1">${esc(x.p)}</td><td class="px-2 py-1">${esc(x.h)}</td><td class="px-2 py-1 text-right whitespace-nowrap${neg(x.e)}">${fm(x.e)}</td></tr>`).join('')+(cf.solo.length>40?`<tr><td colspan="6" class="px-2 py-1 text-xs text-slate-500">… e mais ${cf.solo.length-40} linha(s).</td></tr>`:''),
   num_=(t,v,c)=>`<div class="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2"><div class="text-xs text-slate-500">${t}</div><div class="font-bold tabular-nums ${c||''}">${fr(v)}</div></div>`,
   nt=[cf.est?cf.est+' par(es) de estorno (aplicação e resgate iguais no mesmo dia) sem efeito':'',cf.tol?cf.tol+' lançamento(s) com data diferente em até 5 dias (conferidos)':''].filter(Boolean).join(' · ');
  return `<section class="card space-y-3" id="dconf"><div><h2 class="font-semibold">Conferência dos investimentos <span class="text-xs font-normal text-slate-500">· aba INVESTIMENTO × banco (Contas a Pagar/Receber) · até ${db}</span></h2>
   <p class="text-sm mt-1 ${bad?'text-amber-600 dark:text-amber-400':'text-emerald-600 dark:text-emerald-400'}">${bad?`⚠ Não fecha: a aba INVESTIMENTO fica <b>${dv(cf.dif)}</b>. A diferença vem das linhas abaixo, que existem só de um lado.`:`✔ Fecha com o banco: as ${cf.n} aplicações e resgates da aba INVESTIMENTO têm o lançamento correspondente no banco.`}</p></div>
   <div class="grid sm:grid-cols-3 gap-2">${num_('Aplicado pela aba INVESTIMENTO (o valor do painel)',cf.aba)}${num_('Aplicado pelo banco *',cf.banco)}${num_('Diferença',cf.dif,bad?'text-amber-600 dark:text-amber-400':'')}</div>
   ${bad?`<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-2 py-1.5">Onde está</th><th class="px-2 py-1.5">ID</th><th class="px-2 py-1.5">Data</th><th class="px-2 py-1.5">Produto / categoria</th><th class="px-2 py-1.5">Histórico</th><th class="px-2 py-1.5 text-right">Efeito no Aplicado</th></tr></thead><tbody>${lin}</tbody></table></div>
   <p class="text-xs text-slate-500">Se forem duplicidades (ou lançamentos que não aconteceram), corrija a planilha-base e use <b>⬆ Atualizar base</b>. O painel não descarta nenhuma linha sozinho: o Aplicado segue a aba INVESTIMENTO${cf.solo.length&&cf.solo.every(x=>x.o=='aba')?'; sem as linhas da aba acima ele fecharia em '+fr(cf.banco):''}.</p>`:''}
   ${cf.fl.length?`<p class="text-xs text-slate-500">ℹ Em ${cf.fl.length} linha(s) a coluna TIPO contradiz a Natureza; o painel seguiu o <b>TIPO</b>: ${cf.fl.slice(0,8).map(r=>'ID '+esc(r[13]||'—')+' ('+esc(String(r[10]||'').toLowerCase())+' de '+fr(r[5])+' em '+brd(r[1])+')').join(' · ')}${cf.fl.length>8?' …':''}.</p>`:''}
   <p class="text-xs text-slate-500">* aplicações − resgates/vencimentos das contas a pagar/receber + rendimentos − IR sobre resgate (estes dois só existem na aba INVESTIMENTO).${nt?' '+nt+'.':''}</p></section>`}
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
    byC(r=>cls(r)=='ent'&&!isTr(r),'Entradas','ent');byC(r=>cls(r)=='sai'&&!isTr(r),'Saídas','sai');byC(r=>cls(r)=='inv','Resgates & Aplicações','inv');byC(isTr,'Transferências entre contas','tr',lt);
    if(ii.length){const o={};ii.forEach(r=>{o[r[2]]=(o[r[2]]||0)+sv(r)});
     G.push({id:'iv',t:'Saldo no Investimento',col:'a',v:sm(ii,sv),f:mi_,it:PR.filter(p=>o[p]!=null).map(p=>({t:p,v:o[p],f:r=>mi_(r)&&r[2]==p}))})}
    return{G,mc,mi_,cc:sm(rr,sv),ap:sm(ii,sv),ci:sm(rr.filter(bef),sv),ai:sm(ii.filter(bef),sv)}};
  let TC=0,TA=0,TI=0,TJ=0;
  const rows=CTA.map((a,i)=>{const X=acts(a),G=X.G,cc=X.cc,ap=X.ap,k='a_'+a.c,ex=EX[k];TC+=cc;TA+=ap;TI+=X.ci;TJ+=X.ai;SKS.push(k);
   let h=`<tr class="bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer border-t border-slate-200 dark:border-slate-700" onclick="dash.x('${k}')"><td class="px-2 py-1.5 whitespace-nowrap">${ex?'▾':'▸'} ${a.c}${i==0?' ★':''}${a.n?' · '+esc(a.n):''}</td><td class="px-2 py-1.5">${a.k?`<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">${esc(a.k)}</span>`:'<span class="text-slate-400">—</span>'}</td><td class="px-2 py-1.5 font-normal whitespace-nowrap">${esc(BK[a.b]||a.b)} · ag. ${esc(a.a)} <button class="ml-2 text-xs text-indigo-500 hover:underline" title="Abrir a Visão executiva desta conta" onclick="event.stopPropagation();dash.go('${a.c}')">fluxo ↗︎</button></td>${cell(specS('Conta corrente · '+a.c+' · '+P,X.mc,'',ms,P,'Saldo'),cc,1)}${cell(specS('Aplicado · conta '+a.c+' · '+P,X.mi_,'I',ms,P,'Aplicado'),ap,1)}<td class="px-2 py-1.5 text-right${neg(cc+ap)}">${fm(cc+ap)}</td></tr>`;
   if(ex){h+=`<tr class="border-t border-slate-200 dark:border-slate-800 text-slate-500"><td class="px-2 py-1.5 pl-7" colspan="3">Saldo inicial do período</td>${cell(specF(a.c+' · saldo inicial de '+P,r=>X.mc(r)&&bef(r)),X.ci)}${cell(specF(a.c+' · saldo inicial no investimento',r=>X.mi_(r)&&bef(r),'I'),X.ai)}${vz}</tr>`;
    G.forEach(g=>{const gk=k+'_'+g.id,gx=EX[gk];SKS.push(gk);
    h+=`<tr class="border-t border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onclick="dash.x('${gk}')"><td class="px-2 py-1.5 pl-7 font-semibold" colspan="3">${gx?'▾':'▸'} ${g.t}${g.col=='c'?' · '+P:' · saldo final'}</td>${g.col=='c'?cell(specF(a.c+' · '+g.t+' · '+P,g.f),g.v):vz}${g.col=='a'?cell(specS(a.c+' · '+g.t+' · '+P,g.f,'I',ms,P,'Aplicado'),g.v):vz}${vz}</tr>`;
    if(gx)h+=g.it.map(x=>`<tr class="border-t border-slate-100 dark:border-slate-800/60 text-xs"><td class="px-2 py-1 pl-12" colspan="3">${esc(x.t)}</td>${g.col=='c'?cell(specF(a.c+' · '+g.t+' · '+x.t+' · '+P,x.f),x.v):vz}${g.col=='a'?cell(specS(a.c+' · Saldo no Investimento · '+x.t+' · '+P,x.f,'I',ms,P,x.t),x.v):vz}${vz}</tr>`).join('')})}
   return h}).join('');
  const dCt=specS('Conta corrente · todas as contas · '+P,r=>CTA.some(a=>r[9]==a.c),'',ms,P,'Saldo'),dAt=specS('Aplicado · todas as contas · '+P,r=>CTA.some(a=>nc(r[9]).startsWith(a.c)),'I',ms,P,'Aplicado'),
   tt=`<tr class="border-t-2 border-slate-400 font-bold"><td class="px-2 py-1.5" colspan="3">TOTAL (saldo em ${db})</td>${cell(dCt,TC,1)}${cell(dAt,TA,1)}<td class="px-2 py-1.5 text-right${neg(TC+TA)}">${fm(TC+TA)}</td></tr>`;
  return `<section class="card"><div class="flex flex-wrap items-center gap-2 mb-2"><h2 class="font-semibold mr-auto">Contas bancárias <span class="text-xs font-normal text-slate-500">· período <b>${P}</b> · saldo em <b>${db}</b> · ★ principal · ▸ expande o que ocorreu na conta no período · clique no valor para ver os lançamentos do período</span></h2><button class="btn2" onclick="dash.xa(true)">Expandir tudo</button><button class="btn2" onclick="dash.xa(false)">Recolher tudo</button></div>
   ${tbl('<th class="px-2 py-1.5">CONTA / ATIVIDADE</th><th class="px-2 py-1.5">CLASSE</th><th class="px-2 py-1.5">BANCO / AGÊNCIA</th><th class="px-2 py-1.5 text-right">CONTA CORRENTE</th><th class="px-2 py-1.5 text-right">APLICADO</th><th class="px-2 py-1.5 text-right">SALDO TOTAL</th>',rows+tt)}
   </section>${PERM.admin?confHtml(confBanco(last),db):''}`}
 /* ---------- Saída · Fornecedores ---------- */
 function forn(){const ms=scope().map(x=>x.m),cs=[...new Set(R.filter(r=>FOR(r)&&inS(r,ms)).map(cat))].sort((a,b)=>a.localeCompare(b,'pt'));
  return `<section class="grid grid-cols-2 lg:grid-cols-4 gap-3"><div id="dkp" class="contents"></div>
   <div class="card col-span-2 flex flex-wrap items-end gap-3"><label class="text-xs text-slate-500 grow">🔎 Pesquise por fornecedor ou histórico<input id="dq" class="inp w-full mt-1" placeholder="Search" value="${esc(FQ)}" oninput="dash.q(this.value)"></label>
    <label class="text-xs text-slate-500">Categoria Tipo<select id="dfc" class="inp w-full mt-1" onchange="dash.fv('FC',this.value,1)"><option value="">Todos</option>${cs.map(c=>`<option ${c==FC?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    <button class="btn2" onclick="dash.clr()">Limpar filtros</button></div></section> <div id="dchips" class="flex flex-wrap gap-2"></div><div id="dres" class="space-y-4"></div>`}
 function fres(){DRL=[];KEYS=[];const s=scope(),ms=s.map(x=>x.m),base=R.filter(r=>FOR(r)&&inS(r,ms)),q=r=>!FQ||N(nome(r)+' '+r[3]).includes(N(FQ)),
  pv=base.filter(r=>q(r)&&(!FS||nome(r)==FS)),cv=base.filter(r=>q(r)&&(!FC||cat(r)==FC)),af=pv.filter(r=>!FC||cat(r)==FC),tot=-af.reduce((t,r)=>t+r[5],0);
  $$('dkp').innerHTML=kp('Total saídas',fr(tot),'text-rose-600 dark:text-rose-400',"dash.o3('Saídas filtradas')",'desce','verm',per(s),2.1)+kp('Pagamentos (com título)',af.filter(r=>r[7]).length,'',null,'recibo','ind','lançamentos com nº de título',2.1);
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
 function openD(t,rows,st){const so=l=>l.slice().sort((a,b)=>b[1].localeCompare(a[1])||Math.abs(b[5])-Math.abs(a[5]));DCUR={t,rows:so(rows),q:'',mode:'p',st:st?{...st,all:so(st.all)}:null};
  modal(`<div class="card w-full max-w-7xl flex flex-col" style="max-height:90vh"><div class="flex flex-wrap items-center gap-2 mb-3"><div class="mr-auto min-w-0"><h2 class="text-lg font-bold">${esc(t)}</h2><p id="dd-sub" class="text-xs text-slate-500"></p><p id="dd-br" class="text-xs text-slate-600 dark:text-slate-300 mt-1"></p></div>
   <div id="dd-tg" class="flex gap-1"></div><input id="dd-q" class="inp" placeholder="🔍 Filtrar lançamentos..." oninput="dash.dq(this.value)"><button class="btn2" onclick="dash.dx()">Excel</button><button class="btn" onclick="dash.cl()">Fechar ✕</button></div>
   <div class="overflow-auto" style="flex:1"><table class="w-full text-sm"><thead class="text-xs text-slate-500 text-left sticky top-0 bg-white dark:bg-slate-900"><tr>${dcols.map((c,i)=>`<th class="px-2 py-1.5 whitespace-nowrap ${i==8?'text-right':''}">${c}</th>`).join('')}</tr></thead><tbody id="dd-body"></tbody></table></div></div>`);fillD()}
 function fillD(){const st=DCUR.st,ac=!!st&&DCUR.mode=='a',q=N(DCUR.q),rs=(ac?st.all:DCUR.rows).filter(r=>!q||N([nome(r),r[3],cat(r),r[6],r[7]].join(' ')).includes(q));DCUR.view=rs;
  $$('dd-body').innerHTML=rs.map(r=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-2 py-1 whitespace-nowrap">${brd(r[1])}</td><td class="px-2 py-1">${og(r)}</td><td class="px-2 py-1">${esc(r[6])}</td><td class="px-2 py-1">${esc(r[7])}</td><td class="px-2 py-1">${esc(r[8])}</td><td class="px-2 py-1">${esc(nome(r))}</td><td class="px-2 py-1">${esc(r[3])}</td><td class="px-2 py-1">${esc(cat(r))}</td><td class="px-2 py-1 text-right whitespace-nowrap${neg(sv(r))}">${fm(sv(r))}</td></tr>`).join('')||'<tr><td colspan="9" class="px-2 py-4 text-center text-slate-500">Nenhum lançamento.</td></tr>';
  $$('dd-sub').textContent=rs.length+' lançamento(s) · total '+fr(rs.reduce((t,r)=>t+sv(r),0))+' (entradas +, saídas −)'+(st?(ac?' · acumulado até '+st.z:' · só o período filtrado'):'');
  const br=$$('dd-br'),tg=$$('dd-tg'),gp=st&&Math.abs(st.gap)>=.005;
  if(br)br.innerHTML=st?`${esc(st.n)} antes de ${st.a}: <b>${fr(st.ant)}</b> &nbsp;+&nbsp; movimento do período (${esc(st.P)}): <b>${fr(st.mov)}</b>${gp?' &nbsp;+&nbsp; meses não selecionados entre os dois: <b>'+fr(st.gap)+'</b>':''} &nbsp;=&nbsp; ${esc(st.n)} até ${st.z}: <b>${fr(st.fim)}</b>`:'';
  if(tg)tg.innerHTML=st&&(st.na||gp)?`<button class="${ac?'btn2':'btn'}" onclick="dash.dm('p')">Só o período (${DCUR.rows.length})</button><button class="${ac?'btn':'btn2'}" onclick="dash.dm('a')" title="Tudo que compõe o saldo, desde o início da base">Acumulado até ${st.z} (${st.all.length})</button>`:''}
 
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
  [['R','receb'],['P','pag']].forEach(([s0,k])=>{const n=sh(k);if(n)rw(js(n)).forEach(r=>{const d=iso(r['Dt Baixa']),v=r['Total Baixado'];if(!d||v===''||isNaN(num(v)))return;
   /* base de cálculo = colunas Dt Baixa (K), Total Baixado (R) e TIPO (Z). O TIPO dá o sentido: SAÍDA = pagamento (valor negativo), ENTRADA = recebimento; sem TIPO vale a aba de origem */
   const tpo=N(r['TIPO']),s=/^sai/.test(tpo)?'P':/^entr/.test(tpo)?'R':s0;
   out.push([s,d,t(r['NOME CLI/FOR']),t(r['Historico']).slice(0,120),t(r['Natureza']),Math.round(num(v)*100)/100,t(r['TP']),t(r['Numero']),t(r['Prc']),nc(r['Conta Banco'])])})});
  if(!out.length)throw new Error('Não encontrei as abas "Contas a Receber (Realizado)" e "Contas a Pagar (Realizado)" com as colunas Dt Baixa e Total Baixado. Abas deste arquivo: '+wb.SheetNames.join(' | ')+'. '+[['receb'],['pag']].map(([k])=>{const n=sh(k);if(!n)return '';const rs=js(n),r0=rw(rs)[0]||{};return '['+n+'] colunas: '+Object.keys(rs[0]||{}).slice(0,12).join(' | ')+' · 1ª linha: Dt Baixa='+JSON.stringify(r0['Dt Baixa'])+', Total Baixado='+JSON.stringify(r0['Total Baixado'])+', Valor Original='+JSON.stringify(r0['Valor Original'])}).join(' ; '));
  const sc=sh('bancaria');if(sc)js(sc).forEach(r=>{const c=nc(r['CONTA']);if(c){const nk=Object.keys(r).find(k=>/nome|titular|apelido|descri|identific|entidade|finalidade/.test(N(k)));const ck=Object.keys(r).find(k=>/classe|tipo/.test(N(k)));cta.push({c,b:t(r['BANCO']),a:t(r['AGENCIA']),n:nk?t(r[nk]):'',k:ck?t(r[ck]):''})}});
  const cm={};[['receb'],['pag']].forEach(([k])=>{const n=sh(k);if(n)rw(js(n)).forEach(r=>{const c=nc(r['Conta Banco']),v=t(r['CLASSE CONTA']);if(c&&v)cm[c]=v})});cta.forEach((a,i)=>{if(!a.k)a.k=cm[a.c]||DK[i]||''});
  if(!cta.length)[...new Set(out.map(r=>r[9]).filter(Boolean))].forEach((c,i)=>cta.push({c,b:'',a:'',n:'',k:DK[i]||''}));
  const si=sh('investimento');if(si)rw(js(si)).forEach(r=>{const d=iso(r['Dt Baixa']),v=r['Total Baixado'];if(!d||v===''||isNaN(num(v)))return;
   const nt=t(r['Natureza']),h=t(r['Historico']),tp=N(r['TIPO']),cn=t(r['Conta Banco']),H=N(h),
    /* SENTIDO do movimento (é ele que dá o sinal do Aplicado): a coluna TIPO manda — ENTRADA = entra no produto (aplicação), SAÍDA = sai (resgate/vencimento).
       A Natureza (9.0102 = entrada · 9.0101 = saída) só decide quando o TIPO está vazio; sem os dois, vale o texto do histórico. 1.0301 = rendimento e 2.9905 = IR têm rótulo próprio.
       Antes a Natureza mandava e o TIPO era ignorado: uma aplicação lançada com Natureza 9.0101 e TIPO ENTRADA entrava NEGATIVA (derrubava o Aplicado). */
    sT=/^entr/.test(tp)?'ap':/^sai/.test(tp)?'rs':'',sN=nt=='9.0102'?'ap':nt=='9.0101'?'rs':'',
    kd=nt=='1.0301'?'rd':nt=='2.9905'?'ir':sT||sN||(/rendim/.test(H)?'rd':/aplic/.test(H)?'ap':'rs'),
    /* fl = 1: o TIPO e a Natureza se contradizem (o painel seguiu o TIPO) — aparece na Conferência da aba Saldos */
    fl=(sT&&sN&&sT!=sN)||(kd=='rd'&&sT=='rs')||(kd=='ir'&&sT=='ap')?1:0,
    pc={'130105650':'COMPROMISSADA','1301056500':'CDB','013010565':'CONTAMAX','13010565':'CONTAMAX'}[cn]||'',pr=/compr/.test(H)?'COMPROMISSADA':/cdb/.test(H)?'CDB':/contamax|automatico/.test(H)?'CONTAMAX':pc||'CONTAMAX';
   inv.push([kd=='ap'||kd=='rd'?'R':'P',d,pr,h.slice(0,120),nt,Math.round(num(v)*100)/100,'INV','','',cn,{ap:'Aplicação',rs:'Resgate',rd:'Rendimento',ir:'IR sobre resgate'}[kd],kd,pc,t(r['ID']),fl])});
  return{v:2,r:out,p:Object.keys(pl).length?pl:PL,x:Object.keys(px).length?px:PX,i:inv,c:cta}}

 const TB='dashboard_dados',nv=()=>typeof sb_!='undefined'&&sb_?sb_:null;let NUV='',NST='';
 function aplica(x){TM=[];RA=x.r;PL=x.p;PX=x.x;IV0=x.i||[];CTA=x.c||[];FMT=x.v||1;CT=CTA[0]?CTA[0].c:'';flt();if(tab=='sal'){CTP=CT;CT='';flt()}lastPer();FC='';FS='';FQ=''}
 const fdh=s=>{const d=new Date(s);return isNaN(d)?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
 async function nuvem(){const c=nv();if(!c)return;try{const{data,error}=await c.from(TB).select('dados,arquivo,atualizado_em').eq('id',1).maybeSingle();if(error)throw error;
   if(data&&data.dados&&data.dados.r&&data.dados.r.length){NUV=fdh(data.atualizado_em)+(data.arquivo?' · '+data.arquivo:'');if(data.atualizado_em!=NST){NST=data.atualizado_em;aplica(data.dados);try{localStorage.setItem(KEY,JSON.stringify(data.dados))}catch(e){}}render()}
   else if(!RA.length)render()}catch(e){MSG='Não consegui carregar a base publicada: '+(e.message||e)+'. Confira se o SQL supabase/dashboard-dados.sql foi executado.';render()}}
 /* Atualização automática: quando o admin publica uma base nova, quem está com o Dashboard Financeiro aberto recebe sozinho (confere a cada 30 s e ao voltar para a aba do navegador; só baixa a base se o carimbo de publicação mudou) */
 const dashAberto=()=>!!document.querySelector('[data-view="dash"]:not(.hidden)');
 async function confere(){const c=nv();if(!c||document.hidden||!dashAberto())return;
  try{const{data}=await c.from(TB).select('atualizado_em').eq('id',1).maybeSingle();
   if(data&&data.atualizado_em&&data.atualizado_em!=NST){const ant=NST;await nuvem();if(NST!=ant){MSG='🔄 Base atualizada automaticamente (publicada em '+NUV+').';render()}}}catch(e){}}
 setInterval(confere,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)confere()});
 function ing(buf,orig){try{const x=parse(XLSX.read(buf,{type:'array'}));aplica(x);
   const sem=R.filter(r=>!PL[r[4]]).length;const cf=PERM.admin?confBanco(maxD().slice(0,7)):null;
   MSG=RA.length+' lançamentos + '+IV0.length+' de investimento lidos de '+orig+' (base até '+brd(maxD())+', conta '+(CT||'todas')+')'+(sem?' · '+sem+' sem natureza no Plano de Naturezas':'')+(cf&&(cf.solo.length||Math.abs(cf.dif)>=.005)?' · ⚠ a aba INVESTIMENTO fica '+dv(cf.dif)+': veja a Conferência na aba Saldos':'')+'.';
   try{localStorage.setItem(KEY,JSON.stringify(x))}catch(e){}
   const c=nv();if(c){const M0=MSG;MSG+=' Publicando para todos…';render();c.from(TB).upsert({id:1,dados:x,arquivo:orig}).select('atualizado_em').single().then(({data,error})=>{if(error){MSG=M0+' ⚠ Não publicou para os demais usuários: '+error.message;}else{NST=data.atualizado_em;NUV=fdh(data.atualizado_em)+' · '+orig;MSG=M0+' ✔ Publicado para todos os usuários.'}render()});return}
  }catch(e){MSG='Erro ao ler a planilha: '+e.message}render()}
 /* ---------- exportação Excel (formatada, tema azul do Consórcio) ---------- */
 const CLS={ent:'Entrada',sai:'Saída',inv:'Investimento',tr:'Transferência'},LNF='[>=1000000]#,##0.0,," Mi";[>=1000]#,##0," mil";#,##0',cut=(s,n)=>{s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s},sd_=m=>XR.serial(m+'-01'),
  subX=()=>{const sc=scope(),ms=sc.map(x=>x.m);return (CT?'Conta '+ctl(CT):'Todas as contas')+' · Período: '+(sc.length?(tlOn()||sc.length==1?per(sc):(lab(ms[0])+' a '+lab(ms[ms.length-1]))):'—')+' · Base até '+(R.length||IV.length?brd(maxD()):'—')+' · Gerado em '+XR.hoje()};
 async function xl(){
  try{
   const s=scope();if(!s.length){MSG='⚠ Não há dados no período selecionado para exportar.';render();return}
   const E=XR,c=E.C,ms=s.map(x=>x.m),k=kpis(),P=per(s),wb=XP.book({titulo:'Dashboard Financeiro · Fluxo de Caixa Realizado'}),sub=subX(),rod='Consórcio Santa Dulce · Dashboard Financeiro · Fluxo de Caixa Realizado',SBN='Saldo Bancário';
   const R0=wb.sheet('Resumo Executivo',{tab:c.navy,grid:false,sel:true,rod,zoom:90}),last=s[s.length-1];
   const rows=R.filter(r=>inS(r,ms)),fo=rows.filter(FOR),res=r2(k.ent-k.sai);

   /* ---- abas de dados ---- */
   /* Saldo Bancário: o CONSOLIDADO de cada conta (resultado final do período) fica logo abaixo do cabeçalho (linha 7); depois vem a evolução mensal de cada conta.
      Entram todas as contas do cadastro, independente da conta escolhida na tela. */
   const CT0=CT,AC=CTA.length?CTA:[{c:CT0,k:'',n:''}],GC=[],FD=[],cta=a=>ctl(a.c)||'Todas as contas';
   try{AC.forEach(a=>{CT=a.c;flt();const sc=scope();if(sc.length){GC.push({a,sc});sc.forEach(x=>FD.push(Object.assign({conta:cta(a)},x)))}})}finally{CT=CT0;flt()}
   const nC=GC.length,CONS=[];let off=8+nC; /* dados começam na linha 8 (cabeçalho na 7): consolidados primeiro, depois o detalhe mensal de cada conta */
   GC.forEach(g=>{const d1=off,d2=off+g.sc.length-1,f0=g.sc[0],l0=g.sc[g.sc.length-1];off=d2+1;
    CONS.push({cons:1,conta:'CONSOLIDADO ('+cta(g.a)+')',mt:g.sc.length==1?lab(f0.m):lab(f0.m)+' a '+lab(l0.m),d1,d2,si:f0.si,ent:sum(g.sc,'ent'),sai:sum(g.sc,'sai'),dinv:sum(g.sc,'dinv'),tr:sum(g.sc,'tr'),sf:l0.sf,inv:l0.inv})});
   const cf=fn=>(r,i,Lt,x)=>x.cons?fn(Lt,x):null,sm=q=>cf((Lt,x)=>`SUM(${Lt[q]}${x.d1}:${Lt[q]}${x.d2})`);
   const FM=E.dados(wb,SBN,{titulo:'Saldo bancário por conta · consolidado do período e evolução mensal',sub:sub.replace(/^[^·]*·/,'Contas: '+AC.length+' (todas as do cadastro) ·'),rod,rows:CONS.concat(FD),hh:34,fz:2,cent:1,cols:[
    {h:'CONTA',g:x=>x.conta,b:1,w:1,maxW:44},
    {h:'MÊS / PERÍODO',g:x=>x.cons?x.mt:sd_(x.m),nf:'mes',al:'center',k:'m'},
    {h:'SALDO INICIAL',g:x=>x.si,nf:'moedaZ',k:'si',f:cf((Lt,x)=>`${Lt.si}${x.d1}`)},
    {h:'ENTRADAS',g:x=>x.ent,nf:'moedaZ',k:'ent',c:c.grn,f:sm('ent')},
    {h:'SAÍDAS',g:x=>-x.sai,nf:'moedaZ',k:'sai',f:sm('sai')},
    {h:'APLICAÇÕES EM INVESTIMENTO',g:x=>-x.dinv,nf:'moedaZ',k:'apl',f:sm('apl')},
    {h:'TRANSFERÊNCIAS ENTRE CONTAS',g:x=>x.tr,nf:'moedaZ',k:'tr',f:sm('tr')},
    {h:'SALDO FINAL',g:x=>x.sf,nf:'moedaZ',k:'sf',b:1,f:(r,i,L)=>`${L.si}${r}+${L.ent}${r}+${L.sai}${r}+${L.apl}${r}+${L.tr}${r}`},
    {h:'INVESTIMENTO (POSIÇÃO NO FIM DO MÊS)',g:x=>x.inv,nf:'moedaZ',k:'inv',f:cf((Lt,x)=>`${Lt.inv}${x.d2}`)}]});
   if(FM.t.r1!=8)throw new Error('Layout da aba '+SBN+' mudou (1ª linha de dados = '+FM.t.r1+').');
   if(nC){FM.ws.fillR(FM.t.r1,2,FM.t.r1+nC-1,10,{fg:c.sky2,b:1,c:c.navy});FM.ws.fillR(FM.t.r1+nC-1,2,FM.t.r1+nC-1,10,{bb:['medium',c.navy]})}
   const LC=E.dados(wb,'Lançamentos',{titulo:'Lançamentos do período',sub,rod,rows:rows.slice().sort((a,b)=>a[1].localeCompare(b[1])||String(nome(a)).localeCompare(String(nome(b)),'pt')),fz:1,cent:1,cols:[
    {h:'DATA',g:r=>XP.serial(r[1]),nf:'data'},{h:'ORIGEM',g:r=>og(r)},{h:'CLASSE',g:r=>CLS[cls(r)]},{h:'TIPO',g:r=>r[6],al:'center'},{h:'TÍTULO',g:r=>r[7]},{h:'PARCELA',g:r=>r[8],al:'center'},
    {h:'FORNECEDOR / CLIENTE',g:r=>nome(r),maxW:42,w:1},{h:'HISTÓRICO',g:r=>r[3],maxW:52,w:1},{h:'CATEGORIA',g:r=>cat(r),maxW:30,w:1},{h:'NATUREZA',g:r=>r[4]},{h:'CONTA',g:r=>r[9]},
    {h:'VALOR (ENTRADA + / SAÍDA −)',g:r=>sv(r),nf:'moedaZ',tot:'sum',k:'v'}]});
   LC.t.rt&&LC.ws.put(LC.t.rt,2,'TOTAL (FILTRÁVEL)',{b:1,c:c.navy,fg:c.sky2,box:c.line,bt:['medium',c.navy],v:'center',ind:1});
   let SDS=null;
   if(IV.length){
    /* Saldos Investimentos: só o TOTAL de cada período (todos os produtos juntos) + o total do período inteiro, para ver como encerrou */
    const S=ivSerie(),tt=S.TOTAL.filter(b=>ms.includes(b.m));
    if(tt.length){
     SDS=E.dados(wb,'Saldos Investimentos',{titulo:'Saldos de investimentos · total por período',sub,rod,rows:tt,fz:1,cent:1,cols:[
      {h:'MÊS',g:x=>sd_(x.m),nf:'mes',al:'center',W:21},{h:'SALDO INICIAL',g:x=>x.si,nf:'moedaZ',k:'si',tot:{f:(rt,Lt,r1)=>`${Lt.si}${r1}`,v:tt[0].si}},{h:'APLICAÇÕES',g:x=>x.ap,nf:'moedaZ',k:'ap',tot:'sum'},{h:'RESGATES',g:x=>-x.rs,nf:'moedaZ',k:'rs',tot:'sum'},{h:'RENDIMENTOS',g:x=>x.rd,nf:'moedaZ',k:'rd',c:c.grn,tot:'sum'},{h:'IR SOBRE RESGATE',g:x=>-x.ir,nf:'moedaZ',k:'ir',tot:'sum'},
      {h:'SALDO FINAL (ENCERRAMENTO)',g:x=>x.sf,nf:'moedaZ',k:'sf',b:1,f:(r,i,L)=>`${L.si}${r}+${L.ap}${r}+${L.rs}${r}+${L.rd}${r}+${L.ir}${r}`,tot:{f:(rt,Lt,r1,r2)=>`${Lt.sf}${r2}`,v:tt[tt.length-1].sf}}]});
     SDS.t.rt&&SDS.ws.put(SDS.t.rt,2,'TOTAL DO PERÍODO',{b:1,c:c.navy,fg:c.sky2,box:c.line,bt:['medium',c.navy],v:'center',ind:1})
    }
    E.dados(wb,'Investimentos',{titulo:'Movimentação de investimentos',sub,rod,rows:IV.filter(r=>inS(r,ms)).sort((a,b)=>a[1].localeCompare(b[1])),fz:1,cent:1,cols:[
     {h:'DATA',g:r=>XP.serial(r[1]),nf:'data'},{h:'PRODUTO',g:r=>r[2],b:1},{h:'TIPO',g:r=>r[10]},{h:'HISTÓRICO',g:r=>r[3],maxW:56,w:1},{h:'NATUREZA',g:r=>r[4]},{h:'CONTA',g:r=>r[9]},{h:'VALOR (APLICAÇÃO + / RESGATE −)',g:r=>sv(r),nf:'moedaZ',tot:'sum'}]})
   }

   /* ================= RESUMO EXECUTIVO ================= */
   /* grade: colunas B e I largas (33) e C..H de 16,5 → os 5 cartões saem do mesmo tamanho (B | C-D | E-F | G-H | I) */
   [33,16.5,16.5,16.5,16.5,16.5,16.5,33].forEach((w,i)=>R0.width(2+i,w));
   let r=E.cab(R0,9,{titulo:'Resumo Executivo · Fluxo de Caixa Realizado',sub});
   const pct=(a,b)=>b?a/b:0;
   /* cartões · uma linha, nesta ordem: SALDO INICIAL · ENTRADAS · SAÍDAS · APLICADO EM INVESTIMENTOS · SALDO FINAL */
   /* ícones dos cartões: os mesmos da tela, desenhados em PNG (se o navegador não conseguir, o cartão sai só com o nome) */
   const ico=(k,bg,fg)=>new Promise(res=>{try{const sv=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#${bg}"/><g transform="translate(24 24) scale(2)" fill="none" stroke="#${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IP[k]}</g></svg>`,im=new Image();
    im.onload=()=>{try{const cv=document.createElement('canvas');cv.width=cv.height=96;cv.getContext('2d').drawImage(im,0,0,96,96);res(cv.toDataURL('image/png'))}catch(e){res(null)}};im.onerror=()=>res(null);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sv)}catch(e){res(null)}});
   const ICX=await Promise.all([['cofre','E0F2FE','0284C7'],['sobe','D1FAE5','059669'],['desce','FFE4E6','E11D48'],['cofrinho','FEF3C7','D97706'],['bandeira','E0E7FF','4F46E5']].map(a=>ico(...a)));
   const CD={lsz:10,lc:c.navy,lind:4,hs:[28,17,17,20]};
   E.kpi(R0,r,2,{...CD,w:1,label:'SALDO INICIAL',v:r2(s[0].si),sub:'início de '+lab(s[0].m),cor:c.blue});
   E.kpi(R0,r,3,{...CD,w:2,label:'ENTRADAS',v:r2(k.ent),sub:rows.filter(x=>cls(x)=='ent').length+' lançamento(s) de recebimento',cor:c.grn});
   E.kpi(R0,r,5,{...CD,w:2,label:'SAÍDAS',v:r2(k.sai),sub:rows.filter(x=>cls(x)=='sai').length+' lançamento(s) de pagamento',cor:c.red,vc:c.red});
   E.kpi(R0,r,7,{...CD,w:2,label:'APLICADO EM INVESTIMENTOS',v:r2(last.inv),sub:'posição ao fim de '+lab(last.m),cor:c.yel,vc:c.ink});
   const dsf=r2(last.sf-s[0].si); /* variação do saldo no período, em centavos exatos: sem variação não mostra seta nem sinal */
   E.kpi(R0,r,9,{...CD,w:1,label:'SALDO FINAL',v:r2(last.sf),sub:'fim de '+lab(last.m)+' · '+(dsf==0?'sem variação':(dsf>0?'▲ ':'▼ ')+fr(dsf)),cor:c.navy});
   [2,3,5,7,9].forEach((cc,i)=>{if(ICX[i])R0.image(ICX[i],r,cc,26,26,8,5)});
   r+=4;R0.height(r,10);r++;
   /* categorias e fornecedores (saídas a fornecedores) */
   const gc=(a,key)=>{const o={};a.forEach(x=>{const n=key(x),b=o[n]??={n:0,v:0,cats:{}};b.n++;b.v+=x[5];b.cats[cat(x)]=(b.cats[cat(x)]||0)+x[5]});Object.values(o).forEach(b=>b.v=r2(b.v));return o};
   const CO=gc(fo,cat),CL0=Object.entries(CO).map(([n,b])=>({cat:n,n:b.n,v:b.v})).sort((a,b)=>b.v-a.v);
   let CL=CL0;if(CL0.length>9){const rest=CL0.slice(8).reduce((a,x)=>({cat:'Demais categorias',n:a.n+x.n,v:r2(a.v+x.v)}),{cat:'Demais categorias',n:0,v:0});CL=CL0.slice(0,8).concat([rest])}
   const FO=gc(fo,nome),FL=Object.entries(FO).map(([n,b])=>({f:cut(n,40),fn:n,n:b.n,v:b.v,cat:Object.entries(b.cats).sort((a,b)=>b[1]-a[1])[0][0]})).sort((a,b)=>b.v-a.v).slice(0,10),F10=r2(FL.reduce((t,x)=>t+x.v,0));
   const EN=rows.filter(x=>cls(x)=='ent'),EO=gc(EN,nome),enT=r2(EN.reduce((t,x)=>t+x[5],0)),EL0=Object.entries(EO).map(([n,b])=>({f:cut(n,40),n:b.n,v:b.v})).sort((a,b)=>b.v-a.v);
   let EL=EL0;if(EL0.length>9){const rest=EL0.slice(8).reduce((a,x)=>({f:'Demais origens',n:a.n+x.n,v:r2(a.v+x.v)}),{f:'Demais origens',n:0,v:0});EL=EL0.slice(0,8).concat([rest])}

   /* gráficos (os quadros que os alimentam estão logo abaixo) */
   r=E.sec(R0,r,2,9,'Evolução mensal');const gA=r;r+=16;R0.height(r,10);r++;
   R0.brk(r);r=E.sec(R0,r,2,9,'Saídas por tipo');const gB=r;r+=18;R0.height(r,10);r++;
   const temPos=!!(SDS&&PR.some(p=>ivSerie()[p].filter(b=>ms.includes(b.m)).length&&Math.abs(ivSerie()[p].filter(b=>ms.includes(b.m)).slice(-1)[0].sf)>.005));
   R0.brk(r);r=E.sec(R0,r,2,9,temPos?'Entradas por origem e posição em investimentos':'Entradas por origem');const gC=r;r+=16;R0.height(r,10);r++;

   /* quadros: cada um fica inteiro na página — se não couber no que sobra, começa uma nova (altura estimada em pontos: título 21 + cabeçalho 30 + linhas + total 22 + respiro 15) */
   let PG=0;const CAP=560,fit=(n,h)=>{const t=88+n*h;if(PG&&PG+t>CAP){R0.brk(r);PG=0}PG+=t};
   R0.brk(r);fit(s.length,15);r=E.sec(R0,r,2,9,'Quadro · resumo mensal');
   const T1=E.tabela(R0,r,2,[{h:'MÊS',g:x=>lab(x.m),tot:'PERÍODO',b:1},{h:'SALDO INICIAL',g:x=>x.si,nf:'moedaZ',k:'si',tot:{f:(rt,Lt,r1)=>`${Lt.si}${r1}`,v:s[0].si}},{h:'ENTRADAS',g:x=>x.ent,nf:'moedaZ',tot:'sum',k:'ent',c:c.grn},{h:'SAÍDAS',g:x=>x.sai,nf:'moedaZ',tot:'sum',k:'sai'},
    {h:'RESULTADO',g:x=>x.ent-x.sai,nf:'moedaZ',k:'rs',b:1,f:(rr,i,Lt)=>`${Lt.ent}${rr}-${Lt.sai}${rr}`,tot:{f:(rt,Lt,r1,r2)=>`SUBTOTAL(109,${Lt.rs}${r1}:${Lt.rs}${r2})`,v:res}},{h:'APLICADO (POSIÇÃO)',g:x=>x.inv,nf:'moedaZ',tot:{f:(rt,Lt,r1,r2)=>`G${r2}`,v:last.inv}},
    {h:'SALDO FINAL',g:x=>x.sf,nf:'moedaZ',k:'sf',b:1,tot:{f:(rt,Lt,r1,r2)=>`${Lt.sf}${r2}`,v:last.sf}}],s,{hh:30,cent:1});
   r=T1.end+1;

   fit(CL.length,15);r=E.sec(R0,r,2,9,'Quadro · saídas a fornecedores por categoria');
   const T2=E.tabela(R0,r,2,[{h:'CATEGORIA',g:x=>x.cat,tot:'TOTAL',b:1,w:1},{h:'Nº DE LANÇAMENTOS',g:x=>x.n,nf:'int',tot:'sum'},{h:'VALOR PAGO',g:x=>x.v,nf:'moedaZ',tot:'sum',k:'v'}],CL,{hh:30,cent:1});
   if(CL.length)R0.dataBar(T2.r1,4,T2.r2,4,'5B9BD5');r=T2.end+1;

   /* % = participação de cada fornecedor no total do próprio Top 10 (a coluna fecha em 100%); fórmula na planilha, valor em cache igual ao recalculado */
   fit(FL.length,27);r=E.sec(R0,r,2,9,'Quadro · maiores fornecedores');
   const FR0=r,T3=E.tabela(R0,r,2,[{h:'FORNECEDOR',g:x=>x.f,w:1,b:1,tot:'TOTAL (TOP '+FL.length+')'},{h:'Nº DE LANÇAMENTOS',g:x=>x.n,nf:'int',tot:'sum'},{h:'VALOR PAGO',g:x=>x.v,nf:'moedaZ',tot:'sum',k:'v'},
    {h:'% DO TOP '+FL.length,g:x=>pct(x.v,F10),nf:'pct0',k:'sh',f:(rr,i,Lt)=>`IF(SUM(${Lt.v}$${FR0+1}:${Lt.v}$${FR0+FL.length})=0,0,${Lt.v}${rr}/SUM(${Lt.v}$${FR0+1}:${Lt.v}$${FR0+FL.length}))`,tot:{f:(rt,Lt,r1,r2)=>`SUM(${Lt.sh}${r1}:${Lt.sh}${r2})`,v:F10?1:0}},
    {h:'CATEGORIA PRINCIPAL',g:x=>x.cat,w:1}],FL,{hh:30,cent:1});
   if(FL.length)R0.dataBar(T3.r1,5,T3.r2,5,'5B9BD5');r=T3.end+1;

   fit(EL.length,15);r=E.sec(R0,r,2,9,'Quadro · entradas por origem');
   const T4=E.tabela(R0,r,2,[{h:'ORIGEM DO RECEBIMENTO',g:x=>x.f,w:1,b:1,tot:'TOTAL'},{h:'Nº DE LANÇAMENTOS',g:x=>x.n,nf:'int',tot:'sum'},{h:'VALOR RECEBIDO',g:x=>x.v,nf:'moedaZ',tot:'sum',k:'v'}],EL,{hh:30,cent:1});
   if(EL.length)R0.dataBar(T4.r1,4,T4.r2,4,'5B9BD5');r=T4.end+1;

   let T5=null,PL5=[];
   if(temPos){
    const S=ivSerie();PL5=PR.map(p=>{const a=S[p].filter(b=>ms.includes(b.m));return a.length?{p,si:a[0].si,ap:sum(a,'ap'),rs:sum(a,'rs'),rd:sum(a,'rd'),ir:sum(a,'ir'),sf:a[a.length-1].sf}:null}).filter(x=>x&&Math.abs(x.si)+Math.abs(x.ap)+Math.abs(x.rs)+Math.abs(x.rd)+Math.abs(x.ir)+Math.abs(x.sf)>.005);
    fit(PL5.length,15);r=E.sec(R0,r,2,9,'Quadro · posição dos investimentos');
    T5=E.tabela(R0,r,2,[{h:'PRODUTO',g:x=>x.p,b:1,tot:'TOTAL'},{h:'SALDO INICIAL',g:x=>x.si,nf:'moedaZ',tot:'sum',k:'si'},{h:'APLICAÇÕES',g:x=>x.ap,nf:'moedaZ',tot:'sum',k:'ap'},{h:'RESGATES',g:x=>-x.rs,nf:'moedaZ',tot:'sum',k:'rs'},{h:'RENDIMENTOS',g:x=>x.rd,nf:'moedaZ',tot:'sum',k:'rd',c:c.grn},{h:'IR SOBRE RESGATE',g:x=>-x.ir,nf:'moedaZ',tot:'sum',k:'ir'},
     {h:'SALDO FINAL',g:x=>x.sf,nf:'moedaZ',tot:'sum',k:'sf',b:1,f:(rr,i,Lt)=>`${Lt.si}${rr}+${Lt.ap}${rr}+${Lt.rs}${rr}+${Lt.rd}${rr}+${Lt.ir}${rr}`}],PL5,{hh:30,cent:1});r=T5.end+1
   }

   /* gráficos */
   R0.chart({kind:'col',title:'Entradas × Saídas (colunas) e saldo final (linha)',r1:gA,c1:2,r2:gA+15,c2:9,cats:{sh:R0,r1:T1.r1,c1:2,r2:T1.r2,c2:2},legend:'b',lnf:LNF,vnf:LNF,asz:800,
    series:[{name:'Entradas',vals:{sh:R0,r1:T1.r1,c1:4,r2:T1.r2,c2:4},color:c.blue,labels:true,lsz:800},{name:'Saídas',vals:{sh:R0,r1:T1.r1,c1:5,r2:T1.r2,c2:5},color:c.yel,labels:true,lsz:800},{name:'Saldo final',vals:{sh:R0,r1:T1.r1,c1:8,r2:T1.r2,c2:8},type:'line',axis:2,color:c.navy,labels:true,lsz:800}]});
   if(CL.length)R0.chart({kind:'bar',title:'Saídas a fornecedores por categoria',r1:gB,c1:2,r2:gB+17,c2:5,cats:{sh:R0,r1:T2.r1,c1:2,r2:T2.r2,c2:2},vnf:LNF,asz:800,gap:40,legend:null,series:[{name:'Valor pago',vals:{sh:R0,r1:T2.r1,c1:4,r2:T2.r2,c2:4},color:c.blue,labels:true,lnf:LNF,lsz:800}]});
   if(FL.length)R0.chart({kind:'bar',title:'Maiores fornecedores (top '+FL.length+')',r1:gB,c1:6,r2:gB+17,c2:9,cats:{sh:R0,r1:T3.r1,c1:2,r2:T3.r2,c2:2},vnf:LNF,asz:800,gap:40,legend:null,series:[{name:'Valor pago',vals:{sh:R0,r1:T3.r1,c1:4,r2:T3.r2,c2:4},color:c.navy,labels:true,lnf:LNF,lsz:800}]});
   if(EL.length)R0.chart({kind:'bar',title:'Entradas por origem',r1:gC,c1:2,r2:gC+15,c2:temPos?5:9,cats:{sh:R0,r1:T4.r1,c1:2,r2:T4.r2,c2:2},vnf:LNF,asz:800,gap:40,legend:null,series:[{name:'Valor recebido',vals:{sh:R0,r1:T4.r1,c1:4,r2:T4.r2,c2:4},color:c.verde,labels:true,lnf:LNF,lsz:800}]});
   /* posição dos investimentos: barras horizontais, uma cor por produto, com o valor em cada barra */
   if(T5&&T5.r2>=T5.r1){const COLP={CDB:c.blue,COMPROMISSADA:c.navy,CONTAMAX:c.yel};
    R0.chart({kind:'bar',title:'Posição em investimentos por produto',r1:gC,c1:6,r2:gC+15,c2:9,cats:{sh:R0,r1:T5.r1,c1:2,r2:T5.r2,c2:2},vnf:LNF,asz:900,gap:45,legend:null,vmax:Math.max(1,...PL5.map(x=>x.sf))*1.45, /* folga à direita para o rótulo do valor caber dentro do quadro */
     series:[{name:'Saldo final',vals:{sh:R0,r1:T5.r1,c1:8,r2:T5.r2,c2:8},color:c.blue,colors:PL5.map(x=>COLP[x.p]||c.blue),labels:true,lnf:'"R$" #,##0',lsz:900}]})}
   await saveAs('dashboard_financeiro.xlsx',await wb.save())
  }catch(e){MSG='⚠ Não consegui gerar o Excel: '+(e.message||e);render()}
 }
 async function dx(){
  if(!DCUR)return;
  try{
   const E=XR,c=E.C,rs=(DCUR.view||DCUR.rows),tt=DCUR.t+(DCUR.st&&DCUR.mode=='a'?' · acumulado até '+DCUR.st.z:''),wb=XP.book({titulo:'Lançamentos · '+tt}),rod='Consórcio Santa Dulce · Dashboard Financeiro · Lançamentos';
   E.dados(wb,'Lançamentos',{titulo:tt,sub:subX()+(DCUR.q?' · Filtro: “'+DCUR.q+'”':''),rod,rows:rs,fz:1,cent:1,cols:[
    {h:'DATA',g:r=>XP.serial(r[1]),nf:'data',tot:'TOTAL'},{h:'ORIGEM',g:r=>og(r)},{h:'TIPO',g:r=>r[6],al:'center'},{h:'TÍTULO',g:r=>r[7]},{h:'PARCELA',g:r=>r[8],al:'center'},{h:'FORNECEDOR / CLIENTE',g:r=>nome(r),maxW:42,w:1},{h:'HISTÓRICO',g:r=>r[3],maxW:52,w:1},{h:'CATEGORIA',g:r=>cat(r),maxW:30,w:1},
    {h:'VALOR (ENTRADA + / SAÍDA −)',g:r=>sv(r),nf:'moedaZ',tot:'sum'}]});
   await saveAs('lancamentos_fluxo_caixa.xlsx',await wb.save())
  }catch(e){MSG='⚠ Não consegui gerar o Excel: '+(e.message||e);const m=$$('dash-md');if(m)m.classList.add('hidden');render()}
 }
 const refresh=()=>{if(tab=='for'){const e=$$('dfc');if(e)e.value=FC;fres()}else render()};
 CT=CTA[0]?CTA[0].c:'';CTP=CT;flt();lastPer();
 window.dash={confere,show(){render();nuvem()},t(x){if(x=='sal'&&tab!='sal'){CTP=CT;CT='';flt()}else if(x!='sal'&&tab=='sal'){CT=CTP;flt()}MT[tab]=M;M=x in MT?MT[x]:(tab=x,dM());tab=x;render()},
  tl(){TL=!TL;render()},tm(m){TM=TM.includes(m)?TM.filter(x=>x!=m):TM.concat(m).slice(-2);TM.sort();render()},tc(){TM=[];render()},
  go(c){CT=c;CTP=c;tab='exe';flt();render()},
  f(k,v){if(k=='Y'){Y=v;M=''}else if(k=='CT'){CT=v;CTP=v;flt();FC='';FS=''}else if(k=='M')M=(v==M?'':v);render()},
  fv(k,v,set){if(k=='FC')FC=set?v:(FC==v?'':v);else FS=set?v:(FS==v?'':v);refresh()},fk(k,i){this.fv(k,KEYS[i])},
  rm(k){if(k=='M'){M='';render();return}if(k=='FC')FC='';else if(k=='FS')FS='';else{FQ='';const e=$$('dq');if(e)e.value=''}refresh()},
  clr(){FC='';FS='';FQ='';lastPer();render()},q(v){FQ=v;fres()},ok(i){OPEN[KEYS[i]]=!OPEN[KEYS[i]];fres()},x(k){EX[k]=!EX[k];render()},xa(v){SKS.concat(CTA.map(a=>'a_'+a.c)).forEach(k=>EX[k]=v);if(v)CTA.forEach(a=>['ent','sai','inv','tr','iv'].forEach(g=>EX['a_'+a.c+'_'+g]=true));else Object.keys(EX).filter(k=>k.startsWith('a_')).forEach(k=>EX[k]=false);render()},
  s(k){if(SK==k)SD=-SD;else{SK=k;SD=1}fres()},
  dr(i){const sp=DRL[i];if(sp)openD(sp.t,src(sp.s).filter(sp.f),sp.st?mkSt(sp.st,sp.s):null)},o2(t,f,s){openD(t,src(s).filter(f))},
  os(t,g,s,ms,P,n,sg){openD(t,src(s).filter(r=>g(r)&&inS(r,ms)),mkSt({g,ms,P,n,sg},s))},dm(m){if(DCUR&&DCUR.st){DCUR.mode=m;fillD()}},
  o3(t){const ms=scope().map(x=>x.m),q=r=>!FQ||N(nome(r)+' '+r[3]).includes(N(FQ));openD(t,R.filter(r=>FOR(r)&&inS(r,ms)&&q(r)&&(!FC||cat(r)==FC)&&(!FS||nome(r)==FS)))},
  det(i){const r=TBL[i];if(!r)return;const L=[['Tipo',r[6]],['Título',r[7]],['Parcela',r[8]],['Fornecedor / Cliente',nome(r)],['Valor',fr(sv(r))],['Data do pagamento',brd(r[1])],['Natureza',r[4]],['Categoria serviço',cat(r)],['Histórico',r[3]]];
   modal(`<div class="card w-full max-w-lg"><h2 class="text-lg font-bold mb-3">Detalhe do lançamento</h2><dl class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">${L.map(x=>`<dt class="text-slate-500 text-xs uppercase pt-0.5">${x[0]}</dt><dd class="col-span-2 break-words">${esc(x[1])||'—'}</dd>`).join('')}</dl><div class="flex justify-end mt-4"><button class="btn" onclick="dash.cl()">Fechar</button></div></div>`)},
  cl(){const m=$$('dash-md');if(m)m.classList.add('hidden')},dq(v){if(DCUR){DCUR.q=v;fillD()}},
  up(i){if(!PERM.tem('dash.publicar')){i.value='';return}const fl=i.files[0];i.value='';if(!fl)return;const rd=new FileReader();rd.onload=()=>ing(rd.result,fl.name);rd.readAsArrayBuffer(fl)},
  xl,dx,calc:{serie,kpis:()=>kpis(),posInv,ivSerie,confer,confBanco,posAt,setCT:v=>{CT=v;flt()},rows:()=>R,iv:()=>IV,iv0:()=>IV0,fmt:()=>FMT}};
})();
