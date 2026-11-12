/* Dados do REIDI no Supabase — usado pelos módulos "Projeção REIDI" (lançamento) e "REIDI" (relatório).
   • public.reidi_compras    → uma linha por compra lançada (incluir / editar / excluir)
   • public.reidi_pagamentos → um pagamento (data + valor) por linha, ligado à compra: uma compra pode ser paga em partes (supabase/reidi-pagamentos.sql).
                               O STATUS da compra é calculado: sem pagamento = A pagar · pago < negociado = Parcial · pago = negociado = Pago.
                               Saldo = valor negociado − pago. O banco recusa pagamento acima do saldo. Sem a tabela (SQL ainda não rodado) o módulo segue no modo antigo (Pago = compra inteira).
   • bases · reidi_config    → parâmetros do relatório (documento, data de referência, horizonte, saldo, responsáveis)
   O relatório lê SEMPRE daqui: quem lança, o dado vale para todos. A tela se atualiza sozinha (Realtime do Supabase +
   conferência a cada 30 s como reforço). Também gera a planilha no modelo "Projeção Mensal de Compras REIDI" (exportar).
   Depende de app.js ($, N), supabase.js (sb_) e base.js (BASE). */
const RDB = {
  T: 'reidi_compras', CFG: 'reidi_config', PASSO: 5000,
  /* Metodologia (o comprador NEGOCIA com o fornecedor e digita só o Valor Original e o Valor Negociado):
       economia REAL      = valor original − valor negociado
       % APLICADO (reverso) = (1 − valor negociado ÷ valor original) ÷ 90%   → qual percentual de PIS/COFINS a negociação de fato aplicou
       alíquota de REFERÊNCIA = a alíquota oficial mais próxima do % aplicado: 3,65% ou 9,25% (limite entre as duas = 6,45%)
       economia TEÓRICA   = valor original × alíquota de referência × 90%   (o que o REIDI deveria render) */
  ALIQ: [0.0365, 0.0925], FATOR: 0.9, LIM: 0.0645,
  teor(vo, pc) { return (+vo || 0) * (+pc || 0) * this.FATOR },
  ident(vo, vn) { vo = +vo || 0; vn = +vn || 0; const ec = vo - vn, pa = vo > 0 ? ec / (vo * this.FATOR) : 0; return { ec, pa, al: pa >= this.LIM ? this.ALIQ[1] : this.ALIQ[0] } },
  /* Cor da economia REAL frente à TEÓRICA (comparadas em centavos, como aparecem na tela):
     VERMELHO se a real for menor que a teórica · VERDE se for igual ou maior. Vale para as COLUNAS/linhas de total das tabelas;
     os cartões das abas "Análise Financeira" e "REIDI Realizado" ficam sem cor (como os demais cartões). */
  abaixo(ec, et) { return Math.round((+ec || 0) * 100) < Math.round((+et || 0) * 100) },
  cor(ec, et) { return this.abaixo(ec, et) ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400' },
  dica(ec, et) { return 'Economia teórica ' + f(et) + ' · real ' + (this.abaixo(ec, et) ? 'abaixo' : 'igual ou acima') + ' da teórica' },
  PT: 'reidi_pagamentos', PGok: false, /* PGok = a tabela de pagamentos existe no banco (modo novo); false = modo antigo */
  L: [], PG: [], C: null, Ct: '', ok: false, ouv: [], _ch: null, _ch2: null, _tm: null, _sig: '', _busy: false, _again: false,
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  /* linha do banco → formato usado pelos módulos */
  de(r) { const vo = +r.valor_original, vn = +r.valor_negociado, I = this.ident(vo, vn); /* pc = alíquota de referência e pa = % aplicado, SEMPRE pelo cálculo reverso (a coluna pc do banco é só um espelho) */
    return { id: r.id, f: r.fornecedor, i: r.item || '', cat: r.categoria || '', ped: r.pedido || '', dt: String(r.data_prevista).slice(0, 10), pc: I.al, pa: I.pa, rp: r.responsavel || '', vo, vn, ba: String(r.data_base || r.data_prevista).slice(0, 10), st: r.status == 'Pago' ? 'Pago' : r.status == 'Parcial' ? 'Parcial' : 'A pagar', pgs: [], pago: 0, sd: vn, pf: 0, up: '', cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' } },
  /* o status só é enviado no modo antigo: com a tabela de pagamentos o banco CALCULA o status (qualquer valor enviado seria ignorado) */
  para(x) { const vo = Math.round(x.vo * 100) / 100, vn = Math.round(x.vn * 100) / 100, o = { fornecedor: String(x.f || '').trim(), item: String(x.i || '').trim(), categoria: String(x.cat || '').trim() || 'Previsão', pedido: String(x.ped || '').trim(), data_prevista: x.dt, pc: this.ident(vo, vn).al, responsavel: String(x.rp || '').trim(), valor_original: vo, valor_negociado: vn, data_base: x.ba }; if (!this.PGok) o.status = x.st == 'Pago' ? 'Pago' : 'A pagar'; return o },
  /* ---------- pagamentos parciais ---------- */
  c(n) { return Math.round((+n || 0) * 100) }, r2(c) { return c / 100 }, /* contas SEMPRE em centavos inteiros (sem resíduo de ponto flutuante) */
  semTabela(e) { return /PGRST205|PGRST200|42P01|schema cache|does not exist|could not find the table/i.test(String((e && (e.message || e.code)) || e || '') + ' ' + String((e && e.code) || '')) },
  dePag(r) { return { id: r.id, cid: r.compra_id, d: String(r.data_pagamento).slice(0, 10), v: +r.valor || 0, obs: r.obs || '', cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' } },
  /* liga cada pagamento à sua compra e CALCULA pago, saldo, % pago, último pagamento e status (A pagar · Parcial · Pago).
     Modo antigo (sem a tabela): compra "Pago" vale como 1 pagamento integral na data do calendário (dia 1–15 → 15 · 16–fim → último dia do mês). */
  anexar(L, PG) {
    const por = {}; PG.forEach(r => { (por[r.compra_id] = por[r.compra_id] || []).push(this.dePag(r)) });
    L.forEach(x => {
      let ps = por[x.id] || [];
      if (!this.PGok) ps = x.st == 'Pago' && x.vn > 0 ? [{ id: 'sint-' + x.id, cid: x.id, d: this.pagto(x.dt), v: x.vn, obs: 'Pagamento integral (modo antigo)', cp: '', cn: '', ce: x.ce, an: '', ae: x.ae, sint: true }] : [];
      ps.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.ce < b.ce ? -1 : a.ce > b.ce ? 1 : 0);
      const vn = this.c(x.vn), pg = ps.reduce((t, p) => t + this.c(p.v), 0);
      x.pgs = ps; x.pago = this.r2(pg); x.sd = this.r2(vn - pg); x.pf = vn > 0 ? Math.min(1, pg / vn) : (x.st == 'Pago' ? 1 : 0); x.up = ps.length ? ps[ps.length - 1].d : '';
      x.st = vn > 0 ? (pg >= vn ? 'Pago' : pg > 0 ? 'Parcial' : 'A pagar') : (x.st == 'Pago' ? 'Pago' : 'A pagar')
    });
    return L
  },
  /* tradução das mensagens do banco */
  msg(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || ''), cd = String((e && e.code) || '');
    if (this.semTabela(e)) return 'Os pagamentos parciais ainda não foram ativados no banco: execute supabase/reidi-pagamentos.sql no Supabase.';
    if (/Sem permiss|42501|row-level security|permission denied|not authorized/i.test(m + ' ' + cd)) return 'Sem permissão para esta operação (o Lançador só altera os pagamentos das compras lançadas por ele).';
    if (/valor_check/i.test(m)) return 'O valor pago precisa ser maior que zero.';
    if (/obs_check/i.test(m)) return 'A observação passa de 300 caracteres.';
    return m || 'Falha inesperada.'
  },
  /* confere um pagamento antes de enviar (o banco confere de novo). idEdit = pagamento que está sendo editado (não conta como "já pago") */
  valida(x, cid, idEdit) {
    const k = this.L.find(r => r.id == cid); if (!k) return 'Compra não encontrada.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.d || '') || isNaN(new Date(x.d + 'T12:00:00Z')) || x.d < '2000-01-01') return 'Informe a data do pagamento.';
    if (x.d > this.hoje()) return 'A data do pagamento não pode ser futura.';
    if (typeof x.v != 'number' || !isFinite(x.v) || x.v <= 0 || x.v >= 1e13) return 'Informe o valor pago (maior que zero).';
    if (String(x.obs || '').length > 300) return 'A observação passa de 300 caracteres.';
    const ja = k.pgs.filter(p => p.id != idEdit).reduce((t, p) => t + this.c(p.v), 0), sd = this.c(k.vn) - ja;
    if (this.c(x.v) > sd) return 'O valor pago (' + f(x.v) + ') passa do saldo da compra (' + f(this.r2(sd)) + '). Total negociado ' + f(k.vn) + ', já pago ' + f(this.r2(ja)) + '. Se o valor combinado mudou, edite o valor negociado da compra.';
    return ''
  },
  campos(x) { return { data_pagamento: x.d, valor: this.r2(this.c(x.v)), obs: String(x.obs || '').trim() } },
  async pagar(cid, x) {
    if (!this.PGok) throw new Error(this.msg({ code: 'PGRST205' })); const e = this.valida(x, cid); if (e) throw new Error(e);
    const r = await this.cli().from(this.PT).insert({ compra_id: cid, ...this.campos(x) }).select().single(); if (r.error) throw new Error(this.msg(r.error));
    await this.carregar(); return this.dePag(r.data)
  },
  async corrigirPag(id, cid, x) {
    const e = this.valida(x, cid, id); if (e) throw new Error(e);
    const r = await this.cli().from(this.PT).update(this.campos(x)).eq('id', id).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não alterei: o pagamento foi excluído por outra pessoa ou você não tem permissão. A tela foi atualizada.') }
    await this.carregar()
  },
  async excluirPag(id) {
    const r = await this.cli().from(this.PT).delete().eq('id', id).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o pagamento já tinha sido excluído ou você não tem permissão.') }
    await this.carregar()
  },
  /* volta a compra para "A pagar": exclui TODOS os pagamentos dela */
  async desfazer(cid) {
    const r = await this.cli().from(this.PT).delete().eq('compra_id', cid).select(); if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não encontrei pagamentos para desfazer (ou você não tem permissão).') }
    await this.carregar(); return r.data.length
  },
  /* ---------- pagamentos feitos, um por linha, com a FATIA da compra que cada um representa ----------
     economia e valor sem REIDI são rateados pela parte paga: pago ÷ valor negociado. O rateio é ACUMULADO em centavos (cada pagamento leva a diferença do acumulado),
     então a soma dos pagamentos de uma compra quitada fecha EXATAMENTE no valor original, na economia real e na teórica da compra. */
  realizados(L) {
    const out = [];
    (L || this.L).forEach(x => {
      if (!x.pgs || !x.pgs.length) return;
      let ac = 0, a1 = 0, a2 = 0, a3 = 0;
      x.pgs.forEach(p => {
        ac += this.c(p.v); const k = this.fatia(x, ac);
        out.push({ ...p, c: x, vo: this.r2(k.vo - a1), ec: this.r2(k.ec - a2), et: this.r2(k.et - a3), ac: this.r2(ac) }); a1 = k.vo; a2 = k.ec; a3 = k.et
      })
    });
    return out
  },
  /* A PARTE DA COMPRA que corresponde a `ac` centavos pagos (em centavos): valor sem REIDI, economia real e economia teórica, proporcionais a pago ÷ valor negociado e arredondados.
     É a conta única do REIDI Realizado (acima) e do Resumo Executivo (restante): o que o Realizado mostra como pago + o que o Resumo mostra como a pagar = a compra inteira, no centavo. */
  fatia(x, ac) {
    const vn = this.c(x.vn), vo = this.c(x.vo), et = this.c(this.teor(x.vo, x.pc)), fr = ac > 0 ? (vn > 0 ? Math.min(1, ac / vn) : 1) : 0; /* sem pagamento nada foi realizado (inclusive compra de valor negociado zero); pagamento acima do negociado conta como compra inteira */
    return { vo: Math.round(vo * fr), ec: Math.round((vo - vn) * fr), et: Math.round(et * fr) }
  },
  /* O QUE AINDA FALTA PAGAR da compra, em centavos (alimenta o Resumo Executivo): saldo (negociado − pago, nunca negativo) e a parte do valor sem REIDI, da economia real e da economia teórica
     que ainda não foi paga (o complemento exato de `fatia` para tudo o que já foi pago). Compra quitada → tudo zero; sem pagamento → a compra inteira. */
  restante(x) {
    const vn = this.c(x.vn), vo = this.c(x.vo), et = this.c(this.teor(x.vo, x.pc)), ac = this.c(x.pago), k = this.fatia(x, ac);
    return { vn: Math.max(0, vn - ac), vo: vo - k.vo, ec: (vo - vn) - k.ec, et: et - k.et }
  },
  /* SALDO A PAGAR PARA A PLANILHA (modelo) DO RELATÓRIO REIDI (reidi_xlsx.js): cada compra COM pagamento entra só com o que AINDA FALTA PAGAR (RDB.restante, a mesma conta do Resumo Executivo):
     valor negociado − pagamentos; o valor original e a economia na mesma proporção (as de teórica e real vão em _et e _ec, em reais, ao centavo). Compra quitada fica de fora. Compra SEM pagamento segue inteira
     (é o próprio objeto da lista, sem copiar nem mexer em nada). Devolve { rows, parc: nº de compras que entraram só com o saldo, quit: nº de quitadas que ficaram de fora }.
     A planilha com o saldo NÃO leva legenda nenhuma nas células (os textos são os mesmos da planilha completa). Para o importador não aceitá-la por engano (valores menores que os da tabela duplicariam as compras),
     ela leva uma MARCA INTERNA nas propriedades do arquivo (as "Marcas" do Excel): MARCA_SALDO_PROP, gravada por reidi_xlsx.js e reconhecida por RDB.ehArquivoSaldo (reidi_importar.js). */
  MARCA_SALDO_PROP: 'REIDI saldo a pagar',
  MARCA_SALDO: 'SALDO A PAGAR', /* frase que abria a nota que as planilhas com saldo baixadas ANTES traziam acima do cabeçalho: o importador continua reconhecendo e recusando esses arquivos (RDB.ehNotaSaldo) */
  saldoLista(L) {
    const rows = []; let parc = 0, quit = 0;
    (L || this.L).forEach(x => {
      if (this.c(x.pago) <= 0) { rows.push(x); return }
      const r = this.restante(x); if (r.vn <= 0 && r.vo <= 0) { quit++; return }
      parc++; rows.push({ ...x, vo: this.r2(r.vo), vn: this.r2(r.vn), _ec: this.r2(r.vo - r.vn), _et: this.r2(r.et) })
    });
    return { rows, parc, quit }
  },
  /* Carga COALESCIDA. Uma carga que já estava em andamento pode ter lido os dados ANTES da gravação que quem chamou acabou de fazer (conferência de 30 s, evento de outro usuário...).
     Por isso quem chega durante uma carga recebe a MESMA promessa, que só se resolve depois de uma carga NOVA (feita depois da gravação): após "await RDB.pagar / editar / excluir(...)" os dados em memória já enxergam a gravação. */
  carregar() {
    if (!this.cli()) return Promise.reject(new Error('Supabase não configurado'));
    if (this._busy) { this._again = true; return this._pr }
    this._busy = true;
    this._pr = (async () => { try { let mudou = false; do { this._again = false; if (await this._carga()) mudou = true } while (this._again); return mudou } finally { this._busy = false } })();
    return this._pr
  },
  async _carga() {
    const c = this.cli();
    const [q, qp] = await Promise.all([
      c.from(this.T).select('*').order('data_prevista', { ascending: true }).order('criado_em', { ascending: true }),
      c.from(this.PT).select('*').order('data_pagamento', { ascending: true }).order('criado_em', { ascending: true })]); if (q.error) throw q.error;
    let PG = []; if (qp.error) { if (!this.semTabela(qp.error)) throw qp.error; this.PGok = false } else { PG = qp.data || []; this.PGok = true } /* tabela ausente = SQL ainda não rodado → modo antigo; qualquer outro erro derruba a carga (não troca de modo por falha passageira) */
    const L = this.anexar((q.data || []).map(r => this.de(r)), PG); let C = null, Ct = '';
    try { const r = await BASE.ler(this.CFG); if (r && r.dados) { C = r.dados; Ct = r.atualizado_em || '' } } catch (e) { } /* o Lançador também lê os parâmetros (reidi_config) para ver o relatório */
    const sig = JSON.stringify([L.map(x => [x.id, x.ae]), PG.map(p => [p.id, p.atualizado_em]), Ct, this.PGok]), mudou = sig != this._sig;
    this.L = L; this.PG = PG; this.C = C; this.Ct = Ct; this.ok = true; this._sig = sig; this.iniciar(); if (this.PGok) this.iniciarPag(); if (mudou) this.avisa(); return mudou
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  /* fn é chamada quando algo muda; vis() diz se a tela daquele módulo está aberta (só então confere a cada 30 s) */
  on(fn, vis) { this.ouv.push({ fn, vis: vis || (() => true) }) },
  iniciar() {
    if (this._tm) return; const c = this.cli(); if (!c) return;
    try { this._ch = c.channel('reidi-compras').on('postgres_changes', { event: '*', schema: 'public', table: this.T }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
    this._tm = setInterval(() => { if (document.hidden || !this.ouv.some(o => { try { return o.vis() } catch (e) { return false } })) return; this.carregar().catch(() => { }) }, 30000)
  },
  iniciarPag() { /* canal à parte: se a tabela de pagamentos não existir, a escuta das compras não é afetada */
    if (this._ch2) return; const c = this.cli(); if (!c) return;
    try { this._ch2 = c.channel('reidi-pagamentos').on('postgres_changes', { event: '*', schema: 'public', table: this.PT }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
  },
  async incluir(x) { const c = this.cli(), r = await c.from(this.T).insert(this.para(x)).select().single(); if (r.error) throw r.error; await this.carregar(); return this.de(r.data) },
  async editar(id, x) {
    const c = this.cli(), r = await c.from(this.T).update(this.para(x)).eq('id', id).select();
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error('Sem permissão para editar esta compra (o Lançador só altera os lançamentos feitos por ele).'); await this.carregar()
  },
  async excluir(id) {
    const c = this.cli(), r = await c.from(this.T).delete().eq('id', id).select();
    if (r.error) throw r.error; if (!r.data || !r.data.length) throw new Error('Sem permissão para excluir esta compra (o Lançador só exclui os lançamentos feitos por ele).'); await this.carregar()
  },
  /* EXCLUIR VÁRIAS compras de uma vez (caixas de seleção da Projeção de Compras REIDI). Em lotes de LOTE_EXCL ids por chamada (o endereço do pedido tem limite de tamanho); cada chamada é UMA instrução do banco (tudo ou nada).
     O banco confere as permissões de novo (RLS: o Lançador só exclui as que ele lançou): o que não for excluído (sem permissão, ou já excluído por outra pessoa) simplesmente não volta em "ok". Os pagamentos de cada compra saem junto (cascata).
     Devolve {ok: ids excluídos, erro}: se uma chamada falha, para ali (as anteriores continuam valendo) e devolve o erro. Sempre relê os dados no fim. */
  LOTE_EXCL: 50,
  async excluirLote(ids) {
    const c = this.cli(), ok = []; let erro = null;
    for (let i = 0; i < ids.length; i += this.LOTE_EXCL) {
      let r; try { r = await c.from(this.T).delete().in('id', ids.slice(i, i + this.LOTE_EXCL)).select('id') } catch (e) { erro = e; break }
      if (r.error) { erro = r.error; break }
      (r.data || []).forEach(d => ok.push(d.id))
    }
    try { await this.carregar() } catch (e) { const s = new Set(ok.map(String)); this.L = this.L.filter(x => !s.has(String(x.id))); this.avisa() } /* não conseguiu reler (rede): tira da memória o que o banco confirmou excluído */
    return { ok, erro }
  },
  async gravarConfig(cfg) { const r = await BASE.gravar(this.CFG, cfg, 'parâmetros do REIDI'); this.C = cfg; this.Ct = r.atualizado_em || ''; this._sig = ''; return r },
  /* ---------- parâmetros padrão e utilidades de data ---------- */
  hoje() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
  cfg() { const C = this.C || {}, h = this.hoje(); return { doc: C.doc || '', ref: C.ref || h.slice(0, 8) + '01', hor: +C.hor || 30, saldo: +C.saldo || 0, resp: C.resp || { el: 'Financeiro do Consórcio', cf: 'Gerente Administrativo Financeiro (GAF)', d: ['Diretor Belov', 'Diretor Carioca', 'Diretor CTC'] } } },
  /* data de pagamento: dia 1–15 → dia 15; 16–fim → último dia do mês */
  pagto(iso, d1 = 15) { const d = +iso.slice(8); return d <= d1 ? iso.slice(0, 8) + String(d1).padStart(2, '0') : iso.slice(0, 8) + new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate() },
  /* ---------- exportar a planilha no modelo "Projeção Mensal de Compras REIDI" ---------- */
  serial(iso) { return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5) }
};
