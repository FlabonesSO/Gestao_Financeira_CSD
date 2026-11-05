/* Módulo Fundo de Reserva: leitura da planilha MEDICAO_SERVICO (aba “BASE DE MEDICAO”, só NFs com DOC FISCAL), cálculos (1% do Valor Bruto da NF), dashboard,
   exportações Excel/PDF e Termo de Responsáveis (PDF para assinatura).
   Depende de js/core/app.js (utilitários) e é carregado antes de js/core/main.js. */
let FR=.01;const TD={orig:'SANTANDER, Ag. 3324 - CC 130105657',dest:'SANTANDER, Ag. 3324 - CC 130105877',data:'',prev:'',base:''},
 EMP=['BELOV OBRAS PORTUÁRIAS LTDA','CTC INFRA & CONSTRUCOES LTDA','CARIOCA CHRISTIANI-NIELSEN ENGENHARIA S.A'],TXK=['iss','inss','pis','cof','ir','cs','out'],
 K=['bruto','fr'],
 L={bruto:'Total Faturado',fr:'Fundo de Reserva'},
 MAP=[['titulo','titulo'],['tf','faturado'],['adi','deducao do adiantamento'],['sal','saldo a receber'],['ded','deducoes'],['base','base de calculo'],['aliq','aliquota'],['iss','iss'],['cns','nota salvada'],['inss','inss'],['pis','pis'],['cof','cofins'],['ir','valor ir'],['cs','contribuicoes'],['out','outras'],['liq','valor liquido']],
 /* Detalhamento (nível diretoria): só estas 8 colunas (a última, Status, é escolhida pelo administrador: Aguardando Aprovação, Transferido ou A Receber). NF RECEBIDA (SIM/NAO) vem do Contas a Receber; ISS, INSS, retenção e adiantamento ficam nas telas Contas a Receber e Faturas Emitidas (Análise Fiscal) */
 C=[['d','Data_Base (Emissão NF)'],['titulo','DOC FISCAL'],['bruto','Valor Bruto (NF)'],['vl','Valor Líquido'],['dp','Data de Recebimento'],['fr','Fundo de Reserva'],['rcb','NF Recebida'],['st','Status Fundo de Reserva']],
 MONEY={bruto:1,vl:1,fr:1},
 FCT={d:'Data_Base = DATA EMISSAO NF (data de emissão da nota fiscal)',titulo:'DOC FISCAL = número do título da NF no contas a receber do ERP (TOTVS). É texto: os zeros à esquerda ficam. Clique no valor para selecioná-lo e copie com Ctrl+C',bruto:'Valor Bruto da NF (planilha MEDICAO_SERVICO): é o que foi faturado',vl:'Valor Líquido da planilha (coluna N): Valor Bruto − Retenção Contratual − Desconto do Adiantamento − ISS − INSS. É o valor que vamos receber',dp:'Data em que vamos receber, como está na planilha (coluna DATA PREVISTA DE PAGAMENTO: emissão da NF + prazo de pagamento)',rcb:'SIM = a NF já foi totalmente recebida (Contas a Receber) · NAO = ainda não recebida ou recebida só em parte. Quem não tem acesso ao Contas a Receber vê “—”',st:'Status da NF: Aguardando Aprovação, Transferido ou A Receber. Só o administrador altera (a escolha vale para todos os usuários)'},
 P=['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#ec4899'];
let D=[],sel='',pg=1,sk='d',sd=1,DOC='',FRP=null,
 RESP=[{papel:'Elaboração',nome:'Financeiro do Consórcio'},{papel:'Conferência',nome:'Gerente Administrativo Financeiro (GAF)'},{papel:'Atesto da Diretoria',nome:'Diretor Belov'},{papel:'Atesto da Diretoria',nome:'Diretor Carioca'},{papel:'Atesto da Diretoria',nome:'Diretor CTC'}];

/* ---------- Dados ---------- */
function norm(o){TXK.forEach(k=>o[k]=+o[k]||0);o.ded=+o.ded||0;o.base=+o.base||0;o.aliq=+o.aliq||0;o.cns=+o.cns||0;
 o.ret=+o.ret||TXK.reduce((a,k)=>a+o[k],0);o.bruto=+o.bruto||o.ded+o.base;o.liq=+o.liq||o.bruto-o.ret;
 o.adi=+o.adi||0;o.rc=+o.rc||0;o.glo=+o.glo||0;
 /* Valor Líquido (o que o cliente paga): o da planilha “BASE DE MEDICAO”; nas planilhas antigas é o Saldo a Receber (Faturamento Líquido − Desconto do Adiantamento). Fundo de Reserva = FR (1%) do Valor Bruto da NF */
 o.vl=o.vl==null||o.vl===''?(+o.sal||o.liq-o.adi-o.rc-o.glo):+o.vl;o.sal=o.vl;o.fr=frC(o.bruto);o.dp=o.dp||'';
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
  if(di>=0&&H.some((h,j)=>j!=di&&MAP.some(m=>h.includes(m[1]))))return{hi:i,di,H}}return null},
 /* valor em reais com centavos exatos (meio centavo para cima, sem resíduo de ponto flutuante) */
 mR=v=>{v=+v||0;return Math.sign(v)*Math.round(Math.abs(v)*100+1e-6)/100},
 /* Fundo de Reserva = FR (1%) do Valor Bruto da NF, em centavos */
 frC=b=>Math.round(Math.round((+b||0)*100)*FR+1e-6)/100,
 /* aba “BASE DE MEDICAO”: o cabeçalho é a linha que tem DOC FISCAL e Valor Bruto (NF) (hoje a linha 6); cada coluna é achada PELO NOME (ISS e INSS: “Retenção ISS/INSS” — o nome atual, porque o tomador retém — ou, nas planilhas anteriores, “Imposto ISS/INSS” ou “Retenção: ISS/INSS”) */
 cabMed=a=>{for(let i=0;i<Math.min(a.length,40);i++){const H=a[i].map(c=>N(c).replace(/\s+/g,' '));if(H.some(h=>h=='doc fiscal')&&H.some(h=>h.startsWith('valor bruto')))return{hi:i,H}}return null},
 MC=[['bruto','Valor Bruto (NF)',h=>h.startsWith('valor bruto')],['rc','Retenção Contratual',h=>/^retencao contratual\b/.test(h)],['adi','Valor Desconto Adiantamento',h=>h.startsWith('valor desconto adiantamento')],['glo','Glosa Técnica',h=>h.startsWith('glosa')],
  ['iss','Retenção ISS',h=>/^((retencao|imposto|valor)[: ]+)?(de )?iss$/.test(h)],['inss','Retenção INSS',h=>/^((retencao|imposto|valor)[: ]+)?(de )?inss$/.test(h)],['vl','Valor Líquido',h=>h=='valor liquido'],['titulo','DOC FISCAL',h=>h=='doc fiscal'],
  ['d','DATA EMISSAO NF',h=>h.startsWith('data emissao')],['dp','DATA PREVISTA DE PAGAMENTO',h=>h.startsWith('data prevista de pagamento')]],
 MOBR=['bruto','rc','adi','iss','inss','vl','titulo','d'];/* colunas sem as quais a planilha não é lida (Glosa Técnica e a data prevista são opcionais) */
let AV=[],AZ=[],MDA=[],MDI=null,CI={titulo:false,tf:false};/* avisos da última leitura: Total Faturado × Valor Bruto (AV, planilha antiga), zeros à esquerda do nº do título (AZ), conferências da aba BASE DE MEDICAO (MDA), resumo dessa aba (MDI) e colunas novas reconhecidas (CI) */
/* zeros perdidos: com títulos em TEXTO zerados na mesma planilha (ex.: 00000004) a largura do padrão é conhecida, e os que vieram como número ganham os zeros de volta; sem esse padrão, só avisa.
   `out` = linhas lidas, `nzs` = posições dos títulos que vieram como NÚMERO sem máscara (o Excel não guarda zeros à esquerda em número), `nome` = nome da coluna nas mensagens */
