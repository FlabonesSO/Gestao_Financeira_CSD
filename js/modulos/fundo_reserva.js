/* Módulo Fundo de Reserva: leitura da planilha, cálculos (1% do Faturamento Líquido), dashboard,
   exportações Excel/PDF e Termo de Responsáveis (PDF para assinatura).
   Depende de js/core/app.js (utilitários) e é carregado antes de js/core/main.js. */
let FR=.01;const TD={orig:'SANTANDER, Ag. 3324 - CC 130105657',dest:'SANTANDER, Ag. 3324 - CC 130105877',data:'',prev:'',base:''},
 EMP=['BELOV OBRAS PORTUÁRIAS LTDA','CTC INFRA & CONSTRUCOES LTDA','CARIOCA CHRISTIANI-NIELSEN ENGENHARIA S.A'],TXK=['iss','inss','pis','cof','ir','cs','out'],
 TX={iss:'ISS',inss:'INSS',pis:'PIS',cof:'COFINS',ir:'IR',cs:'Contribuições Sociais',out:'Outras Retenções'},
 K=['bruto','ded','base','ret','liq','adi','sal','fr'],
 L={bruto:'Valor Bruto da NF',ded:'Deduções',base:'Base de Cálculo',ret:'Impostos',liq:'Faturamento Líquido (de Impostos)',adi:'(-) Desconto Adiantamento',sal:'Saldo a Receber do Cliente',fr:'Fundo de Reserva'},
 MAP=[['adi','deducao do adiantamento'],['sal','saldo a receber'],['ded','deducoes'],['base','base de calculo'],['aliq','aliquota'],['iss','iss'],['cns','nota salvada'],['inss','inss'],['pis','pis'],['cof','cofins'],['ir','valor ir'],['cs','contribuicoes'],['out','outras'],['liq','valor liquido']],
 C=[['d','Data_Base'],['bruto','Valor Bruto'],['ded','Deduções'],['base','Base Cálc.'],['aliq','Alíq.'],['iss','ISS'],['inss','INSS'],['pis','PIS'],['cof','COFINS'],['ir','IR'],['cs','Contrib. Soc.'],['out','Outras'],['ret','Impostos'],['liq','Líquido'],['adi','(-) Desc. Adiantamento'],['sal','Saldo a Receber do Cliente'],['fr','Fundo de Reserva']],
 P=['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#ec4899'];
let D=[],sel='',pg=1,sk='d',sd=1,DOC='',
 RESP=[{papel:'Elaboração',nome:'Financeiro do Consórcio'},{papel:'Conferência',nome:'Gerente Administrativo Financeiro (GAF)'},{papel:'Atesto da Diretoria',nome:'Diretor Belov'},{papel:'Atesto da Diretoria',nome:'Diretor Carioca'},{papel:'Atesto da Diretoria',nome:'Diretor CTC'}];

/* ---------- Dados ---------- */
function norm(o){TXK.forEach(k=>o[k]=+o[k]||0);o.ded=+o.ded||0;o.base=+o.base||0;o.aliq=+o.aliq||0;o.cns=+o.cns||0;
 o.ret=+o.ret||TXK.reduce((a,k)=>a+o[k],0);o.bruto=+o.bruto||o.ded+o.base;o.liq=+o.liq||o.bruto-o.ret;
 o.adi=+o.adi||0;o.sal=+o.sal||o.liq-o.adi;o.fr=o.liq*FR;return o}
function toIso(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v=='number')return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
 v=String(v).trim();const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:v.slice(0,10)}
