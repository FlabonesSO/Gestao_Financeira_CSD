/* Importar o Excel do REIDI (modelo "Projeção Mensal de Compras REIDI") para a tabela public.reidi_compras.
   O arquivo é lido AQUI, no navegador (SheetJS = XLSX); nada sobe antes de a pessoa conferir a prévia e confirmar (a tela está em js/modulos/reidi_lanc.js).
   COMO LÊ
     • procura a aba "Projeção de Compras" (ou a primeira aba que tenha as colunas) e, nela, a linha de cabeçalho: a primeira que tem
       FORNECEDOR + DATA (PAGAMENTO PREVISTA) + VALOR ORIGINAL + VALOR (APÓS) NEGOCIAÇÃO. Lê pelo NOME da coluna (sem acento/maiúscula), então
       a ordem e colunas extras não atrapalham. Colunas lidas: FORNECEDOR · ITEM/DESCRIÇÃO · CATEGORIA · Nº PEDIDO/PROCESSO/NF · DATA PAGAMENTO PREVISTA ·
       RESPONSÁVEL · VALOR ORIGINAL · VALOR APÓS NEGOCIAÇÃO · DATA BASE ATUALIZAÇÃO. O "% DE PIS E COFINS" e as colunas de economia (fórmulas) NÃO são lidos:
       o site calcula tudo pelo valor original e o negociado (cálculo reverso, RDB.ident).
     • linhas totalmente vazias são ignoradas (o modelo vem com ~500 linhas em branco); linha com algum dado e defeito vira "erro" e fica de fora.
     • a planilha do relatório REIDI com o SALDO A PAGAR (botão "⬇ Planilha (modelo)" do relatório, quando já há pagamento lançado) NÃO é importada: os valores dela são menores que os da tabela (já descontados os pagamentos),
       então importá-la criaria compras repetidas. O arquivo é recusado com a explicação. Ela é reconhecida pela MARCA INTERNA que leva nas propriedades do arquivo (as "Marcas": RDB.MARCA_SALDO_PROP, RDB.ehArquivoSaldo);
       nada aparece nas células. Os arquivos com saldo baixados antes, que traziam uma nota acima do cabeçalho ("SALDO A PAGAR em dd/mm/aaaa", RDB.MARCA_SALDO), também continuam sendo reconhecidos (RDB.ehNotaSaldo).
     • a linha de TOTAL que o próprio site acrescenta ao exportar o modelo (só o rótulo "TOTAL" no fornecedor, sem item, categoria, pedido, data nem responsável) NÃO é uma compra:
       é ignorada e só contada em "totais" (RDB.ehTotal); assim exportar e importar de novo continua sem erro.
   COMO COMPARA
     • "já está na tabela" = mesmo fornecedor + item + data prevista + valor original + valor negociado (sem acento/maiúscula/espaço repetido; valores em centavos).
       A conta é por QUANTIDADE: se o arquivo tem 2 linhas iguais e a tabela já tem 1, entra 1. Importar o mesmo arquivo de novo não duplica nada.
   COMO GRAVA
     • uma única gravação (INSERT em lote): ou entram todas as compras novas ou nenhuma. Status "A pagar" (os pagamentos são registrados no site depois).
       Responsável: o administrador mantém o da planilha (o banco permite só para ele, supabase/reidi-importar.sql); os demais ficam com o nome do próprio cadastro.
   Depende de: XLSX (index.html), N (app.js) e RDB (reidi_dados.js). */
