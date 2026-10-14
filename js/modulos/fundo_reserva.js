/* Módulo Fundo de Reserva: leitura da planilha, cálculos (1% do Faturamento Líquido), dashboard,
   exportações Excel/PDF e Termo de Responsáveis (PDF para assinatura).
   Depende de js/core/app.js (utilitários) e é carregado antes de js/core/main.js. */
let FR=.01;const TD={orig:'SANTANDER, Ag. 3324 - CC 130105657',dest:'SANTANDER, Ag. 3324 - CC 130105877',data:'',prev:'',base:''},
 EMP=['BELOV OBRAS PORTUÁRIAS LTDA','CTC INFRA & CONSTRUCOES LTDA','CARIOCA CHRISTIANI-NIELSEN ENGENHARIA S.A'],TXK=['iss','inss','pis','cof','ir','cs','out'],
 TX={iss:'ISS',inss:'INSS',pis:'PIS',cof:'COFINS',ir:'IR',cs:'Contribuições Sociais',out:'Outras Retenções'},
 K=['bruto','ded','base','ret','liq','adi','sal','fr'],
 L={bruto:'Valor Bruto da NF',ded:'Deduções',base:'Base de Cálculo',ret:'Impostos',liq:'Faturamento Líquido (de Impostos)',adi:'(-) Desconto Adiantamento',sal:'Saldo a Receber do Cliente',fr:'Fundo de Reserva'},
 MAP=[['titulo','titulo'],['tf','faturado'],['adi','deducao do adiantamento'],['sal','saldo a receber'],['ded','deducoes'],['base','base de calculo'],['aliq','aliquota'],['iss','iss'],['cns','nota salvada'],['inss','inss'],['pis','pis'],['cof','cofins'],['ir','valor ir'],['cs','contribuicoes'],['out','outras'],['liq','valor liquido']],
 C=[['d','Data_Base'],['titulo','Nº do Título'],['tf','Total Faturado'],['ded','Deduções'],['base','Base Cálc.'],['aliq','Alíq.'],['iss','ISS'],['inss','INSS'],['pis','PIS'],['cof','COFINS'],['ir','IR'],['cs','Contrib. Soc.'],['out','Outras'],['ret','Impostos'],['liq','Líquido'],['adi','(-) Desc. Adiantamento'],['sal','Saldo a Receber do Cliente'],['fr','Fundo de Reserva']],
 FCT={titulo:'Número do título no contas a receber do ERP (TOTVS). É texto: os zeros à esquerda ficam. Clique no valor para selecioná-lo e copie com Ctrl+C',tf:'Total Faturado informado na planilha (é o Valor Bruto da NF dos cartões e gráficos). Deve ser igual a Deduções + Base de Cálculo; fica em âmbar quando for diferente'},
 P=['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#ec4899'];
let D=[],sel='',pg=1,sk='d',sd=1,DOC='',
 RESP=[{papel:'Elaboração',nome:'Financeiro do Consórcio'},{papel:'Conferência',nome:'Gerente Administrativo Financeiro (GAF)'},{papel:'Atesto da Diretoria',nome:'Diretor Belov'},{papel:'Atesto da Diretoria',nome:'Diretor Carioca'},{papel:'Atesto da Diretoria',nome:'Diretor CTC'}];

/* ---------- Dados ---------- */
function norm(o){TXK.forEach(k=>o[k]=+o[k]||0);o.ded=+o.ded||0;o.base=+o.base||0;o.aliq=+o.aliq||0;o.cns=+o.cns||0;
 o.ret=+o.ret||TXK.reduce((a,k)=>a+o[k],0);o.bruto=+o.bruto||o.ded+o.base;o.liq=+o.liq||o.bruto-o.ret;
 o.adi=+o.adi||0;o.sal=+o.sal||o.liq-o.adi;o.fr=o.liq*FR;
 o.titulo=String(o.titulo==null?'':o.titulo).trim();o.tf=+o.tf||o.bruto;/* Total Faturado: sem a coluna na planilha vale o Valor Bruto */return o}
function toIso(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v=='number')return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
 v=String(v).trim();const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:v.slice(0,10)}
