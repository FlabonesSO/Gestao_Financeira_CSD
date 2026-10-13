/* Módulo genérico "planilha publicada": o admin importa um Excel (.xlsx/.xls/.csv), a base é gravada no
   Supabase (BASE) e todos os usuários veem as abas em tabelas com busca, ordenação, totais e Excel.
   Uso (em js/modulos/<modulo>.js):  baseModulo({id:'reidi', chave:'reidi', titulo:'REIDI', sub:'...'});
   Depende de app.js ($, f, br, N, ROLE, saveAs) e de base.js (BASE). */
function baseModulo(cfg){
 const VIEW=document.querySelector('[data-view="'+cfg.id+'"]'),G='bm_'+cfg.id,PS=100,MAXR=20000,MAXC=60,MAXB=9e6;
 if(!VIEW)return;
 const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  isD=v=>typeof v=='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),brd=d=>d.split('-').reverse().join('/'),
  idc=h=>/^(id|numero|num|no|cod|codigo|conta|agencia|banco|prc|cnpj|cpf|ano|mes)\b/.test(N(h)),
  fn=(v,d)=>v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}),
  iso=d=>new Date(d.getTime()+432e5).toISOString().slice(0,10);
 let B=null,META='',ST='',Q='',SK=-1,SD=1,PG=1,CUR=0,MSG='',ERR=false;
 /* ---- leitura da planilha ---- */
 function cell(v){if(Object.prototype.toString.call(v)=='[object Date]')return isNaN(v)?'':iso(v);if(typeof v=='boolean')return v?'Sim':'Não';if(typeof v=='number')return isFinite(v)?v:'';return v==null?'':String(v).trim()}
 function parse(wb){const out=[];
  wb.SheetNames.forEach((n,i)=>{const hd=wb.Workbook&&wb.Workbook.Sheets&&wb.Workbook.Sheets[i]&&wb.Workbook.Sheets[i].Hidden;if(hd)return;
   const a=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''});
   let hi=a.findIndex((r,k)=>k<15&&r.filter(c=>typeof c=='string'&&c.trim()!=='').length>=2);if(hi<0)hi=a.findIndex(r=>r.some(c=>c!==''));if(hi<0)return;
   const H=a[hi].map(c=>String(c==null?'':c).trim());let w=H.length;while(w>0&&!H[w-1])w--;w=Math.min(w,MAXC);if(!w)return;
   const hh=H.slice(0,w).map((h,j)=>h||'Coluna '+(j+1)),rr=[];
   for(let k=hi+1;k<a.length&&rr.length<MAXR;k++){const row=hh.map((_,j)=>cell(a[k][j]));if(row.some(c=>c!==''))rr.push(row)}
   if(rr.length)out.push({n,h:hh,r:rr,cut:a.length-hi-1>MAXR})});
  if(!out.length)throw new Error('Não encontrei linhas de dados em nenhuma aba.');return{sheets:out}}
 /* ---- tipos de coluna (data, número, identificador, texto) ---- */
 function kinds(S){if(S._k)return S._k;S._k=S.h.map((h,j)=>{let n=0,d=0,t=0,dec=false;
   for(const r of S.r){const v=r[j];if(v==='')continue;t++;if(typeof v=='number'){n++;if(!Number.isInteger(v))dec=true}else if(isD(v))d++}
   if(!t)return{k:'t'};if(d/t>=.8)return{k:'d'};if(n/t>=.8)return{k:idc(h)?'i':'n',dec};return{k:'t'}});return S._k}
 const fv=(v,c)=>v===''?'':c.k=='d'&&isD(v)?brd(v):typeof v=='number'?(c.k=='i'?String(v):fn(v,c.dec?2:0)):esc(v);
 function view(){const S=B.sheets[CUR],K=kinds(S);
  if(!S._s)S._s=S.r.map(r=>N(r.map(c=>isD(c)?brd(c):c).join(' ')));
  const q=N(Q);let ix=S.r.map((_,i)=>i).filter(i=>!q||S._s[i].includes(q));
  if(SK>=0)ix.sort((a,b)=>{const x=S.r[a][SK],y=S.r[b][SK];if(x===''&&y==='')return 0;if(x==='')return 1;if(y==='')return -1;
    return(typeof x=='number'&&typeof y=='number'?x-y:String(x).localeCompare(String(y),'pt-BR',{numeric:true}))*SD});
  return{S,K,ix}}
 /* ---- tela ---- */
 function head(){const adm=ROLE=='admin';
  return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">${esc(cfg.titulo)}</h1><p class="text-sm text-slate-500">${esc(cfg.sub||'Planilha publicada pelo administrador')}${META?' · Base publicada em <b>'+esc(META)+'</b>':''}</p></div>
  <button class="btn2 adm" title="Lê a planilha e publica a base para todos os usuários" onclick="document.getElementById('${G}-fi').click()">⬆ Atualizar base</button><input id="${G}-fi" type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="${G}.up(this)">
  ${B?`<button class="btn2" onclick="${G}.xl()">Excel</button>`:''}</div>
  ${MSG?`<div class="text-sm rounded-lg px-3 py-2 ${ERR?'bg-rose-500/10 text-rose-500':'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>`:''}`}
 function body(){if(!B)return `<div class="card py-12 text-center"><div class="text-4xl mb-2">📄</div><p class="font-semibold">Nenhuma base publicada ainda</p><p class="text-sm text-slate-500 mt-1">${ROLE=='admin'?'Clique em “Atualizar base” e escolha a planilha deste módulo.':'Peça ao administrador para publicar a planilha.'}</p></div>`;
  const tabs=B.sheets.length>1?`<div class="flex flex-wrap gap-1">${B.sheets.map((s,i)=>`<button class="px-3 py-1.5 rounded-lg text-sm font-medium ${i==CUR?'bg-indigo-600 text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}" onclick="${G}.sheet(${i})">${esc(s.n)}</button>`).join('')}</div>`:'';
  return `${tabs}<div class="flex flex-wrap items-center gap-2"><input id="${G}-q" class="inp w-64" placeholder="Buscar em todas as colunas…" value="${esc(Q)}" oninput="${G}.q(this.value)"><span id="${G}-n" class="text-xs text-slate-500"></span></div><div id="${G}-t"></div>`}
 function tbl(){const el=document.getElementById(G+'-t');if(!el||!B)return;const{S,K,ix}=view(),pages=Math.max(1,Math.ceil(ix.length/PS));PG=Math.max(1,Math.min(PG,pages));
  const pg=ix.slice((PG-1)*PS,PG*PS),sm=S.h.map((_,j)=>K[j].k=='n'?ix.reduce((t,i)=>t+(+S.r[i][j]||0),0):null),temSoma=sm.some(x=>x!==null);
  el.innerHTML=`<div class="card p-0 overflow-auto" style="max-height:68vh"><table class="w-full text-sm whitespace-nowrap"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr>${S.h.map((h,j)=>`<th class="px-3 py-2 ${K[j].k=='n'||K[j].k=='i'?'text-right':'text-left'} cursor-pointer select-none" onclick="${G}.s(${j})">${esc(h)}${SK==j?(SD>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
  <tbody>${pg.map(i=>`<tr class="border-t border-slate-200 dark:border-slate-800">${S.r[i].map((v,j)=>`<td class="px-3 py-1.5 ${K[j].k=='n'||K[j].k=='i'?'text-right':''}${typeof v=='number'&&v<0?' text-rose-600':''}">${fv(v,K[j])}</td>`).join('')}</tr>`).join('')||`<tr><td class="px-3 py-6 text-center text-slate-500" colspan="${S.h.length}">Nenhuma linha encontrada.</td></tr>`}</tbody>
  ${temSoma?`<tfoot class="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-semibold"><tr>${sm.map((x,j)=>`<td class="px-3 py-2 text-right">${j==0&&x===null?'TOTAL':x===null?'':fn(x,K[j].dec?2:0)}</td>`).join('')}</tr></tfoot>`:''}</table></div>
  <div class="flex items-center gap-2 text-sm"><button class="btn2" ${PG<=1?'disabled':''} onclick="${G}.pg(-1)">‹</button><span class="text-slate-500">Página ${PG} de ${pages}</span><button class="btn2" ${PG>=pages?'disabled':''} onclick="${G}.pg(1)">›</button></div>`;
  const n=document.getElementById(G+'-n');if(n)n.textContent=ix.length.toLocaleString('pt-BR')+' de '+S.r.length.toLocaleString('pt-BR')+' linhas'+(S.cut?' (a aba tinha mais de '+MAXR.toLocaleString('pt-BR')+' linhas; só as primeiras foram publicadas)':'')}
 function render(){VIEW.innerHTML=head()+body();tbl()}
 /* ---- base na nuvem ---- */
 async function nuvem(){try{const r=await BASE.ler(cfg.chave);
   if(r&&r.dados&&r.dados.sheets&&r.dados.sheets.length){META=BASE.fdh(r.atualizado_em)+(r.arquivo?' · '+r.arquivo:'');if(r.atualizado_em!=ST){ST=r.atualizado_em;B=r.dados;CUR=0;Q='';SK=-1;PG=1}render()}
   else if(!B)render()}catch(e){MSG='Não consegui carregar a base: '+(e.message||e)+'. Confira se o SQL supabase/bases-dados.sql foi executado.';ERR=true;render()}}
 window[G]={show(){render();nuvem()},
  sheet(i){CUR=i;Q='';SK=-1;PG=1;render()},q(v){Q=v;PG=1;tbl()},s(j){if(SK==j)SD=-SD;else{SK=j;SD=1}tbl()},pg(d){PG+=d;tbl()},
  xl(){if(!B)return;const{S,K,ix}=view(),wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(ix.map(i=>Object.fromEntries(S.h.map((h,j)=>[h,K[j].k=='d'&&isD(S.r[i][j])?brd(S.r[i][j]):S.r[i][j]]))));
   XLSX.utils.book_append_sheet(wb,ws,S.n.slice(0,31));saveAs(cfg.id+'_'+S.n.replace(/[^\w-]+/g,'_')+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}))},
  up(i){if(ROLE!='admin'){i.value='';return}const fl=i.files[0];i.value='';if(!fl)return;const rd=new FileReader();
   rd.onload=()=>{try{const x=parse(XLSX.read(rd.result,{type:'array',cellDates:true}));if(JSON.stringify(x).length>MAXB)throw new Error('a planilha é grande demais para publicar (limite ~9 MB de dados).');
     B=x;ST='';CUR=0;Q='';SK=-1;PG=1;META='';ERR=false;const nl=x.sheets.reduce((t,s)=>t+s.r.length,0),M0=nl.toLocaleString('pt-BR')+' linhas em '+x.sheets.length+' aba(s) lidas de '+fl.name+'.';
     MSG=M0+' Publicando para todos…';render();
     BASE.gravar(cfg.chave,x,fl.name).then(r=>{ST=r.atualizado_em;META=BASE.fdh(r.atualizado_em)+' · '+fl.name;MSG=M0+' ✔ Publicado para todos os usuários.';ERR=false;render()})
      .catch(e=>{MSG=M0+' ⚠ Não publicou para os demais usuários: '+(e.message||e);ERR=true;render()})}
    catch(e){MSG='Erro ao ler a planilha: '+(e.message||e);ERR=true;render()}};rd.readAsArrayBuffer(fl)}};
 render();
}