function parse(wb){
 DOC='';const s1=wb.SheetNames.find(x=>N(x).includes('fatur'))||wb.SheetNames[0],S2={},DX=/^\d{3}-\d{4}$/,
  rd=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[s1],{raw:true,defval:0}),out=[];
 rows.forEach(r=>{const o={};for(const h in r){const k=N(h);if(k.includes('data'))o.d=toIso(r[h]);else{const m=MAP.find(a=>k.includes(a[1]));if(m)o[m[0]]=+r[h]||0}}if(o.d)out.push(o)});
 /* aba "NNN-AAAA_Memória" (ou "Recebimento e Reserva"): impostos, desconto do adiantamento, nº do documento e taxa do fundo */
 const n2=wb.SheetNames.find(x=>N(x).includes('memoria')&&!DX.test(x.trim()))||wb.SheetNames.find(x=>N(x).includes('recebimento')),nd=wb.SheetNames.find(x=>DX.test(x.trim()));
 if(n2){const a=rd(n2),hi=a.findIndex(r=>r.some(c=>N(c)=='data base')&&r.some(c=>N(c).includes('valor bruto')));
  if(hi>=0){const H=a[hi].map(N),ix=(...t)=>{for(const k of t){const i=H.findIndex(h=>h.includes(k));if(i>=0)return i}return -1},di=H.indexOf('data base'),c={bruto:ix('valor bruto'),ret:ix('impostos','retencoes e tributos'),adi:ix('desconto adiantamento','adiantado','adiantamento')};
   for(let i=hi+1;i<a.length&&a[i][di]!==''&&N(a[i][di])!='total';i++){const d=toIso(a[i][di]);S2[d]={};for(const k in c)S2[d][k]=c[k]<0?0:+a[i][c[k]]||0}}
  const dr=a.find(r=>N(r[0]).startsWith('documento'));if(dr&&dr[1])DOC=String(dr[1]);
  const tr=a.find(r=>r.some(c=>N(c).startsWith('apuracao do fundo'))),tx=tr&&tr.find(c=>typeof c=='number'&&c>0&&c<1);if(tx)FR=tx}
 /* aba "NNN-AAAA" (solicitação): data, data prevista e contas bancárias — valem como padrão do 1º período */
 if(nd){const a=rd(nd),g=t=>{const r=a.find(r=>r.some(c=>N(c).startsWith(t)));if(!r)return'';const i=r.findIndex(c=>N(c).startsWith(t));return r.slice(i+1).find(c=>c!=='')??''},
  dt=g('data:'),pv=g('data prevista'),co=g('conta de origem'),cd=g('conta de destino');
  if(dt)TD.data=toIso(dt);if(pv)TD.prev=toIso(pv);if(co)TD.orig=String(co);if(cd)TD.dest=String(cd)}
 TD.base=out.map(o=>o.d).sort()[0]||'';
 return out.map(o=>{const s=S2[o.d]||{};return norm({...s,...o,adi:o.adi||s.adi})});
}
function setData(arr){D=arr.sort((a,b)=>a.d<b.d?-1:1);
 $('#sel').innerHTML=D.slice().reverse().map(x=>`<option value="${x.d}">${br(x.d)}</option>`).join('')+'<option value="">Todas as Data_Base</option>';
 sel=D.length?D[D.length-1].d:'';$('#sel').value=sel;pg=1;render()}
/* Upload (só admin) apenas LÊ a planilha e mostra como rascunho; só vai para os demais usuários quando o admin clica em "Publicar atualização" */
let PEND=null;
function fBar(){const b=$('#fpub');if(!b)return;if(PEND){$('#fpubt').innerHTML='⚠ <b>Atualização ainda não publicada</b>: '+PEND.n+' Data_Base lida(s) de "'+String(PEND.arq).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'". Só você vê estes dados até publicar.';b.classList.remove('hidden')}else b.classList.add('hidden')}
$('#fi').onchange=e=>{if(ROLE!='admin')return;const fl=e.target.files[0];if(!fl)return;const r=new FileReader();
 r.onload=ev=>{try{const d=parse(XLSX.read(ev.target.result,{type:'array'}));if(!d.length)throw 0;setData(d);PEND={arq:fl.name,n:d.length};fBar();msg(`${d.length} Data_Base lida(s) de "${fl.name}". Confira os valores e clique em “Publicar atualização” para liberar a todos.`)}catch(x){msg('Não foi possível ler o arquivo. Verifique as colunas (Data_Base, Base de Cálculo, ISS, INSS, Valor Líquido...).',1)}};
 r.readAsArrayBuffer(fl);e.target.value=''};
function fundoPub(){if(ROLE!='admin'||!PEND)return;const P=PEND;msg('Publicando para todos…');
 BASE.gravar('fundo_reserva',{d:D,FR,DOC,TD},P.arq).then(r=>{FST=r.atualizado_em;fMeta(r.atualizado_em,P.arq);PEND=null;fBar();msg(`✔ ${P.n} Data_Base de "${P.arq}" publicada(s) para todos os usuários`)}).catch(e=>msg(`NÃO publicado para os demais usuários: ${e.message||e}`,1))}