Object.assign(RDB, {
  IMP_MAX: 1000, IMP_BYTES: 8 * 1024 * 1024,
  /* texto limpo: espaços repetidos viram um só; max = corte opcional */
  lp(v, max) { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return max ? s.slice(0, max) : s },
  nk(v) { return N(String(v == null ? '' : v)).replace(/\s+/g, ' ') },
  vazio(v) { return String(v == null ? '' : v).trim() === '' },
  /* a MARCA INTERNA que a planilha do relatório com o SALDO A PAGAR leva nas propriedades do arquivo (as "Marcas", separadas por ; ou ,): RDB.MARCA_SALDO_PROP. Só vale a marca inteira, nada parecido */
  ehArquivoSaldo(wb) { const k = wb && wb.Props && wb.Props.Keywords; return typeof k == 'string' && k.split(/[;,]/).some(t => this.nk(t) == this.nk(this.MARCA_SALDO_PROP)) },
  MSG_SALDO: 'Esta é a planilha do relatório REIDI com o SALDO A PAGAR: cada compra já sai com o valor que falta pagar (descontados os pagamentos) e as quitadas nem aparecem. Importá-la criaria compras repetidas, com valores menores. Para importar, use a planilha completa, baixada em “Projeção REIDI” → “⬇ Exportar planilha (modelo)”.',
  /* a nota que as planilhas com SALDO A PAGAR baixadas ANTES traziam acima do cabeçalho ("SALDO A PAGAR em dd/mm/aaaa · já descontados…", em qualquer coluna). Só ela conta: um título qualquer que apenas comece com as mesmas palavras NÃO é a nota */
  ehNotaSaldo(v) { return typeof v == 'string' && new RegExp('^' + N(this.MARCA_SALDO) + ' em \\d{2}/\\d{2}/\\d{4}( |$)').test(N(v).replace(/\s+/g, ' ')) },
  /* número do Excel (número de verdade) ou texto em formato brasileiro/americano ("R$ 1.234,56", "1234.56", "(500,00)"); NaN se não for número */
  nu(v) {
    if (typeof v == 'number') return v;
    let s = String(v == null ? '' : v).replace(/[\s ]/g, '').replace(/R\$/gi, ''); if (!s) return NaN;
    const ng = /^\(.*\)$/.test(s) || /^[-−]/.test(s); s = s.replace(/^[-−(]+/, '').replace(/\)$/, '');
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
    const vg = (s.match(/,/g) || []).length, pt = (s.match(/\./g) || []).length, mil = /^[1-9]\d{0,2}(\.\d{3})+$/;   /* mil = pontos só como separador de milhar (1.234 · 12.345.678) */
    if (vg && pt) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (vg > 1) s = s.replace(/,/g, '');
    else if (vg == 1) s = s.replace(',', '.');
    else if (pt > 1) { if (!mil.test(s)) return NaN; s = s.replace(/\./g, '') }
    else if (mil.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = parseFloat(s); return isNaN(n) ? NaN : ng ? -n : n
  },
  /* data do Excel (número de série, Date ou texto dd/mm/aaaa · aaaa-mm-dd) → "aaaa-mm-dd"; '' se não for uma data válida entre 2000 e 2100.
     d1904 = pasta de trabalho no sistema de datas de 1904 (Excel do Mac antigo) */
  isoData(v, d1904) {
    const ok = s => s >= '2000-01-01' && s <= '2100-12-31' ? s : '';
    if (v instanceof Date) return isNaN(v) ? '' : ok(new Date(v.getTime() + 432e5).toISOString().slice(0, 10));
    if (typeof v == 'number') { if (!isFinite(v)) return ''; return ok(new Date(Date.UTC(1899, 11, 30) + (Math.floor(v) + (d1904 ? 1462 : 0)) * 864e5).toISOString().slice(0, 10)) }
    const s = String(v == null ? '' : v).trim(), a = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?!\d)/), b = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/), p = n => String(n).padStart(2, '0');
    const y = a ? +a[3] : b ? +b[1] : 0, m = a ? +a[2] : b ? +b[2] : 0, d = a ? +a[1] : b ? +b[3] : 0; if (!y) return '';
    const t = new Date(Date.UTC(y, m - 1, d)); if (t.getUTCFullYear() != y || t.getUTCMonth() != m - 1 || t.getUTCDate() != d) return '';
    return ok(y + '-' + p(m) + '-' + p(d))
  },
  /* categoria: "Pedido de Compra" e "Previsão" ficam no padrão do site; outro texto é mantido; vazio = Previsão */
  catImp(v) { const s = this.lp(v, 60), k = this.nk(s); return !s ? 'Previsão' : k == 'pedido de compra' ? 'Pedido de Compra' : k == 'previsao' ? 'Previsão' : s },
  /* nº do pedido: número vira texto inteiro; "-" (como o modelo marca "sem pedido") vira vazio */
  pedImp(v) { if (typeof v == 'number') return isFinite(v) ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(6))) : ''; const s = this.lp(v, 80); return /^[-–—]+$/.test(s) ? '' : s },
  /* colunas: [chave, teste sobre o cabeçalho já sem acento/maiúscula]. A ordem importa: cada cabeçalho vale para uma só coluna. */
  COLS: [
    ['f', t => t.includes('fornecedor')],
    ['dt', t => t.includes('data') && /pagamento|prevista/.test(t) && !/base|atualiza/.test(t)],
    ['ba', t => /data base|atualiza/.test(t)],
    ['vo', t => t.includes('valor') && t.includes('original')],
    ['vn', t => t.includes('negocia')],
    ['rp', t => t.includes('respons')],
    ['cat', t => t.includes('categoria')],
    ['ped', t => /pedido|processo/.test(t)],
    ['i', t => /(^|[^a-z])item([^a-z]|$)|descri/.test(t)]
  ],
  /* linha de TOTAL do modelo exportado pelo site: fornecedor "TOTAL" e nada de item, categoria, pedido, data ou responsável (g = leitor da coluna pelo nome) */
  ehTotal(g) { return this.nk(g('f')) == 'total' && ['i', 'cat', 'ped', 'dt', 'rp'].every(k => this.vazio(g(k))) },
  /* acha a linha de cabeçalho (nas 40 primeiras linhas): {r: índice da linha, m: {coluna: índice}} ou null */
  cabecalho(A) {
    for (let r = 0; r < Math.min(A.length, 40); r++) {
      const m = {};
      (A[r] || []).forEach((c, j) => { const t = N(c).replace(/\s+/g, ' '); if (!t) return; for (const [k, f] of this.COLS) if (m[k] == null && f(t)) { m[k] = j; break } });
      if (m.f != null && m.dt != null && m.vo != null && m.vn != null) return { r, m }
    }
    return null
  },
  /* uma linha da planilha → compra + erros (ficam de fora) + avisos (entram mesmo assim). n = número da linha no Excel */
  linhaImp(g, n, d1904) {
    const er = [], av = [], f = this.lp(g('f'), 200), dtr = g('dt'), vor = g('vo'), vnr = g('vn'), bar = g('ba');
    if (!f) er.push('sem fornecedor');
    const dt = this.isoData(dtr, d1904); if (!dt) er.push(this.vazio(dtr) ? 'sem data de pagamento prevista' : 'data inválida (“' + this.lp(dtr, 20) + '”)');
    const val = (raw, nome) => {
      if (this.vazio(raw)) { er.push('sem ' + nome); return NaN }
      const v = this.nu(raw); if (isNaN(v)) { er.push(nome + ' inválido (“' + this.lp(raw, 20) + '”)'); return NaN }
      if (v < 0) { er.push(nome + ' negativo'); return NaN }
      if (v >= 1e13) { er.push(nome + ' grande demais'); return NaN }
      return Math.round(v * 100) / 100
    };
    const vo = val(vor, 'valor original'), vn = val(vnr, 'valor negociado');
    if (isFinite(vo) && isFinite(vn) && vn > vo) av.push('valor negociado maior que o original');
    let ba = this.vazio(bar) ? '' : this.isoData(bar, d1904); if (!this.vazio(bar) && !ba) { av.push('data base inválida: usei a de hoje'); }
    return { n, f, i: this.lp(g('i')), cat: this.catImp(g('cat')), ped: this.pedImp(g('ped')), dt, rp: this.lp(g('rp'), 120), vo, vn, ba: ba || this.hoje(), er, av, sit: '' }
  },
  /* lê o arquivo (ArrayBuffer) e devolve {arq, aba, cab, linhas, vazias}; lança Error com mensagem clara se não achar as colunas */
  lerPlanilha(buf, arq) {
    if (typeof XLSX == 'undefined') throw new Error('O leitor de Excel não foi carregado. Atualize a página (Ctrl+F5) e tente de novo.');
    let wb; try { wb = XLSX.read(buf, { type: 'array' }) } catch (e) { throw new Error('Não consegui abrir o arquivo. Use o Excel (.xlsx) no modelo “Projeção Mensal de Compras REIDI”.') }
    if (this.ehArquivoSaldo(wb)) throw new Error(this.MSG_SALDO);
    const d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904), pref = s => /projecao/.test(N(s)) && /compras/.test(N(s)) ? 0 : 1,
      abas = (wb.SheetNames || []).map((s, k) => [s, k]).sort((a, b) => pref(a[0]) - pref(b[0]) || a[1] - b[1]).map(a => a[0]);
    for (const aba of abas) {
      const ws = wb.Sheets[aba]; if (!ws || !ws['!ref']) continue;
      const A = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), h = this.cabecalho(A); if (!h) continue;
      for (let r = 0; r < h.r; r++) if ((A[r] || []).some(c => this.ehNotaSaldo(c))) throw new Error(this.MSG_SALDO);
      const ini = XLSX.utils.decode_range(ws['!ref']).s.r, linhas = []; let vazias = 0, totais = 0;
      for (let r = h.r + 1; r < A.length; r++) {
        const L = A[r] || [], g = k => h.m[k] == null ? '' : L[h.m[k]];
        if (this.ehTotal(g)) { totais++; continue }
        if (['f', 'i', 'cat', 'ped', 'dt', 'rp', 'vo', 'vn'].every(k => this.vazio(g(k)))) { vazias++; continue }
        if (linhas.length >= this.IMP_MAX) throw new Error('A planilha tem mais de ' + this.IMP_MAX + ' linhas com compras. Divida o arquivo e importe por partes.');
        linhas.push(this.linhaImp(g, ini + r + 1, d1904))
      }
      return { arq: arq || '', aba, cab: ini + h.r + 1, linhas, vazias, totais }
    }
    throw new Error('Não encontrei as colunas da Projeção de Compras. A planilha precisa ter, na mesma linha de cabeçalho: FORNECEDOR, DATA PAGAMENTO PREVISTA, VALOR ORIGINAL (R$) e VALOR APÓS NEGOCIAÇÃO REIDI (R$). Use o modelo (botão “⬇ Exportar planilha (modelo)”) ou o Excel antigo da Projeção Mensal de Compras REIDI.')
  },
  /* chave de comparação com o que já está na tabela */
  chaveImp(x) { return [this.nk(x.f), this.nk(x.i), x.dt, this.c(x.vo), this.c(x.vn)].join('|') },
  /* marca cada linha: 'erro' · 'dup' (já está na tabela) · 'nova'. Compara por quantidade (ver o cabeçalho do arquivo). Usa this.L (a tabela carregada). */
  compara(linhas) {
    const tem = {}; this.L.forEach(x => { const k = this.chaveImp(x); tem[k] = (tem[k] || 0) + 1 });
    linhas.forEach(r => { if (r.er.length) { r.sit = 'erro'; return } const k = this.chaveImp(r); if (tem[k] > 0) { tem[k]--; r.sit = 'dup' } else r.sit = 'nova' });
    return linhas
  },
  /* sobe as compras NOVAS numa única gravação (tudo ou nada). admin = mantém o responsável da planilha; os demais gravam o próprio nome (eu). Devolve as linhas gravadas. */
  async importar(novas, admin, eu) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const rows = novas.map(r => this.para({ f: r.f, i: r.i, cat: r.cat, ped: r.ped, dt: r.dt, rp: admin && r.rp ? r.rp : eu, vo: r.vo, vn: r.vn, st: 'A pagar', ba: r.ba }));
    const q = await c.from(this.T).insert(rows).select(); if (q.error) throw q.error;
    await this.carregar(); return q.data || []
  }
});
