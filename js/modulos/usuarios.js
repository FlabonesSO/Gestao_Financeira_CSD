/* Usuários — Supabase (Auth + public.perfis). O navegador só LÊ perfis; a escrita passa pela Edge Function admin-usuarios (cadastro) e pela função
   public.definir_permissoes (permissões: só administrador, nunca as próprias). O editor de permissões usa o catálogo de js/core/permissoes.js (PERM). */
const LRX=/^[a-z0-9._-]{3,30}$/,IDLE=30*60e3,PWMSG='A senha deve ter ao menos 8 caracteres, com letras e números.',
 esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 pwOk=p=>typeof p=='string'&&p.length>=8&&/[a-zA-Z]/.test(p)&&/\d/.test(p),
 tr=m=>/different/i.test(m)?'Escolha uma senha diferente da atual.':/weak|at least/i.test(m)?PWMSG:m;
let US=[],AUD=[],ME='',PF=null;const PAPELN={admin:'Administrador',viewer:'Visualizador',lancador:'Lançador REIDI',faturamento:'Faturamento (Faturas Emitidas)'};
const admins=()=>US.filter(x=>x.papel=='admin'&&x.ativo).length;
async function uLog(e){try{await sb_.rpc('log_evento',{e})}catch(x){}}
function mo(h){$('#mdb').style.maxWidth='';$('#mdb').innerHTML=h;$('#mdb').scrollTop=0;$('#md').classList.remove('hidden')}
function closeMd(){$('#md').classList.add('hidden')}
let _yes=null;
function dlg(t,x,fn){_yes=fn;mo(`<h2 class="text-lg font-bold mb-2">${t}</h2><p class="text-sm text-slate-500 mb-4">${x}</p><div class="flex justify-end gap-2">${fn?'<button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="closeMd();_yes()">Confirmar</button>':'<button class="btn" onclick="closeMd()">OK</button>'}</div>`)}
const merr=m=>{const e=$('#me');e.textContent=m;e.classList.remove('hidden')},lbl=t=>`<label class="block text-sm mb-1">${t}</label>`;
async function uRender(){const er=$('#uerr');er.classList.add('hidden');
 try{const a=await sb_.from('perfis').select('*').order('criado_em');if(a.error)throw a.error;US=a.data||[];
  const g=await sb_.from('auditoria').select('*').order('t',{ascending:false}).limit(15);AUD=g.data||[]}
 catch(e){er.textContent='Não foi possível carregar os usuários: '+e.message;er.classList.remove('hidden');return}
 const b='btn2 !py-1 !text-xs';
 $('#utb').innerHTML=US.map(u=>{const me=PF&&u.id==PF.id,last=u.papel=='admin'&&u.ativo&&admins()<2,dis=last?'disabled title="É preciso manter ao menos um administrador ativo" style="opacity:.4"':'';
  return `<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-2 font-medium">${esc(u.nome)}${me?' <span class="text-xs text-slate-500">(você)</span>':''}</td><td class="px-3 py-2">${esc(u.login)}</td><td class="px-3 py-2">${PAPELN[u.papel]||u.papel}</td>
  <td class="px-3 py-2">${uAcesso(u)}</td>
  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs ${u.ativo?'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400':'bg-slate-500/20 text-slate-500'}">${u.ativo?'Ativo':'Desativado'}</span>${u.mc?' <span class="text-xs text-amber-500">troca de senha pendente</span>':''}</td>
  <td class="px-3 py-2 text-right whitespace-nowrap space-x-1"><button class="${b}" onclick="uForm('${u.id}')">Editar</button><button class="${b}" onclick="uReset('${u.id}')">Redefinir senha</button>${me?'':`<button class="${b}" ${dis} onclick="uToggle('${u.id}')">${u.ativo?'Desativar':'Ativar'}</button><button class="${b} !text-rose-500" ${dis} onclick="uDel('${u.id}')">Excluir</button>`}</td></tr>`}).join('');
 $('#ulog').innerHTML=AUD.map(x=>`<tr class="border-t border-slate-200 dark:border-slate-800"><td class="px-3 py-1.5 whitespace-nowrap">${new Date(x.t).toLocaleString('pt-BR')}</td><td class="px-3 py-1.5">${esc(x.usuario)}</td><td class="px-3 py-1.5">${esc(x.evento)}</td></tr>`).join('')||'<tr><td class="px-3 py-2 text-slate-500" colspan="3">Sem registros.</td></tr>';uStatus()}