function fundoDesc(){if(ROLE!='admin'||!PEND)return;PEND=null;fBar();FST='';fundoNuvem().then(ok=>{if(!ok)seed()});msg('Atualização descartada: voltou a base publicada.')}
/* ---------- Base compartilhada (Supabase · tabela public.bases, chave fundo_reserva) ---------- */
let FST='';
function fMeta(ts,arq){const e=document.getElementById('fmeta');if(e)e.textContent=ts?' · Base publicada em '+BASE.fdh(ts)+(arq?' · '+arq:''):''}
async function fundoNuvem(){if(PEND)return true;try{const r=await BASE.ler('fundo_reserva'),x=r&&r.dados;
  if(x&&Array.isArray(x.d)&&x.d.length){if(r.atualizado_em!=FST){FST=r.atualizado_em;FR=+x.FR||FR;DOC=x.DOC||'';if(x.TD)Object.assign(TD,x.TD);setData(x.d)}fMeta(r.atualizado_em,r.arquivo);return true}}
 catch(e){msg('Não consegui carregar a base do Fundo de Reserva: '+(e.message||e)+'. Confira se o SQL supabase/bases-dados.sql foi executado.',1)}return false}
function msg(t,e){const m=$('#toast');m.textContent=t;m.className='text-sm rounded-lg px-3 py-2 '+(e?'bg-rose-500/10 text-rose-500':'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400');setTimeout(()=>m.classList.add('hidden'),6000)}

