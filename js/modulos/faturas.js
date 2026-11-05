/* Módulo "Faturas Emitidas" · notas fiscais (NF) anexadas por competência (ANEXAR · EDITAR · CORRIGIR / REFATURAR · BAIXAR).
   Quem anexa: quem tem a permissão "Anexar e corrigir NF" (padrão do perfil Faturamento e do administrador). Cada NF leva a "Data da Emissão" = data em que a NF foi emitida, o "Nº da NF" e o "Valor Bruto";
   o mês dessa data é a competência que o Fundo de Reserva usa para oferecer o download da NF (ao escolher a Data_Base do mês).
   Digitou a data (ou o nº / o valor bruto / a observação) errada? "Editar": acerta na hora, SEM justificativa, sem trocar o arquivo e sem criar versão (fica só "ajustada por … em …" e o evento na Auditoria).
   Se a NF for refaturada (falta de item ou de valor), use "Corrigir / refaturar": o arquivo novo passa a valer e o anterior fica no histórico,
   com o motivo (obrigatório aqui), quem corrigiu e quando (o histórico é gravado pelo banco). Quem só tem "Visualizar": consulta, visualiza a NF na tela (👁) e baixa (⬇). Excluir: permissão "Excluir NF".
   Cards no topo: Total Faturado (soma da coluna "Total Faturado" da base do Fundo de Reserva; o nº do título da planilha aparece como referência) e NFs anexadas.
   ANÁLISE FISCAL (2ª aba, só para quem tem a permissão do Fundo de Reserva · visualizar): o ISS e o INSS cobrados em cada fatura (NF), lidos da planilha MEDICAO_SERVICO publicada no Fundo de Reserva,
   com o gráfico por fatura e a rosca "Impostos por tributo". O ISS e o INSS são retidos pelo tomador na NF (colunas "Retenção ISS" e "Retenção INSS" da planilha; o Valor Líquido já os desconta) · pedido S: a tabela "Impostos cobrados por fatura" tem as colunas "Retenção ISS" e "Retenção INSS".
   O gráfico por fatura rotula cada coluna com o mês/ano da emissão (MM/AA). O filtro de PERÍODO (De/Até em meses, js/core/periodo.js) é o mesmo de Contas a Receber e da Programação Financeira Quadrimestral e vale para as DUAS abas (cartões, gráficos e tabelas; na aba Notas fiscais ele substituiu a lista “Todas as competências”); só vale na tela aberta (nada é gravado).
   Na aba Notas fiscais (para quem vê o Fundo de Reserva) fica o gráfico "Valor Bruto faturado" (colunas por mês da Data_Base + linha do acumulado), que antes ficava no Fundo de Reserva.
   Dados em js/core/faturas_dados.js (FDB → tabela public.faturas_emitidas + bucket privado faturas-nf). Regras reais no banco (RLS).
   MÓDULO ISOLADO: usa de js/core: $, N, ROLE, PERM, PF, saveAs, mo/closeMd/dlg (usuarios.js), uLog, FDB, NFV (nf_visualizador.js). */