/* ---------- Permissões: resumo na tabela, consulta e editor (checkboxes) ---------- */
const CHIP='px-2 py-0.5 rounded-full text-xs whitespace-nowrap',
 RODA='flex flex-wrap items-center justify-end gap-2 sticky -bottom-6 -mx-6 -mb-6 mt-4 px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-2xl'; // botões sempre à vista nas janelas longas
function uAcesso(u){const e=PERM.efetivas(u),gs=PERM.GRUPOS.filter(g=>e.includes(g.p[0].k)),ver=`<button class="text-[11px] underline text-indigo-500 whitespace-nowrap" title="Consultar as permissões deste usuário" onclick="uVer('${u.id}')">ver permissões</button>`;
 if(u.papel=='admin')return `<div class="flex flex-wrap items-center gap-1.5"><span class="${CHIP} bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">Acesso total</span>${ver}</div>`;
 if(!gs.length)return `<div class="flex flex-wrap items-center gap-1.5"><span class="${CHIP} bg-rose-500/15 text-rose-600 dark:text-rose-400">Sem acesso</span>${ver}</div>`;
 return `<div class="flex flex-wrap items-center gap-1 max-w-[300px]">${gs.slice(0,4).map(g=>`<span class="px-1.5 py-0.5 rounded bg-slate-500/15 text-[11px] whitespace-nowrap" title="${esc(g.t)}">${g.s}</span>`).join('')}${gs.length>4?`<span class="text-[11px] text-slate-500" title="${esc(gs.slice(4).map(g=>g.t).join(' · '))}">+${gs.length-4}</span>`:''}${ver}</div>`}
/* consulta (somente leitura) das permissões de um usuário */
function uVer(id){const u=US.find(x=>x.id==id);if(!u)return;const e=PERM.efetivas(u),adm=u.papel=='admin';
 mo(`<h2 class="text-lg font-bold">Permissões de ${esc(u.nome)}</h2><p class="text-sm text-slate-500 mb-3">${esc(u.login)} · perfil ${PAPELN[u.papel]||esc(u.papel)} · ${u.ativo?'ativo':'desativado'}</p>
 ${adm?'<p class="text-sm rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 mb-3">O Administrador tem acesso total a todos os relatórios e ações.</p>':PERM.legado?'<p class="text-sm rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-3">Permissões individuais ainda não ativadas no banco: vale o padrão do perfil.</p>':''}
 <div class="space-y-2" id="uver">${PERM.GRUPOS.map(g=>`<div class="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2" data-g="${g.g}"><div class="text-sm font-semibold">${g.ic} ${g.t}</div><div class="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm">${g.p.map(x=>{const on=e.includes(x.k);return `<span data-k="${x.k}" data-on="${on?1:0}" class="${on?'text-emerald-600 dark:text-emerald-400':'text-slate-400 line-through'}">${on?'✓':'✕'} ${x.t}</span>`}).join('')}</div></div>`).join('')}
 <div class="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-500">👥 Usuários · 📝 Termo para assinatura · ⬇ Planilha (modelo) do REIDI — <span class="${adm?'text-emerald-600 dark:text-emerald-400':'text-slate-400'}">${adm?'✓ liberado':'✕ somente administrador'}</span></div></div>
 <div class="${RODA}"><button class="btn2" onclick="closeMd()">Fechar</button><button class="btn" onclick="uForm('${u.id}')">Editar</button></div>`);$('#mdb').style.maxWidth='40rem'}