/* ---------- Render ---------- */
const sum=(r,k)=>r.reduce((a,x)=>a+x[k],0),cur=()=>sel?D.filter(x=>x.d==sel):D,CH={};
function mk(id,t,data,o={}){CH[id]&&CH[id].destroy();CH[id]=new Chart($('#'+id),{type:t,data,options:{responsive:true,maintainAspectRatio:false,...o}})}
function rank(id,it,tot){const m=Math.max(...it.map(a=>a[1]),1);$('#'+id).innerHTML=it.length?it.map((a,i)=>`<div class="mb-3"><div class="flex justify-between text-sm gap-2"><span>${i+1}. ${a[0]}</span><b>${f(a[1])}</b></div><div class="h-2 rounded bg-slate-200 dark:bg-slate-800"><div class="h-2 rounded" style="width:${a[1]/m*100}%;background:${P[i%7]}"></div></div></div>`).join('')+(tot==null?'':`<div class="flex justify-between text-sm gap-2 pt-3 mt-auto border-t-2 border-slate-300 dark:border-slate-700 font-bold"><span>TOTAL</span><b>${f(tot)}</b></div>`):'<p class="text-sm text-slate-400">Sem dados</p>'}
function render(){
 const r=cur(),b=sum(r,'bruto');
 const kp=[['bruto',''],['liq',`Impostos ${f(sum(r,'ret'))} (${b?p(sum(r,'ret')/b):'—'} do bruto)`],['sal',`(-) Desconto Adiantamento ${f(-sum(r,'adi'))}`],['fr',(FR*100)+'% do Faturamento Líquido']];
 $('#kpis').innerHTML=kp.map((a,i)=>{const w=a[0]=='fr';return`<div class="card border-t-4 ${w?'!bg-indigo-100 dark:!bg-indigo-600 text-black dark:text-white':''}" style="border-top-color:${P[i]}"><p class="text-xs uppercase ${w?'text-black dark:text-indigo-100':'text-slate-500'}">${L[a[0]]}</p><p class="text-xl sm:text-2xl font-bold mt-1">${f(sum(r,a[0]))}</p>${a[1]?`<p class="text-xs mt-1 ${w?'text-black dark:text-indigo-100':'text-slate-400'}">${a[1]}</p>`:''}</div>`}).join('');
 const tc=Chart.defaults.color,tx=TXK.map(k=>[TX[k],sum(r,k)]).filter(a=>a[1]>0).sort((a,b)=>b[1]-a[1]),tt=tx.reduce((a,c)=>a+c[1],0);
 const dl={anchor:'end',align:'end',color:tc,font:{size:11,weight:'bold'},formatter:v=>f(v)};
 if(sel)mk('c1','bar',{labels:[['Valor Bruto','da NF'],['Impostos'],['Faturamento Líquido','(de Impostos)'],['(-) Desconto','Adiantamento'],['Saldo a Receber','do Cliente'],['Fundo de Reserva']],datasets:[{data:['bruto','ret','liq','adi','sal','fr'].map(k=>sum(r,k)),backgroundColor:P,borderRadius:6,maxBarThickness:90}]},
  {scales:{y:{display:false,grace:'18%'},x:{grid:{display:false}}},plugins:{legend:{display:false},datalabels:dl,tooltip:{callbacks:{label:c=>' '+f(c.parsed.y)}}}});
 else{const cf=v=>v>=1e6?'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':v>=1e3?'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':f(v),
   mb=Math.max(...r.map(x=>x.bruto),1),mf=Math.max(...r.map(x=>x.fr),1),sh=r.length<=6,
   lb=(c,o)=>({display:sh,anchor:'end',align:'end',color:c,font:{size:10,weight:'bold'},formatter:cf,...o}),
   bar=(l,k,c)=>({type:'bar',label:l,data:r.map(x=>x[k]),backgroundColor:c,borderRadius:6,maxBarThickness:46,yAxisID:'y',order:2,datalabels:lb(tc)});
  mk('c1','bar',{labels:r.map(x=>br(x.d)),datasets:[bar('Valor Bruto','bruto',P[0]),bar('Faturamento Líquido','liq',P[1]),
   {type:'line',label:'Fundo de Reserva (1% do Líquido)',data:r.map(x=>x.fr),borderColor:P[2],backgroundColor:P[2],borderWidth:3,pointRadius:5,pointHoverRadius:7,tension:.25,yAxisID:'y1',order:1,datalabels:lb(P[2],{display:r.length<=12,align:'top',offset:6,font:{size:11,weight:'bold'}})}]},
  {interaction:{mode:'index',intersect:false},
   scales:{x:{grid:{display:false}},y:{display:false,beginAtZero:true,max:mb*1.7},y1:{display:false,min:-mf*1.8,max:mf*1.25}},
   plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:16}},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+f(c.parsed.y)}}}})}
 mk('c2','doughnut',{labels:tx.map(a=>a[0]),datasets:[{data:tx.map(a=>a[1]),backgroundColor:P,borderWidth:0}]},
  {cutout:'40%',plugins:{legend:{display:false},datalabels:{color:'#fff',font:{size:12,weight:'bold'},display:c=>c.dataset.data[c.dataIndex]/tt>.015,formatter:v=>p(v/tt)},tooltip:{callbacks:{label:c=>' '+c.label+': '+f(c.parsed)}}}});
 rank('r1',tx,tt);
 $('#t1').textContent=sel?'Leitura da Data_Base '+br(sel)+' — do bruto ao Fundo de Reserva':'Evolução por Data_Base';
 $('#per').innerHTML=sel?'Período exibido: <b>'+br(sel)+'</b>':'Período exibido: <b>Todas as Data_Base</b> (consolidado)';
 const i=sel?D.findIndex(x=>x.d==sel):D.length-1;
 $('#cmp').innerHTML=i<1?'<p class="text-sm text-slate-400">É necessário ao menos dois períodos (Data_Base) para comparar. Carregue mais períodos via Upload.</p>':
  `<table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="py-2">Indicador</th><th>${br(D[i].d)}</th><th>${br(D[i-1].d)} (anterior)</th><th>Variação</th></tr></thead><tbody>`+
  K.map(k=>{const a=D[i][k],c=D[i-1][k],v=c?(a-c)/c*100:0;return`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="py-2">${L[k]}</td><td>${f(k=='adi'?-a:a)}</td><td>${f(k=='adi'?-c:c)}</td><td class="font-semibold ${v>=0?'text-emerald-500':'text-rose-500'}">${v>=0?'▲':'▼'} ${Math.abs(v).toFixed(1).replace('.',',')}%</td></tr>`}).join('')+'</tbody></table>';
 T()}