function fixZ(out,nzs,nome){const wd=out.filter((o,i)=>!nzs.includes(i)&&/^0\d*$/.test(o.titulo)).map(o=>o.titulo.length),W=wd.length?Math.max(...wd):0,fx=[],sp=[];
 nzs.forEach(i=>{const o=out[i],n0=o.titulo;if(W>n0.length){o.titulo=n0.padStart(W,'0');fx.push(br(o.d)+': '+n0+' → '+o.titulo)}else if(!W)sp.push(br(o.d)+' ('+n0+')')});
 if(fx.length)AZ.push(nome+' veio como número e perdeu os zeros à esquerda; completei com o padrão dos outros títulos ('+fx.join('; ')+'). Confira e, na planilha, formate a coluna do título como Texto antes de digitar.');
 if(sp.length)AZ.push(nome+' está como número em '+sp.join(', ')+': o Excel não guarda zeros à esquerda em número. Se o título tem zeros (ex.: 00000004), formate a coluna como Texto antes de digitar.')}
function parse(wb){
 const sm=wb.SheetNames.find(x=>N(x).replace(/\s+/g,' ')=='base de medicao');if(sm)return parseMed(wb,sm);
 return parseLeg(wb)}
/* Aba “BASE DE MEDICAO” (planilha MEDICAO_SERVICO): só entram as linhas que já têm DOC FISCAL (NF emitida). Data_Base = DATA EMISSAO NF.
   Valores em centavos exatos; Retenção Contratual (coluna I), Desconto do Adiantamento, ISS e INSS vêm negativos na planilha e ficam guardados como valores positivos.
   Valor Líquido = o da planilha (coluna N: é o que vamos receber); se não bater com Valor Bruto − Retenção Contratual − desconto − ISS − INSS, avisa (não bloqueia). Fundo de Reserva = 1% do Valor Bruto da NF. */
function parseMed(wb,sn){
 AV=[];AZ=[];MDA=[];MDI=null;CI={titulo:true,tf:true};FR=.01;
 const ws=wb.Sheets[sn],a=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}),cb=cabMed(a);
 if(!cb)throw FE('não achei o cabeçalho da aba "'+sn+'" (precisa das colunas Valor Bruto (NF) e DOC FISCAL)');
 const col={};MC.forEach(m=>{const j=cb.H.findIndex(m[2]);if(j>=0)col[m[0]]=j});
 const falta=MC.filter(m=>MOBR.includes(m[0])&&col[m[0]]==null).map(m=>m[1]);if(falta.length)throw FE('a aba "'+sn+'" não tem a(s) coluna(s) '+falta.join(', '));
 const r0=+((String(ws['!ref']||'').match(/\d+/)||[1])[0]),/* nº da 1ª linha da faixa lida: a linha i do vetor é a linha r0+i da planilha */
  fw=(()=>{try{return XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''})}catch(e){return null}})(),/* texto como aparece no Excel (nº do DOC FISCAL gravado como número com máscara) */
  out=[],nzs=[],vz=v=>v===''||v==null;let ign=0;
 for(let i=cb.hi+1;i<a.length;i++){const r=a[i],t0=r[col.titulo],ex='linha '+(r0+i);
  if(vz(t0)||String(t0).trim()===''||String(t0).trim()==='-'){if(!vz(r[col.bruto])&&nv(r[col.bruto])!==0)ign++;continue}/* sem DOC FISCAL = ainda não faturada: fica de fora */
  let t=t0;if(typeof t=='number'){const w=fw&&fw[i]&&fw[i][col.titulo];t=w!==''&&w!=null?String(w):String(t0);if(Number.isInteger(t0)&&t0>=0&&/^\d+$/.test(t)&&t.length<=String(t0).length)nzs.push(out.length)}
  const tit=String(t).trim(),d=toIso(r[col.d]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){MDA.push('DOC FISCAL '+tit+' ('+ex+') sem DATA EMISSAO NF válida: não entrou');continue}
  const g=k=>col[k]==null?0:nv(r[col[k]]),esp=g('bruto')-Math.abs(g('rc'))-Math.abs(g('adi'))-Math.abs(g('glo'))-Math.abs(g('iss'))-Math.abs(g('inss')),vc=r[col.vl];
  let vl;if(vz(vc)){vl=mR(esp);MDA.push('DOC FISCAL '+tit+' ('+ex+'): Valor Líquido vazio na planilha; calculei pelas colunas ('+f(vl)+')')}
  else{const v=nv(vc);vl=mR(v);if(Math.abs(v-esp)>=.005)MDA.push('DOC FISCAL '+tit+' ('+ex+'): Valor Líquido '+f(vl)+' da planilha ≠ '+f(mR(esp))+' (Valor Bruto − Retenção Contratual − desconto − ISS − INSS)')}
  if(col.glo!=null&&mR(Math.abs(g('glo')))>0)MDA.push('DOC FISCAL '+tit+' ('+ex+'): Glosa Técnica '+f(mR(Math.abs(g('glo'))))+' reduz o Valor Líquido mas não tem coluna na tela');
  const bruto=mR(g('bruto')),dpv=col.dp!=null&&!vz(r[col.dp])?toIso(r[col.dp]):'';
  out.push({d,titulo:tit,tf:bruto,bruto,rc:mR(Math.abs(g('rc'))),adi:mR(Math.abs(g('adi'))),glo:mR(Math.abs(g('glo'))),iss:mR(Math.abs(g('iss'))),inss:mR(Math.abs(g('inss'))),vl,dp:/^\d{4}-\d{2}-\d{2}$/.test(dpv)?dpv:''})}
 if(!out.length)throw FE('a aba "'+sn+'" não tem nenhuma linha com DOC FISCAL preenchido (só entram as NFs já emitidas)');
 if(nzs.length)fixZ(out,nzs,'DOC FISCAL');
 const dup=out.map(o=>o.d).filter((d,i,s)=>s.indexOf(d)!=i).filter((d,i,s)=>s.indexOf(d)==i);
 if(dup.length)MDA.push('Mais de uma NF com a mesma DATA EMISSAO NF ('+dup.map(br).join(', ')+'): a Data_Base é a data de emissão, então o Contas a Receber soma essas NFs numa só linha');
 MDI={ign,tot:out.length};DOC='';TD.data='';TD.prev='';TD.base=out.map(o=>o.d).sort()[0]||'';
 return out.map(norm)}