/* editor: caixas de marcação por relatório. Marcar uma ação marca o "Visualizar" do mesmo relatório; desmarcar o "Visualizar" desmarca as ações dele */
let UF={u:null,ro:false};
function uPermHtml(papel,marcadas,ro){
 if(papel=='admin')return '<div class="rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-sm">O <b>Administrador</b> tem acesso total: todos os relatórios e ações, mais Usuários, Termo para assinatura e Planilha (modelo) do REIDI. Para limitar o acesso, escolha outro perfil.</div>';
 const s=new Set(marcadas),bt='btn2 !py-1 !text-xs';
 return `<div class="flex flex-wrap items-center gap-1.5 mb-2">${ro?'':`<button type="button" class="${bt}" onclick="uPdef()" title="Volta às permissões iniciais do perfil escolhido">Padrão do perfil</button><button type="button" class="${bt}" onclick="uPall(1)">Marcar tudo</button><button type="button" class="${bt}" onclick="uPall(0)">Limpar</button>`}<span id="uperm-n" class="ml-auto text-xs text-slate-500"></span></div>
 <div class="grid sm:grid-cols-2 gap-3">${PERM.GRUPOS.map(g=>`<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3" data-g="${g.g}"><div class="text-sm font-semibold mb-1">${g.ic} ${g.t}</div>${g.p.map(x=>`<label class="flex items-start gap-2 text-sm py-1 ${ro?'':'cursor-pointer'}"><input type="checkbox" class="mt-0.5 h-4 w-4 accent-indigo-600" data-pk="${x.k}" ${s.has(x.k)?'checked':''} ${ro?'disabled':''} onchange="uPk(this)"><span>${x.t}<span class="block text-[11px] leading-snug text-slate-500">${x.d}</span></span></label>`).join('')}</div>`).join('')}</div>
 <p class="text-[11px] text-slate-500 mt-2">Usuários, Termo para assinatura e Planilha (modelo) do REIDI são exclusivos do administrador.</p>`}
const uPermLer=()=>[...document.querySelectorAll('#uperm [data-pk]:checked')].map(i=>i.dataset.pk),
 uPn=()=>{const n=$('#uperm-n');if(n)n.textContent=uPermLer().length+' de '+PERM.TODAS.length+' permissões marcadas'},
 uPset=l=>{const s=new Set(l);document.querySelectorAll('#uperm [data-pk]').forEach(i=>i.checked=s.has(i.dataset.pk));uPn()};
function uPk(el){const k=el.dataset.pk,q=x=>document.querySelector(`#uperm [data-pk="${x}"]`);
 if(el.checked&&PERM.DEP[k])q(PERM.DEP[k]).checked=true;
 if(!el.checked)Object.keys(PERM.DEP).forEach(a=>{if(PERM.DEP[a]==k)q(a).checked=false});uPn()}
const uPall=on=>uPset(on?PERM.TODAS:[]),uPdef=()=>uPset(PERM.padrao($('#uf-r').value));
/* trocou o perfil na janela → mostra as permissões do perfil novo (o mesmo perfil de antes mantém as do usuário) */
function uRole(v){const u=UF.u;$('#uperm').innerHTML=uPermHtml(v,u&&u.papel==v?PERM.efetivas(u):PERM.padrao(v),UF.ro);uPn()}
/* faixa de situação: as regras do banco estão mesmo por permissão? (só o administrador chama permissoes_status) */
async function uStatus(){const el=$('#ubn');if(!el)return;el.className='hidden';
 const box=(c,t)=>{el.className='rounded-lg px-3 py-2 text-sm '+c;el.innerHTML=t},am='bg-amber-500/10 text-amber-700 dark:text-amber-300';
 if(PERM.legado)return box(am,'⚠ <b>Permissões individuais ainda não ativadas no banco.</b> Execute <code>supabase/permissoes.sql</code> no Supabase (veja o COMO_ATUALIZAR.txt). Até lá, cada usuário usa as permissões padrão do perfil e as caixas de marcação ficam somente para consulta.');
 try{const r=await sb_.rpc('permissoes_status');if(r.error)throw r.error;const s=r.data||{};
  if(s.ok)box('bg-emerald-500/10 text-emerald-700 dark:text-emerald-300','✔ As regras de acesso do banco estão aplicadas por permissão: o bloqueio vale para qualquer forma de acesso, não só para o menu.');
  else box(am,'⚠ Algumas regras do banco ainda estão no modelo antigo (por perfil): <b>'+(s.divergentes||[]).map(esc).join(', ')+'</b>. Execute <code>supabase/permissoes.sql</code> de novo no Supabase.')}
 catch(e){box(am,'⚠ Não consegui conferir as regras do banco: '+esc(PERM.erro(e)))}}