/* Erro com texto pronto para o usuário (os demais viram a mensagem genérica) */
const FE=m=>Object.assign(new Error(m),{fr:1}),
 /* número tolerante: aceita número do Excel e texto no padrão brasileiro ("4.864.267,00", "R$ 1.234,56", "-" = 0) */
 nv=v=>{if(typeof v=='number')return isFinite(v)?v:0;if(typeof v!='string')return 0;let s=v.replace(/[R$\s\u00a0]/g,'');if(!s)return 0;
  const ng=/^\(.*\)$/.test(s)||/^-|-$/.test(s);s=s.replace(/[()-]/g,'');s=s.includes(',')?s.replace(/\./g,'').replace(',','.'):/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,''):s;
  const n=parseFloat(s);return isNaN(n)?0:ng?-n:n},
 /* cabeçalho da aba Faturamento (procura nas 15 primeiras linhas): coluna Data_Base + ao menos uma coluna conhecida */
 cabFat=a=>{for(let i=0;i<Math.min(a.length,15);i++){const H=a[i].map(c=>N(c).replace(/[_\s]+/g,' ')),b=H.findIndex(h=>h.startsWith('data base')),di=b>=0?b:H.findIndex(h=>h.includes('data'));
  if(di>=0&&H.some((h,j)=>j!=di&&MAP.some(m=>h.includes(m[1]))))return{hi:i,di,H}}return null};
let AV=[],AZ=[],CI={titulo:false,tf:false};/* avisos da última leitura: Total Faturado × Valor Bruto (AV), zeros à esquerda do nº do título (AZ) e colunas novas reconhecidas (CI) */
function parse(wb){
 AV=[];AZ=[];CI={titulo:false,tf:false};const s1=wb.SheetNames.find(x=>N(x).includes('fatur'))||wb.SheetNames[0],S2={},DX=/^\d{3}-\d{4}$/,
  rd=n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:''});
 /* aba "Faturamento": uma linha por Data_Base. As colunas são achadas PELO NOME do cabeçalho (sem acento/caixa, em qualquer posição):
    colunas novas (ex.: "Numero do Titulo", "Total Faturado") não deslocam as demais e planilhas no layout antigo continuam valendo */
 const fa=rd(s1),cb=cabFat(fa),out=[];if(!cb)throw FE('não achei o cabeçalho da aba "'+s1+'" (precisa da coluna Data_Base e de colunas como Base de Cálculo, ISS, INSS e Valor Líquido)');
 const col={};cb.H.forEach((h,j)=>{if(j==cb.di)return;const m=MAP.find(a=>h.includes(a[1]));if(m)col[m[0]]=j});
 let fw=null;if(col.titulo>=0)try{fw=XLSX.utils.sheet_to_json(wb.Sheets[s1],{header:1,raw:false,defval:''})}catch(e){}/* texto como aparece no Excel (ex.: nº do título 00000004 gravado como número com máscara) */
 const nzs=[];/* posições (em out) dos títulos que vieram como NÚMERO sem máscara: o Excel não guarda zeros à esquerda em número */
 for(let i=cb.hi+1;i<fa.length;i++){const r=fa[i],rv=r[cb.di];if(rv===''||rv==null)continue;const d=toIso(rv);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))continue;/* ignora linhas sem data (ex.: "Total") */
  const o={d};for(const k in col)if(k!='titulo')o[k]=nv(r[col[k]]);
  /* Nº do título = TEXTO, nunca número: "00000004" não pode virar 4 (a busca no contas a receber do ERP usa os zeros) */
  if(col.titulo>=0){const t0=r[col.titulo];let t=t0;if(typeof t=='number'){const w=fw&&fw[i]&&fw[i][col.titulo];t=w!==''&&w!=null?String(w):String(t0);
    if(Number.isInteger(t0)&&t0>=0&&/^\d+$/.test(t)&&t.length<=String(t0).length)nzs.push(out.length)}
   o.titulo=String(t==null?'':t).trim()}
  out.push(o)}
 if(!out.length)throw FE('a aba "'+s1+'" não tem nenhuma linha com Data_Base preenchida');
 /* zeros perdidos: com títulos em TEXTO zerados na mesma planilha (ex.: 00000004) a largura do padrão é conhecida, e os que vieram como número ganham os zeros de volta; sem esse padrão, só avisa */
 if(nzs.length){const wd=out.filter((o,i)=>!nzs.includes(i)&&/^0\d*$/.test(o.titulo)).map(o=>o.titulo.length),W=wd.length?Math.max(...wd):0,fx=[],sp=[];
  nzs.forEach(i=>{const o=out[i],n0=o.titulo;if(W>n0.length){o.titulo=n0.padStart(W,'0');fx.push(br(o.d)+': '+n0+' → '+o.titulo)}else if(!W)sp.push(br(o.d)+' ('+n0+')')});
  if(fx.length)AZ.push('Numero do Titulo veio como número e perdeu os zeros à esquerda; completei com o padrão dos outros títulos ('+fx.join('; ')+'). Confira e, na planilha, formate a coluna do título como Texto antes de digitar.');
  if(sp.length)AZ.push('Numero do Titulo está como número em '+sp.join(', ')+': o Excel não guarda zeros à esquerda em número. Se o título tem zeros (ex.: 00000004), formate a coluna como Texto antes de digitar.')}
 CI={titulo:col.titulo>=0,tf:col.tf>=0};DOC='';/* só zera o nº do documento depois de a aba Faturamento ter sido lida com sucesso */
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
 const res=out.map(o=>{const s=S2[o.d]||{};return norm({...s,...o,adi:o.adi||s.adi})});
 /* conferência: o Total Faturado informado precisa bater com o Valor Bruto da NF (Deduções + Base de Cálculo); diferença vira aviso (não bloqueia) */
 res.forEach((r,i)=>{if(CI.tf&&out[i].tf>0&&Math.abs(r.tf-r.bruto)>=.005)AV.push(br(r.d)+' (Total Faturado '+f(r.tf)+' × Valor Bruto '+f(r.bruto)+')')});
 return res;
}
/* toda linha que entra na tela (planilha, base publicada ou exemplo) passa por aqui: bases publicadas ANTES das colunas "Numero do Titulo" e "Total Faturado" não têm esses campos
   (o Total Faturado vale o Valor Bruto e o título fica vazio); o título é sempre texto */
