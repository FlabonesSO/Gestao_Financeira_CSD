/* REIDI · botão "Doc. Assinados" (só administrador): anexa os documentos já assinados (por exemplo, o Termo para assinatura) e os ABRE NA PRÓPRIA TELA,
   sem baixar, para conferir se foi aprovado. Vários arquivos de uma vez (PDF, PNG, JPG ou WEBP, até 10 MB cada); cada um mostra quem anexou e quando.
   Dados: RDOC (js/core/reidi_docs_dados.js) · visualizador: NFV (js/core/nf_visualizador.js) · janela: mo()/closeMd() (js/modulos/usuarios.js).
   O botão está no topo do relatório REIDI (reidi.js) e só aparece para o administrador; o banco também só entrega a lista e os arquivos para administrador. */
(() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    $id = id => document.getElementById(id),
    pl = (n, um, vs) => n + ' ' + (n == 1 ? um : vs),
    /* textos do visualizador (padrão dele é "NF") */
    TXT = { rotulo: 'Documento assinado', carregando: 'Carregando o documento…', falhaAbrir: 'Não foi possível abrir o documento', falhaBaixar: 'Não consegui baixar o documento', falhaCarregar: 'Não consegui carregar o documento' },
    /* a janela está aberta (e é a nossa)? devolve a raiz */
    raiz = () => { const m = $id('md'), r = $id('rdoc'); return m && r && !m.classList.contains('hidden') ? r : null };
  let CARGA = 'carregando', /* 'carregando' | 'ok' | 'erro' */
    BUSY = false, PROG = '', MSG = null, /* MSG = { ok: 'texto', er: ['linhas'] } */
    CONF = null, /* id do documento que espera a confirmação de exclusão */
    TOK = 0;

  const quando = d => 'Anexado' + (d.por ? ' por ' + d.por : '') + (d.em ? ' em ' + BASE.fdh(d.em) : ''),
    detalhe = d => [quando(d), RDOC.ROT[d.tipo] || '', RDOC.tam(d.bytes)].filter(Boolean).join(' · ');

  const shell = () => `<div id="rdoc" role="dialog" aria-modal="true" aria-labelledby="rdoc-t" tabindex="-1" class="outline-none">
    <div class="flex items-start gap-3 mb-1"><h2 id="rdoc-t" class="text-lg font-bold mr-auto">Documentos assinados <span class="font-normal text-slate-500">· REIDI</span></h2>
      <button type="button" class="btn2" data-a="fechar" aria-label="Fechar">✕ Fechar</button></div>
    <p class="text-sm text-slate-500 mb-4">Anexe aqui os documentos já assinados (por exemplo, o Termo para assinatura). Use <b>Abrir</b> para ver o arquivo na tela, sem baixar, e conferir se foi aprovado.</p>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
      <button type="button" id="rdoc-add" class="btn" data-a="anexar">＋ Anexar documento</button>
      <span class="text-xs text-slate-500">PDF, PNG, JPG ou WEBP · até 10 MB cada · pode escolher vários</span>
      <input id="rdoc-f" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"></div>
    <div id="rdoc-st" role="status" aria-live="polite"></div>
    <div id="rdoc-lista"></div></div>`;

  function estado() {
    let h = '';
    if (PROG) h += `<div class="rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-sm mb-3" data-prog>⏳ ${esc(PROG)}</div>`;
    if (MSG && MSG.ok) h += `<div class="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2 text-sm mb-3" data-ok>✔ ${esc(MSG.ok)}</div>`;
    if (MSG && MSG.er && MSG.er.length) h += `<div class="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-2 text-sm mb-3" data-er>${MSG.er.map(t => '⚠ ' + esc(t)).join('<br>')}</div>`;
    return h
  }

  function linha(d) {
    const conf = CONF == d.id, img = d.tipo != 'application/pdf', id = esc(d.id);
    return `<li class="rounded-xl border ${conf ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-200 dark:border-slate-800'} px-3 py-2.5" data-doc="${id}">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="text-2xl shrink-0" aria-hidden="true">${img ? '🖼️' : '📄'}</span>
        <div class="min-w-0 mr-auto flex-1 basis-40"><div class="font-medium truncate" title="${esc(d.nome)}" data-nome>${esc(d.nome)}</div><div class="text-xs text-slate-500" data-meta>${esc(detalhe(d))}</div></div>
        ${conf ? '' : `<button type="button" class="btn" data-a="ver" data-id="${id}" ${BUSY ? 'disabled' : ''}>👁 Abrir</button><button type="button" class="btn2 text-rose-600 dark:text-rose-400" data-a="pedir" data-id="${id}" ${BUSY ? 'disabled' : ''}>🗑 Excluir</button>`}
      </div>
      ${conf ? `<div class="mt-2 flex flex-wrap items-center gap-2 text-sm" data-conf><span class="mr-auto min-w-0 break-words">Excluir <b>${esc(d.nome)}</b>? Não dá para desfazer.</span><button type="button" class="btn2" data-a="cancela" ${BUSY ? 'disabled' : ''}>Cancelar</button><button type="button" class="btn !bg-rose-600 hover:!bg-rose-500" data-a="exclui" data-id="${id}" ${BUSY ? 'disabled' : ''}>Sim, excluir</button></div>` : ''}
    </li>`
  }

  function lista() {
    if (CARGA == 'carregando') return '<p class="text-sm text-slate-500 py-6 text-center" data-carregando>Carregando…</p>';
    if (CARGA == 'erro') {
      if (RDOC.falta) return `<div class="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-3 text-sm" data-falta><b>Falta instalar no banco.</b><br>${esc(RDOC.erro)}<br>Depois de executar, feche e abra esta janela de novo.</div>`;
      return `<div class="rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-3 text-sm mb-3" data-erro>⚠ Não consegui carregar a lista: ${esc(RDOC.erro)}</div><button type="button" class="btn2" data-a="recarregar">Tentar de novo</button>`
    }
    if (!RDOC.L.length) return '<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500" data-vazio>Nenhum documento assinado anexado ainda.<br>Use <b>＋ Anexar documento</b> para enviar o primeiro.</div>';
    return `<div class="text-xs text-slate-500 mb-2" data-conta>${pl(RDOC.L.length, 'documento anexado', 'documentos anexados')}</div><ul class="space-y-2">${RDOC.L.map(linha).join('')}</ul>`
  }

  function desenha() {
    if (!raiz()) return;
    const add = $id('rdoc-add'); add.disabled = BUSY || CARGA != 'ok';
    add.classList.toggle('opacity-50', add.disabled); add.classList.toggle('cursor-not-allowed', add.disabled);
    $id('rdoc-st').innerHTML = estado(); $id('rdoc-lista').innerHTML = lista()
  }

  async function recarrega() {
    try { await RDOC.carregar(); CARGA = 'ok' } catch (e) { if (CARGA != 'ok' || !RDOC.L.length) CARGA = 'erro' }   /* uma falha passageira não esconde a lista que já está na tela */
  }

  async function abrir() {
    if (typeof ROLE == 'undefined' || ROLE != 'admin') return;
    CARGA = 'carregando'; BUSY = false; PROG = ''; MSG = null; CONF = null; const tok = ++TOK;
    mo(shell()); $id('mdb').style.maxWidth = '44rem';
    const r = $id('rdoc'); r.addEventListener('click', clique); $id('rdoc-f').addEventListener('change', e => anexar(e.target));
    desenha(); r.focus();
    await recarrega(); if (tok != TOK) return; desenha()
  }

  function clique(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (a == 'fechar') closeMd();
    else if (a == 'anexar') { if (!BUSY && CARGA == 'ok') $id('rdoc-f').click() }
    else if (a == 'ver') ver(id);
    else if (a == 'pedir') { if (!BUSY) { CONF = id; MSG = null; desenha(); const c = document.querySelector('#rdoc [data-a="cancela"]'); if (c) c.focus() } }
    else if (a == 'cancela') { const k = CONF; CONF = null; desenha(); const x = k && Array.from(document.querySelectorAll('#rdoc [data-doc]')).find(li => li.dataset.doc == k); const y = x && x.querySelector('[data-a="pedir"]'); if (y) y.focus() }
    else if (a == 'exclui') exclui(id);
    else if (a == 'recarregar') { CARGA = 'carregando'; desenha(); recarrega().then(desenha) }
  }

  /* abre o documento na tela (o visualizador baixa os bytes só para a memória do navegador; nada é salvo no computador) */
  function ver(id) {
    const d = RDOC.L.find(x => x.id == id);
    if (!d) { MSG = { ok: '', er: ['Documento não encontrado. Atualize a lista.'] }; desenha(); return }
    NFV.abrirArquivo({ titulo: d.nome, sub: detalhe(d), nome: d.nome, tipo: d.tipo, obter: () => RDOC.blob(d.path), baixar: () => RDOC.baixar(d.path, d.nome), rotulo: TXT.rotulo, t: TXT })
  }

  async function anexar(inp) {
    const fs = Array.from(inp.files || []); inp.value = '';
    if (!fs.length || BUSY || CARGA != 'ok' || typeof ROLE == 'undefined' || ROLE != 'admin') return;
    BUSY = true; MSG = null; CONF = null; const falhas = []; let ok = 0;
    for (let i = 0; i < fs.length; i++) {
      PROG = 'Enviando ' + (i + 1) + ' de ' + fs.length + ': ' + fs[i].name; desenha();
      try { await RDOC.anexar(fs[i]); ok++ } catch (e) { falhas.push(fs[i].name + ': ' + ((e && e.message) || String(e))) }
    }
    PROG = ''; BUSY = false; await recarrega();
    MSG = { ok: ok ? (ok == 1 ? 'Documento anexado.' : ok + ' documentos anexados.') : '', er: falhas };
    if (raiz()) { desenha(); const a = $id('rdoc-add'); if (a && !a.disabled) a.focus() }
    else if (typeof aviso == 'function') aviso(ok ? '✔ ' + MSG.ok + (falhas.length ? ' ' + pl(falhas.length, 'arquivo não foi anexado', 'arquivos não foram anexados') + '.' : '') : '⚠ ' + falhas[0], !ok)   /* a janela foi fechada durante o envio */
  }

  async function exclui(id) {
    if (BUSY) return; BUSY = true; PROG = 'Excluindo…'; desenha(); let m;
    try { await RDOC.excluir(id); m = { ok: 'Documento excluído.', er: [] } } catch (e) { m = { ok: '', er: [(e && e.message) || String(e)] } }
    CONF = null; BUSY = false; PROG = ''; MSG = m; await recarrega(); desenha();
    const a = $id('rdoc-add'); if (raiz() && a && !a.disabled) a.focus()
  }

  /* Esc fecha a janela (se o visualizador estiver aberto, é ele que fecha: o dele vem antes e interrompe o evento) */
  document.addEventListener('keydown', e => {
    if (e.key != 'Escape' || !raiz()) return; const v = $id('nfv'); if (v && !v.classList.contains('hidden')) return;
    e.stopPropagation(); closeMd()
  });

  window.reidiDocs = { abrir };
})();
