/* Relatório "Doc Assinados" (só administrador): anexa os documentos já assinados do REIDI, do FUNDO DE RESERVA e do FLUXO DE CAIXA e os ABRE NA PRÓPRIA TELA,
   sem baixar, para conferir. Três abas (mais "Todos"), cada uma com a contagem. Ao anexar escolhe-se a categoria e, se quiser, uma referência (texto livre, até 120
   caracteres, por exemplo "Termo 001/2026 · NF 00000004"); vários arquivos de uma vez (PDF, PNG, JPG ou WEBP, até 10 MB cada). Cada documento mostra quem anexou e quando.
   Excluir pede confirmação; editar não existe (exclui-se e anexa-se de novo). Busca por nome, referência, categoria ou quem anexou.
   Os documentos anexados antes pelo botão "Doc. Assinados" do REIDI aparecem na aba REIDI (e continuam no botão do REIDI).
   Dados: DOCA (js/core/docs_assinados_dados.js) · visualizador: NFV (js/core/nf_visualizador.js) · janela: mo()/closeMd() (js/modulos/usuarios.js).
   O item do menu só aparece para o administrador (main.js: adm:true) e o banco também só entrega a lista e os arquivos para administrador. */
(() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    $id = id => document.getElementById(id),
    pl = (n, um, vs) => n + ' ' + (n == 1 ? um : vs),
    sem = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    /* textos do visualizador (padrão dele é "NF") */
    TXT = { rotulo: 'Documento assinado', carregando: 'Carregando o documento…', falhaAbrir: 'Não foi possível abrir o documento', falhaBaixar: 'Não consegui baixar o documento', falhaCarregar: 'Não consegui carregar o documento' },
    admin = () => typeof ROLE != 'undefined' && ROLE == 'admin',
    pagina = () => document.querySelector('[data-view="docs"]'),
    /* a janela de anexar está aberta (e é a nossa)? devolve a raiz */
    dlg = () => { const m = $id('md'), r = $id('docs-dlg'); return m && r && !m.classList.contains('hidden') ? r : null };
  let ABA = 'todos',                       /* 'todos' | id da categoria */
    Q = '',                                /* busca */
    CARGA = 'carregando',                  /* 'carregando' | 'ok' | 'erro' */
    BUSY = false, PROG = '', MSG = null,   /* MSG = { ok: 'texto', er: ['linhas'] } (faixa da página) */
    CONF = null,                           /* key do documento que espera a confirmação de exclusão */
    SEL = [],                              /* arquivos escolhidos na janela de anexar: { f: File, er: 'texto do problema' | '' } */
    DMSG = null,                           /* mensagens da janela de anexar: { er: ['linhas'] } */
    TOK = 0;

  const quando = d => 'Anexado' + (d.por ? ' por ' + d.por : '') + (d.em ? ' em ' + BASE.fdh(d.em) : ''),
    detalhe = d => [quando(d), RDOC.ROT[d.tipo] || '', RDOC.tam(d.bytes)].filter(Boolean).join(' · '),
    /* documentos da aba aberta, já filtrados pela busca */
    visiveis = () => {
      const q = sem(Q).trim().split(/\s+/).filter(Boolean);
      return DOCA.L.filter(d => (ABA == 'todos' || d.cat == ABA) && (!q.length || q.every(t => sem([d.nome, d.ref, DOCA.rotCat(d.cat), d.por].join(' ')).includes(t))))
    },
    nomeAba = () => ABA == 'todos' ? 'Todos' : DOCA.rotCat(ABA);

  const casca = () => `<div class="flex flex-wrap items-center gap-2">
      <div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Doc Assinados</h1><p class="text-sm text-slate-500">Documentos assinados do REIDI, do Fundo de Reserva e do Fluxo de Caixa</p></div>
      <button type="button" id="docs-add" class="btn" data-a="anexar">＋ Anexar documento</button></div>
    <div id="docs-tabs" class="flex flex-wrap items-center gap-2" role="tablist" aria-label="Categorias"></div>
    <div id="docs-st" role="status" aria-live="polite"></div>
    <div class="card space-y-3">
      <input id="docs-q" type="search" class="inp w-full" placeholder="🔍 Buscar por nome, referência, categoria ou quem anexou" aria-label="Buscar documentos" autocomplete="off">
      <div id="docs-lista"></div></div>`;

  function abas() {
    const n = DOCA.conta(), ok = CARGA == 'ok';
    return [{ id: 'todos', nome: 'Todos' }].concat(DOCA.CATS).map(t => {
      const on = ABA == t.id;
      return `<button type="button" role="tab" data-a="aba" data-id="${t.id}" data-aba="${t.id}" aria-selected="${on}" class="${on ? 'btn' : 'btn2'}">${esc(t.nome)}${ok ? ` <span class="opacity-75 tabular-nums" data-n>(${n[t.id]})</span>` : ''}</button>`
    }).join('')
  }

  function estado() {
    let h = '';
    if (PROG) h += `<div class="rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-sm" data-prog>⏳ ${esc(PROG)}</div>`;
    if (MSG && MSG.ok) h += `<div class="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2 text-sm" data-ok>✔ ${esc(MSG.ok)}</div>`;
    if (MSG && MSG.er && MSG.er.length) h += `<div class="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-2 text-sm" data-er>${MSG.er.map(t => '⚠ ' + esc(t)).join('<br>')}</div>`;
    if (CARGA == 'ok' && DOCA.avisoLegado) h += `<div class="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 text-sm" data-aviso>⚠ ${esc(DOCA.avisoLegado)}</div>`;
    return h ? `<div class="space-y-2">${h}</div>` : ''
  }

  function linha(d) {
    const conf = CONF == d.key, img = d.tipo != 'application/pdf', k = esc(d.key), off = BUSY ? 'disabled' : '';
    return `<li class="rounded-xl border ${conf ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-200 dark:border-slate-800'} px-3 py-2.5" data-doc="${k}" data-cat="${esc(d.cat)}">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-2xl shrink-0" aria-hidden="true">${img ? '🖼️' : '📄'}</span>
        <div class="min-w-0 mr-auto flex-1 basis-48">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1"><span class="font-medium truncate max-w-full" title="${esc(d.nome)}" data-nome>${esc(d.nome)}</span>${ABA == 'todos' ? `<span class="shrink-0 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-xs font-medium" data-cat-chip>${esc(DOCA.rotCat(d.cat))}</span>` : ''}</div>
          ${d.ref ? `<div class="text-sm text-slate-700 dark:text-slate-300 break-words" data-ref><span class="text-slate-500">Referência:</span> ${esc(d.ref)}</div>` : ''}
          <div class="text-xs text-slate-500" data-meta>${esc(detalhe(d))}${d.legado ? ' · <span data-legado title="Anexado antes pelo botão Doc. Assinados do REIDI">anexo anterior do REIDI</span>' : ''}</div></div>
        ${conf ? '' : `<button type="button" class="btn" data-a="ver" data-id="${k}" ${off}>👁 Abrir</button><button type="button" class="btn2" data-a="baixar" data-id="${k}" ${off}>⬇ Baixar</button><button type="button" class="btn2 text-rose-600 dark:text-rose-400" data-a="pedir" data-id="${k}" ${off}>🗑 Excluir</button>`}
      </div>
      ${conf ? `<div class="mt-2 flex flex-wrap items-center gap-2 text-sm" data-conf><span class="mr-auto min-w-0 break-words">Excluir <b>${esc(d.nome)}</b>? Não dá para desfazer.</span><button type="button" class="btn2" data-a="cancela" ${off}>Cancelar</button><button type="button" class="btn !bg-rose-600 hover:!bg-rose-500" data-a="exclui" data-id="${k}" ${off}>Sim, excluir</button></div>` : ''}
    </li>`
  }

  function lista() {
    if (CARGA == 'carregando') return '<p class="text-sm text-slate-500 py-6 text-center" data-carregando>Carregando…</p>';
    if (CARGA == 'erro') {
      if (DOCA.falta) return `<div class="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-3 text-sm" data-falta><b>Falta instalar no banco.</b><br>${esc(DOCA.erro)}<br>Depois de executar, <button type="button" class="underline font-medium" data-a="recarregar">atualize a lista</button>.</div>`;
      return `<div class="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-3 text-sm mb-3" data-erro>⚠ Não consegui carregar a lista: ${esc(DOCA.erro)}</div><button type="button" class="btn2" data-a="recarregar">Tentar de novo</button>`
    }
    const v = visiveis(), tot = DOCA.L.filter(d => ABA == 'todos' || d.cat == ABA).length;
    if (!tot) return `<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500" data-vazio>${ABA == 'todos' ? 'Nenhum documento assinado anexado ainda.' : 'Nenhum documento em ' + esc(nomeAba()) + ' ainda.'}<br>Use <b>＋ Anexar documento</b> para enviar o primeiro.</div>`;
    if (!v.length) return `<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500" data-sem-resultado>Nenhum documento encontrado para “${esc(Q.trim())}”${ABA == 'todos' ? '' : ' em ' + esc(nomeAba())}.</div>`;
    return `<div class="text-xs text-slate-500 mb-2" data-conta>${Q.trim() ? pl(v.length, 'documento encontrado', 'documentos encontrados') + ' de ' + tot : pl(v.length, 'documento anexado', 'documentos anexados')}${ABA == 'todos' ? '' : ' · ' + esc(nomeAba())}</div><ul class="space-y-2">${v.map(linha).join('')}</ul>`
  }

  function desenha() {
    if (!pagina() || !$id('docs-tabs')) return;
    const add = $id('docs-add'); add.disabled = BUSY || CARGA != 'ok';
    add.classList.toggle('opacity-50', add.disabled); add.classList.toggle('cursor-not-allowed', add.disabled);
    $id('docs-tabs').innerHTML = abas(); $id('docs-st').innerHTML = estado(); $id('docs-lista').innerHTML = lista()
  }

  async function recarrega() {
    try { await DOCA.carregar(); CARGA = 'ok' } catch (e) { if (CARGA != 'ok' || !DOCA.L.length) CARGA = 'erro' }   /* uma falha passageira não esconde a lista que já está na tela */
  }

  async function show() {
    if (!admin()) return;
    const p = pagina(); if (!p) return;
    CARGA = 'carregando'; BUSY = false; PROG = ''; MSG = null; CONF = null; const tok = ++TOK;
    if (!$id('docs-tabs')) { p.innerHTML = casca(); p.addEventListener('click', clique); $id('docs-q').addEventListener('input', e => { Q = e.target.value; CONF = null; desenha() }) }
    $id('docs-q').value = Q; desenha();
    await recarrega(); if (tok != TOK) return; desenha()
  }

  function clique(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (a == 'aba') { ABA = id; CONF = null; desenha() }
    else if (a == 'anexar') { if (!BUSY && CARGA == 'ok') abreAnexar() }
    else if (a == 'ver') ver(id);
    else if (a == 'baixar') baixa(id);
    else if (a == 'pedir') { if (!BUSY) { CONF = id; MSG = null; desenha(); const c = document.querySelector('[data-view="docs"] [data-a="cancela"]'); if (c) c.focus() } }
    else if (a == 'cancela') { const k = CONF; CONF = null; desenha(); const x = k && Array.from(document.querySelectorAll('[data-view="docs"] [data-doc]')).find(li => li.dataset.doc == k); const y = x && x.querySelector('[data-a="pedir"]'); if (y) y.focus() }
    else if (a == 'exclui') exclui(id);
    else if (a == 'recarregar') { CARGA = 'carregando'; desenha(); recarrega().then(desenha) }
  }

  /* abre o documento na tela (o visualizador baixa os bytes só para a memória do navegador; nada é salvo no computador) */
  function ver(key) {
    const d = DOCA.L.find(x => x.key == key);
    if (!d) { MSG = { ok: '', er: ['Documento não encontrado. Atualize a lista.'] }; desenha(); return }
    NFV.abrirArquivo({ titulo: d.nome, sub: [DOCA.rotCat(d.cat), d.ref ? 'Ref.: ' + d.ref : '', detalhe(d)].filter(Boolean).join(' · '), nome: d.nome, tipo: d.tipo, obter: () => DOCA.blob(d), baixar: () => DOCA.baixar(d), rotulo: TXT.rotulo, t: TXT })
  }

  async function baixa(key) {
    const d = DOCA.L.find(x => x.key == key); if (!d || BUSY) return;
    try { await DOCA.baixar(d) } catch (e) { MSG = { ok: '', er: [TXT.falhaBaixar + ': ' + ((e && e.message) || String(e))] }; desenha() }
  }

  async function exclui(key) {
    if (BUSY) return; BUSY = true; PROG = 'Excluindo…'; desenha(); let m;
    try { await DOCA.excluir(key); m = { ok: 'Documento excluído.', er: [] } } catch (e) { m = { ok: '', er: [(e && e.message) || String(e)] } }
    CONF = null; BUSY = false; PROG = ''; MSG = m; await recarrega(); desenha();
    const a = $id('docs-add'); if (a && !a.disabled) a.focus()
  }

  /* ---------- janela "Anexar documento" ---------- */
  const selecionados = () => SEL.map((s, i) => {
    const lis = `<li class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border ${s.er ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-200 dark:border-slate-800'} px-2.5 py-1.5 text-sm" data-sel="${i}">
        <span class="min-w-0 mr-auto break-all" data-sel-nome>${esc(s.f.name)}</span><span class="text-xs text-slate-500 shrink-0">${esc(RDOC.tam(s.f.size))}</span>
        <button type="button" class="btn2 !px-2 !py-0.5 shrink-0" data-a="tirar" data-i="${i}" ${BUSY ? 'disabled' : ''} aria-label="Tirar ${esc(s.f.name)} da lista">✕</button>
        ${s.er ? `<span class="basis-full text-xs text-rose-600 dark:text-rose-400" data-sel-er>⚠ ${esc(s.er)}</span>` : ''}</li>`;
    return lis
  }).join('');

  function dEstado() {
    let h = '';
    if (PROG) h += `<div class="rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-sm" data-prog>⏳ ${esc(PROG)}</div>`;
    if (DMSG && DMSG.er && DMSG.er.length) h += `<div class="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-2 text-sm" data-er>${DMSG.er.map(t => '⚠ ' + esc(t)).join('<br>')}</div>`;
    if (!PROG && SEL.some(s => s.er)) h += '<div class="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 text-sm" data-inv>Os arquivos marcados com ⚠ não serão enviados. Tire-os da lista (✕) ou escolha outros.</div>';
    return h
  }

  function dDesenha() {
    if (!dlg()) return;
    $id('docs-sel').innerHTML = selecionados();
    $id('docs-sel-conta').textContent = SEL.length ? pl(SEL.length, 'arquivo escolhido', 'arquivos escolhidos') : 'Nenhum arquivo escolhido';
    $id('docs-dst').innerHTML = dEstado();
    const validos = SEL.filter(s => !s.er).length, ok = $id('docs-ok');
    ok.disabled = BUSY || !validos; ok.classList.toggle('opacity-50', ok.disabled); ok.classList.toggle('cursor-not-allowed', ok.disabled);
    ok.textContent = BUSY ? 'Enviando…' : validos > 1 ? 'Anexar ' + validos + ' documentos' : 'Anexar documento';
    ['docs-cat', 'docs-ref', 'docs-esc'].forEach(i => { $id(i).disabled = BUSY });
    $id('docs-cancel').disabled = BUSY
  }

  function abreAnexar() {
    if (!admin() || BUSY || CARGA != 'ok') return;
    SEL = []; DMSG = null; MSG = null; desenha();
    const pre = ABA != 'todos' ? ABA : '';
    mo(`<div id="docs-dlg" role="dialog" aria-modal="true" aria-labelledby="docs-dlg-t" tabindex="-1" class="outline-none">
      <h2 id="docs-dlg-t" class="text-lg font-bold mb-1">Anexar documento assinado</h2>
      <p class="text-sm text-slate-500 mb-4">Escolha a categoria e, se quiser, uma referência. Vale para todos os arquivos que você escolher agora.</p>
      <div class="space-y-3">
        <div><label class="block text-sm font-medium mb-1" for="docs-cat">Categoria</label>
          <select id="docs-cat" class="inp w-full"><option value="">Selecione a categoria…</option>${DOCA.CATS.map(c => `<option value="${c.id}" ${c.id == pre ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
        <div><label class="block text-sm font-medium mb-1" for="docs-ref">Referência <span class="font-normal text-slate-500">(opcional)</span></label>
          <input id="docs-ref" type="text" class="inp w-full" maxlength="${DOCA.REFMAX}" placeholder="Ex.: Termo 001/2026 · NF 00000004" autocomplete="off"></div>
        <div><div class="flex flex-wrap items-center gap-x-3 gap-y-2"><button type="button" id="docs-esc" class="btn2" data-a="escolher">📎 Escolher arquivos</button>
            <span class="text-xs text-slate-500">PDF, PNG, JPG ou WEBP · até 10 MB cada · pode escolher vários</span></div>
          <input id="docs-f" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp">
          <div id="docs-sel-conta" class="text-xs text-slate-500 mt-2" aria-live="polite"></div><ul id="docs-sel" class="space-y-1.5 mt-1.5 max-h-56 overflow-auto"></ul></div>
        <div id="docs-dst" role="status" aria-live="polite" class="space-y-2"></div></div>
      <div class="flex justify-end gap-2 mt-4"><button type="button" id="docs-cancel" class="btn2" data-a="cancelar">Cancelar</button><button type="button" id="docs-ok" class="btn" data-a="enviar">Anexar documento</button></div></div>`);
    $id('mdb').style.maxWidth = '36rem';
    const r = $id('docs-dlg'); r.addEventListener('click', dClique); $id('docs-f').addEventListener('change', e => escolhidos(e.target));
    dDesenha(); r.focus()
  }

  function dClique(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a == 'escolher') { if (!BUSY) $id('docs-f').click() }
    else if (a == 'tirar') { if (!BUSY) { SEL.splice(+b.dataset.i, 1); dDesenha() } }
    else if (a == 'cancelar') { if (!BUSY) closeMd() }
    else if (a == 'enviar') envia()
  }

  /* arquivos escolhidos: cada um é conferido na hora (tipo, vazio, 10 MB); repetido (mesmo nome, tamanho e data) não entra duas vezes */
  function escolhidos(inp) {
    const fs = Array.from(inp.files || []); inp.value = '';
    fs.forEach(f => { if (!SEL.some(s => s.f.name == f.name && s.f.size == f.size && s.f.lastModified == f.lastModified)) SEL.push({ f, er: RDOC.validar(f) }) });
    DMSG = null; dDesenha()
  }

  async function envia() {
    if (BUSY || !admin() || CARGA != 'ok') return;
    const cat = $id('docs-cat').value, ref = $id('docs-ref').value, v = SEL.filter(s => !s.er); if (!v.length) return;
    const er = DOCA.validar(v[0].f, cat, ref);   /* categoria e referência (o arquivo já foi conferido ao escolher) */
    if (er) { DMSG = { er: [er] }; dDesenha(); const f = DOCA.CATS.some(c => c.id == cat) ? $id('docs-ref') : $id('docs-cat'); if (f) f.focus(); return }
    BUSY = true; DMSG = null; MSG = null; CONF = null; const falhas = []; let ok = 0;
    for (let i = 0; i < v.length; i++) {
      PROG = 'Enviando ' + (i + 1) + ' de ' + v.length + ': ' + v[i].f.name; dDesenha(); desenha();
      try { await DOCA.anexar(v[i].f, cat, ref); ok++; SEL = SEL.filter(s => s !== v[i]) } catch (e) { falhas.push(v[i].f.name + ': ' + ((e && e.message) || String(e))) }
    }
    PROG = ''; BUSY = false; await recarrega();
    const m = ok ? (ok == 1 ? 'Documento anexado' : ok + ' documentos anexados') + ' em ' + DOCA.rotCat(cat) + '.' : '';
    if (dlg()) {
      if (ok) { MSG = { ok: m, er: [] }; ABA = cat }   /* a página já mostra a aba onde os documentos entraram */
      if (!falhas.length && !SEL.length) { closeMd(); desenha(); const a = $id('docs-add'); if (a && !a.disabled) a.focus() }   /* tudo certo: fecha */
      else { DMSG = falhas.length ? { er: falhas } : null; dDesenha(); desenha() }   /* ficou algo (falhou ou era inválido): a janela continua aberta só com o que sobrou */
    } else {
      MSG = { ok: m, er: falhas }; if (ok) ABA = cat; desenha();   /* a janela foi fechada durante o envio */
      if (typeof aviso == 'function') aviso(ok ? '✔ ' + m + (falhas.length ? ' ' + pl(falhas.length, 'arquivo não foi anexado', 'arquivos não foram anexados') + '.' : '') : '⚠ ' + falhas[0], !ok)
    }
  }

  /* Esc fecha a janela de anexar (se o visualizador estiver aberto, é ele que fecha: o dele vem antes e interrompe o evento; durante o envio não fecha) */
  document.addEventListener('keydown', e => {
    if (e.key != 'Escape' || !dlg()) return; const v = $id('nfv'); if (v && !v.classList.contains('hidden')) return;
    e.stopPropagation(); if (!BUSY) closeMd()
  });

  window.docs = { show };
})();