/* Planilha antiga (aba “Faturamento” + “NNN-AAAA_Memória”): continua sendo lida. O Fundo de Reserva também passa a ser 1% do Valor Bruto da NF. */
function parseLeg(wb){
 AV=[];AZ=[];MDA=[];MDI=null;CI={titulo:false,tf:false};const s1=wb.SheetNames.find(x=>N(x).includes('fatur'))||wb.SheetNames[0],S2={},DX=/^\d{3}-\d{4}$/,
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
 if(nzs.length)fixZ(out,nzs,'Numero do Titulo');
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
/* toda linha que entra na tela (planilha, base publicada ou exemplo) passa por aqui. Bases publicadas ANTES da aba “BASE DE MEDICAO” não têm Retenção Contratual, Valor Líquido nem a data prevista:
   o Valor Líquido vale o Saldo a Receber que já estava publicado, a retenção contratual é 0 e a data prevista fica vazia; o Total Faturado vale o Valor Bruto e o título fica vazio; o título é sempre texto.
   O Fundo de Reserva é sempre recalculado: 1% do Valor Bruto da NF (em centavos) */
function setData(arr){arr.forEach(r=>{r.titulo=String(r.titulo==null?'':r.titulo).trim();r.bruto=+r.bruto||0;r.tf=+r.tf||r.bruto;r.rc=+r.rc||0;r.glo=+r.glo||0;r.adi=+r.adi||0;r.iss=+r.iss||0;r.inss=+r.inss||0;r.ret=+r.ret||0;
  r.vl=r.vl==null||r.vl===''?(+r.sal||0):+r.vl;r.sal=r.vl;r.dp=r.dp||'';r.fr=frC(r.bruto)});D=arr.sort((a,b)=>a.d<b.d?-1:1);
 sel='';frSelOpts();pg=1;render()}   /* o filtro Data_Base abre em "Todas as Data_Base" (consolidado de toda a base); a escolha de uma data é do usuário */
/* ---------- Período (De/Até em meses · o mesmo de Contas a Receber e de Faturas Emitidas: js/core/periodo.js) ----------
   Meses (AAAA-MM) = os da Data_Base (= emissão da NF) da base. FRP = null → todos os meses (um mês novo na base entra sozinho). Nada é gravado: o período vale enquanto a tela está aberta.
   Vale para os cartões, o gráfico, a tabela Detalhamento, o PDF e o Excel do detalhamento, e a lista Data_Base só mostra as datas do período. Os documentos de emissão (Excel/Termo p/ assinatura) escolhem a NF entre TODAS da base. */
const frMeses=()=>[...new Set(D.map(x=>x.d.slice(0,7)))].sort(),frPer=()=>PER.fix(FRP,frMeses()),
 frOk=d=>{if(!FRP)return true;const p=frPer(),m=String(d).slice(0,7);return m>=p.de&&m<=p.ate},
 frTxt=()=>{const p=frPer();return PER.lb(p.de)+' a '+PER.lb(p.ate)};
/* lista Data_Base: só as datas do período (a mais recente primeiro) + "Todas as Data_Base"; a data escolhida que ficou fora do período volta para "Todas" */
function frSelOpts(){const L=D.filter(x=>frOk(x.d));if(sel&&!L.some(x=>x.d==sel))sel='';
 $('#sel').innerHTML=L.slice().reverse().map(x=>`<option value="${x.d}">${br(x.d)}</option>`).join('')+'<option value="">Todas as Data_Base</option>';$('#sel').value=sel}
/* a caixa só é refeita quando muda (os meses da base ou a escolha) */
function frPinta(){const el=document.getElementById('fr-per');if(!el)return;const h=PER.bar({id:'fr-pb',ms:frMeses(),s:frPer(),fn:'fundoPer',pre:'fundoPre'});if(el._h!==h){el.innerHTML=h;el._h=h}}
function fundoPer(k,v){const ms=frMeses(),t=PER.set(frPer(),k,v);FRP=ms.length&&PER.igual(t,{de:ms[0],ate:ms[ms.length-1]})?null:t;pg=1;frSelOpts();render()}
function fundoPre(a){FRP=null;pg=1;frSelOpts();render()}
/* Upload (permissão fundo.publicar) apenas LÊ a planilha e mostra como rascunho; só vai para os demais usuários quando o admin clica em "Publicar atualização" */
let PEND=null;
function fBar(){const b=$('#fpub');if(!b)return;if(PEND){$('#fpubt').innerHTML='⚠ <b>Atualização ainda não publicada</b>: '+PEND.n+' Data_Base lida(s) de "'+esc(PEND.arq)+'". Só você vê estes dados até publicar.'+(PEND.av||[]).map(a=>'<span class="block text-xs mt-1">⚠ '+esc(a)+'</span>').join('');b.classList.remove('hidden')}else b.classList.add('hidden')}
$('#fi').onchange=e=>{if(!PERM.tem('fundo.publicar'))return;const fl=e.target.files[0];if(!fl)return;const r=new FileReader();
 r.onload=ev=>{try{const d=parse(XLSX.read(ev.target.result,{type:'array'})),av=(AV.length?['Total Faturado diferente do Valor Bruto (Deduções + Base de Cálculo) em: '+AV.join('; ')+'.']:[]).concat(MDA,AZ);setData(d);PEND={arq:fl.name,n:d.length,av};fBar();
   const nt=MDI?`Aba “BASE DE MEDICAO”: só entram as linhas com DOC FISCAL (${d.length} NF lida(s))${MDI.ign?`; ${MDI.ign} medição(ões) sem DOC FISCAL (ainda não faturada(s)) ficaram de fora`:''}.`:CI.titulo&&CI.tf?'Colunas “Numero do Titulo” e “Total Faturado” reconhecidas.':!CI.tf?'Planilha sem a coluna “Total Faturado”: o card de Faturas Emitidas usa o Valor Bruto.':'Planilha sem a coluna “Numero do Titulo”.';
   msg(`${d.length} Data_Base lida(s) de "${fl.name}". ${nt}${av.length?' ⚠ '+av.join(' ⚠ ')+' Confira antes de publicar.':''} Confira os valores e clique em “Publicar atualização” para liberar a todos.`,av.length?2:0,av.length?25000:0)}
  catch(x){msg('Não foi possível ler o arquivo'+(x&&x.fr?': '+x.message+'.':'.')+' Verifique a aba “BASE DE MEDICAO” (cabeçalho com Valor Bruto (NF), Retenção Contratual, Valor Desconto Adiantamento, Retenção ISS, Retenção INSS, Valor Líquido, DOC FISCAL e DATA EMISSAO NF).',1)}};
 r.readAsArrayBuffer(fl);e.target.value=''};
function fundoPub(){if(!PERM.tem('fundo.publicar')||!PEND)return;const P=PEND;msg('Publicando para todos…');
 BASE.gravar('fundo_reserva',{d:D,FR,DOC,TD},P.arq).then(r=>{FST=r.atualizado_em;fMeta(r.atualizado_em,P.arq);PEND=null;fBar();rcbCarrega();msg(`✔ ${P.n} Data_Base de "${P.arq}" publicada(s) para todos os usuários`)}).catch(e=>msg(`NÃO publicado para os demais usuários: ${e.message||e}`,1))}
function fundoDesc(){if(!PERM.tem('fundo.publicar')||!PEND)return;PEND=null;fBar();FST='';fundoNuvem().then(ok=>{if(!ok)seed()});msg('Atualização descartada: voltou a base publicada.')}
/* ---------- Base compartilhada (Supabase · tabela public.bases, chave fundo_reserva) ---------- */
let FST='';
function fMeta(ts,arq){const e=document.getElementById('fmeta');if(e)e.textContent=ts?' · Base publicada em '+BASE.fdh(ts)+(arq?' · '+arq:''):''}
async function fundoNuvem(){fstCarrega();if(PEND)return true;try{const r=await BASE.ler('fundo_reserva'),x=r&&r.dados;
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

/* ---------- NF RECEBIDA (SIM/NAO) ----------
   Vem do Contas a Receber (RCB): a NF é achada pelo DOC FISCAL (igual ao vínculo dos recebimentos) e, sem ele, pela Data_Base. SIM = situação Recebido (ou Recebido a maior); NAO = Em aberto, Parcial
   ou NF que ainda não está na base publicada. Quem não tem a permissão receber.ver não pode ler os recebimentos: a coluna mostra “—” (e “…” enquanto carrega). */
let RCon=false,RM={e:'sem'};
function rcbCarrega(){if(typeof RCB=='undefined'||!PERM.tem('receber.ver'))return;
 if(!RCon){RCon=true;RCB.on(()=>{if(document.querySelector('[data-view=fundo]:not(.hidden)'))T()})}
 RCB.tudo().then(()=>T())}
function rcbPrep(){if(typeof RCB=='undefined'||!PERM.tem('receber.ver')){RM={e:'sem'};return}
 if(!RCB.F.ok||!RCB.ok){RM={e:(RCB.F.erro||RCB.erro)?'erro':'carregando'};return}
 const m={};RCB.linhas('saldo').forEach(r=>{m[r.d]=r});RM={m,nf:RCB.F.nf||{}}}
/* ---------- Status da NF (coluna do Detalhamento) ----------
   Vem de public.fundo_status (js/core/fundo_status_dados.js · FSD): uma linha por NF, chave = DOC FISCAL (ou a Data_Base, sem DOC FISCAL). Todos que veem o Fundo de Reserva veem o status;
   só o administrador altera (lista suspensa na própria célula; o banco confere). Sem o SQL supabase/fundo-status.sql a coluna fica sem valores e o administrador recebe o aviso. */
let FSTon=false,FSTav=false;
function fstCarrega(){if(typeof FSD=='undefined'||!PERM.tem('fundo.ver'))return;
 if(!FSTon){FSTon=true;FSD.on(()=>{if(document.querySelector('[data-view=fundo]:not(.hidden)'))T()})}
 FSD.carregar().catch(()=>{if(FSD.falta&&ROLE=='admin'&&!FSTav){FSTav=true;msg(FSD.erro,2,20000)}}).then(()=>T())}
const stCor={aguardando:'bg-amber-500/15 text-amber-700 dark:text-amber-400',transferido:'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',a_receber:'bg-sky-500/15 text-sky-700 dark:text-sky-300'};
/* status da NF: { c: chave, s: código ('' = sem status), rot: texto, o: ordem para classificar (-1 = sem status) } */
function stDe(x){const c=typeof FSD=='undefined'?'':FSD.chave(x),m=c&&FSD.M[c],s=m?m.s:'';return{c,s,rot:s?FSD.rot(s):'',o:s?FSD.OP.findIndex(o=>o.id==s):-1,m}}
function stTd(x,cl){if(typeof FSD=='undefined')return`<td class="${cl}"><span class="text-slate-400">—</span></td>`;const t=stDe(x),ok=FSD.ok,tip=t.m?'Alterado por '+(t.m.por||'—')+(t.m.em?' em '+BASE.fdh(t.m.em):''):'Status ainda não definido';
 if(ROLE=='admin'){const off=!ok||!t.c,dica=FSD.falta?FSD.erro:!ok?(FSD.erro||'Carregando os status…'):tip;
  return`<td class="${cl}" data-st="${esc(t.s)}"><select class="inp !py-1 !px-2 text-xs font-semibold ${t.s?stCor[t.s]:''}" data-stsel="${esc(t.c)}" aria-label="Status da NF ${esc(t.c)}" title="${esc(dica||tip)}" ${off?'disabled':''} onchange="fundoSt(this)"><option value="">— sem status —</option>${FSD.OP.map(o=>`<option value="${o.id}" ${o.id==t.s?'selected':''}>${esc(o.nome)}</option>`).join('')}</select></td>`}
 return`<td class="${cl}" data-st="${esc(t.s)}">${t.s?`<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${stCor[t.s]}" title="${esc(tip)}">${esc(t.rot)}</span>`:`<span class="text-slate-400" title="${ok?'Status ainda não definido':esc(FSD.erro||'Carregando os status…')}">—</span>`}</td>`}
/* o administrador escolheu um status na lista: grava (o banco confere), avisa e redesenha; se não gravar, a lista volta ao valor de antes */
async function fundoSt(el){if(ROLE!='admin'||typeof FSD=='undefined')return;const c=el.dataset.stsel,v=el.value,ant=(FSD.M[c]||{}).s||'';if(!c||v===ant)return;el.disabled=true;
 try{await FSD.definir(c,v);msg(v?`✔ Status da NF ${c}: ${FSD.rot(v)}`:`✔ Status da NF ${c} removido`)}catch(e){msg('NÃO alterei o status: '+(e.message||e),1)}
 T()}
const rI=d=>`<svg viewBox="0 0 16 16" width="12" height="12" class="inline-block align-[-1px] mr-0.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
function rcbSt(x){
 if(RM.e=='sem')return{t:'—',o:-1,tip:'Sem acesso ao Contas a Receber (permissão “Contas a Receber · Visualizar”)'};
 if(RM.e=='carregando')return{t:'…',o:-1,tip:'Carregando os recebimentos…'};
 if(RM.e=='erro')return{t:'—',o:-1,tip:'Não consegui ler o Contas a Receber'};
 const n=typeof RCB.nt=='function'?RCB.nt(x.titulo):'',ds=n?(RM.nf[n]||[]):[],r=RM.m[ds.length==1?ds[0]:x.d];
 if(!r)return{t:'NAO',o:0,tip:'Esta NF ainda não está na base publicada do Contas a Receber'};
 if(r.st=='quitado'||r.st=='maior')return{t:'SIM',o:1,tip:'Recebida: '+f(r.rec)+(r.ult?' · último recebimento em '+br(r.ult):'')+(r.st=='maior'?' (recebido a maior)':'')};
 return{t:'NAO',o:0,tip:r.st=='parcial'?'Recebimento parcial: '+f(r.rec)+' de '+f(r.dev)+' ('+p(r.pct)+')':'Nenhum recebimento lançado ainda'}}
const sum=(r,k)=>r.reduce((a,x)=>a+Math.round((+x[k]||0)*100),0)/100,/* soma em centavos exatos: o total é a soma do que a tabela mostra */
 cur=()=>D.filter(x=>frOk(x.d)&&(!sel||x.d==sel)),CH={},MES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function mk(id,t,data,o={}){CH[id]&&CH[id].destroy();CH[id]=new Chart($('#'+id),{type:t,data,options:{responsive:true,maintainAspectRatio:false,...o}})}
/* total de cada mês da Data_Base (= mês da emissão da NF) e acumulado (a partir do 1º mês do período), para a chave k (bruto, fr...); os meses do Período escolhido (sem filtro: todos os meses da base; não depende da Data_Base escolhida); meses sem NF entram com zero */
function serieMes(k){const m={};D.forEach(x=>{if(!frOk(x.d))return;const ym=x.d.slice(0,7);m[ym]=(m[ym]||0)+Math.round((+x[k]||0)*100)});
 const ks=Object.keys(m).sort(),out=[];if(!ks.length)return{k:out,v:[],a:[]};
 let y=+ks[0].slice(0,4),mo=+ks[0].slice(5),y2=+ks[ks.length-1].slice(0,4),m2=+ks[ks.length-1].slice(5);
 while(y<y2||(y==y2&&mo<=m2)){out.push(y+'-'+String(mo).padStart(2,'0'));if(++mo>12){mo=1;y++}}
 let ac=0;return{k:out,v:out.map(x=>(m[x]||0)/100),a:out.map(x=>{ac+=m[x]||0;return ac/100})}}
/* paleta dos gráficos (validada com scripts/validate_palette.js, claro e escuro): azul = total do mês · laranja = acumulado */
const tema=()=>{const dk=document.documentElement.classList.contains('dark');return dk?{azul:'#3987e5',lar:'#d95926',ink:'#f0efec',ink2:'#c3c2b7',mut:'#898781',grid:'#2c2c2a',base:'#383835',tip:'#1a1a19',surf:'#000000',dk}
 :{azul:'#1f65c0',lar:'#d95926',ink:'#0b0b0b',ink2:'#52514e',mut:'#52514e',grid:'#d2d1c9',base:'#898781',tip:'#ffffff',surf:'#ffffff',dk}};
const cm=v=>v>=1e6?(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi':v>=1e3?(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':v.toLocaleString('pt-BR',{maximumFractionDigits:2}),cf=v=>'R$ '+cm(v);
function serieGraf(id,k,nome){const T0=tema(),M=serieMes(k),n=M.k.length;
 mk(id,'bar',{labels:M.k.map(x=>MES3[+x.slice(5)-1]+'/'+x.slice(0,4)),datasets:[
  {type:'bar',label:nome+' do mês',data:M.v,backgroundColor:T0.azul,borderColor:T0.surf,borderWidth:2,borderRadius:{topLeft:4,topRight:4,bottomLeft:0,bottomRight:0},maxBarThickness:44,order:2,datalabels:{display:n<=6,anchor:'end',align:'end',color:T0.ink,font:{size:11,weight:'bold'},formatter:cm}},
  {type:'line',label:nome+' acumulado',data:M.a,borderColor:T0.lar,backgroundColor:T0.lar,borderWidth:T0.dk?2:3,pointRadius:4,pointHoverRadius:6,pointBorderColor:T0.surf,pointBorderWidth:2,tension:.2,order:1,datalabels:{display:c=>n>1&&c.dataIndex==n-1,anchor:'end',align:'top',offset:6,color:T0.ink,font:{size:11,weight:'bold'},formatter:cf}}]},
  {interaction:{mode:'index',intersect:false},layout:{padding:{top:18}},
   scales:{x:{grid:{display:false},border:{color:T0.base},ticks:{color:T0.mut,font:{size:11}}},y:{display:false,beginAtZero:true,grace:'12%'}},
   plugins:{legend:{position:'bottom',labels:{color:T0.ink2,usePointStyle:true,boxWidth:8,padding:16,sort:(a,b)=>a.datasetIndex-b.datasetIndex}},
    tooltip:{backgroundColor:T0.tip,titleColor:T0.ink,bodyColor:T0.ink2,borderColor:T0.dk?'rgba(255,255,255,.10)':'rgba(11,11,11,.10)',borderWidth:1,padding:10,boxPadding:4,usePointStyle:true,callbacks:{label:c=>' '+c.dataset.label+': '+f(c.parsed.y)}}}})}
function render(){
 const r=cur(),n=r.length,pcFR=(FR*100).toLocaleString('pt-BR')+'%';
 /* nível diretoria: o que foi faturado (Total Faturado = Valor Bruto das NFs) e o que vai para o Fundo de Reserva (o Valor Líquido fica só na tabela Detalhamento) */
 const kp=[['bruto','Total Faturado',f(sum(r,'bruto')),n+(n==1?' NF emitida':' NFs emitidas')+(sel?' · emissão '+br(sel):'')],['fr','Fundo de Reserva',f(sum(r,'fr')),pcFR+' do Valor Bruto da NF']];
 const IKP={bruto:['recibo','azul'],fr:['cofrinho','amb']},PK={bruto:P[0],fr:P[2]};
 $('#kpis').innerHTML=kp.map(a=>{const w=a[0]=='fr';return CRT.kpi({t:a[1],v:a[2],s:a[3],ic:IKP[a[0]][0],tom:IKP[a[0]][1],cls:'border-t-4 '+(w?'!bg-indigo-100 dark:!bg-indigo-600 text-black dark:text-white':''),st:'border-top-color:'+PK[a[0]],sc:w?'text-black dark:text-indigo-100':'text-slate-400',mx:1.6})}).join('');
 serieGraf('cfr','fr','Fundo de Reserva');/* o gráfico “Valor Bruto faturado” mora em Faturas Emitidas */
 $('#per').innerHTML=sel?'Período exibido: <b>'+br(sel)+'</b>':'Período exibido: <b>Todas as Data_Base</b> (consolidado'+(FRP?' · '+frTxt():'')+')';
 frPinta();fNF();T()}
const fm=(k,x)=>k=='d'?br(x.d):k=='dp'?(x.dp?br(x.dp):'—'):k=='titulo'?(x.titulo||'—'):k=='rcb'?rcbSt(x).t:k=='st'?(stDe(x).rot||'—'):f(x[k]);
/* célula da tabela: o texto vai ESCAPADO (o nº do DOC FISCAL vem da planilha); o DOC FISCAL é texto (zeros à esquerda), selecionável com 1 clique para colar no contas a receber do ERP */
const fTd=(k,x)=>{let cl='px-2 py-2 whitespace-nowrap',tt='';
 if(MONEY[k])cl+=' text-right tabular-nums';
 if(k=='fr')cl+=' font-semibold text-indigo-500';
 else if(k=='titulo'){cl+=' tabular-nums select-all';if(x.titulo)tt='Clique para selecionar · Ctrl+C copia o DOC FISCAL com os zeros'}
 else if(k=='st')return stTd(x,cl);
 else if(k=='rcb'){const s=rcbSt(x),ok=s.t=='SIM',nao=s.t=='NAO';
  return`<td class="${cl}" data-rcb="${esc(s.t)}"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${ok?'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400':nao?'bg-amber-500/15 text-amber-700 dark:text-amber-400':'text-slate-400'}" title="${esc(s.tip)}">${ok?rI('<path d="m3 8.6 3.2 3.2L13 4.8"/>'):nao?rI('<circle cx="8" cy="8" r="5.5"/>'):''}${esc(s.t)}</span></td>`}
 return`<td class="${cl}"${tt?` title="${esc(tt)}"`:''}>${esc(fm(k,x))}</td>`};
const sv=(k,x)=>k=='rcb'?rcbSt(x).o:k=='st'?stDe(x).o:x[k];
function flt(){rcbPrep();const q=$('#q').value.toLowerCase();
 return cur().filter(x=>(!q||C.map(c=>fm(c[0],x)).join(' ').toLowerCase().includes(q))).sort((x,y)=>(sv(sk,x)>sv(sk,y)?1:-1)*sd)}
const ftt=k=>k=='fr'?(FR*100).toLocaleString('pt-BR')+'% do Valor Bruto da NF (em centavos)':FCT[k];
function srt(k){sd=sk==k?-sd:1;sk=k;T()}
function T(){const r=flt(),ps=+$('#ps').value,pages=Math.ceil(r.length/ps)||1;pg=Math.max(1,Math.min(pg,pages));
 $('#th').innerHTML='<tr>'+C.map(c=>`<th class="px-2 py-2 cursor-pointer align-bottom leading-tight${MONEY[c[0]]?' text-right':''}"${ftt(c[0])?` title="${esc(ftt(c[0]))}"`:''} onclick="srt('${c[0]}')">${c[1]}${sk==c[0]?(sd>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
 $('#tb').innerHTML=r.slice((pg-1)*ps,pg*ps).map(x=>'<tr class="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">'+C.map(c=>fTd(c[0],x)).join('')+'</tr>').join('')||`<tr><td colspan="${C.length}" class="p-4 text-center text-slate-400">Nenhum registro encontrado</td></tr>`;
 $('#cnt').textContent=r.length+' registro(s)';$('#pgi').textContent=`${pg} / ${pages}`}

/* ---------- Exportações ---------- */
/* Excel do DETALHAMENTO (botão na tabela; o Excel para assinatura é o documento de emissão, mais abaixo) (padrão visual do Consórcio, js/core/xlsx_rel.js): faixa com logo e título, grupos de colunas, cabeçalho azul, Data_Base como data de verdade,
   valores em R$ no formato Contábil (centavos exatos, iguais aos da tela), Alíquota em %, Nº do Título como TEXTO (zeros à esquerda), filtro, painéis congelados (Data_Base e Título) e, com 2 ou mais registros, linha de TOTAL (SUBTOTAL: acompanha o filtro) */
async function xlDet(){
 try{
  const r=flt();if(!r.length){msg('Não há registros para exportar com os filtros atuais.',1);return}
  const E=XR,c=E.C,c2=v=>{const n=+f(v).replace(/\u2212/g,'-').replace(/[^\d,-]/g,'').replace(',','.');return n===0?0:n},/* o valor exato que a tela (f) mostra: centavos, meio centavo arredondado igual à tela, zero sem sinal */
   q=$('#q').value.trim(),fm_=document.getElementById('fmeta'),
   orig=PEND?'Rascunho não publicado · '+PEND.arq:(fm_?fm_.textContent.replace(/^[\s·]+/,''):''),
   sub=[sel?'Data_Base '+br(sel):'Todas as Data_Base',r.length+' registro(s)',FRP?'Período (Data_Base): '+frTxt():'',q?'Busca: “'+q+'”':'',
    'Fundo de Reserva = '+(FR*100).toLocaleString('pt-BR')+'% do Valor Bruto da NF',orig,'Gerado em '+E.hoje()].filter(Boolean).join(' · '),
   M=(h,k,o)=>Object.assign({h,g:x=>c2(x[k]),nf:'contabil',tot:'sum'},o),
   cols=[{h:'DATA_BASE (EMISSÃO NF)',g:x=>XP.serial(x.d),nf:'data',tot:'TOTAL'},
    {h:'DOC FISCAL',g:x=>x.titulo||null,nf:'texto',al:'center'},/* TEXTO (formato "@"): o DOC FISCAL 00000004 não perde os zeros nem ao ser editado no Excel */
    M('VALOR BRUTO (NF)','bruto'),M('VALOR LÍQUIDO','vl'),{h:'DATA DE RECEBIMENTO',g:x=>x.dp?XP.serial(x.dp):null,nf:'data',al:'center'},
    M('FUNDO DE RESERVA','fr',{b:1,c:c.navy}),{h:'NF RECEBIDA',g:x=>{const t=rcbSt(x).t;return t=='…'?null:t},al:'center'},
    {h:'STATUS FUNDO DE RESERVA',g:x=>stDe(x).rot||'—',al:'center'}],/* SIM / NAO (— sem acesso ao Contas a Receber) · Status escolhido pelo administrador (— = ainda não definido) */
   wb=XP.book({titulo:'Fundo de Reserva · Apuração por Data_Base'}),HR=8,
   {ws,t}=E.dados(wb,'Fundo de Reserva',{titulo:'Fundo de Reserva · Apuração por Data_Base',sub,rod:'Consórcio Santa Dulce · Fundo de Reserva',rows:r,hr:HR,fz:2,cent:1,total:r.length>1,/* com 1 registro só, a linha de TOTAL repetiria a própria linha */
    eq:cols.map((x,j)=>x.nf=='contabil'?j:-1).filter(j=>j>=0),cols});
  /* faixa de grupos acima do cabeçalho: organiza as 8 colunas por assunto */
  const gs={b:1,c:c.white,fg:c.navy,h:'center',v:'center',sz:9,bl:['thin',c.white],br:['thin',c.white]};
  ws.height(HR-1,18);[['PERÍODO E DOCUMENTO',2,3],['VALORES DA NOTA',4,5],['RECEBIMENTO, FUNDO E STATUS',6,9]].forEach(g=>ws.merge(HR-1,g[1],HR-1,g[2],g[0],gs));
  ws.fillR(t.r1,7,t.r2,7,{fg:c.sky});/* destaque da coluna que importa: o valor a transferir ao Fundo */
  ws.noErr(t.r1,3,t.r2,3);/* o DOC FISCAL é texto de propósito (zeros à esquerda): sem o triângulo verde "número armazenado como texto" */
  ws.o.titles=[HR-1,HR];ws.o.zoom=90;
  await saveAs('fundo_reserva_'+(sel||'todas')+'.xlsx',await wb.save())
 }catch(e){msg('Não consegui gerar o Excel: '+(e.message||e),1)}
}
function pdf(){const d=new jspdf.jsPDF('l','pt','a4'),r=flt(),cs=[['d','Data_Base (Emissão NF)'],['titulo','DOC FISCAL'],['bruto','Valor Bruto (NF)'],['vl','Valor Líquido'],['dp','Data de Recebimento'],['fr','Fundo de Reserva'],['rcb','NF Recebida'],['st','Status Fundo de Reserva']];
 d.addImage(LOGO,'PNG',40,22,36*LR,36);d.setFontSize(16).text('Gestão Financeira CSD · Dashboard Executivo',40+36*LR+14,40);d.setFontSize(10).text('Data_Base: '+(sel?br(sel):'Todas')+(FRP?' · Período: '+frTxt():'')+' · Gerado em '+new Date().toLocaleString('pt-BR'),40+36*LR+14,56);
 d.autoTable({startY:75,head:[['Indicador','Valor']],body:K.map(k=>[L[k],f(sum(cur(),k))]),headStyles:{fillColor:[79,70,229]},tableWidth:340});
 d.autoTable({startY:d.lastAutoTable.finalY+20,head:[cs.map(c=>c[1])],body:r.map(x=>cs.map(c=>fm(c[0],x))),headStyles:{fillColor:[79,70,229]}});
 saveAs('fundo_reserva_dashboard.pdf',d.output('arraybuffer'))}
/* ---------- Documento de emissão: Memória de Cálculo e Solicitação de Transferência (modelo 001/2026) ----------
   Um documento por faturamento (NF). O Excel e o PDF (Termo para assinatura) saem no MESMO layout do documento 001/2026 e, antes de gerar, abre uma janela para conferir os parâmetros:
   faturamento, nº do documento, data, valores (Valor Bruto da NF → 1% → valor a transferir) e data prevista da transferência. Só o administrador gera (assinatura das consorciadas). */
const ORDEM=()=>D.slice().sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.titulo<b.titulo?-1:a.titulo>b.titulo?1:0),
 hojeL=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())},/* data LOCAL (toISOString daria o dia seguinte depois das 21h no Brasil) */
 chaveNF=x=>x.titulo||x.d,
 evGet=()=>{try{const o=JSON.parse(localStorage.csd_termo_v2||'{}');return{c:o.c||{},n:o.n||{}}}catch(e){return{c:{},n:{}}}},
 isoOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&v>='2000-01-01'&&!isNaN(new Date(v+'T12:00:00Z')),
 TXD={obj:'Formalizar a memória de cálculo e solicitar a autorização dos representantes legais das empresas consorciadas para a transferência de recursos da conta corrente do Consórcio para a conta bancária, também do Consórcio, destinada ao Fundo de Reserva, no Banco Santander, em atendimento ao percentual previsto na NPO, conforme cláusula 3.4 (Aportes), alínea V.',
  sol:'Com base na memória de cálculo acima e nas disposições da NPO, solicita-se a autorização dos representantes legais/conselho executivo das empresas consorciadas para a transferência do valor calculado da conta corrente do Consórcio para a conta bancária do Fundo de Reserva, no Banco Santander.',
  aut:'Os representantes legais abaixo identificados, na qualidade de representantes das empresas consorciadas, manifestam sua autorização para a transferência acima.'};
let EMO={modo:'pdf',L:[]};
/* Nº do documento: sequencial por faturamento, na ordem da emissão das NFs dentro do ano (001/2026 = 1ª NF de 2026, 002/2026 = 2ª...). A janela deixa corrigir. */
function docNo(x){const y=x.d.slice(0,4),i=Math.max(0,ORDEM().filter(r=>r.d.slice(0,4)==y).indexOf(x)),m=String(DOC).match(/^(\d+)\/(\d{4})$/),s=m&&m[2]==y?+m[1]:1;return String(s+i).padStart(3,'0')+'/'+y}
const termo=()=>emissao('pdf'),xlsAss=()=>emissao('xlsx');
function emissao(modo){if(ROLE!='admin')return;if(!D.length){msg('Não há faturamento carregado.',1);return}
 const L=ORDEM(),xi=(sel?L.find(r=>r.d==sel):null)||L[L.length-1],ev=evGet(),cc={orig:TD.orig,dest:TD.dest,...ev.c};EMO={modo,L};
 const I=(id,l,v,t,ex)=>`<label class="block text-sm mb-1" for="${id}">${l}</label><input id="${id}" type="${t||'text'}" class="inp w-full" value="${esc(v)}" ${ex||''}>`,
  LN=(id,l,v)=>`<div class="flex items-center justify-between gap-3 px-3 py-2"><span class="text-slate-500">${l}</span><b id="${id}" class="tabular-nums text-right">${v}</b></div>`;
 mo(`<h2 class="text-lg font-bold mb-1">Documento de emissão · ${modo=='xlsx'?'Excel':'Termo para assinatura (PDF)'}</h2>
  <p class="text-sm text-slate-500 mb-4">Confira os parâmetros antes de gerar. O documento segue o modelo “Memória de Cálculo e Solicitação de Transferência”: um por faturamento.</p>
  <label class="block text-sm mb-1" for="e-nf">Faturamento (NF)</label>
  <select id="e-nf" class="inp w-full mb-3" onchange="emiNF()">${L.map((x,i)=>`<option value="${i}">${esc((x.titulo?'DOC FISCAL '+x.titulo:'NF sem DOC FISCAL')+' · emissão '+br(x.d)+' · '+f(x.bruto)+(ev.n[chaveNF(x)]?' · ✔ já gerado':''))}</option>`).join('')}</select>
  <div class="grid grid-cols-2 gap-3 mb-3"><div>${I('e-no','Documento nº','','text','maxlength="11" inputmode="numeric" placeholder="001/2026" oninput="this.dataset.s=1;emiVal(1)"')}</div><div>${I('e-d','Data do documento','','date','oninput="this.dataset.s=1;emiVal(1)"')}</div></div>
  <div class="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 text-sm mb-3" id="e-res">${LN('e-vb','Valor Bruto (medido)','')}${LN('e-pc','Percentual do Fundo de Reserva (NPO)','')}${LN('e-fr','Valor a ser transferido para o Fundo de Reserva','')}${LN('e-tr','Valor da transferência','')}</div>
  <div class="mb-3">${I('e-p','Data prevista da transferência','','date','required oninput="this.dataset.s=1;emiVal(1)"')}</div>
  <details class="mb-3 text-sm"><summary class="cursor-pointer text-slate-500">Contas da transferência</summary><div class="mt-2">${I('e-o','Conta de origem - CSD',cc.orig)}<div class="h-2"></div>${I('e-t','Conta de destino - Fundo de Reserva',cc.dest)}</div></details>
  <p id="e-err" class="text-sm text-rose-500 min-h-[1.25rem] mb-2" role="alert"></p>
  <div class="flex flex-wrap justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="${modo=='xlsx'?'btn':'btn2'}" data-emi="xlsx" onclick="emitir('xlsx')">📊 Gerar Excel</button><button class="${modo=='pdf'?'btn':'btn2'}" data-emi="pdf" onclick="emitir('pdf')">📄 Gerar PDF (Termo)</button></div>`);
 $('#mdb').style.maxWidth='580px';$('#e-nf').value=String(L.indexOf(xi));emiNF()}
/* trocou o faturamento: refaz o nº do documento, a data prevista e os valores (o que o usuário já digitou nesta janela só é mantido se ele mexeu no campo) */
function emiNF(){const x=EMO.L[+$('#e-nf').value];if(!x)return;const ev=evGet(),sv=ev.n[chaveNF(x)]||{},lg=x.d==TD.base?{data:TD.data,prev:TD.prev}:{};
 [['e-no',sv.no||docNo(x)],['e-d',sv.data||lg.data||hojeL()],['e-p',sv.prev||lg.prev||'']].forEach(a=>{const e=$('#'+a[0]);e.dataset.s='';e.value=a[1]});emiVal(1)}
/* valida e devolve os parâmetros (ou mostra o erro na própria janela); quiet = só atualiza os valores, sem reclamar de campo vazio */
function emiVal(quiet){const x=EMO.L[+$('#e-nf').value];if(!x)return null;
 $('#e-vb').textContent=f(x.bruto);$('#e-pc').textContent=(FR*100).toLocaleString('pt-BR')+'%';$('#e-fr').textContent=f(x.fr);$('#e-tr').textContent=f(x.fr);
 const no=$('#e-no').value.trim(),m=no.match(/^(\d{1,6})\/(\d{4})$/),o={x,no:m?m[1].padStart(3,'0')+'/'+m[2]:no,data:$('#e-d').value,prev:$('#e-p').value,orig:$('#e-o').value.trim(),dest:$('#e-t').value.trim()},
  er=!m?'Informe o nº do documento no formato 001/2026.':!isoOk(o.data)?'Informe a data do documento.':!isoOk(o.prev)?'Informe a data prevista da transferência.':o.prev<o.data?'A data prevista da transferência não pode ser anterior à data do documento.':!o.orig?'Informe a conta de origem.':!o.dest?'Informe a conta de destino.':!(x.fr>0)?'Este faturamento não tem Valor Bruto: não há valor a transferir.':'';
 $('#e-err').textContent=quiet?'':er;return er?null:o}
function emitir(tipo){const o=emiVal(0);if(!o)return;const x=o.x,ev=evGet();ev.n[chaveNF(x)]={no:o.no,data:o.data,prev:o.prev};ev.c={orig:o.orig,dest:o.dest};
 try{localStorage.csd_termo_v2=JSON.stringify(ev)}catch(e){}
 closeMd();(tipo=='xlsx'?xlDoc:pdfDoc)(x,o)}
const nomeDoc=(o,ext,suf)=>o.no.replace('/','-')+'_'+suf+'.'+ext;
/* Excel: a MESMA planilha do documento 001/2026 (uma aba "NNN-AAAA", A:D, logo, faixa azul, 5 seções); o valor a transferir é fórmula ARREDONDADA em centavos, igual à tela */
async function xlDoc(x,o){
 try{
  const K='000000',BD='808080',RS='\\R\\$\\ #,##0.00',
   wb=XP.book({titulo:'Memória de Cálculo e Solicitação de Transferência de Recursos para o Fundo de Reserva · '+o.no,font:'Aptos Narrow',sz:11}),
   ws=wb.sheet(o.no.replace('/','-'),{grid:false,tab:'1F4E79',rowh:14.4,land:false,hc:false,nofoot:true,mg:[.25,.25,.5,.5,.2,.2],area:[1,1,35,4],sel:true,colw:8.89,zoom:100}),
   cx=st=>Object.assign({sz:11,c:K,fn:'Aptos Narrow'},st),B=st=>cx(Object.assign({box:BD},st));
  [42.89,18.11,24,19].forEach((w,i)=>ws.width(i+1,w));
  ws.image(LOGOD,1,1,111,51,7,8);ws.height(1,51.6);ws.height(2,24);ws.height(3,18);
  const tt={fn:'Arial',sz:14,b:1,c:K,fg:'B4C6E7',h:'center',v:'center'};
  ws.merge(2,1,2,4,'MEMÓRIA DE CÁLCULO E SOLICITAÇÃO DE TRANSFERÊNCIA',tt);ws.merge(3,1,3,4,'DE RECURSOS PARA O FUNDO DE RESERVA',Object.assign({},tt,{v:'bottom'}));
  ws.put(4,3,'Documento nº:',{fn:'Arial',sz:10,b:1,c:K,h:'right',v:'bottom'});ws.put(4,4,o.no,cx({b:1}));
  ws.put(5,3,'Data:',cx({b:1,h:'right',v:'bottom'}));ws.put(5,4,XP.serial(o.data),cx({b:1,h:'left',v:'bottom',nf:'dd/mm/yyyy'}));
  const SC={fn:'Calibri',sz:11,b:1,c:K};
  ws.put(6,1,'1. OBJETIVO',SC);ws.merge(7,1,9,4,TXD.obj,{fn:'Arial',sz:10,c:K,v:'top',w:1});
  ws.put(11,1,'2. MEMÓRIA DE CÁLCULO RESUMIDA',SC);
  const TH={fn:'Calibri',sz:11,b:1,c:K,fg:'D9E1F2',box:BD,h:'center',v:'bottom'};ws.put(12,1,'Descrição',TH);ws.put(12,2,'Valor',TH);
  const LB=B({v:'center',w:1}),VR=B({v:'center',w:1,nf:RS});
  ws.put(13,1,'Valor Bruto (medido)',LB);ws.put(13,2,x.bruto,VR);
  ws.put(14,1,'Percentual do Fundo de Reserva (NPO)',LB);ws.put(14,2,FR,B({v:'center',w:1,nf:'0%'}));
  ws.put(15,1,'Valor a ser transferido para o Fundo de Reserva',LB);ws.put(15,2,{f:'ROUND(B13*B14,2)',v:x.fr},Object.assign({},VR,{fn:'Calibri',b:1}));
  ws.put(17,1,'3. SOLICITAÇÃO DE AUTORIZAÇÃO',SC);ws.merge(18,1,21,4,TXD.sol,cx({v:'top',w:1}));
  ws.put(22,1,'4. DADOS DA TRANSFERÊNCIA',SC);
  const L4={fn:'Calibri',sz:11,b:1,c:K,fg:'D9E1F2',box:BD,v:'bottom'},V4=B({v:'bottom'});
  [[23,'Conta de origem - CSD',o.orig,V4],[24,'Conta de destino - Fundo de Reserva',o.dest,V4],[25,'Valor da transferência',{f:'B15',v:x.fr},Object.assign({},V4,{fn:'Calibri',b:1,h:'left',nf:RS})],[26,'Data prevista',XP.serial(o.prev),Object.assign({},V4,{h:'left',nf:'dd/mm/yyyy'})]].forEach(a=>{ws.put(a[0],1,a[1],L4);ws.merge(a[0],2,a[0],4,a[2],a[3])});
  ws.put(28,1,'5. AUTORIZAÇÃO DOS REPRESENTANTES LEGAIS',SC);ws.merge(29,1,30,4,TXD.aut,cx({v:'top',w:1}));
  ws.put(32,1,'EMPRESA CONSORCIADA',{fn:'Calibri',sz:9,b:1,c:K,fg:'D9E1F2',box:BD,h:'center',v:'bottom',w:1});ws.merge(32,2,32,3,'REPRESENTANTE LEGAL',{fn:'Calibri',sz:9,b:1,c:K,fg:'D9E1F2',box:BD,h:'center',v:'bottom',w:1});
  EMP.forEach((e,i)=>{ws.height(33+i,37.95);ws.put(33+i,1,e,B({h:'center',v:'center',w:1}));ws.merge(33+i,2,33+i,3,null,B({h:'center',v:'center',w:1}))});
  await saveAs(nomeDoc(o,'xlsx','Mem._Calc._Fundo_Reserva'),await wb.save());
  msg('Excel '+o.no+' gerado.')
 }catch(e){msg('Não consegui gerar o Excel: '+(e.message||e),1)}
}
/* PDF (Termo para assinatura): a MESMA página do documento 001/2026 — A4 retrato, uma página */
function pdfDoc(x,o){
 try{
  const d=new jspdf.jsPDF('p','pt','a4'),X=40,W=515,cA=W*42.89/104,cB=W*18.11/104,cC=W*24/104,HB=[180,198,231],LB=[217,225,242],pc=(FR*100).toLocaleString('pt-BR')+'%',
   T=(t,xx,yy,sz,b,al)=>d.setFont('helvetica',b?'bold':'normal').setFontSize(sz).setTextColor(0).text(String(t),xx,yy,{align:al||'left'}),
   P=(t,yy,sz)=>{const l=d.splitTextToSize(t,W);d.setFont('helvetica','normal').setFontSize(sz).setTextColor(0).text(l,X,yy);return yy+l.length*sz*1.3},
   Sx=(t,yy)=>{T(t,X,yy,9.5,1);return yy+13},
   /* linha de tabela: cs = [{w,t,fc,b,al:'l|c|r',sz}] lado a lado a partir de X; o texto encolhe (até 7pt) para caber na célula */
   Rw=(yy,h,cs)=>{let x0=X;cs.forEach(c=>{d.setDrawColor(128).setLineWidth(.5);if(c.fc)d.setFillColor(...c.fc);d.rect(x0,yy,c.w,h,c.fc?'FD':'S');
    let sz=c.sz||9;d.setFont('helvetica',c.b?'bold':'normal');if(c.t){d.setFontSize(sz);while(sz>7&&d.getTextWidth(String(c.t))>c.w-8)d.setFontSize(sz-=.25)}
    if(c.t)T(c.t,c.al=='c'?x0+c.w/2:c.al=='r'?x0+c.w-4:x0+4,yy+h/2+3,sz,c.b,c.al=='c'?'center':c.al=='r'?'right':'left');x0+=c.w});return yy+h};
  d.addImage(LOGOD,'PNG',X+4,22,84,84/LDR);
  d.setFillColor(...HB).rect(X,76,W,42,'F');T('MEMÓRIA DE CÁLCULO E SOLICITAÇÃO DE TRANSFERÊNCIA',X+W/2,94,12.5,1,'center');T('DE RECURSOS PARA O FUNDO DE RESERVA',X+W/2,110,12.5,1,'center');
  T('Documento nº:',X+cA+cB+cC-4,132,9,1,'right');T(o.no,X+cA+cB+cC+4,132,9.5,1);T('Data:',X+cA+cB+cC-4,144,9,1,'right');T(br(o.data),X+cA+cB+cC+4,144,9.5,1);
  let y=Sx('1. OBJETIVO',166);y=P(TXD.obj,y,9.5)+14;
  y=Sx('2. MEMÓRIA DE CÁLCULO RESUMIDA',y);y=Rw(y,15,[{w:cA,t:'Descrição',fc:LB,b:1,al:'c'},{w:cB,t:'Valor',fc:LB,b:1,al:'c'}]);
  y=Rw(y,15,[{w:cA,t:'Valor Bruto (medido)'},{w:cB,t:f(x.bruto),al:'r'}]);y=Rw(y,15,[{w:cA,t:'Percentual do Fundo de Reserva (NPO)'},{w:cB,t:pc,al:'r'}]);
  y=Rw(y,15,[{w:cA,t:'Valor a ser transferido para o Fundo de Reserva'},{w:cB,t:f(x.fr),al:'r',b:1}])+16;
  y=Sx('3. SOLICITAÇÃO DE AUTORIZAÇÃO',y);y=P(TXD.sol,y,9.5)+10;
  y=Sx('4. DADOS DA TRANSFERÊNCIA',y);const R4=(a,b,bb)=>{y=Rw(y,15,[{w:cA,t:a,fc:LB,b:1},{w:cB+cC+W*19/104,t:b,b:bb}])};
  R4('Conta de origem - CSD',o.orig);R4('Conta de destino - Fundo de Reserva',o.dest);R4('Valor da transferência',f(x.fr),1);R4('Data prevista',br(o.prev));y+=16;
  y=Sx('5. AUTORIZAÇÃO DOS REPRESENTANTES LEGAIS',y);y=P(TXD.aut,y,9.5)+8;
  y=Rw(y,16,[{w:cA,t:'EMPRESA CONSORCIADA',fc:LB,b:1,al:'c',sz:8},{w:cB+cC,t:'REPRESENTANTE LEGAL',fc:LB,b:1,al:'c',sz:8}]);
  EMP.forEach(e=>{y=Rw(y,40,[{w:cA,t:e,al:'c',sz:8.5},{w:cB+cC}])});
  saveAs(nomeDoc(o,'pdf','Termo_Assinatura_Fundo_Reserva'),d.output('arraybuffer'));msg('Termo '+o.no+' gerado.')
 }catch(e){msg('Não consegui gerar o PDF: '+(e.message||e),1)}
}