const fm=(k,x)=>k=='d'?br(x.d):k=='aliq'?p(x.aliq):f(k=='adi'?-x[k]:x[k]);
function flt(){const q=$('#q').value.toLowerCase(),a=$('#d1').value,b=$('#d2').value;
 return cur().filter(x=>(!a||x.d>=a)&&(!b||x.d<=b)&&(!q||C.map(c=>fm(c[0],x)).join(' ').toLowerCase().includes(q))).sort((x,y)=>(x[sk]>y[sk]?1:-1)*sd)}
function srt(k){sd=sk==k?-sd:1;sk=k;T()}
function T(){const r=flt(),ps=+$('#ps').value,pages=Math.ceil(r.length/ps)||1;pg=Math.max(1,Math.min(pg,pages));
 $('#th').innerHTML='<tr>'+C.map(c=>`<th class="px-3 py-2 cursor-pointer whitespace-nowrap" onclick="srt('${c[0]}')">${c[1]}${sk==c[0]?(sd>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
 $('#tb').innerHTML=r.slice((pg-1)*ps,pg*ps).map(x=>'<tr class="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">'+C.map(c=>`<td class="px-3 py-2 whitespace-nowrap ${c[0]=='fr'?'font-semibold text-indigo-500':''}">${fm(c[0],x)}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${C.length}" class="p-4 text-center text-slate-400">Nenhum registro encontrado</td></tr>`;
 $('#cnt').textContent=r.length+' registro(s)';$('#pgi').textContent=`${pg} / ${pages}`}

/* ---------- Exportações ---------- */
function xl(){const r=flt(),ws=XLSX.utils.json_to_sheet(r.map(x=>Object.fromEntries(C.map(c=>[c[1],c[0]=='d'?br(x.d):c[0]=='adi'?-x.adi:x[c[0]]])))),wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,ws,'Fundo de Reserva');saveAs('fundo_reserva_'+(sel||'todas')+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}))}
function pdf(){const d=new jspdf.jsPDF('l','pt','a4'),r=flt(),cs=['d','bruto','ret','liq','adi','sal','fr'];
 d.addImage(LOGO,'PNG',40,22,36*LR,36);d.setFontSize(16).text('Gestão Financeira CSD · Dashboard Executivo',40+36*LR+14,40);d.setFontSize(10).text('Data_Base: '+(sel?br(sel):'Todas')+' · Gerado em '+new Date().toLocaleString('pt-BR'),40+36*LR+14,56);
 d.autoTable({startY:75,head:[['Indicador','Valor']],body:K.map(k=>[L[k],f((k=='adi'?-1:1)*sum(cur(),k))]),headStyles:{fillColor:[79,70,229]},tableWidth:340});
 d.autoTable({startY:d.lastAutoTable.finalY+20,head:[C.filter(c=>cs.includes(c[0])).map(c=>c[1])],body:r.map(x=>cs.map(k=>fm(k,x))),headStyles:{fillColor:[79,70,229]}});
 saveAs('fundo_reserva_dashboard.pdf',d.output('arraybuffer'))}
/* Nº do documento: sequencial por ano, na ordem das Data_Base (ex.: 001/2026, 002/2026...).
   O número é por Data_Base de faturamento; o 1º período usa o número da planilha (aba "NNN-AAAA_Memória"); se não houver, começa em 001. */
function docNo(x){const y=x.d.slice(0,4),i=D.filter(r=>r.d.slice(0,4)==y).findIndex(r=>r.d==x.d),m=String(DOC).match(/^(\d+)\/(\d{4})$/),s=m&&m[2]==y?+m[1]:1;
 return String(s+i).padStart(3,'0')+'/'+y}