function uForm(id){const u=US.find(x=>x.id==id),nw=!u,me=u&&PF&&u.id==PF.id,papel=u?u.papel:'viewer',ro=PERM.legado;UF={u:u||null,ro};
 mo(`<h2 class="text-lg font-bold mb-4">${nw?'Novo usuário':'Editar usuário'}</h2>
 ${lbl('Nome')}<input id="uf-n" class="inp w-full mb-3" value="${esc(u?u.nome:'')}">
 ${lbl('Usuário (login)')}<input id="uf-l" class="inp w-full mb-3" value="${esc(u?u.login:'')}" placeholder="ex.: maria.silva" ${nw?'':'disabled'}>
 ${lbl('Perfil <span class="text-xs text-slate-500">(define as permissões iniciais; ajuste-as abaixo)</span>')}<select id="uf-r" class="inp w-full mb-3" ${me?'disabled':''} onchange="uRole(this.value)"><option value="viewer" ${papel=='viewer'?'selected':''}>Visualizador (consulta e exporta os relatórios)</option><option value="lancador" ${papel=='lancador'?'selected':''}>Lançador REIDI (lança compras na Projeção REIDI)</option><option value="faturamento" ${papel=='faturamento'?'selected':''}>Faturamento (anexa e corrige NF)</option><option value="admin" ${papel=='admin'?'selected':''}>Administrador (acesso total, inclusive Usuários)</option></select>
 ${nw?`${lbl('Senha inicial (mín. 8, com letras e números)')}<input id="uf-p" type="password" autocomplete="new-password" class="inp w-full mb-3"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no primeiro acesso</label>`:''}
 <div class="border-t border-slate-200 dark:border-slate-800 pt-3 mt-1"><h3 class="font-semibold mb-1">Permissões de acesso</h3><p class="text-xs text-slate-500 mb-2">Marque o que este usuário pode ver e fazer. A regra vale no banco de dados — quem não tem a permissão não recebe os dados, mesmo digitando o endereço da página.</p>
 ${ro?'<p class="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-2">Permissões individuais ainda não ativadas no banco (execute <code>supabase/permissoes.sql</code>): por enquanto vale o padrão do perfil.</p>':''}
 <div id="uperm">${uPermHtml(papel,u?PERM.efetivas(u):PERM.padrao(papel),ro)}</div></div>
 <div class="${RODA}"><p id="me" class="hidden flex-1 basis-full sm:basis-0 text-sm text-rose-500 text-left"></p><button class="btn2" onclick="closeMd()">Cancelar</button><button id="uf-ok" class="btn" onclick="uSaveForm('${nw?'':u.id}')">Salvar</button></div>`);
 $('#mdb').style.maxWidth='48rem';uPn()}
async function uRun(p){try{await adminUsuarios(p);closeMd();await uRender()}catch(e){merr(e.message)}finally{const x=$('#uf-p');if(x)x.value=''}}
async function uOp(p){try{await adminUsuarios(p);await uRender()}catch(e){dlg('Não foi possível concluir',esc(e.message))}}
/* grava as permissões pela função do banco (só administrador; nunca as próprias; só chaves do catálogo) */
async function uPermSalvar(id,lista){const r=await sb_.rpc('definir_permissoes',{p_id:id,p_permissoes:lista});if(r.error)throw new Error(PERM.erro(r.error));return r.data}
async function uSaveForm(id){const n=$('#uf-n').value.trim(),r=$('#uf-r').value;if(!n)return merr('Informe o nome.');
 const u=id?US.find(x=>x.id==id):null,quer=r=='admin'||PERM.legado?null:uPermLer(),b=$('#uf-ok');
 let l='',pw='';
 if(!id){l=$('#uf-l').value.trim().toLowerCase();pw=$('#uf-p').value;
  if(!LRX.test(l))return merr('Usuário: 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou _).');
  if(US.some(x=>x.login==l))return merr('Esse usuário já existe.');
  if(!pwOk(pw))return merr(PWMSG)}
 b.disabled=true;b.textContent='Salvando…';let criado=false;
 try{
  if(id){await adminUsuarios({a:'update',id,n,r});
   /* trocar o perfil volta ao padrão do perfil novo (gatilho do banco); só grava de novo se o que está marcado for diferente */
   if(quer&&!PERM.igual(quer,u.papel==r?PERM.efetivas(u):PERM.padrao(r)))await uPermSalvar(id,quer)}
  else{await adminUsuarios({a:'create',l,n,r,pw,mc:$('#uf-m').checked});criado=true;
   if(quer&&!PERM.igual(quer,PERM.padrao(r))){const a=await sb_.from('perfis').select('id').eq('login',l).maybeSingle();if(a.error||!a.data)throw new Error('não encontrei o usuário recém-criado');await uPermSalvar(a.data.id,quer)}}
  const alt=quer&&(id?!PERM.igual(quer,u.papel==r?PERM.efetivas(u):PERM.padrao(r)):!PERM.igual(quer,PERM.padrao(r)));
  closeMd();await uRender();if(alt)aviso('Permissões de '+(id?u.login:l)+' salvas. Valem na hora: o banco já aplica o novo acesso.')}
 catch(e){
  if(criado){closeMd();await uRender();dlg('Usuário criado, permissões não gravadas','O usuário "'+esc(l)+'" foi criado com as permissões padrão do perfil, mas não consegui gravar as permissões escolhidas: '+esc(e.message)+'. Abra “Editar” para ajustá-las.')}
  else{merr(e.message||String(e));b.disabled=false;b.textContent='Salvar';if(id)uRender().catch(()=>{})}}
 finally{const x=$('#uf-p');if(x)x.value=''}}
