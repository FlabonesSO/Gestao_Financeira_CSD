/* Pedido AY · Projeção REIDI: coluna Responsável na tabela + o ADMINISTRADOR escolhe de quem é o lançamento (Incluir e Editar compra).
   Antes o formulário mostrava o nome de quem digitava (somente leitura); agora o administrador responde "De quem é o lançamento?" (lista obrigatória) e o Lançador continua com o próprio nome. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const unesc=s=>String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

/* usr: linhas de public.perfis que o administrador lê · gravado: o que o "banco" devolve ao salvar (função (payload, tipo) → linha) */
function load({admin=true,L=[],usr=null,usrErro=false,devolve=null,real=false}={}){
 const els={},view={innerHTML:'',classList:{contains:()=>true,toggle(){}},dataset:{}},inc=[],chamadas=[];
 const El=function(v){this.value=v||'';this.dataset={};this.innerHTML='';this.textContent='';this.disabled=false;this.className='';this.style={};this.classList={add(){},remove(){}};this.focus=()=>{};this.select=()=>{}};
 const ctx={window:{},document:{querySelector:()=>view,documentElement:{classList:{contains:()=>false}},getElementById:id=>els[id]||null,addEventListener(){},activeElement:null},localStorage:{getItem:()=>null,setItem(){}},
  PERM:{tem:()=>true},ROLE:admin?'admin':'lanc',PF:{id:'u1',nome:'Fulano',login:'fulano'},f:n=>String(n),br:s=>s,
  N:s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(),uLog(){},closeMd(){},setTimeout(){},clearTimeout(){},addEventListener(){},removeEventListener(){},
  mo:h=>{
   for(const k of Object.keys(els))if(k.startsWith('lf-'))delete els[k];
   (h.match(/<(input|select|div|p|button)[^>]*\sid="lf-[a-z]+"[^>]*>/g)||[]).forEach(t=>{const id=t.match(/id="(lf-[a-z]+)"/)[1],v=t.match(/\svalue="([^"]*)"/);els[id]=new El(v?unesc(v[1]):'');els[id].tag=t.match(/^<(\w+)/)[1];els[id].ro=/\sreadonly/.test(t)});
   /* listas (select): value = a opção marcada (ou a primeira) */
   (h.match(/<select id="lf-[a-z]+"[\s\S]*?<\/select>/g)||[]).forEach(b=>{const id=b.match(/id="(lf-[a-z]+)"/)[1],ops=[...b.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(m=>({v:unesc(m[1]),sel:/selected/.test(m[2]),t:unesc(m[3])}));
    els[id].ops=ops;els[id].value=(ops.find(o=>o.sel)||ops[0]||{v:''}).v});
   els.mdb=els.mdb||new El();els.mdb.innerHTML=h;ctx.__html=h}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'js/core/reidi_dados.js'),'utf8')+'\nwindow.RDB=RDB;',ctx);
 const rdb=ctx.window.RDB;rdb.PGok=true;rdb.ok=true;rdb.C={ref:'2026-11-01',hor:30};rdb.L=rdb.anexar(L,[]);rdb.carregar=async()=>{};
 rdb.cli=()=>({from:t=>{chamadas.push(t);return {select:()=>({order:async()=>usrErro?{data:null,error:{message:'sem permissão'}}:{data:usr,error:null}})}}});
 if(!real){rdb.incluir=async x=>{inc.push({...x});return devolve?devolve(x,'incluir'):x};rdb.editar=async(id,x)=>{inc.push({id,...x});return devolve?devolve(x,'editar'):x}}
 vm.runInContext(fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8'),ctx);
 const lanc=ctx.window.lanc;
 return {lanc,rdb,els,ctx,inc,view,chamadas,
  opts(){return (els['lf-r'].ops||[]).map(o=>o.t)},
  get html(){return ctx.__html},get rp(){return els['lf-r'].value},
  preenche(){els['lf-f'].value='FORNECEDOR X';els['lf-d'].value='2026-11-30';els['lf-b'].value='2026-11-12';els['lf-vo'].value='100.000,00';els['lf-vn'].value='95.000,00';els['lf-ok']=new El()},
  get erro(){return els['lf-e'].textContent},
  async salva(){this.preenche();await lanc.sv()}};
}
const compra=(id,rp,o={})=>({id,f:'F'+id,i:'Item '+id,cat:'Previsão',ped:'P'+id,dt:'2026-11-2'+id.slice(-1),vo:100000,vn:95000,rp,cp:'u1',ba:'2026-11-01',st:'A pagar',...o});
const USR=[{nome:'Ana Paula Ribeiro',ativo:true},{nome:'Bruno Lima',ativo:true},{nome:'Inativo Antigo',ativo:false},{nome:'Fulano',ativo:true},{nome:'  ',ativo:true}];
const tick=()=>new Promise(r=>setImmediate(r));

test('Administrador: “Incluir compra” pergunta de quem é o lançamento (lista obrigatória, em branco) em vez de mostrar o nome de quem digita',async()=>{
 const T=load({usr:USR});T.lanc.f();
 assert.match(T.html,/De quem é o lançamento\? \*/);assert.match(T.html,/<select id="lf-r"/);assert.doesNotMatch(T.html,/<input id="lf-r"/);assert.doesNotMatch(T.html,/readonly/);
 assert.equal(T.els['lf-r'].tag,'select');assert.equal(T.rp,'');   /* nada pré-selecionado: nem o nome do administrador */
 assert.deepEqual(T.opts(),['Selecione…','Fulano']);   /* sem a lista de cadastros ainda: só o próprio nome */
 assert.doesNotMatch(T.html,/seu nome de cadastro/)});

test('Administrador: a lista junta cadastros ativos + responsáveis já lançados + o próprio nome, sem repetir (sem acento/maiúscula), em ordem alfabética',async()=>{
 const T=load({usr:USR,L:[compra('a1','Carla Dias'),compra('a2','ana paula ribeiro'),compra('a3',''),compra('a4','CARLA DIAS'),compra('a5','Édson Souza')]});
 T.lanc.show();await tick();await tick();assert.deepEqual(T.chamadas,['perfis']);
 T.lanc.f();assert.deepEqual(T.opts(),['Selecione…','Ana Paula Ribeiro','Bruno Lima','Carla Dias','Édson Souza','Fulano']);
 assert.ok(!T.opts().includes('Inativo Antigo'),'cadastro desativado fica de fora');assert.ok(!T.opts().includes('  '),'nome em branco fica de fora');assert.equal(T.rp,'')});

test('Administrador: sem poder ler os cadastros (erro ou exceção) a lista usa só os responsáveis já lançados e o próprio nome',async()=>{
 const A=load({usrErro:true,L:[compra('a1','Carla Dias')]});A.lanc.show();await tick();await tick();A.lanc.f();assert.deepEqual(A.opts(),['Selecione…','Carla Dias','Fulano']);
 const B=load({usr:USR,L:[compra('a1','Carla Dias')]});B.rdb.cli=()=>{throw new Error('sem cliente')};B.lanc.show();await tick();B.lanc.f();assert.deepEqual(B.opts(),['Selecione…','Carla Dias','Fulano'])});

test('Lançador não lê cadastros e continua com o próprio nome em campo somente leitura',async()=>{
 const T=load({admin:false,usr:USR});T.lanc.show();await tick();assert.deepEqual(T.chamadas,[]);T.lanc.f();
 assert.match(T.html,/<input id="lf-r"[^>]*readonly/);assert.doesNotMatch(T.html,/<select id="lf-r"/);assert.equal(T.rp,'Fulano');assert.match(T.html,/seu nome de cadastro/);assert.doesNotMatch(T.html,/De quem é o lançamento/);
 T.preenche();await T.lanc.sv();assert.equal(T.inc.length,1);assert.equal(T.inc[0].rp,'Fulano')});

test('Administrador: salvar SEM escolher o responsável não grava e explica; escolhendo, grava o escolhido (não o administrador)',async()=>{
 const T=load({usr:USR});T.lanc.show();await tick();await tick();T.lanc.f();
 await T.salva();assert.equal(T.inc.length,0);assert.equal(T.erro,'Escolha de quem é o lançamento (responsável).');
 T.els['lf-r'].value='Bruno Lima';await T.lanc.sv();assert.equal(T.inc.length,1);assert.equal(T.inc[0].rp,'Bruno Lima');assert.equal(T.inc[0].f,'FORNECEDOR X');
 assert.match(T.view.innerHTML,/✔ Compra incluída/);assert.doesNotMatch(T.view.innerHTML,/⚠/)});

test('Administrador: o administrador também pode ser escolhido (o lançamento é dele) — mas só quando ele responde',async()=>{
 const T=load({usr:USR});T.lanc.show();await tick();await tick();T.lanc.f();T.preenche();T.els['lf-r'].value='Fulano';await T.lanc.sv();assert.equal(T.inc.length,1);assert.equal(T.inc[0].rp,'Fulano')});

test('Administrador › Editar: a lista vem com o responsável ATUAL marcado (grafia mantida) e dá para trocar',async()=>{
 const T=load({usr:USR,L:[compra('a1','ana paula ribeiro'),compra('a2','Bruno Lima'),compra('a3','Só Histórico')]});T.lanc.show();await tick();await tick();
 T.lanc.f('a1');assert.equal(T.rp,'ana paula ribeiro');   /* a grafia gravada, não a do cadastro: sem trocar o nome sem querer */
 assert.deepEqual(T.opts().filter(o=>o.toLowerCase()=='ana paula ribeiro'),['ana paula ribeiro']);
 T.lanc.f('a3');assert.equal(T.rp,'Só Histórico');T.lanc.f('a2');assert.equal(T.rp,'Bruno Lima');
 T.els['lf-d'].value='2026-11-22';T.els['lf-b'].value='2026-11-12';T.els['lf-ok']=new (T.els['lf-d'].constructor)();T.els['lf-r'].value='Fulano';await T.lanc.sv();
 assert.equal(T.inc.length,1);assert.equal(T.inc[0].id,'a2');assert.equal(T.inc[0].rp,'Fulano')});

test('Administrador › Editar compra sem responsável gravado: abre em branco e exige a resposta (não assume o administrador)',async()=>{
 const T=load({usr:USR,L:[compra('a1','')]});T.lanc.f('a1');assert.equal(T.rp,'');
 T.els['lf-ok']=new (T.els['lf-d'].constructor)();await T.lanc.sv();assert.equal(T.inc.length,0);assert.equal(T.erro,'Escolha de quem é o lançamento (responsável).');
 T.els['lf-r'].value='Fulano';await T.lanc.sv();assert.equal(T.inc.length,1);assert.equal(T.inc[0].rp,'Fulano')});

test('Aviso quando o banco ainda tem a regra antiga: ao EDITAR guardou o responsável anterior → manda rodar reidi-responsavel-admin.sql; ao INCLUIR guardou o nome de quem digitou → reidi-importar.sql',async()=>{
 const E=load({usr:USR,L:[compra('a1','Ana Paula Ribeiro')],devolve:(x,t)=>({...x,rp:'Ana Paula Ribeiro'})});E.lanc.f('a1');E.els['lf-r'].value='Bruno Lima';E.els['lf-ok']=new (E.els['lf-d'].constructor)();await E.lanc.sv();
 assert.match(E.view.innerHTML,/✔ Compra atualizada\. ⚠ O banco manteve “Ana Paula Ribeiro” como responsável: para o administrador poder trocar o responsável ao editar, rode o arquivo supabase\/reidi-responsavel-admin\.sql/);assert.match(E.view.innerHTML,/bg-amber-500\/10/);
 const I=load({usr:USR,devolve:(x,t)=>({...x,rp:'Fulano'})});I.lanc.f();I.preenche();I.els['lf-r'].value='Bruno Lima';await I.lanc.sv();
 assert.match(I.view.innerHTML,/✔ Compra incluída\..*⚠ O banco gravou “Fulano” como responsável \(e não “Bruno Lima”\): rode o arquivo supabase\/reidi-importar\.sql/);
 /* banco com a regra nova (devolve o que foi pedido, mesmo com outra grafia): sem aviso */
 const K=load({usr:USR,L:[compra('a1','Ana Paula Ribeiro')],devolve:(x,t)=>({...x,rp:x.rp.toUpperCase()})});K.lanc.f('a1');K.els['lf-r'].value='Bruno Lima';K.els['lf-ok']=new (K.els['lf-d'].constructor)();await K.lanc.sv();
 assert.match(K.view.innerHTML,/✔ Compra atualizada\./);assert.doesNotMatch(K.view.innerHTML,/⚠/);assert.doesNotMatch(K.view.innerHTML,/bg-amber-500\/10/)});

test('Lançador nunca recebe o aviso (o banco grava o nome dele de qualquer jeito)',async()=>{
 const T=load({admin:false,devolve:(x,t)=>({...x,rp:'Outro Nome'})});T.lanc.f();T.preenche();await T.lanc.sv();assert.match(T.view.innerHTML,/✔ Compra incluída/);assert.doesNotMatch(T.view.innerHTML,/⚠/)});

test('RDB.editar devolve a compra como o banco gravou (com o responsável)',async()=>{
 const R=load({real:true}).rdb;R.carregar=async()=>{};
 const linha={id:'a1',fornecedor:'F',item:'I',categoria:'Previsão',pedido:'',data_prevista:'2026-11-20',responsavel:'Bruno Lima',valor_original:100000,valor_negociado:95000,pc:0.0365,data_base:'2026-11-01',status:'A pagar'};
 let ult=null;R.cli=()=>({from:()=>({update:x=>{ult=x;return {eq:()=>({select:async()=>({data:[linha],error:null})})}}})});
 const r=await R.editar('a1',{f:'F',i:'I',cat:'Previsão',ped:'',dt:'2026-11-20',rp:'Bruno Lima',vo:100000,vn:95000,ba:'2026-11-01',st:'A pagar'});
 assert.equal(r.rp,'Bruno Lima');assert.equal(ult.responsavel,'Bruno Lima');
 R.cli=()=>({from:()=>({update:()=>({eq:()=>({select:async()=>({data:[],error:null})})})})});
 await assert.rejects(()=>R.editar('a1',{f:'F',i:'I',cat:'Previsão',ped:'',dt:'2026-11-20',rp:'X',vo:1,vn:1,ba:'2026-11-01',st:'A pagar'}),/Sem permissão/)});

/* ---------- tabela ---------- */
const ths=h=>[...h.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m=>m[1].replace(/<[^>]+>/g,' ').replace(/[▲▼]/g,'').replace(/\s+/g,' ').trim());
function tabela(o={}){const T=load(o);T.els['lanc-t']={innerHTML:''};T.lanc._r();return T}
const linhaHtml=(h,id)=>(h.match(new RegExp('<tr[^>]*data-id="'+id+'"[\\s\\S]*?</tr>'))||[''])[0];
const tds=r=>[...r.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const L3=()=>[compra('a1','Carla Dias',{dt:'2026-11-21',f:'ZETA',vo:100000,vn:95000}),compra('a2','ana paula',{dt:'2026-11-22',f:'ALFA'}),compra('a3','',{dt:'2026-11-23',f:'BETA'})];

test('Tabela: a coluna Responsável vem depois da Data prevista de pagamento e antes do Valor original (a ordem do modelo da planilha)',()=>{
 const T=tabela({L:L3()}),H=ths(T.els['lanc-t'].innerHTML);
 assert.deepEqual(H,['Nº','Fornecedor','Item / descrição','Categoria','Nº pedido / processo / NF','Data prevista de pagamento','Responsável','Valor original','Valor negociado','Valor pago','Saldo a pagar','Economia REIDI real','Economia REIDI teórica','Status','Ações']);
 const c=tds(linhaHtml(T.els['lanc-t'].innerHTML,'a1'));assert.equal(c.length,15);assert.equal(c[1],'ZETA');assert.equal(c[6],'Carla Dias');assert.match(c[5],/21\/11\/2026/);assert.match(c[7],/R\$.*100\.000,00/);
 assert.equal(tds(linhaHtml(T.els['lanc-t'].innerHTML,'a3'))[6],'-');   /* sem responsável gravado */
 assert.match(linhaHtml(T.els['lanc-t'].innerHTML,'a1'),/<td[^>]*data-c="rp"[^>]*>Carla Dias<\/td>/)});

test('Tabela: a linha de TOTAL e o aviso de “nenhuma compra” cobrem as 15 colunas; o título Responsável ordena a tabela',()=>{
 const T=tabela({L:L3()}),h=T.els['lanc-t'].innerHTML;
 assert.match(h,/<tfoot[\s\S]*?<td[^>]*colspan="7">TOTAL \(3\)/);   /* Nº … Responsável (7 colunas) antes dos valores */
 assert.match(h,/<th[^>]*onclick="lanc\.s\('rp'\)"[^>]*>Responsável/);
 const ord=()=>[...T.els['lanc-t'].innerHTML.matchAll(/data-id="(a\d)"/g)].map(m=>m[1]);
 assert.deepEqual(ord(),['a1','a2','a3']);   /* padrão: data prevista */
 T.lanc.s('rp');assert.deepEqual(ord(),['a3','a2','a1']);   /* sem responsável, ana paula, Carla Dias */
 T.lanc.s('rp');assert.deepEqual(ord(),['a1','a2','a3']);
 const V=tabela({L:L3()});V.lanc.fl('r','Carla Dias');const f=V.els['lanc-t'].innerHTML;assert.match(f,/data-id="a1"/);assert.doesNotMatch(f,/data-id="a2"/);
 const Z=tabela({L:L3()});Z.lanc.q('zzz-nada');assert.match(Z.els['lanc-t'].innerHTML,/<td colspan="15"[^>]*>Nenhuma compra encontrada/)});

test('Tabela compacta: letra de 12 px nas linhas, 10,5 px nos títulos, espaços menores e títulos que quebram; Lançador vê a mesma coluna',()=>{
 for(const admin of [true,false]){const h=tabela({admin,L:L3()}).els['lanc-t'].innerHTML;
  assert.match(h,/<table id="lanc-tb" class="w-full text-\[12px\]">/);assert.match(h,/<thead[^>]*text-\[10\.5px\][^>]*>/);assert.match(h,/<tbody class="text-\[12px\]">/);
  assert.doesNotMatch(h,/text-\[13px\]|px-2 py-1\.5/);   /* as medidas antigas saíram da tabela */
  assert.doesNotMatch(h,/<th[^>]*whitespace-nowrap[^>]*>(Fornecedor|Item|Responsável|Valor|Economia)/);   /* títulos podem quebrar em duas linhas */
  assert.deepEqual(ths(h).slice(5,8),['Data prevista de pagamento','Responsável','Valor original'])}});

/* ---------- SQL: a regra do carimbo é a mesma nos 4 scripts que definem reidi_compras_carimbo (rodar qualquer um deles não desfaz a outra) ---------- */
const SQLS=['reidi-responsavel-admin.sql','reidi-importar.sql','reidi-lancador-proprio.sql','reidi-lancamentos.sql'];
const sql=f=>fs.readFileSync(path.join(root,'supabase',f),'utf8');
const corpo=f=>{const t=sql(f),i=t.indexOf('create or replace function public.reidi_compras_carimbo()'),j=t.indexOf('$$;',i);return t.slice(i,j)};
test('SQL: ao INCLUIR, só o administrador informa o responsável; ao EDITAR, só o administrador o troca (e só com nome preenchido); o autor segue preservado — igual nos 4 scripts',()=>{
 for(const f of SQLS){const c=corpo(f),ins=c.slice(c.indexOf("tg_op = 'INSERT'"),c.indexOf('else\n')),upd=c.slice(c.indexOf('else\n')),n=f;
  assert.match(ins,/new\.responsavel\s*:=\s*case when public\.is_admin\(\) and nullif\(btrim\(new\.responsavel\), ''\) is not null then btrim\(new\.responsavel\)\s*else coalesce\(nullif\(btrim\(v_nome\), ''\), new\.responsavel, ''\) end;/,n+' · inclusão');
  assert.match(upd,/new\.responsavel\s*:=\s*case when public\.is_admin\(\) and nullif\(btrim\(new\.responsavel\), ''\) is not null then btrim\(new\.responsavel\)\s*else old\.responsavel end;/,n+' · edição');
  assert.doesNotMatch(upd,/new\.responsavel\s*:=\s*old\.responsavel;/,n+' · a regra antiga (responsável nunca muda) saiu');
  assert.match(upd,/new\.criado_por\s*:=\s*old\.criado_por;/,n+' · autor preservado');assert.match(upd,/new\.criado_em\s*:=\s*old\.criado_em;/,n+' · data de criação preservada');
  assert.match(upd,/new\.criado_por_nome\s*:=\s*old\.criado_por_nome;/,n+' · nome do autor preservado');assert.match(c,/security definer set search_path = public/,n+' · função segura')}});
test('SQL: reidi-responsavel-admin.sql confere os pré-requisitos, recria o gatilho e traz a consulta de conferência; não mexe em dados nem em regras de acesso',()=>{
 const t=sql('reidi-responsavel-admin.sql');assert.match(t,/to_regclass\('public\.reidi_compras'\) is null/);assert.match(t,/to_regprocedure\('public\.is_admin\(\)'\) is null/);
 assert.match(t,/drop trigger if exists trg_reidi_compras_carimbo on public\.reidi_compras;\s*create trigger trg_reidi_compras_carimbo\s*before insert or update on public\.reidi_compras\s*for each row execute function public\.reidi_compras_carimbo\(\);/);
 assert.match(t,/else old\.responsavel end%' as regra_nova/);assert.doesNotMatch(t.replace(/^--.*$/gm,''),/\b(delete|truncate|drop table|alter table|create policy|drop policy|update public)\b/i);
 assert.match(t,/Lançador não informa nem troca responsável/);assert.match(t,/NÃO muda quem pode editar\/excluir/)});
test('A mensagem do site aponta para o arquivo que existe',()=>{const lanc=fs.readFileSync(path.join(root,'js/modulos/reidi_lanc.js'),'utf8');for(const f of ['reidi-responsavel-admin.sql','reidi-importar.sql'])assert.ok(lanc.includes('supabase/'+f)&&fs.existsSync(path.join(root,'supabase',f)),f)});