/* Termo de RESPONSÁVEIS (PDF paisagem, layout da planilha) — não aparece no dashboard */
const tget=()=>{try{return JSON.parse(localStorage.csd_termo_v1)||{}}catch(e){return{}}};
function termo(){if(ROLE!='admin')return;const x=sel?D.find(r=>r.d==sel):D[D.length-1];if(!x)return;
 const o={orig:TD.orig,dest:TD.dest,data:'',prev:'',...(x.d==TD.base?{data:TD.data,prev:TD.prev}:{}),...tget()[x.d]};if(!o.data)o.data=new Date().toISOString().slice(0,10);
 const I=(id,l,v,t)=>`<label class="block text-sm mb-1">${l}</label><input id="${id}" type="${t||'text'}" class="inp w-full mb-3" value="${esc(v)}">`;
 mo(`<h2 class="text-lg font-bold mb-1">Termo para assinatura</h2><p class="text-sm text-slate-500 mb-4">Documento nº ${docNo(x)} · Data_Base ${br(x.d)}</p>${I('t-d','Data do documento',o.data,'date')}${I('t-p','Data prevista da transferência',o.prev,'date')}${I('t-o','Conta de origem - CSD',o.orig)}${I('t-t','Conta de destino - Fundo de Reserva',o.dest)}<div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="termoOk('${x.d}')">Gerar PDF</button></div>`)}
function termoOk(b){const x=D.find(r=>r.d==b),o={data:$('#t-d').value,prev:$('#t-p').value,orig:$('#t-o').value.trim(),dest:$('#t-t').value.trim()},a=tget();a[b]=o;try{localStorage.csd_termo_v1=JSON.stringify(a)}catch(e){}closeMd();termoGerar(x,o)}
/* Página 1 do Termo (aba "NNN-AAAA"): memória resumida e solicitação de transferência — A4 retrato */
function pag1(d,x,o){const HB=[180,198,231],LB=[217,225,242],X=40,W=515,pc=(FR*100).toLocaleString('pt-BR')+'%',
 T=(t,xx,yy,sz,b,al)=>d.setFont('helvetica',b?'bold':'normal').setFontSize(sz).setTextColor(0).text(String(t),xx,yy,{align:al||'left'}),
 P=(t,yy,sz)=>{const l=d.splitTextToSize(t,W);d.setFont('helvetica','normal').setFontSize(sz).setTextColor(0).text(l,X,yy);return yy+l.length*sz*1.3},
 Bx=(x0,y0,w,h,fc)=>{d.setDrawColor(90).setLineWidth(.5);if(fc)d.setFillColor(...fc);d.rect(x0,y0,w,h,fc?'FD':'S')},
 Rw=(y,h,a,b,o2={})=>{Bx(X,y,o2.c||330,h,o2.fa);Bx(X+(o2.c||330),y,W-(o2.c||330),h,o2.fb);T(a,o2.ca?X+(o2.c||330)/2:X+4,y+h/2+3,8.5,o2.ba,o2.ca?'center':'left');T(b,o2.cb?X+(o2.c||330)+(W-(o2.c||330))/2:o2.vl?X+(o2.c||330)+4:X+W-4,y+h/2+3,8.5,o2.bb,o2.cb?'center':o2.vl?'left':'right');return y+h},
 Sx=(t,y)=>{T(t,X,y,9,1);return y+13};
 d.addImage(LOGO,'PNG',X,22,110,110/LR);
 d.setFillColor(...HB).rect(X,76,W,42,'F');T('MEMÓRIA DE CÁLCULO E SOLICITAÇÃO DE TRANSFERÊNCIA',X+W/2,94,12.5,1,'center');T('DE RECURSOS PARA O FUNDO DE RESERVA',X+W/2,110,12.5,1,'center');
 T('Documento nº: '+docNo(x),X+W,132,9,1,'right');T('Data: '+(o.data?br(o.data):''),X+W,144,9,1,'right');
 let y=Sx('1. OBJETIVO',166);y=P('Formalizar a memória de cálculo e solicitar a autorização dos representantes legais das empresas consorciadas para a transferência de recursos da conta corrente do Consórcio para a conta bancária, também do Consórcio, destinada ao Fundo de Reserva, no Banco Santander, em atendimento ao percentual previsto na NPO, conforme cláusula 3.4 (Aportes), alínea V.',y,8.5)+14;
 y=Sx('2. MEMÓRIA DE CÁLCULO RESUMIDA',y);y=Rw(y,15,'Descrição','Valor',{fa:LB,fb:LB,ba:1,bb:1,ca:1,cb:1});
 y=Rw(y,15,'Valor recebido',f(x.liq));y=Rw(y,15,'Percentual do Fundo de Reserva (NPO)',pc);y=Rw(y,15,'Valor a ser transferido para o Fundo de Reserva',f(x.fr),{bb:1})+16;
 y=Sx('3. SOLICITAÇÃO DE AUTORIZAÇÃO',y);y=P('Com base na memória de cálculo acima e nas disposições da NPO, solicita-se a autorização dos representantes legais/conselho executivo das empresas consorciadas para a transferência do valor calculado da conta corrente do Consórcio para a conta bancária do Fundo de Reserva, no Banco Santander.',y,10)+10;
 y=Sx('4. DADOS DA TRANSFERÊNCIA',y);const R4=(a,b,bb)=>{y=Rw(y,15,a,b,{c:200,fa:LB,ba:1,vl:1,bb})};
 R4('Conta de origem - CSD',o.orig);R4('Conta de destino - Fundo de Reserva',o.dest);R4('Valor da transferência',f(x.fr),1);R4('Data prevista',o.prev?br(o.prev):'');y+=16;
 y=Sx('5. AUTORIZAÇÃO DOS REPRESENTANTES LEGAIS',y);y=P('Os representantes legais abaixo identificados, na qualidade de representantes das empresas consorciadas, manifestam sua autorização para a transferência acima.',y,10)+8;
 y=Rw(y,16,'EMPRESA CONSORCIADA','REPRESENTANTE LEGAL',{c:260,fa:LB,fb:LB,ba:1,bb:1,ca:1,cb:1});
 EMP.forEach(e=>{Bx(X,y,260,40);Bx(X+260,y,W-260,40);T(e,X+130,y+23,8.5,0,'center');y+=40})}