function uReset(id){const u=US.find(x=>x.id==id);mo(`<h2 class="text-lg font-bold mb-1">Redefinir senha</h2><p class="text-sm text-slate-500 mb-4">Usuário: ${esc(u.login)}</p>
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="uf-p" type="password" autocomplete="new-password" class="inp w-full mb-3"><label class="flex items-center gap-2 text-sm mb-3"><input id="uf-m" type="checkbox"> Exigir troca de senha no próximo acesso</label>
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button class="btn" onclick="uDoReset('${id}')">Salvar</button></div>`)}
function uDoReset(id){const pw=$('#uf-p').value;if(!pwOk(pw))return merr(PWMSG);return uRun({a:'reset',id,pw,mc:$('#uf-m').checked})}
function uToggle(id){return uOp({a:'toggle',id})}
function uDel(id){const u=US.find(x=>x.id==id);if(!u)return;dlg('Excluir usuário','Excluir "'+esc(u.login)+'"? Esta ação não pode ser desfeita.',()=>uOp({a:'delete',id}))}
function pwModal(forced){mo(`<h2 class="text-lg font-bold mb-1">${forced?'Defina uma nova senha':'Alterar minha senha'}</h2>${forced?'<p class="text-sm text-slate-500 mb-4">Por segurança, troque a senha provisória para continuar.</p>':'<div class="mb-4"></div>'}
 ${forced?'':lbl('Senha atual')+'<input id="pw0" type="password" autocomplete="current-password" class="inp w-full mb-3">'}
 ${lbl('Nova senha (mín. 8, com letras e números)')}<input id="pw1" type="password" autocomplete="new-password" class="inp w-full mb-3">${lbl('Repita a nova senha')}<input id="pw2" type="password" autocomplete="new-password" class="inp w-full mb-3">
 <p id="me" class="hidden text-sm text-rose-500 mb-3"></p>
 <div class="flex justify-end gap-2"><button class="btn2" onclick="${forced?'logout()':'closeMd()'}">${forced?'Sair':'Cancelar'}</button><button class="btn" onclick="pwSave(${forced?1:0})">Salvar</button></div>`)}
async function pwSave(forced){const a=$('#pw1').value;
 try{if(!forced){const r=await sb_.auth.signInWithPassword({email:PF.email,password:$('#pw0').value});if(r.error)return merr('Senha atual incorreta.')}
  if(!pwOk(a))return merr(PWMSG);if(a!==$('#pw2').value)return merr('As senhas não conferem.');
  const r=await sb_.auth.updateUser({password:a});if(r.error)return merr(tr(r.error.message));
  await sb_.rpc('limpar_mc');uLog('alterou a própria senha');closeMd();if(forced)await enter()}
 catch(e){merr('Falha ao alterar a senha: '+e.message)}
 finally{['pw0','pw1','pw2'].forEach(i=>{const x=$('#'+i);if(x)x.value=''})}}
