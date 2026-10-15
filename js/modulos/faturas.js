/* Módulo "Faturas Emitidas" · notas fiscais (NF) anexadas por competência (ANEXAR · EDITAR · CORRIGIR / REFATURAR · BAIXAR).
   Quem anexa: quem tem a permissão "Anexar e corrigir NF" (padrão do perfil Faturamento e do administrador). Cada NF leva a "Data da Emissão" = data em que a NF foi emitida, o "Nº da NF" e o "Valor Bruto";
   o mês dessa data é a competência que o Fundo de Reserva usa para oferecer o download da NF (ao escolher a Data_Base do mês).
   Digitou a data (ou o nº / o valor bruto / a observação) errada? "Editar": acerta na hora, SEM justificativa, sem trocar o arquivo e sem criar versão (fica só "ajustada por … em …" e o evento na Auditoria).
   Se a NF for refaturada (falta de item ou de valor), use "Corrigir / refaturar": o arquivo novo passa a valer e o anterior fica no histórico,
   com o motivo (obrigatório aqui), quem corrigiu e quando (o histórico é gravado pelo banco). Quem só tem "Visualizar": consulta, visualiza a NF na tela (👁) e baixa (⬇). Excluir: permissão "Excluir NF".
   Cards no topo: Total Faturado (soma da coluna "Total Faturado" da base do Fundo de Reserva; o nº do título da planilha aparece como referência) e NFs anexadas.
   Dados em js/core/faturas_dados.js (FDB → tabela public.faturas_emitidas + bucket privado faturas-nf). Regras reais no banco (RLS).
   MÓDULO ISOLADO: usa de js/core: $, N, ROLE, PERM, PF, saveAs, mo/closeMd/dlg (usuarios.js), uLog, FDB, NFV (nf_visualizador.js). */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="fat"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '',
    MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], mesLb = ym => MES[+ym.slice(5, 7) - 1] + '/' + ym.slice(0, 4), mm = ym => ym.slice(5, 7) + '/' + ym.slice(0, 4),
    dh = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  /* cartões de indicador: selo com ícone (SVG de traço, herda a cor do selo) + NOME em destaque (negrito, maiúsculas, cresce com a largura do cartão) + valor numa linha só que se ajusta à largura
     (mesmo padrão dos cartões do Dashboard Financeiro) */
  const SV = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IP = {
      recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
      arquivo: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'
    },
    TOM = { ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
    kp = (id, t, v, ic, tom, s, tt) => `<div class="card py-4 min-w-0 flex flex-col justify-center" data-kpi="${id}"${tt ? ` title="${esc(tt)}"` : ''}><div class="w-full" style="container-type:inline-size"><div class="flex items-center gap-2.5"><span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center ${TOM[tom]}">${SV(IP[ic])}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-[13px] text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,7.4cqw,1.04rem)">${t}</div></div><div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl" data-v style="font-size:clamp(.8rem,10.2cqw,1.6rem)">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div></div>`;
  /* EDIT = id da NF aberta na janela · MODO = 'novo' | 'corrigir' (refaturar) | 'editar' (ajuste sem justificativa) · EV = versão que a pessoa via ao abrir a janela */
  let FQ = '', FM = '', MSG = '', ERR = false, ABRE = {}, EDIT = null, MODO = 'novo', EV = 0, PEND = false;
  const exc = () => PERM.tem('fat.excluir'), pode = () => PERM.tem('fat.anexar'), g = id => (document.getElementById(id) || {}).value || '';
  /* Valor Bruto digitado em reais ("12.160.667,52", "12160667,52", "12160667.52", "R$ 1.234,56") → número com 2 casas; NaN se não for um valor */
  const num_ = t => { let x = String(t == null ? '' : t).replace(/R\$|\s/g, ''); if (!x) return NaN; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); return /^\d+(\.\d+)?$/.test(x) ? Math.round(parseFloat(x) * 100) / 100 : NaN },
    fnum = n => n == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function filtradas() {
    const q = N(FQ);
    return FDB.L.filter(x => (!FM || x.comp.slice(0, 7) == FM) && (!q || N([x.num, x.nome, x.obs, x.mot, x.cn, x.an, x.edn, dmy(x.comp), x.vb != null ? fnum(x.vb) : '', ...x.h.map(h => h.num + ' ' + h.nome + ' ' + h.mot + ' ' + (h.vb != null ? fnum(h.vb) : ''))].join(' ')).includes(q)))
  }
  function head() {
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Faturas Emitidas</h1><p class="text-sm text-slate-500">Notas fiscais por competência · a NF anexada aqui é a que o Fundo de Reserva oferece para visualizar e baixar${FDB.L.length ? ' · ' + FDB.L.length + ' NF(s)' : ''}</p>${ROLE != 'admin' && pode() ? '<p id="fat-aviso" class="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">Anexe a NF informando a Data da Emissão, o nº e o Valor Bruto. Errou algum desses dados? Use “Editar” (sem justificativa). NF refaturada com arquivo novo? Use “Corrigir / refaturar”.</p>' : ''}</div>
    ${pode() ? '<button class="btn" onclick="fat.f()">＋ Anexar NF</button>' : ''}</div>
    ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}`
  }
  /* Total Faturado = soma da coluna "Total Faturado" da base do Fundo de Reserva (todas as Data_Base, ou só a da competência escolhida no filtro).
     Referência: nº do título (coluna "Numero do Titulo") e se a NF da competência já foi anexada aqui. */
  function tfCard() {
    const tf = FDB.TF, id = 'total', t = 'Total Faturado';
    if (!tf.ok && !tf.erro) return kp(id, t, '…', 'recibo', 'ver', 'carregando…');
    if (!tf.ok) return kp(id, t, '—', 'recibo', 'ver', `<span class="text-amber-600 dark:text-amber-400">indisponível</span>`, tf.erro);
    const L = FM ? tf.L.filter(r => r.d.slice(0, 7) == FM) : tf.L, tot = Math.round(L.reduce((a, r) => a + r.tf, 0) * 100) / 100,
      sem = L.filter(r => !FDB.mes(r.d.slice(0, 7)).length).length,
      tit = L.map(r => r.titulo).filter(Boolean), ts = tit.length && tit.length <= 3 ? (tit.length == 1 ? 'Título ' : 'Títulos ') + tit.join(', ') : L.length + (L.length == 1 ? ' período' : ' períodos'),
      nf = sem ? `<span class="text-amber-600 dark:text-amber-400">${sem == L.length ? (L.length == 1 ? 'sem NF anexada' : 'sem NF anexada em nenhum') : sem + ' sem NF anexada'}</span>` : 'NF anexada';
    return kp(id, t, brl(tot), 'recibo', 'ver', L.length ? `${esc(ts)} · ${nf}` : FM ? 'sem Total Faturado na base para ' + mm(FM) : 'base do Fundo de Reserva sem períodos',
      'Soma da coluna “Total Faturado” da base do Fundo de Reserva' + (FM ? ' na competência ' + mm(FM) : '') + (tf.em ? ' · base publicada em ' + dh(tf.em) : ''))
  }
  function render() {
    if (!FDB.ok) { VIEW.innerHTML = head() + `<div class="card py-10 text-center text-slate-500">${FDB.erro ? esc(FDB.erro) : ERR ? '' : 'Carregando…'}</div>`; return }
    const T = filtradas(), mes = [...new Set(FDB.L.map(x => x.comp.slice(0, 7)))].sort().reverse();
    VIEW.innerHTML = head() + `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${tfCard()}${kp('nfs', 'NFs anexadas', T.length, 'arquivo', 'azul', T.length != FDB.L.length ? 'de ' + FDB.L.length : 'vigentes')}</div>
    <div class="card"><div class="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3"><input id="fat-q" class="inp sm:col-span-3" placeholder="🔍 Buscar por nº da NF, arquivo, observação, motivo ou responsável" value="${esc(FQ)}" oninput="fat.q(this.value)">
      <select id="fat-m" class="inp ${FM ? 'ring-2 ring-amber-500' : ''}" title="Filtrar pela competência" onchange="fat.fl(this.value)"><option value="">Todas as competências</option>${mes.map(m => `<option value="${m}" ${m == FM ? 'selected' : ''}>${mesLb(m)}</option>`).join('')}</select></div>
      <div id="fat-t" class="overflow-x-auto"></div></div>`;
    tbl(T)
  }
  function hist(x) {
    return `<tr class="bg-slate-500/5" data-hist="${x.id}"><td colspan="7" class="px-3 py-3"><div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Versões anteriores desta NF (a vigente está na linha acima)</div><div class="overflow-x-auto"><table class="w-full text-xs whitespace-nowrap"><thead class="text-slate-500 text-left"><tr><th class="py-1 pr-4">Versão</th><th class="pr-4">Data da Emissão</th><th class="pr-4">Nº da NF</th><th class="pr-4 text-right">Valor Bruto</th><th class="pr-4">Arquivo</th><th class="pr-4">Anexada por</th><th class="pr-4">Substituída por</th><th class="pr-4">Motivo da correção</th><th></th></tr></thead>
      <tbody>${x.h.map(h => `<tr class="border-t border-slate-200 dark:border-slate-700"><td class="py-1.5 pr-4 font-semibold">v${h.v}</td><td class="pr-4">${dmy(h.comp)}</td><td class="pr-4">${esc(h.num) || '—'}</td><td class="pr-4 text-right tabular-nums">${h.vb != null ? brl(h.vb) : '—'}</td><td class="pr-4 max-w-[220px] truncate" title="${esc(h.nome)}">${esc(h.nome)} <span class="text-slate-500">(${FDB.tam(h.bytes)})</span></td><td class="pr-4">${esc(h.por) || '—'}<div class="text-[11px] text-slate-500">${dh(h.em)}</div></td><td class="pr-4">${esc(h.sub) || '—'}<div class="text-[11px] text-slate-500">${dh(h.sem)}</div></td><td class="pr-4 whitespace-normal min-w-[200px]">${esc(h.mot)}</td><td class="text-right whitespace-nowrap"><button class="btn2 !py-0.5 !text-xs" title="Abrir esta versão na tela, sem baixar" onclick="fat.ver('${x.id}',${h.v})">👁 Visualizar</button> <button class="btn2 !py-0.5 !text-xs" onclick="fat.dl('${x.id}',${h.v})">⬇ Baixar</button></td></tr>`).join('')}</tbody></table></div></td></tr>`
  }
  function tbl(T) {
    T = T || filtradas(); const el = document.getElementById('fat-t'); if (!el) return;
    if (!FDB.L.length) { el.innerHTML = `<div class="py-10 text-center text-slate-500"><div class="text-4xl mb-2">🧾</div><p class="font-semibold">Nenhuma NF anexada ainda</p><p class="text-sm mt-1">${pode() ? 'Clique em “Anexar NF”, informe a Data da Emissão, o nº e o Valor Bruto e escolha o arquivo.' : 'Quando o Faturamento anexar as NFs, elas aparecem aqui.'}</p></div>`; return }
    el.innerHTML = `<table class="w-full text-sm"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-3 py-2 whitespace-nowrap">Data da Emissão</th><th class="px-3 py-2 whitespace-nowrap">Nº da NF</th><th class="px-3 py-2 text-right whitespace-nowrap">Valor Bruto</th><th class="px-3 py-2">Arquivo</th><th class="px-3 py-2">Versão</th><th class="px-3 py-2">Anexada por</th><th class="px-3 py-2 text-right">Ações</th></tr></thead>
      <tbody>${T.map(x => `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-id="${x.id}">
        <td class="px-3 py-2 whitespace-nowrap"><div class="font-semibold">${dmy(x.comp)}</div><div class="text-[11px] text-slate-500">competência ${mesLb(x.comp.slice(0, 7))}</div></td>
        <td class="px-3 py-2 whitespace-nowrap">${esc(x.num) || '—'}</td>
        <td class="px-3 py-2 whitespace-nowrap text-right tabular-nums" data-vb>${x.vb != null ? brl(x.vb) : `<span class="text-slate-400">—</span>${pode() ? `<div><button class="text-[11px] underline text-amber-600 dark:text-amber-400" title="NF cadastrada antes do campo Valor Bruto: informe para completar" onclick="fat.e('${x.id}')">informar</button></div>` : ''}`}</td>
        <td class="px-3 py-2"><div class="max-w-[280px] truncate" title="${esc(x.nome)}">${esc(x.nome)}</div><div class="text-[11px] text-slate-500 max-w-[280px] truncate" title="${esc(x.obs)}">${FDB.tam(x.bytes)}${x.obs ? ' · ' + esc(x.obs) : ''}</div></td>
        <td class="px-3 py-2">${x.v > 1 ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500/15 text-amber-600 dark:text-amber-400">Refaturada · v${x.v}</span><div class="text-[11px] text-slate-500 mt-0.5 max-w-[220px] truncate" title="${esc(x.mot)}">${esc(x.mot)}</div>` : '<span class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap bg-slate-500/15 text-slate-600 dark:text-slate-300">Original</span>'}</td>
        <td class="px-3 py-2 whitespace-nowrap"><div>${esc(x.v > 1 ? x.an || x.cn : x.cn) || '—'}</div><div class="text-[11px] text-slate-500">${dh(x.v > 1 ? x.ae || x.ce : x.ce)}</div>${x.ede ? `<div class="text-[11px] text-slate-500" title="Data da Emissão, nº ou observação ajustados (sem justificativa e sem nova versão)">✎ ajustada${x.edn ? ' por ' + esc(x.edn) : ''} · ${dh(x.ede)}</div>` : ''}</td>
        <td class="px-3 py-2 text-right"><div class="flex flex-wrap justify-end gap-1 ml-auto max-w-[460px]"><button class="btn2 !py-1 !text-xs" title="Abrir a NF vigente na tela, sem baixar" onclick="fat.ver('${x.id}')">👁 Visualizar</button><button class="btn2 !py-1 !text-xs" title="Baixar a NF vigente" onclick="fat.dl('${x.id}')">⬇ Baixar</button>${pode() ? `<button class="btn2 !py-1 !text-xs" title="Acertar a Data da Emissão, o nº ou a observação — sem justificativa e sem trocar o arquivo" onclick="fat.e('${x.id}')">✎ Editar</button><button class="btn2 !py-1 !text-xs" title="Anexar a NF refaturada (arquivo novo); a atual vai para o histórico" onclick="fat.f('${x.id}')">↻ Corrigir / refaturar</button>` : ''}${x.h.length ? `<button class="btn2 !py-1 !text-xs" onclick="fat.hist('${x.id}')">🕘 Histórico (${x.h.length})</button>` : ''}${exc() ? `<button class="btn2 !py-1 !text-xs !text-rose-500" onclick="fat.del('${x.id}')">Excluir</button>` : ''}</div></td></tr>${ABRE[x.id] && x.h.length ? hist(x) : ''}`).join('') || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Nenhuma NF encontrada com esse filtro.</td></tr>'}</tbody></table>`
  }

  /* ---------- formulário (anexar · editar · corrigir / refaturar) ----------
     campos na MESMA ordem da tabela: Data da Emissão · Nº da NF · Valor Bruto · Arquivo (Versão e Anexada por são preenchidos pelo sistema) */
  function form(id, ed) {
    const x = id ? FDB.L.find(r => r.id == id) : null; if (!pode() || (id && !x)) return;
    EDIT = id || null; MODO = !x ? 'novo' : ed ? 'editar' : 'corrigir'; EV = x ? x.v : 0;
    const cor = MODO == 'corrigir', edi = MODO == 'editar', L = (t, h) => `<label class="block text-xs text-slate-500 mb-1">${t}${h ? ' <span class="text-slate-400">' + h + '</span>' : ''}</label>`;
    mo(`<h2 class="text-lg font-bold mb-1">${edi ? 'Editar NF' : cor ? 'Corrigir / refaturar NF' : 'Anexar NF'}</h2>
    ${cor ? `<p class="text-sm text-slate-500 mb-3">NF atual: ${x.num ? 'nº ' + esc(x.num) + ' · ' : ''}${esc(x.nome)} · emissão ${dmy(x.comp)}${x.vb != null ? ' · ' + brl(x.vb) : ''} · v${x.v}</p>` : edi ? `<p class="text-sm text-slate-500 mb-3">${x.num ? 'NF nº ' + esc(x.num) + ' · ' : ''}${esc(x.nome)} · v${x.v} · o arquivo não muda</p>` : '<div class="mb-3"></div>'}
    ${cor ? '<p id="ff-dica" class="text-xs rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-300 px-3 py-2 mb-3">Use quando a NF foi <b>refaturada</b> (arquivo novo). Para acertar só a Data da Emissão, o nº, o Valor Bruto ou a observação, use <b>✎ Editar</b>: não pede justificativa.</p>' : ''}
    <div class="max-h-[70vh] overflow-y-auto pr-1">
    ${L('Data da Emissão')}<input id="ff-d" type="date" class="inp w-full mb-1" value="${esc(x ? x.comp : '')}" oninput="fat.aviso()">
    <p id="ff-av" class="text-xs text-slate-500 mb-3"></p>
    <div class="grid grid-cols-2 gap-3 mb-3"><div>${L('Nº da NF', '(opcional)')}<input id="ff-n" class="inp w-full" maxlength="30" value="${esc(x ? x.num : '')}"></div>
      <div>${L('Valor Bruto da NF' + (edi && x.vb == null ? '' : ' *'), '(R$)')}<input id="ff-vb" class="inp w-full text-right tabular-nums" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${x && x.vb != null ? esc(fnum(x.vb)) : ''}" onblur="fat.vbf(this)"></div></div>
    ${edi && x.vb == null ? '<p id="ff-vbn" class="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 mb-3">Esta NF foi cadastrada antes do campo Valor Bruto. Informe o valor para completar o cadastro (não pede justificativa).</p>' : ''}
    ${edi ? '' : `${L(x ? 'Novo arquivo da NF *' : 'Arquivo da NF *', 'PDF, XML, PNG ou JPG · até 10 MB')}<input id="ff-a" type="file" accept=".pdf,.xml,.png,.jpg,.jpeg" class="inp w-full mb-1" onchange="fat.arq(this)">
    <p id="ff-ai" class="text-xs text-slate-500 mb-3 min-h-[1rem]"></p>`}
    <div class="mb-3">${L('Observação', '(opcional)')}<input id="ff-o" class="inp w-full" maxlength="200" value="${esc(x ? x.obs : '')}"></div>
    ${cor ? `${L('Motivo da correção *', '(ex.: refaturada por falta de item ou de valor)')}<textarea id="ff-m" rows="3" class="inp w-full mb-2" maxlength="300"></textarea><p class="text-xs text-slate-500 mb-3">A NF atual vai para o histórico (continua disponível para consulta) e a nova passa a valer, inclusive para o Fundo de Reserva.</p>` : ''}
    ${edi ? '<p id="ff-nota" class="text-xs text-slate-500 mb-3"><b>Não precisa de justificativa.</b> É um ajuste simples: o arquivo continua o mesmo e não cria versão nova. Fica registrado na Auditoria e na linha da NF (“ajustada por…”). Se a NF foi refaturada com arquivo novo, use “Corrigir / refaturar”.</p>' : ''}
    </div>
    <p id="ff-e" class="hidden text-sm text-rose-500 mb-3"></p><div class="flex justify-end gap-2"><button class="btn2" onclick="closeMd()">Cancelar</button><button id="ff-ok" class="btn" onclick="fat.sv()">${edi ? 'Salvar alterações' : cor ? 'Salvar correção' : 'Anexar NF'}</button></div>`);
    aviso()
  }
  /* arquivo escolhido: mostra nome e tamanho (ou o problema, antes de enviar) */
  function arq(inp) {
    const a = document.getElementById('ff-ai'), f0 = inp && inp.files && inp.files[0]; if (!a) return;
    if (!f0) { a.textContent = ''; return }
    const v = FDB.validar(f0); a.className = 'text-xs mb-3 min-h-[1rem] ' + (v ? 'text-rose-500' : 'text-slate-500');
    a.textContent = v || '📎 ' + f0.name + ' · ' + FDB.tam(f0.size)
  }
  /* avisos sobre a competência escolhida */
  function aviso() {
    const el = document.getElementById('ff-av'), d = g('ff-d'); if (!el) return; const x = EDIT ? FDB.L.find(r => r.id == EDIT) : null;
    let t = 'O mês da Data da Emissão é a competência usada no Fundo de Reserva.', c = 'text-slate-500';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const ym = d.slice(0, 7), o = FDB.mes(ym).filter(r => r.id != EDIT);
      if (x && ym != x.comp.slice(0, 7)) { t = `⚠ A competência muda de ${mm(x.comp.slice(0, 7))} para ${mm(ym)}: a NF deixa de aparecer no Fundo de Reserva de ${mm(x.comp.slice(0, 7))}.`; c = 'text-amber-600' }
      else if (!x && o.length) { t = `⚠ Já existe NF anexada para a competência ${mm(ym)}${o[0].num ? ' (nº ' + o[0].num + ')' : ''}. Se ela foi refaturada, use “Corrigir / refaturar” na linha dela para manter o histórico; se é outra NF do mesmo mês, pode continuar.`; c = 'text-amber-600' }
    }
    el.className = 'text-xs mb-3 ' + c; el.textContent = t
  }
  async function sv() {
    const er = m => { const e = document.getElementById('ff-e'); e.textContent = m; e.classList.remove('hidden') },
      inp = document.getElementById('ff-a'), file = inp && inp.files && inp.files[0], comp = g('ff-d'), num = g('ff-n').trim(), vbt = g('ff-vb').trim(), vbn = num_(vbt), obs = g('ff-o').trim(), motivo = g('ff-m').trim(),
      id = EDIT, modo = MODO, a = id ? FDB.L.find(r => r.id == id) : null;
    /* validações na ordem dos campos da janela: Data da Emissão · Valor Bruto · Arquivo · Motivo */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(comp) || isNaN(new Date(comp + 'T12:00:00Z')) || comp < '2000-01-01') return er('Informe a Data da Emissão.');
    let vb = null;
    if (modo == 'editar') { /* ajuste simples: o Valor Bruto pode continuar em branco só se a NF já era antiga e sem ele */
      if (vbt) { if (!FDB.vbOk(vbn)) return er('Valor Bruto inválido: informe um valor em reais maior que zero (ex.: 12.160.667,52).'); vb = vbn }
      else if (a && a.vb != null) return er('O Valor Bruto não pode ficar em branco.')
    } else { if (!FDB.vbOk(vbn)) return er(vbt ? 'Valor Bruto inválido: informe um valor em reais maior que zero (ex.: 12.160.667,52).' : 'Informe o Valor Bruto da NF.'); vb = vbn }
    if (modo != 'editar') { const v = FDB.validar(file); if (v) return er(v) }
    if (modo == 'corrigir' && motivo.length < 3) return er('Informe o motivo da correção.');
    let dif = '';
    if (modo == 'editar') { /* ajuste simples: sem arquivo e sem justificativa; só grava se algo mudou */
      if (!a) return er('NF não encontrada. Feche a janela e atualize a tela.');
      dif = [comp != a.comp && 'emissão ' + dmy(a.comp) + ' → ' + dmy(comp), num != a.num && 'nº ' + (a.num || '—') + ' → ' + (num || '—'), vb != a.vb && 'valor bruto ' + (a.vb != null ? brl(a.vb) : '—') + ' → ' + brl(vb), obs != a.obs && 'observação alterada'].filter(Boolean).join(' · ');
      if (!dif) return er('Nenhuma alteração para salvar.')
    }
    const lb = modo == 'editar' ? 'Salvar alterações' : modo == 'corrigir' ? 'Salvar correção' : 'Anexar NF', b = document.getElementById('ff-ok'); b.disabled = true; b.textContent = modo == 'novo' ? 'Enviando…' : 'Salvando…';
    try {
      if (modo == 'editar') await FDB.editar(id, { comp, num, vb, obs, v: EV }); else if (modo == 'corrigir') await FDB.corrigir(id, { file, comp, num, vb, obs, motivo, v: EV }); else await FDB.anexar({ file, comp, num, vb, obs });
      try { uLog('Faturas: ' + (modo == 'editar' ? 'ajustou NF' + (a.num ? ' ' + a.num : '') + ' · ' + dif : (id ? 'corrigiu' : 'anexou') + ' NF' + (num ? ' ' + num : '') + ' · emissão ' + dmy(comp) + ' · bruto ' + brl(vb) + (id ? ' · ' + motivo.slice(0, 40) : ''))) } catch (e) { }
      closeMd(); ERR = false;
      MSG = modo == 'editar' ? '✔ NF atualizada' + (a.comp.slice(0, 7) != comp.slice(0, 7) ? ': agora ela vale para o Fundo de Reserva de ' + mm(comp.slice(0, 7)) + ' (e deixou de aparecer em ' + mm(a.comp.slice(0, 7)) + ').' : '.')
        : id ? '✔ NF corrigida: a versão anterior ficou no histórico e a nova já vale no Fundo de Reserva.' : '✔ NF anexada. Já está disponível no Fundo de Reserva (competência ' + mm(comp.slice(0, 7)) + ').';
      render()
    } catch (e) { b.disabled = false; b.textContent = lb; er('Não foi possível salvar: ' + (e.message || e)) }
  }
  function del(id) {
    const x = FDB.L.find(r => r.id == id); if (!exc() || !x) return;
    dlg('Excluir NF', `Excluir a NF ${x.num ? 'nº <b>' + esc(x.num) + '</b> ' : ''}(<b>${esc(x.nome)}</b>), emissão ${dmy(x.comp)}${x.h.length ? ', e as ' + x.h.length + ' versão(ões) anterior(es)' : ''}? Ela some do Fundo de Reserva e os arquivos são apagados. Esta ação não pode ser desfeita.`, async () => {
      try { await FDB.excluir(id); try { uLog('Faturas: excluiu NF' + (x.num ? ' ' + x.num : '') + ' · emissão ' + dmy(x.comp)) } catch (e) { } MSG = '✔ NF excluída.'; ERR = false } catch (e) { MSG = '⚠ ' + (e.message || e); ERR = true } render()
    })
  }
  async function nuvem() { const tf = FDB.carregarTF(); try { ERR = false; await FDB.carregar() } catch (e) { MSG = 'Não consegui carregar as faturas: ' + (e.message || e); ERR = true } render(); await tf.catch(() => { }) }
  function atual() {
    if (VIEW.classList.contains('hidden')) return; const a = document.activeElement;
    if (a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { PEND = true; return } render()
  }
  try { FDB.on(atual); VIEW.addEventListener('focusout', () => { if (PEND) setTimeout(() => { const a = document.activeElement; if (PEND && !(a && VIEW.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { PEND = false; render() } }, 80) }) } catch (e) { }

  window.fat = {
    show() { MSG = ''; render(); nuvem() }, f: id => form(id), e: id => form(id, true), arq, aviso, sv, del,
    q(v) { FQ = v; tbl() }, fl(v) { FM = v; render() },
    hist(id) { ABRE[id] = !ABRE[id]; tbl() },
    async dl(id, v) { try { await FDB.baixarNF(id, v) } catch (e) { MSG = '⚠ Não consegui baixar a NF: ' + (e.message || e); ERR = true; render() } },
    ver(id, v) { NFV.abrir(id, v) },
    vbf(i) { const n = num_(i.value); if (FDB.vbOk(n)) i.value = fnum(n) },
    _r: render
  };
})();