function termoGerar(x,o){if(ROLE!='admin')return;
 const d=new jspdf.jsPDF('p','pt','a4'),s=.648,B=[31,78,121],LB=[221,235,247],MB=[155,194,230],NV=[31,56,100],G=[166,166,166],GL=[217,217,217],W=[255,255,255],
 R=(x0,y0,x1,y1,fc,lc)=>{if(fc)d.setFillColor(...fc);if(lc)d.setDrawColor(...lc);d.rect(x0*s,y0*s,(x1-x0)*s,(y1-y0)*s,fc&&lc?'FD':fc?'F':'S')},
 T=(t,xx,yy,sz,b,al,col)=>{d.setFont('helvetica',b?'bold':'normal').setFontSize(sz*s).setTextColor(...(col||[0,0,0])).text(String(t),xx*s,yy*s,{align:al||'left'})},
 V=(c,y0,y1,col,lw)=>{d.setDrawColor(...col).setLineWidth(lw);c.forEach(v=>d.line(v*s,y0*s,v*s,y1*s))},
 [yy,mm]=x.d.split('-'),ME=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
 pc=(v,n=2)=>(v*100).toFixed(n).replace('.',',')+'%',bp=v=>x.bruto?pc(v/x.bruto):'-',f0=v=>'R$ '+Math.round(v).toLocaleString('pt-BR');
 pag1(d,x,o);d.addPage('a4','l');d.setLineWidth(.5);
 /* logo + título */
 d.addImage(LOGO,'PNG',88*s,115*s,137*s,137*s/LR);
 R(85,181,1208,204,B,B);T('APURAÇÃO DA TRANSFERÊNCIA PARA O FUNDO DE RESERVA',646,198,19,1,'center',W);
 T('Documento nº:',258,217,12,1,'right');T(docNo(x),318,217,12,0,'center');
 T('Data base referência:',258,236,12,1,'right');T(ME[+mm-1]+', '+yy,318,236,12,0,'center',[255,0,0]);
 T(`Apuração do Fundo de Reserva (${pc(FR,0)} / Faturamento Líquido)`,630,256,13,1,'right',B);R(678,243,816,262,[255,242,204],G);T(pc(FR),747,257,13,1,'center',[0,0,255]);
 /* KPIs */
 const kc=[85,388,678,956,1208],kl=['FATURAMENTO LÍQUIDO (DE IMPOSTOS)','(-) DEDUÇÃO DO ADIANTAMENTO','SALDO A RECEBER DO CLIENTE','TRANSFERIR AO FUNDO DE RESERVA'],kv=[x.liq,-x.adi,x.sal,x.fr];
 R(85,262,1208,279,B,B);R(85,280,1208,312,LB);V(kc.slice(1,-1),262,312,W,1.2);
 kl.forEach((t,i)=>{const c=(kc[i]+kc[i+1])/2;T(t,c,274,11,1,'center',W);T(f(kv[i]),c,301,17,1,'center',NV)});
 /* detalhamento */
 T('DETALHAMENTO POR PERÍODO',88,327,13,1,'left',B);
 const cb=[85,249,388,526,677,816,955,1093,1208],hd=['Data Base','Valor Bruto da NF','(-) Impostos',['Faturamento Líquido','(de Impostos)'],['(-) Desconto','Adiantamento'],['Saldo a Receber','do Cliente'],'Fundo de Reserva','Impostos s/ Bruto'],
 vl=[br(x.d),f(x.bruto),f(x.ret),f(x.liq),f(-x.adi),f(x.sal),f(x.fr),pc(x.bruto?x.ret/x.bruto:0,1)];
 R(85,332,1208,364,B,B);V(cb.slice(1,-1),332,364,W,1);
 hd.forEach((h,i)=>{const c=(cb[i]+cb[i+1])/2,a=[].concat(h);a.length>1?a.forEach((t,j)=>T(t,c,344+j*13,11,1,'center',W)):T(a[0],c,352,11,1,'center',W)});
 [364,380].forEach((y,r)=>{R(85,y,1208,y+(r?17:16),W,GL);V(cb.slice(1,-1),y,y+17,GL,.5)});
 R(677,364,816,380,[255,242,204],GL);
 vl.forEach((t,i)=>i?T(t,cb[i+1]-5,376,11,i==6,'right',i==6?NV:[0,0,0]):T(t,(cb[0]+cb[1])/2,376,11,0,'center'));
 R(85,398,1208,415,MB,MB);d.setDrawColor(...B).setLineWidth(1.6).line(85*s,398*s,1208*s,398*s);
 T('TOTAL',(cb[0]+cb[1])/2,411,12,1,'center',NV);vl.forEach((t,i)=>i&&T(t,cb[i+1]-5,411,11,1,'right',NV));
 /* memória de cálculo */
 R(85,427,527,443,B,B);T('MEMÓRIA DE CÁLCULO',306,439,12,1,'center',W);
 R(85,443,527,460,MB,MB);T('Indicador',167,455,11,1,'center',NV);T('Valor (R$)',318,455,11,1,'center',NV);T('% do Bruto',457,455,11,1,'center',NV);
 [['Valor Bruto da NF',x.bruto,0],['(-) Impostos',x.ret,0],['Fat. Líquido (de Impostos)',x.liq,1],['(-) Desconto Adiantamento',x.adi,0],['Saldo a Receber do Cliente',x.sal,0],['Fundo de Reserva',x.fr,1]].forEach((r,i)=>{
  const y=460+i*17;R(85,y,527,y+17,i%2?[242,242,242]:W,GL);V([249,388],y,y+17,GL,.5);
  T(r[0],89,y+12.5,11,r[2]);T(f0(r[1]),384,y+12.5,11,r[2],'right');T(bp(r[1]),523,y+12.5,11,r[2],'right')});
 /* gráfico: Composição do Faturamento */
 d.setDrawColor(64,64,64).setLineWidth(.8).roundedRect(623*s,423*s,545*s,146*s,10*s,10*s,'S');
 T('Composição do Faturamento (R$)',896,447,17,1,'center',[38,38,38]);
 const mx=x.bruto||1;
 [['Valor Bruto da NF',x.bruto],['(-) Impostos',x.ret],['Faturamento Líquido',x.liq],['(-) Desconto Adiantamento',x.adi],['Saldo a Receber',x.sal]].forEach((r,i)=>{
  const cy=462+i*21.8,w=294*Math.max(r[1],0)/mx;T(r[0],752,cy+3.5,9,1,'right',[38,38,38]);R(763,cy-5,763+w,cy+5,NV);T(f0(r[1]),763+w+6,cy+3.5,9,1,'left',[38,38,38])});
 d.setDrawColor(...G).setLineWidth(.5).line(763*s,454*s,763*s,562*s);
 saveAs('termo_'+docNo(x).replace('/','-')+'_'+x.d+'.pdf',d.output('arraybuffer'))}

