/* Dados do REIDI no Supabase — usado pelos módulos "Projeção REIDI" (lançamento) e "REIDI" (relatório).
   • public.reidi_compras  → uma linha por compra lançada (incluir / editar / excluir)
   • bases · reidi_config  → parâmetros do relatório (documento, data de referência, horizonte, saldo, responsáveis)
   O relatório lê SEMPRE daqui: quem lança, o dado vale para todos. A tela se atualiza sozinha (Realtime do Supabase +
   conferência a cada 30 s como reforço). Também gera a planilha no modelo "Projeção Mensal de Compras REIDI" (exportar).
   Depende de app.js ($, N), supabase.js (sb_) e base.js (BASE). */
const RDB = {
  T: 'reidi_compras', CFG: 'reidi_config', PASSO: 5000,
  /* alíquotas de PIS/COFINS escolhidas pelo lançador (3,65% e 9,25%) e fator da economia TEÓRICA: valor original × alíquota × 90% */
  ALIQ: [0.0365, 0.0925], FATOR: 0.9,
  teor(vo, pc) { return (+vo || 0) * (+pc || 0) * this.FATOR },
  L: [], C: null, Ct: '', ok: false, ouv: [], _ch: null, _tm: null, _sig: '', _busy: false, _again: false,
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  /* linha do banco → formato usado pelos módulos */
  de(r) { return { id: r.id, f: r.fornecedor, i: r.item || '', cat: r.categoria || '', ped: r.pedido || '', dt: String(r.data_prevista).slice(0, 10), pc: +r.pc, rp: r.responsavel || '', vo: +r.valor_original, vn: +r.valor_negociado, ba: String(r.data_base || r.data_prevista).slice(0, 10), st: r.status == 'Pago' ? 'Pago' : 'A pagar', cp: r.criado_por || '', cn: r.criado_por_nome || '', ce: r.criado_em || '', an: r.atualizado_por_nome || '', ae: r.atualizado_em || '' } },
  para(x) { return { fornecedor: String(x.f || '').trim(), item: String(x.i || '').trim(), categoria: String(x.cat || '').trim() || 'Previsão', pedido: String(x.ped || '').trim(), data_prevista: x.dt, pc: +x.pc, responsavel: String(x.rp || '').trim(), valor_original: Math.round(x.vo * 100) / 100, valor_negociado: Math.round(x.vn * 100) / 100, data_base: x.ba, status: x.st == 'Pago' ? 'Pago' : 'A pagar' } },
  async carregar() {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const q = await c.from(this.T).select('*').order('data_prevista', { ascending: true }).order('criado_em', { ascending: true }); if (q.error) throw q.error;
      const L = (q.data || []).map(r => this.de(r)); let C = null, Ct = '';
      try { const r = await BASE.ler(this.CFG); if (r && r.dados) { C = r.dados; Ct = r.atualizado_em || '' } } catch (e) { } /* o Lançador também lê os parâmetros (reidi_config) para ver o relatório */
      const sig = JSON.stringify([L.map(x => [x.id, x.ae]), Ct]), mudou = sig != this._sig;
      this.L = L; this.C = C; this.Ct = Ct; this.ok = true; this._sig = sig; this.iniciar(); if (mudou) this.avisa(); return mudou
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  /* fn é chamada quando algo muda; vis() diz se a tela daquele módulo está aberta (só então confere a cada 30 s) */
  on(fn, vis) { this.ouv.push({ fn, vis: vis || (() => true) }) },
  iniciar() {
    if (this._tm) return; const c = this.cli(); if (!c) return;
    try { this._ch = c.channel('reidi-compras').on('postgres_changes', { event: '*', schema: 'public', table: this.T }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
    this._tm = setInterval(() => { if (document.hidden || !this.ouv.some(o => { try { return o.vis() } catch (e) { return false } })) return; this.carregar().catch(() => { }) }, 30000)
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
  async gravarConfig(cfg) { const r = await BASE.gravar(this.CFG, cfg, 'parâmetros do REIDI'); this.C = cfg; this.Ct = r.atualizado_em || ''; this._sig = ''; return r },
  /* ---------- parâmetros padrão e utilidades de data ---------- */
  hoje() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
  cfg() { const C = this.C || {}, h = this.hoje(); return { doc: C.doc || '', ref: C.ref || h.slice(0, 8) + '01', hor: +C.hor || 30, saldo: +C.saldo || 0, resp: C.resp || { el: 'Financeiro do Consórcio', cf: 'Gerente Administrativo Financeiro (GAF)', d: ['Diretor Belov', 'Diretor Carioca', 'Diretor CTC'] } } },
  /* data de pagamento: dia 1–15 → dia 15; 16–fim → último dia do mês */
  pagto(iso, d1 = 15) { const d = +iso.slice(8); return d <= d1 ? iso.slice(0, 8) + String(d1).padStart(2, '0') : iso.slice(0, 8) + new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate() },
  /* ---------- exportar a planilha no modelo "Projeção Mensal de Compras REIDI" ---------- */
  serial(iso) { return Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5) }
};
