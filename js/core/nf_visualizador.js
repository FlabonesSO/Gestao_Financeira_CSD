/* Visualizador de NF — abre o arquivo da NF NA TELA, sem baixar (PDF, imagem PNG/JPG ou XML). O botão de baixar continua ao lado.
   Usado por Faturas Emitidas (linha e histórico), Fundo de Reserva (faixa "NF da emissão") e Contas a Receber.
   • O arquivo vem do armazenamento privado "faturas-nf" pelo mesmo caminho do download: só entrega para quem tem a permissão fat.ver (regra do banco).
   • PDF → visualizador do próprio navegador (blob local, nada é enviado a terceiros) · imagem → <img> · XML → texto indentado (nunca é executado como página).
   Uso: NFV.abrir(idDaNF[, versão])   ·   NFV.fechar()
   Depende de: FDB (faturas_dados.js), PERM (permissoes.js), $ (app.js). */
const NFV = (() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '',
    brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    MAXTXT = 600 * 1024;
  let EL = null, URLB = null, SEQ = 0, ANT = null, ULT = null;

  function limpa() { if (URLB) { try { URL.revokeObjectURL(URLB) } catch (e) { } URLB = null } }
  function onKey(ev) { if (ev.key == 'Escape' && EL && !EL.classList.contains('hidden')) { ev.stopPropagation(); fechar() } }
  function monta() {
    if (EL) return EL;
    EL = document.createElement('div'); EL.id = 'nfv'; EL.className = 'hidden fixed inset-0 z-[70] flex flex-col p-2 sm:p-4 bg-black/80'; EL.setAttribute('role', 'dialog'); EL.setAttribute('aria-modal', 'true'); EL.setAttribute('aria-label', 'Visualizar NF');
    EL.innerHTML = `<div class="flex flex-wrap items-center gap-2 rounded-t-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5">
      <div class="mr-auto min-w-0"><div id="nfv-t" class="font-semibold truncate"></div><div id="nfv-s" class="text-xs text-slate-500 truncate"></div></div>
      <button id="nfv-dl" class="btn2" title="Baixar o arquivo">⬇ Baixar</button><button id="nfv-nv" class="btn2 hidden" title="Abrir em outra aba do navegador">↗ Nova aba</button><button id="nfv-x" class="btn" aria-label="Fechar">✕ Fechar</button></div>
      <div id="nfv-c" class="flex-1 min-h-0 overflow-auto rounded-b-xl bg-slate-100 dark:bg-slate-800 border border-t-0 border-slate-200 dark:border-slate-800"></div>`;
    document.body.appendChild(EL);
    EL.addEventListener('mousedown', ev => { if (ev.target === EL) fechar() });
    EL.querySelector('#nfv-x').onclick = fechar;
    document.addEventListener('keydown', onKey, true);
    return EL
  }
  function fechar() {
    if (!EL) return; SEQ++; EL.classList.add('hidden'); limpa(); EL.querySelector('#nfv-c').innerHTML = ''; document.body.style.overflow = '';
    if (ANT && document.contains(ANT)) { try { ANT.focus() } catch (e) { } } ANT = null
  }
  const corpo = h => { EL.querySelector('#nfv-c').innerHTML = h },
    aviso = (ic, t, x) => corpo(`<div class="h-full min-h-[240px] grid place-items-center p-6 text-center"><div><div class="text-4xl mb-2">${ic}</div><p class="font-semibold">${esc(t)}</p>${x ? `<p class="text-sm text-slate-500 mt-1 max-w-md mx-auto">${x}</p>` : ''}</div></div>`);
  function xmlBonito(t) {
    const L = String(t).replace(/>\s*</g, '>\n<').split('\n'); let n = 0;
    return L.map(l => { l = l.trim(); if (/^<\//.test(l)) n = Math.max(0, n - 1); const r = '  '.repeat(n) + l; if (/^<[^!?\/][^>]*[^\/]>$/.test(l)) n++; return r }).join('\n')
  }
  /* abre a NF (ou a versão v do histórico) */
  async function abrir(id, v) {
    monta(); const seq = ++SEQ; limpa();
    if (EL.classList.contains('hidden')) ANT = document.activeElement;
    let a; const dl = EL.querySelector('#nfv-dl'), nv = EL.querySelector('#nfv-nv');
    EL.classList.remove('hidden'); document.body.style.overflow = 'hidden'; EL.querySelector('#nfv-x').focus();
    nv.classList.add('hidden'); nv.onclick = null; dl.onclick = null;
    try { a = FDB.arq(id, v) } catch (e) { EL.querySelector('#nfv-t').textContent = 'NF'; EL.querySelector('#nfv-s').textContent = ''; return aviso('⚠️', 'Não foi possível abrir a NF', esc(e.message || e)) }
    const tit = (a.num ? 'NF nº ' + a.num : 'NF') + ' · ' + a.nome, sub = ['emissão ' + dmy(a.comp), a.vb != null ? 'Valor Bruto ' + brl(a.vb) : '', a.x.v > 1 || v ? (v ? 'versão v' + a.v + (a.v == a.x.v ? ' (vigente)' : ' (anterior)') : 'refaturada · v' + a.x.v + ' (vigente)') : '', FDB.tam(a.bytes)].filter(Boolean).join(' · ');
    EL.querySelector('#nfv-t').textContent = tit; EL.querySelector('#nfv-t').title = tit; EL.querySelector('#nfv-s').textContent = sub;
    dl.onclick = () => { FDB.baixarNF(id, v).catch(e => aviso('⚠️', 'Não consegui baixar a NF', esc(e.message || e))) };
    if (typeof PERM != 'undefined' && !PERM.tem('fat.ver')) return aviso('🔒', 'Sem permissão', 'Você não tem permissão para ver as NFs. Peça ao administrador.');
    aviso('⏳', 'Carregando a NF…');
    try {
      const b = await FDB.blob(a.path); if (seq != SEQ) return;
      const tipo = a.tipo || b.type || '', fb = new Blob([b], { type: tipo || 'application/octet-stream' });
      if (tipo == 'application/pdf' || /^image\/(png|jpeg)$/.test(tipo)) {
        URLB = URL.createObjectURL(fb); nv.classList.remove('hidden'); const u = URLB; nv.onclick = () => { window.open(u, '_blank', 'noopener') };
        if (tipo == 'application/pdf') corpo(`<iframe data-nfv-pdf class="w-full h-full min-h-[60vh] bg-white" src="${u}" title="${esc(tit)}"></iframe>`);
        else {
          corpo(`<div class="min-h-full grid place-items-center p-3"><img data-nfv-img src="${u}" alt="${esc(tit)}" class="max-w-full h-auto cursor-zoom-in bg-white shadow rounded" title="Clique para ampliar ou reduzir"></div>`);
          const im = EL.querySelector('[data-nfv-img]'); im.onclick = () => { const z = im.dataset.z == '1'; im.dataset.z = z ? '0' : '1'; im.style.maxWidth = z ? '' : 'none'; im.style.width = z ? '' : 'auto'; im.classList.toggle('cursor-zoom-out', !z); im.classList.toggle('cursor-zoom-in', z) }
        }
      } else if (tipo == 'application/xml' || /\.xml$/i.test(a.nome)) {
        let t = await b.text(); if (seq != SEQ) return; const cort = t.length > MAXTXT; if (cort) t = t.slice(0, MAXTXT);
        corpo(`<pre data-nfv-xml class="text-xs leading-relaxed whitespace-pre-wrap break-words p-4"></pre>${cort ? '<p class="px-4 pb-4 text-xs text-amber-600 dark:text-amber-400">Arquivo grande: mostrei só o começo. Use “Baixar” para ver completo.</p>' : ''}`);
        EL.querySelector('[data-nfv-xml]').textContent = cort ? t : xmlBonito(t)
      } else aviso('📄', 'Este tipo de arquivo não tem visualização', 'Use o botão “Baixar” para abrir no seu computador.');
    } catch (e) { if (seq == SEQ) aviso('⚠️', 'Não consegui carregar a NF', esc(e.message || e)) }
  }
  return { abrir, fechar }
})();