function setData(arr){arr.forEach(r=>{r.titulo=String(r.titulo==null?'':r.titulo).trim();r.tf=+r.tf||r.bruto||0});D=arr.sort((a,b)=>a.d<b.d?-1:1);
 $('#sel').innerHTML=D.slice().reverse().map(x=>`<option value="${x.d}">${br(x.d)}</option>`).join('')+'<option value="">Todas as Data_Base</option>';
 sel=D.length?D[D.length-1].d:'';$('#sel').value=sel;pg=1;render()}
/* Upload (permissão fundo.publicar) apenas LÊ a planilha e mostra como rascunho; só vai para os demais usuários quando o admin clica em "Publicar atualização" */
let PEND=null;
function fBar(){const b=$('#fpub');if(!b)return;if(PEND){$('#fpubt').innerHTML='⚠ <b>Atualização ainda não publicada</b>: '+PEND.n+' Data_Base lida(s) de "'+esc(PEND.arq)+'". Só você vê estes dados até publicar.'+(PEND.av||[]).map(a=>'<span class="block text-xs mt-1">⚠ '+esc(a)+'</span>').join('');b.classList.remove('hidden')}else b.classList.add('hidden')}
$('#fi').onchange=e=>{if(!PERM.tem('fundo.publicar'))return;const fl=e.target.files[0];if(!fl)return;const r=new FileReader();
 r.onload=ev=>{try{const d=parse(XLSX.read(ev.target.result,{type:'array'})),av=(AV.length?['Total Faturado diferente do Valor Bruto (Deduções + Base de Cálculo) em: '+AV.join('; ')+'.']:[]).concat(AZ);setData(d);PEND={arq:fl.name,n:d.length,av};fBar();
   const nt=CI.titulo&&CI.tf?'Colunas “Numero do Titulo” e “Total Faturado” reconhecidas.':!CI.tf?'Planilha sem a coluna “Total Faturado”: o card de Faturas Emitidas usa o Valor Bruto.':'Planilha sem a coluna “Numero do Titulo”.';
   msg(`${d.length} Data_Base lida(s) de "${fl.name}". ${nt}${av.length?' ⚠ '+av.join(' ⚠ ')+' Confira antes de publicar.':''} Confira os valores e clique em “Publicar atualização” para liberar a todos.`,av.length?2:0,av.length?25000:0)}
  catch(x){msg('Não foi possível ler o arquivo'+(x&&x.fr?': '+x.message+'.':'.')+' Verifique as colunas (Data_Base, Base de Cálculo, ISS, INSS, Valor Líquido...).',1)}};
 r.readAsArrayBuffer(fl);e.target.value=''};