(() => {
  'use strict';
  const VIEW = document.querySelector('[data-view="fat"]'); if (!VIEW) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '',
    mmaa = iso => iso ? iso.slice(5, 7) + '/' + iso.slice(2, 4) : '',   /* 2026-09-15 → 09/26 */
    MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], mesLb = ym => MES[+ym.slice(5, 7) - 1] + '/' + ym.slice(0, 4), mm = ym => ym.slice(5, 7) + '/' + ym.slice(0, 4),
    dh = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) },
    brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  /* cartões de indicador: selo com ícone (SVG de traço, herda a cor do selo) + NOME em destaque (negrito, maiúsculas, cresce com a largura do cartão) + valor numa linha só que se ajusta à largura
     (mesmo padrão dos cartões do Dashboard Financeiro) */
  const SV = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`,
    IP = {
      recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
      arquivo: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
      pct: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
    },
    TOM = { ver: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', azul: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', amb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', ind: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' },
    kp = (id, t, v, ic, tom, s, tt) => `<div class="card py-4 min-w-0 flex flex-col justify-center" data-kpi="${id}"${tt ? ` title="${esc(tt)}"` : ''}><div class="w-full" style="container-type:inline-size"><div class="flex items-center gap-2.5"><span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center ${TOM[tom]}">${SV(IP[ic])}</span><div class="min-w-0 break-words font-extrabold uppercase tracking-wide leading-tight text-[13px] text-slate-700 dark:text-slate-200" style="font-size:clamp(.78rem,7.4cqw,1.04rem)">${t}</div></div><div class="font-bold mt-3 whitespace-nowrap tabular-nums leading-tight text-xl" data-v style="font-size:clamp(.8rem,10.2cqw,1.6rem)">${v}</div>${s ? `<div class="text-xs text-slate-500 mt-1">${s}</div>` : ''}</div></div>`;
  /* EDIT = id da NF aberta na janela · MODO = 'novo' | 'corrigir' (refaturar) | 'editar' (ajuste sem justificativa) · EV = versão que a pessoa via ao abrir a janela */
  let FQ = '', MSG = '', ERR = false, ABRE = {}, EDIT = null, MODO = 'novo', EV = 0, PEND = false, ABA = 'nf', FQF = '', FPR = null, CHF = [];
  /* ---------- período (De/Até em meses · o mesmo de Contas a Receber e da Programação Financeira Quadrimestral: js/core/periodo.js) ----------
     Vale para as DUAS abas. Meses (AAAA-MM) = o mês da emissão das NFs anexadas + o mês da Data_Base da base do Fundo de Reserva (a emissão da NF é a própria Data_Base).
     FPR = null → todos os meses (um mês novo entra sozinho). Nada é gravado: o período vale enquanto a tela está aberta. */
  const fMeses = () => [...new Set([...FDB.L.map(x => x.comp.slice(0, 7)), ...FDB.TF.L.map(r => r.d.slice(0, 7))])].sort(), fPer = () => PER.fix(FPR, fMeses()),
    perOk = d => { if (!FPR) return true; const p = fPer(), m = String(d).slice(0, 7); return m >= p.de && m <= p.ate },
    perTxt = () => { const p = fPer(); return PER.lb(p.de) + ' a ' + PER.lb(p.ate) },
    perBar = () => PER.bar({ id: 'fat-per', ms: fMeses(), s: fPer(), fn: 'fat.per', pre: 'fat.pre' });
  const fiscalOk = () => PERM.tem('fundo.ver');
  const exc = () => PERM.tem('fat.excluir'), pode = () => PERM.tem('fat.anexar'), g = id => (document.getElementById(id) || {}).value || '';
  /* Valor Bruto digitado em reais ("12.160.667,52", "12160667,52", "12160667.52", "R$ 1.234,56") → número com 2 casas; NaN se não for um valor */
  const num_ = t => { let x = String(t == null ? '' : t).replace(/R\$|\s/g, ''); if (!x) return NaN; if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); return /^\d+(\.\d+)?$/.test(x) ? Math.round(parseFloat(x) * 100) / 100 : NaN },
    fnum = n => n == null || isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function filtradas() {
    const q = N(FQ);
    return FDB.L.filter(x => perOk(x.comp) && (!q || N([x.num, x.nome, x.obs, x.mot, x.cn, x.an, x.edn, dmy(x.comp), x.vb != null ? fnum(x.vb) : '', ...x.h.map(h => h.num + ' ' + h.nome + ' ' + h.mot + ' ' + (h.vb != null ? fnum(h.vb) : ''))].join(' ')).includes(q)))
  }
  function head() {
    const fx = ABA == 'fiscal';
    return `<div class="flex flex-wrap items-center gap-2"><div class="mr-auto"><h1 class="text-2xl font-bold leading-tight">Faturas Emitidas</h1>${fx ? '<p class="text-sm text-slate-500">Análise Fiscal · o ISS e o INSS cobrados em cada fatura, lidos da planilha MEDICAO_SERVICO</p>' : `<p class="text-sm text-slate-500">Notas fiscais por competência · a NF anexada aqui é a que o Fundo de Reserva oferece para visualizar e baixar${FDB.L.length ? ' · ' + FDB.L.length + ' NF(s)' : ''}</p>${ROLE != 'admin' && pode() ? '<p id="fat-aviso" class="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">Anexe a NF informando a Data da Emissão, o nº e o Valor Bruto. Errou algum desses dados? Use “Editar” (sem justificativa). NF refaturada com arquivo novo? Use “Corrigir / refaturar”.</p>' : ''}`}</div>
    ${pode() && !fx ? '<button class="btn" onclick="fat.f()">＋ Anexar NF</button>' : ''}</div>
    ${MSG ? `<div class="text-sm rounded-lg px-3 py-2 ${ERR ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${esc(MSG)}</div>` : ''}
    ${fiscalOk() ? `<div class="flex flex-wrap items-center gap-2" role="tablist" aria-label="Faturas Emitidas"><button role="tab" data-aba="nf" aria-selected="${ABA == 'nf'}" class="${ABA == 'nf' ? 'btn' : 'btn2'}" onclick="fat.aba('nf')">Notas fiscais</button><button role="tab" data-aba="fiscal" aria-selected="${ABA == 'fiscal'}" class="${ABA == 'fiscal' ? 'btn' : 'btn2'}" title="ISS e INSS cobrados em cada fatura (planilha MEDICAO_SERVICO)" onclick="fat.aba('fiscal')">Análise Fiscal</button></div>` : ''}`
  }
  /* Total Faturado = soma da coluna "Total Faturado" da base do Fundo de Reserva (todas as Data_Base, ou só as dos meses do Período escolhido).
     Referência: nº do título (coluna "Numero do Titulo") e se a NF da competência já foi anexada aqui. */
  function tfCard() {
    const tf = FDB.TF, id = 'total', t = 'Total Faturado';
    if (!tf.ok && !tf.erro) return kp(id, t, '…', 'recibo', 'ver', 'carregando…');
    if (!tf.ok) return kp(id, t, '—', 'recibo', 'ver', `<span class="text-amber-600 dark:text-amber-400">indisponível</span>`, tf.erro);
    const L = tf.L.filter(r => perOk(r.d)), tot =Math.round(L.reduce((a, r) => a + r.tf, 0) * 100) / 100,
      sem = L.filter(r => !FDB.mes(r.d.slice(0, 7)).length).length,
      tit = L.map(r => r.titulo).filter(Boolean), ts = tit.length && tit.length <= 3 ? (tit.length == 1 ? 'Título ' : 'Títulos ') + tit.join(', ') : L.length + (L.length == 1 ? ' período' : ' períodos'),
      nf = sem ? `<span class="text-amber-600 dark:text-amber-400">${sem == L.length ? (L.length == 1 ? 'sem NF anexada' : 'sem NF anexada em nenhum') : sem + ' sem NF anexada'}</span>` : 'NF anexada';
    return kp(id, t, brl(tot), 'recibo', 'ver', L.length ? `${esc(ts)} · ${nf}` : FPR ? 'sem Total Faturado na base no período (' + perTxt() + ')' : 'base do Fundo de Reserva sem períodos',
      'Soma da coluna “Total Faturado” da base do Fundo de Reserva' + (FPR ? ' no período ' + perTxt() : '') + (tf.em ? ' · base publicada em ' + dh(tf.em) : ''))
  }
  function render() {
    CHF.forEach(c => { try { c.destroy() } catch (e) { } }); CHF = [];
    if (ABA == 'fiscal' && !fiscalOk()) ABA = 'nf';
    if (ABA == 'fiscal') { fiscal(); return }
    if (!FDB.ok) { VIEW.innerHTML = head() + `<div class="card py-10 text-center text-slate-500">${FDB.erro ? esc(FDB.erro) : ERR ? '' : 'Carregando…'}</div>`; return }
    const T = filtradas();
    VIEW.innerHTML = head() + perBar() + `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${tfCard()}${kp('nfs', 'NFs anexadas', T.length, 'arquivo', 'azul', T.length != FDB.L.length ? 'de ' + FDB.L.length : 'vigentes')}</div>${brutoCard()}
    <div class="card"><input id="fat-q" class="inp w-full mb-3" placeholder="🔍 Buscar por nº da NF, arquivo, observação, motivo ou responsável" value="${esc(FQ)}" oninput="fat.q(this.value)">
      <div id="fat-t" class="overflow-x-auto"></div></div>`;
    tbl(T); brutoGraf()
  }
  /* ---------- Valor Bruto faturado (veio do Fundo de Reserva): colunas = Valor Bruto das NFs de cada mês da Data_Base (= mês da emissão) · linha = acumulado ----------
     Lê a base do Fundo de Reserva, por isso só aparece para quem pode ver o Fundo (fundo.ver). Considera os meses do Período escolhido (sem filtro: todos os meses da base); o acumulado começa no 1º mês do período. Meses sem NF entram com zero. */
  function brutoSerie() {
    const m = {}; FDB.TF.L.forEach(r => { if (!perOk(r.d)) return; const ym = r.d.slice(0, 7); m[ym] = (m[ym] || 0) + Math.round((+r.bruto || 0) * 100) });
    const ks = Object.keys(m).sort(), k = []; if (!ks.length) return { k, v: [], a: [] };
    let y = +ks[0].slice(0, 4), mo = +ks[0].slice(5), y2 = +ks[ks.length - 1].slice(0, 4), m2 = +ks[ks.length - 1].slice(5);
    while (y < y2 || (y == y2 && mo <= m2)) { k.push(y + '-' + String(mo).padStart(2, '0')); if (++mo > 12) { mo = 1; y++ } }
    let ac = 0; return { k, v: k.map(x => (m[x] || 0) / 100), a: k.map(x => { ac += m[x] || 0; return ac / 100 }) }
  }
  const brutoOk = () => FDB.TF.ok && FDB.TF.fiscal && FDB.TF.L.length > 0;
  function brutoCard() {
    const vz = !FDB.TF.L.some(r => perOk(r.d));   /* período sem nenhum faturamento na base */
    return brutoOk() ? `<div class="card" id="fat-bruto"><h2 class="font-semibold">Valor Bruto faturado</h2><p class="text-xs text-slate-500 mb-3">Colunas: Valor Bruto das NFs de cada mês (mês da Data_Base = emissão da NF) · Linha: acumulado${FPR ? ' a partir de ' + PER.lb(fPer().de) : ''}. Considera os meses do Período escolhido acima${FPR ? ' (' + perTxt() + ')' : ' (sem filtro: todos os meses da base)'}.</p><div class="relative h-72">${vz ? '<p class="text-sm text-slate-500 py-10 text-center" data-bruto-vazio>Nenhum faturamento na base neste período.</p>' : '<canvas id="fat-c0" role="img" aria-label="Gráfico de colunas com o Valor Bruto faturado em cada mês e linha com o valor acumulado; os valores de cada NF também estão na Análise Fiscal"></canvas>'}</div></div>` : ''
  }
  function brutoRepinta() { CHF.forEach(c => { try { c.destroy() } catch (e) { } }); CHF = []; brutoGraf() }
  function brutoGraf() {
    const cv = document.getElementById('fat-c0'); if (!cv || typeof Chart == 'undefined') return;
    try {
      const T = cor(cv), M = brutoSerie(), n = M.k.length, nome = 'Valor Bruto';
      CHF.push(new Chart(cv, {
        type: 'bar',
        data: { labels: M.k.map(mesLb), datasets: [
          { type: 'bar', label: nome + ' do mês', data: M.v, backgroundColor: T.mes, borderColor: T.surf, borderWidth: 2, borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }, maxBarThickness: 44, order: 2, datalabels: { display: n <= 6, anchor: 'end', align: 'end', color: T.ink, font: { size: 11, weight: 'bold' }, formatter: v => cmp(v).replace('R$ ', '') } },
          { type: 'line', label: nome + ' acumulado', data: M.a, borderColor: T.acu, backgroundColor: T.acu, borderWidth: T.dk ? 2 : 3, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: T.surf, pointBorderWidth: 2, tension: .2, order: 1, datalabels: { display: c => n > 1 && c.dataIndex == n - 1, anchor: 'end', align: 'top', offset: 6, color: T.ink, font: { size: 11, weight: 'bold' }, formatter: cmp } }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 18 } },
          scales: { x: { grid: { display: false }, border: { color: T.base }, ticks: { color: T.mut, font: { size: 11 } } },
            y: { display: false, beginAtZero: true, grace: '12%' } },   /* sem valores nem linhas de grade no eixo Y: os valores estão nos rótulos e no tooltip */
          plugins: { legend: { position: 'bottom', labels: { color: T.ink2, usePointStyle: true, boxWidth: 8, padding: 16, sort: (a, b) => a.datasetIndex - b.datasetIndex } },
            tooltip: { backgroundColor: T.tip, titleColor: T.ink, bodyColor: T.ink2, borderColor: T.dk ? 'rgba(255,255,255,.10)' : 'rgba(11,11,11,.10)', borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true, callbacks: { label: c => ' ' + c.dataset.label + ': ' + brl(c.parsed.y) } } } }
      }))
    } catch (e) { console.error('Faturas · Valor Bruto faturado · gráfico:', e) }
  }
  /* ---------- Análise Fiscal: ISS e INSS cobrados em cada fatura (planilha MEDICAO_SERVICO · base publicada no Fundo de Reserva) ---------- */
  const somaC = (L, k) => L.reduce((t, r) => t + Math.round((+r[k] || 0) * 100), 0) / 100,
    pcn = (a, b) => b > 0 ? (a / b * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—',
    cmp = v => 'R$ ' + (v >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : v >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })),
    /* paleta dos gráficos (validada com scripts/validate_palette.js, claro e escuro): ISS = azul · INSS = laranja, igual na coluna e na rosca */
    cor = el => { const dk = document.documentElement.classList.contains('dark'), sf = (el && el.closest('.card') && getComputedStyle(el.closest('.card')).backgroundColor) || (dk ? '#000000' : '#ffffff');
      return dk ? { iss: '#3987e5', inss: '#d95926', mes: '#3987e5', acu: '#d95926', ink: '#f0efec', ink2: '#c3c2b7', mut: '#898781', grid: '#2c2c2a', base: '#383835', tip: '#1a1a19', surf: sf, dk, dl: ['#0b0b0b', '#0b0b0b'] }
        : { iss: '#1f65c0', inss: '#d95926', mes: '#1f65c0', acu: '#d95926', ink: '#0b0b0b', ink2: '#52514e', mut: '#52514e', grid: '#d2d1c9', base: '#898781', tip: '#ffffff', surf: sf, dk, dl: ['#ffffff', '#0b0b0b'] } };
  function fLinhas() {
    const q = N(FQF), p = fPer();
    return FDB.TF.L.filter(r => r.d.slice(0, 7) >= p.de && r.d.slice(0, 7) <= p.ate && (!q || N([dmy(r.d), r.titulo, fnum(r.bruto), fnum(r.iss), fnum(r.inss)].join(' ')).includes(q)))
  }
  function fiscal() {
    const tf = FDB.TF;
    if (!tf.ok) { VIEW.innerHTML = head() + `<div class="card py-10 text-center text-slate-500" data-fx-msg>${tf.erro ? esc(tf.erro) : 'Carregando…'}</div>`; return }
    if (!tf.fiscal) { VIEW.innerHTML = head() + '<div class="card py-10 text-center text-slate-500" data-fx-msg>A Análise Fiscal usa a base do Fundo de Reserva, que este usuário não pode ler.</div>'; return }
    VIEW.innerHTML = head() + `${perBar()}<div class="card"><input id="fat-qf" class="inp w-full" placeholder="🔍 Buscar por DOC FISCAL, data ou valor" value="${esc(FQF)}" oninput="fat.qf(this.value)"></div>
      <div id="fat-fx" class="space-y-6"></div>`;
    fiscalCorpo()
  }
  function fiscalCorpo() {
    const el = document.getElementById('fat-fx'); if (!el) return;
    CHF.forEach(c => { try { c.destroy() } catch (e) { } }); CHF = [];
    const tf = FDB.TF, L = fLinhas(), iss = somaC(L, 'iss'), inss = somaC(L, 'inss'), tot = Math.round((iss + inss) * 100) / 100, vb = somaC(L, 'bruto'), n = L.length, T0 = cor(null),
      D = L.slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : a.titulo < b.titulo ? 1 : -1),
      sw = c => `<span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style="background:${c}" aria-hidden="true"></span>`,
      lg = (k, t, v, c) => `<div class="flex items-center justify-between gap-2 text-sm mb-2" data-leg="${k}"><span class="flex items-center gap-2">${sw(c)}${t}</span><b class="tabular-nums">${brl(v)} <span class="font-normal text-slate-500">${pcn(v, tot)}</span></b></div>`,
      cel = (r, k) => `<td class="px-2.5 py-2 text-right whitespace-nowrap tabular-nums"><div data-c="${k}">${brl(r[k])}</div><div class="text-[11px] text-slate-500" data-p="${k}">${pcn(r[k], r.bruto)}</div></td>`;
    el.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">${kp('iss', 'ISS cobrado', brl(iss), 'pct', 'azul', pcn(iss, vb) + ' do Valor Bruto das NFs', 'Soma da Retenção ISS da planilha MEDICAO_SERVICO nas NFs mostradas')}${kp('inss', 'INSS cobrado', brl(inss), 'pct', 'amb', pcn(inss, vb) + ' do Valor Bruto das NFs', 'Soma da Retenção INSS da planilha MEDICAO_SERVICO nas NFs mostradas')}${kp('imp', 'Total de impostos', brl(tot), 'recibo', 'ind', 'ISS + INSS · ' + n + (n == 1 ? ' NF' : ' NFs'), 'ISS + INSS das NFs mostradas')}</div>
      <div class="grid lg:grid-cols-3 gap-4"><div class="card lg:col-span-2"><h2 class="font-semibold">ISS e INSS por fatura</h2><p class="text-xs text-slate-500 mb-3">Cada coluna é uma NF, identificada pelo mês/ano da emissão (09/26 = setembro de 2026): o ISS e o INSS cobrados nela. Passe o mouse para ver o DOC FISCAL e a data; os valores de cada NF estão na tabela abaixo.</p><div class="relative h-72">${n ? '<canvas id="fat-c1" role="img" aria-label="Gráfico de colunas empilhadas com o ISS e o INSS cobrados em cada NF; os mesmos valores estão na tabela abaixo"></canvas>' : '<p class="text-sm text-slate-500 py-10 text-center">Nenhuma NF neste filtro.</p>'}</div></div>
        <div class="card flex flex-col"><h2 class="font-semibold mb-3">Impostos por tributo</h2><div class="relative h-48 shrink-0">${tot > 0 ? '<canvas id="fat-c2" role="img" aria-label="Gráfico de rosca com a divisão entre ISS e INSS; os valores estão na lista abaixo"></canvas>' : '<p class="text-sm text-slate-500 py-10 text-center">Sem ISS nem INSS neste filtro.</p>'}</div>
          <div class="mt-4 flex flex-col flex-1" id="fat-leg">${lg('iss', 'ISS', iss, T0.iss)}${lg('inss', 'INSS', inss, T0.inss)}<div class="flex justify-between text-sm gap-2 pt-3 mt-auto border-t-2 border-slate-300 dark:border-slate-700 font-bold"><span>TOTAL</span><b class="tabular-nums" data-leg="tot">${brl(tot)}</b></div></div></div></div>
      <div class="card"><h2 class="font-semibold">Impostos cobrados por fatura</h2><p class="text-xs text-slate-500 mb-3">${tf.em ? 'Base do Fundo de Reserva publicada em ' + dh(tf.em) + ' · ' : ''}O ISS e o INSS da planilha são retidos pelo tomador na NF (colunas Retenção ISS e Retenção INSS). O percentual é sobre o Valor Bruto da NF.</p>
        <div class="overflow-x-auto"><table class="w-full text-sm" data-tab="fiscal"><thead class="text-xs uppercase text-slate-500 text-left"><tr><th class="px-2.5 py-2 align-bottom leading-tight">Data_Base (Emissão NF)</th><th class="px-2.5 py-2 align-bottom leading-tight">DOC FISCAL</th><th class="px-2.5 py-2 text-right align-bottom leading-tight">Valor Bruto (NF)</th><th class="px-2.5 py-2 text-right align-bottom leading-tight">Retenção ISS</th><th class="px-2.5 py-2 text-right align-bottom leading-tight">Retenção INSS</th><th class="px-2.5 py-2 text-right align-bottom leading-tight">Total ISS + INSS</th></tr></thead>
          <tbody>${D.map(r => { const t = Math.round((r.iss + r.inss) * 100) / 100; return `<tr class="border-t border-slate-200 dark:border-slate-800 align-top" data-d="${esc(r.d)}" data-doc="${esc(r.titulo)}"><td class="px-2.5 py-2 whitespace-nowrap">${dmy(r.d)}</td><td class="px-2.5 py-2 whitespace-nowrap tabular-nums">${esc(r.titulo) || '—'}</td><td class="px-2.5 py-2 text-right whitespace-nowrap tabular-nums" data-c="bruto">${brl(r.bruto)}</td>${cel(r, 'iss')}${cel(r, 'inss')}<td class="px-2.5 py-2 text-right whitespace-nowrap tabular-nums font-semibold"><div data-c="tot">${brl(t)}</div><div class="text-[11px] font-normal text-slate-500" data-p="tot">${pcn(t, r.bruto)}</div></td></tr>` }).join('') || '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-500" data-vazio>Nenhuma NF encontrada com esse filtro.</td></tr>'}</tbody>
          ${n > 1 ? `<tfoot><tr class="border-t-2 border-slate-300 dark:border-slate-700 font-semibold align-top"><td class="px-2.5 py-2" colspan="2">Total (${n} NFs)</td><td class="px-2.5 py-2 text-right tabular-nums" data-t="bruto">${brl(vb)}</td><td class="px-2.5 py-2 text-right tabular-nums"><div data-t="iss">${brl(iss)}</div><div class="text-[11px] font-normal text-slate-500">${pcn(iss, vb)}</div></td><td class="px-2.5 py-2 text-right tabular-nums"><div data-t="inss">${brl(inss)}</div><div class="text-[11px] font-normal text-slate-500">${pcn(inss, vb)}</div></td><td class="px-2.5 py-2 text-right tabular-nums"><div data-t="tot">${brl(tot)}</div><div class="text-[11px] font-normal text-slate-500">${pcn(tot, vb)}</div></td></tr></tfoot>` : ''}</table></div></div>`;
    graficos(L)
  }
  function graficos(L) {
    if (typeof Chart == 'undefined') return;
    const c1 = document.getElementById('fat-c1'), c2 = document.getElementById('fat-c2'), A = L.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.titulo < b.titulo ? -1 : 1);
    try {
      if (c1) {
        const T = cor(c1), iss = A.map(r => r.iss), inss = A.map(r => r.inss), raio = (i, ds) => (ds == 1 ? inss[i] > 0 : inss[i] <= 0 && iss[i] > 0) ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0;
        CHF.push(new Chart(c1, {
          type: 'bar',
          data: { labels: A.map(r => mmaa(r.d)), datasets: [
            { label: 'ISS', data: iss, backgroundColor: T.iss, borderColor: T.surf, borderWidth: 2, borderRadius: c => raio(c.dataIndex, 0), maxBarThickness: 40, stack: 's', datalabels: { display: false } },
            { label: 'INSS', data: inss, backgroundColor: T.inss, borderColor: T.surf, borderWidth: 2, borderRadius: c => raio(c.dataIndex, 1), maxBarThickness: 40, stack: 's', datalabels: { display: false } }] },
          options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false },
            scales: { x: { stacked: true, grid: { display: false }, border: { color: T.base }, ticks: { color: T.mut, maxRotation: 45, autoSkip: true, font: { size: 11 } } },
              y: { stacked: true, display: false, beginAtZero: true, grace: '8%' } },   /* sem valores nem linhas de grade no eixo Y: os valores estão no tooltip */
            plugins: { datalabels: { display: false },
              legend: { position: 'bottom', labels: { color: T.ink2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 12 } } },
              tooltip: { backgroundColor: T.tip, titleColor: T.ink, bodyColor: T.ink2, footerColor: T.ink2, borderColor: T.dk ? 'rgba(255,255,255,.10)' : 'rgba(11,11,11,.10)', borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
                callbacks: { title: it => { const r = A[it[0].dataIndex]; return (r.titulo ? 'DOC FISCAL ' + r.titulo + ' · ' : '') + 'Data_Base ' + dmy(r.d) },
                  label: c => ' ' + c.dataset.label + ': ' + brl(c.parsed.y) + ' (' + pcn(c.parsed.y, A[c.dataIndex].bruto) + ' do bruto)',
                  footer: it => { const r = A[it[0].dataIndex], t = Math.round((r.iss + r.inss) * 100) / 100; return 'Total ISS + INSS ' + brl(t) + ' · ' + pcn(t, r.bruto) + ' do Valor Bruto ' + brl(r.bruto) } } } } }
        }))
      }
      if (c2) {
        const T = cor(c2), iss = somaC(L, 'iss'), inss = somaC(L, 'inss'), tot = Math.round((iss + inss) * 100) / 100;
        CHF.push(new Chart(c2, {
          type: 'doughnut',
          data: { labels: ['ISS', 'INSS'], datasets: [{ data: [iss, inss], backgroundColor: [T.iss, T.inss], borderColor: T.surf, borderWidth: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, cutout: '42%',
            plugins: { legend: { display: false },
              datalabels: { color: c => T.dl[c.dataIndex], font: { size: 12, weight: 'bold' }, display: c => tot > 0 && c.dataset.data[c.dataIndex] / tot > .03, formatter: v => pcn(v, tot) },
              tooltip: { backgroundColor: T.tip, titleColor: T.ink, bodyColor: T.ink2, borderColor: T.dk ? 'rgba(255,255,255,.10)' : 'rgba(11,11,11,.10)', borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true, callbacks: { label: c => ' ' + c.label + ': ' + brl(c.parsed) + ' (' + pcn(c.parsed, tot) + ')' } } } }
        }))
      }
    } catch (e) { CHF = []; console.error('Faturas · Análise Fiscal · gráfico:', e) }
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

  try { new MutationObserver(() => { if (!VIEW.classList.contains('hidden') && CHF.length) { if (ABA == 'fiscal') fiscalCorpo(); else brutoRepinta() } }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }) } catch (e) { } /* trocou o tema: repinta os gráficos */

  window.fat = {
    show() { MSG = ''; render(); nuvem() }, f: id => form(id), e: id => form(id, true), arq, aviso, sv, del,
    aba(a) { ABA = a == 'fiscal' && fiscalOk() ? 'fiscal' : 'nf'; MSG = ''; if (ABA == 'fiscal' && !FDB.TF.ok) FDB.carregarTF().catch(() => { }); render() },
    qf(v) { FQF = v; fiscalCorpo() },
    /* filtro de período (igual ao de Contas a Receber e da Programação Financeira Quadrimestral; vale para as duas abas): k = 'de' | 'ate'. Todo o período = null (meses novos entram sozinhos) */
    per(k, v) { const ms = fMeses(), t = PER.set(fPer(), k, v); FPR = ms.length && PER.igual(t, { de: ms[0], ate: ms[ms.length - 1] }) ? null : t; render() },
    pre(a) { FPR = null; render() },
    q(v) { FQ = v; tbl() },
    hist(id) { ABRE[id] = !ABRE[id]; tbl() },
    async dl(id, v) { try { await FDB.baixarNF(id, v) } catch (e) { MSG = '⚠ Não consegui baixar a NF: ' + (e.message || e); ERR = true; render() } },
    ver(id, v) { NFV.abrir(id, v) },
    vbf(i) { const n = num_(i.value); if (FDB.vbOk(n)) i.value = fnum(n) },
    _r: render
  };
})();