function fundoPub(){if(!PERM.tem('fundo.publicar')||!PEND)return;const P=PEND;msg('Publicando para todos…');
 BASE.gravar('fundo_reserva',{d:D,FR,DOC,TD},P.arq).then(r=>{FST=r.atualizado_em;fMeta(r.atualizado_em,P.arq);PEND=null;fBar();msg(`✔ ${P.n} Data_Base de "${P.arq}" publicada(s) para todos os usuários`)}).catch(e=>msg(`NÃO publicado para os demais usuários: ${e.message||e}`,1))}
function fundoDesc(){if(!PERM.tem('fundo.publicar')||!PEND)return;PEND=null;fBar();FST='';fundoNuvem().then(ok=>{if(!ok)seed()});msg('Atualização descartada: voltou a base publicada.')}
/* ---------- Base compartilhada (Supabase · tabela public.bases, chave fundo_reserva) ---------- */
let FST='';
function fMeta(ts,arq){const e=document.getElementById('fmeta');if(e)e.textContent=ts?' · Base publicada em '+BASE.fdh(ts)+(arq?' · '+arq:''):''}
async function fundoNuvem(){if(PEND)return true;try{const r=await BASE.ler('fundo_reserva'),x=r&&r.dados;
  if(x&&Array.isArray(x.d)&&x.d.length){if(r.atualizado_em!=FST){FST=r.atualizado_em;FR=+x.FR||FR;DOC=x.DOC||'';if(x.TD)Object.assign(TD,x.TD);setData(x.d)}fMeta(r.atualizado_em,r.arquivo);return true}}
 catch(e){msg('Não consegui carregar a base do Fundo de Reserva: '+(e.message||e)+'. Confira se o SQL supabase/bases-dados.sql foi executado.',1)}return false}
/* e: 0 = ok (verde) · 1 = erro (vermelho) · 2 = aviso (âmbar); ms = tempo na tela (avisos longos ficam mais). Cada aviso zera o relógio do anterior */
let FMT=0;function msg(t,e,ms){const m=$('#toast');m.textContent=t;m.className='text-sm rounded-lg px-3 py-2 '+(e==2?'bg-amber-500/10 text-amber-700 dark:text-amber-300':e?'bg-rose-500/10 text-rose-500':'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400');clearTimeout(FMT);FMT=setTimeout(()=>m.classList.add('hidden'),ms||6000)}

/* ---------- NF da emissão (Faturas Emitidas) ----------
   Ao escolher a Data_Base, mostra a(s) NF(s) vigente(s) anexada(s) em "Faturas Emitidas" cuja DATA DA EMISSÃO cai no MÊS dela (a faixa fala de emissão, não do período do serviço), com o Valor Bruto da NF e os botões
   👁 Visualizar (abre a NF na tela, sem baixar) e ⬇ Baixar. Se a NF foi refaturada, vale a versão corrigida.
   A faixa aparece só para quem tem a permissão fat.ver (ver/baixar NF); o banco confere a mesma permissão ao entregar o arquivo. */
let FNFon=false;
function fNFcarrega(){if(typeof FDB=='undefined'||!PERM.tem('fat.ver'))return;if(!FNFon){FNFon=true;FDB.on(()=>{if(document.querySelector('[data-view=fundo]:not(.hidden)'))fNF()})}FDB.carregar().catch(()=>{}).then(fNF)}
function fNF(){const e=document.getElementById('fnf');if(!e)return;
 if(typeof FDB=='undefined'||!PERM.tem('fat.ver')){e.innerHTML='';return}
 const bx='rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1',mudo=bx+' border-slate-300/60 dark:border-slate-700 text-slate-500';
 if(!sel){e.innerHTML=`<div class="${mudo}">🧾 Escolha uma Data_Base para ver ou baixar a NF da emissão do mês.</div>`;return}
 const ym=sel.slice(0,7),cp=ym.slice(5)+'/'+ym.slice(0,4);
 if(!FDB.ok){e.innerHTML=FDB.erro?(PERM.tem('fat.anexar')?`<div class="${bx} border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">🧾 NFs indisponíveis: ${esc(FDB.erro)}</div>`:''):`<div class="${mudo}">🧾 Carregando a NF da emissão ${cp}…</div>`;return}
 const L=FDB.mes(ym);
 e.innerHTML=L.length?L.map(x=>`<div class="${bx} border-indigo-500/30 bg-indigo-500/10" data-nf="${esc(x.id)}"><span class="font-semibold">🧾 NF da emissão ${cp}</span><span>${x.num?'nº '+esc(x.num)+' · ':''}emitida em ${br(x.comp)}</span>${x.vb!=null?`<span class="font-semibold tabular-nums" data-vb title="Valor Bruto da NF">Valor Bruto ${f(x.vb)}</span>`:''}<span class="text-slate-500 max-w-[260px] truncate" title="${esc(x.nome)}">${esc(x.nome)} (${FDB.tam(x.bytes)})</span>${x.v>1?`<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400" title="${esc(x.mot)}">Refaturada · v${x.v}</span>`:''}<span class="ml-auto flex flex-wrap gap-2"><button class="btn2" data-nfv title="Abrir a NF aqui na tela, sem baixar" onclick="fundoNFV('${esc(x.id)}')">👁 Visualizar NF</button><button class="btn" data-nfd onclick="fundoNF('${esc(x.id)}')">⬇ Baixar NF</button></span></div>`).join(''):`<div class="${mudo}">🧾 Nenhuma NF anexada com emissão em ${cp}.${PERM.tem('fat.anexar')?' <button class="underline text-indigo-500" onclick="go(\'fat\')">Anexar em Faturas Emitidas</button>':''}</div>`}
function fundoNF(id){FDB.baixarNF(id).catch(e=>msg('Não consegui baixar a NF: '+(e.message||e),1))}
function fundoNFV(id){NFV.abrir(id)}

/* ---------- Render ---------- */
const sum=(r,k)=>r.reduce((a,x)=>a+x[k],0),cur=()=>sel?D.filter(x=>x.d==sel):D,CH={};
function mk(id,t,data,o={}){CH[id]&&CH[id].destroy();CH[id]=new Chart($('#'+id),{type:t,data,options:{responsive:true,maintainAspectRatio:false,...o}})}
function rank(id,it,tot){const m=Math.max(...it.map(a=>a[1]),1);$('#'+id).innerHTML=it.length?it.map((a,i)=>`<div class="mb-3"><div class="flex justify-between text-sm gap-2"><span>${i+1}. ${a[0]}</span><b>${f(a[1])}</b></div><div class="h-2 rounded bg-slate-200 dark:bg-slate-800"><div class="h-2 rounded" style="width:${a[1]/m*100}%;background:${P[i%7]}"></div></div></div>`).join('')+(tot==null?'':`<div class="flex justify-between text-sm gap-2 pt-3 mt-auto border-t-2 border-slate-300 dark:border-slate-700 font-bold"><span>TOTAL</span><b>${f(tot)}</b></div>`):'<p class="text-sm text-slate-400">Sem dados</p>'}
function render(){
 const r=cur(),b=sum(r,'bruto');
 const kp=[['bruto',''],['liq',`Impostos ${f(sum(r,'ret'))} (${b?p(sum(r,'ret')/b):'—'} do bruto)`],['sal',`(-) Desconto Adiantamento ${f(-sum(r,'adi'))}`],['fr',(FR*100)+'% do Faturamento Líquido']];
 const IKP={bruto:['recibo','azul'],liq:['sobe','ver'],sal:['cofre','ind'],fr:['cofrinho','amb']};
 $('#kpis').innerHTML=kp.map((a,i)=>{const w=a[0]=='fr';return CRT.kpi({t:L[a[0]],v:f(sum(r,a[0])),s:a[1],ic:IKP[a[0]][0],tom:IKP[a[0]][1],cls:'border-t-4 '+(w?'!bg-indigo-100 dark:!bg-indigo-600 text-black dark:text-white':''),st:'border-top-color:'+P[i],sc:w?'text-black dark:text-indigo-100':'text-slate-400',mx:1.6})}).join('');
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
 fNF();T()}
const fm=(k,x)=>k=='d'?br(x.d):k=='titulo'?(x.titulo||'—'):k=='aliq'?p(x.aliq):f(k=='adi'?-x[k]:x[k]);
/* célula da tabela: o texto vai ESCAPADO (o nº do título vem da planilha); o título é texto (zeros à esquerda), selecionável com 1 clique para colar no contas a receber do ERP; Total Faturado diferente do Valor Bruto fica em âmbar */
const fTd=(k,x)=>{let cl='px-3 py-2 whitespace-nowrap',tt='';
 if(k=='fr')cl+=' font-semibold text-indigo-500';
 else if(k=='titulo'){cl+=' tabular-nums select-all';if(x.titulo)tt='Clique para selecionar · Ctrl+C copia o título com os zeros'}
 else if(k=='tf'&&Math.abs(x.tf-x.bruto)>=.005){cl+=' text-amber-500 font-semibold';tt='Total Faturado diferente de Deduções + Base de Cálculo ('+f(x.bruto)+'): confira a planilha'}
 return`<td class="${cl}"${tt?` title="${esc(tt)}"`:''}>${esc(fm(k,x))}</td>`};
function flt(){const q=$('#q').value.toLowerCase(),a=$('#d1').value,b=$('#d2').value;
 return cur().filter(x=>(!a||x.d>=a)&&(!b||x.d<=b)&&(!q||C.map(c=>fm(c[0],x)).join(' ').toLowerCase().includes(q))).sort((x,y)=>(x[sk]>y[sk]?1:-1)*sd)}
function srt(k){sd=sk==k?-sd:1;sk=k;T()}
function T(){const r=flt(),ps=+$('#ps').value,pages=Math.ceil(r.length/ps)||1;pg=Math.max(1,Math.min(pg,pages));
 $('#th').innerHTML='<tr>'+C.map(c=>`<th class="px-3 py-2 cursor-pointer whitespace-nowrap"${FCT[c[0]]?` title="${esc(FCT[c[0]])}"`:''} onclick="srt('${c[0]}')">${c[1]}${sk==c[0]?(sd>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
 $('#tb').innerHTML=r.slice((pg-1)*ps,pg*ps).map(x=>'<tr class="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">'+C.map(c=>fTd(c[0],x)).join('')+'</tr>').join('')||`<tr><td colspan="${C.length}" class="p-4 text-center text-slate-400">Nenhum registro encontrado</td></tr>`;
 $('#cnt').textContent=r.length+' registro(s)';$('#pgi').textContent=`${pg} / ${pages}`}

/* ---------- Exportações ---------- */
/* Excel (padrão visual do Consórcio, js/core/xlsx_rel.js): faixa com logo e título, grupos de colunas, cabeçalho azul, Data_Base como data de verdade,
   valores em R$ no formato Contábil (centavos exatos, iguais aos da tela), Alíquota em %, Nº do Título como TEXTO (zeros à esquerda), filtro, painéis congelados (Data_Base e Título) e, com 2 ou mais registros, linha de TOTAL (SUBTOTAL: acompanha o filtro) */
async function xl(){
 try{
  const r=flt();if(!r.length){msg('Não há registros para exportar com os filtros atuais.',1);return}
  const E=XR,c=E.C,c2=v=>{const n=+f(v).replace(/\u2212/g,'-').replace(/[^\d,-]/g,'').replace(',','.');return n===0?0:n},/* o valor exato que a tela (f) mostra: centavos, meio centavo arredondado igual à tela, zero sem sinal */
   q=$('#q').value.trim(),a=$('#d1').value,b=$('#d2').value,fm_=document.getElementById('fmeta'),
   orig=PEND?'Rascunho não publicado · '+PEND.arq:(fm_?fm_.textContent.replace(/^[\s·]+/,''):''),
   sub=[sel?'Data_Base '+br(sel):'Todas as Data_Base',r.length+' registro(s)',a||b?'Período '+(a?br(a):'…')+' a '+(b?br(b):'…'):'',q?'Busca: “'+q+'”':'',
    'Fundo de Reserva = '+(FR*100).toLocaleString('pt-BR')+'% do Faturamento Líquido',orig,'Gerado em '+E.hoje()].filter(Boolean).join(' · '),
   M=(h,k,o)=>Object.assign({h,g:x=>c2(x[k]),nf:'contabil',tot:'sum'},o),
   cols=[{h:'DATA_BASE',g:x=>XP.serial(x.d),nf:'data',tot:'TOTAL'},
    {h:'Nº DO TÍTULO',g:x=>x.titulo||null,nf:'texto',al:'center'},/* TEXTO (formato "@"): o título 00000004 não perde os zeros nem ao ser editado no Excel */
    M('TOTAL FATURADO','tf'),M('DEDUÇÕES','ded'),M('BASE DE CÁLCULO','base'),{h:'ALÍQUOTA',g:x=>x.aliq,nf:'pct2',al:'center'},
    M('ISS','iss'),M('INSS','inss'),M('PIS','pis'),M('COFINS','cof'),M('IR','ir'),M('CONTRIB. SOCIAIS','cs'),M('OUTRAS RETENÇÕES','out'),M('TOTAL IMPOSTOS','ret'),
    M('FATURAMENTO LÍQUIDO','liq'),M('(-) DESC. ADIANTAMENTO','adi',{g:x=>c2(-x.adi)}),M('SALDO A RECEBER DO CLIENTE','sal'),M('FUNDO DE RESERVA','fr',{b:1,c:c.navy})],
   wb=XP.book({titulo:'Fundo de Reserva · Apuração por Data_Base'}),HR=8,
   {ws,t}=E.dados(wb,'Fundo de Reserva',{titulo:'Fundo de Reserva · Apuração por Data_Base',sub,rod:'Consórcio Santa Dulce · Fundo de Reserva',rows:r,hr:HR,fz:2,cent:1,total:r.length>1,/* com 1 registro só, a linha de TOTAL repetiria a própria linha */
    eq:cols.map((x,j)=>x.nf=='contabil'?j:-1).filter(j=>j>=0),cols});
  /* faixa de grupos acima do cabeçalho: organiza as 18 colunas por assunto */
  const gs={b:1,c:c.white,fg:c.navy,h:'center',v:'center',sz:9,bl:['thin',c.white],br:['thin',c.white]};
  ws.height(HR-1,18);[['PERÍODO E TÍTULO',2,3],['FATURAMENTO',4,6],['ALÍQUOTA, RETENÇÕES E IMPOSTOS',7,15],['RESULTADO',16,19]].forEach(g=>ws.merge(HR-1,g[1],HR-1,g[2],g[0],gs));
  ws.fillR(t.r1,19,t.r2,19,{fg:c.sky});/* destaque da coluna que importa: o valor a transferir ao Fundo */
  ws.noErr(t.r1,3,t.r2,3);/* o título é texto de propósito (zeros à esquerda): sem o triângulo verde "número armazenado como texto" */
  ws.o.titles=[HR-1,HR];ws.o.zoom=90;
  await saveAs('fundo_reserva_'+(sel||'todas')+'.xlsx',await wb.save())
 }catch(e){msg('Não consegui gerar o Excel: '+(e.message||e),1)}
}
function pdf(){const d=new jspdf.jsPDF('l','pt','a4'),r=flt(),cs=[['d','Data_Base'],['bruto','Valor Bruto'],['ret','Impostos'],['liq','Líquido'],['adi','(-) Desc. Adiantamento'],['sal','Saldo a Receber do Cliente'],['fr','Fundo de Reserva']];
 d.addImage(LOGO,'PNG',40,22,36*LR,36);d.setFontSize(16).text('Gestão Financeira CSD · Dashboard Executivo',40+36*LR+14,40);d.setFontSize(10).text('Data_Base: '+(sel?br(sel):'Todas')+' · Gerado em '+new Date().toLocaleString('pt-BR'),40+36*LR+14,56);
 d.autoTable({startY:75,head:[['Indicador','Valor']],body:K.map(k=>[L[k],f((k=='adi'?-1:1)*sum(cur(),k))]),headStyles:{fillColor:[79,70,229]},tableWidth:340});
 d.autoTable({startY:d.lastAutoTable.finalY+20,head:[cs.map(c=>c[1])],body:r.map(x=>cs.map(c=>fm(c[0],x))),headStyles:{fillColor:[79,70,229]}});
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

