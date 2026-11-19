/* Dados da coluna "Status" da tabela Detalhamento do Fundo de Reserva — usado por js/modulos/fundo_reserva.js.
   • public.fundo_status → o status de cada NF: "Aguardando Aprovação", "Transferido" ou "A Receber". Uma linha por NF, chave = DOC FISCAL (texto, com os zeros);
     NF sem DOC FISCAL usa a Data_Base (AAAA-MM-DD). Fica numa tabela PRÓPRIA porque a base do Fundo de Reserva é trocada a cada publicação da planilha.
   • NF sem registro = status ainda não definido. Escolher "— sem status —" apaga o registro.
   Quem VÊ: quem pode ver o Fundo de Reserva (fundo.ver). Quem ALTERA: só o administrador (regras do banco: RLS). Cada mudança vai para a Auditoria (gatilho no banco).
   Instalação: supabase/fundo-status.sql. Sem ele a coluna continua na tabela, mas sem valores (e o administrador recebe o aviso para rodar o SQL).
   Depende de supabase.js (sb_). */
const FSD = {
  T: 'fundo_status',
  /* as três opções, na ordem da lista */
  OP: [{ id: 'aguardando', nome: 'Aguardando Aprovação' }, { id: 'transferido', nome: 'Transferido' }, { id: 'a_receber', nome: 'A Receber' }],
  /* M = { chave: { s: código, por: quem alterou, em: quando } } · ok = a última leitura deu certo · falta = a tabela não existe (SQL não rodado) · erro = texto do último erro de leitura */
  M: {}, ok: false, falta: false, erro: '', ouv: [], _ch: null, _busy: false, _again: false, _sig: '',
  rot(id) { const o = this.OP.find(x => x.id == id); return o ? o.nome : '' },
  valido(id) { return this.OP.some(x => x.id == id) },
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  /* chave da NF: o DOC FISCAL (texto) ou, sem ele, a Data_Base */
  chave(x) { const t = String(x && x.titulo != null ? x.titulo : '').trim(); return t || String((x && x.d) || '') },
  faltaTabela(e) { return /PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(String((e && (e.message || e.error_description || e.error)) || e || '') + ' ' + String((e && (e.code || e.statusCode)) || '')) },
  msg(e) {
    const tx = v => (typeof v == 'string' ? v : ''), m = typeof e == 'string' ? e : (e ? tx(e.message) || tx(e.error_description) || tx(e.error) : ''), cd = String((e && (e.code || e.statusCode)) || ''), t = m + ' ' + cd;
    if (this.faltaTabela(e)) return 'O Status ainda não foi instalado no banco: execute supabase/fundo-status.sql no Supabase.';
    if (/fundo_status_status_check/i.test(m)) return 'Escolha um status: Aguardando Aprovação, Transferido ou A Receber.';
    if (/fundo_status_chave_check/i.test(m)) return 'Esta NF não tem um identificador válido (DOC FISCAL ou Data_Base).';
    if (/jwt|PGRST301|auth session missing|exp claim/i.test(t)) return 'Sua sessão expirou. Entre de novo no sistema.';
    if (/row-level security|42501|permission denied|not authorized|unauthorized|Sem permiss/i.test(t)) return 'Sem permissão: só o administrador altera o status.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    return m || 'Falha inesperada.'
  },
  /* uma chamada ao Supabase: falha de rede lançada como exceção vira { error } igual às demais */
  async via(fn) { try { return await fn() } catch (e) { return { data: null, error: e } } },
  /* lê todos os status (o RLS só entrega a quem pode ver o Fundo de Reserva). Devolve true se algo mudou desde a leitura anterior. */
  async carregar() {
    const c = this.cli(); if (!c) { this.ok = false; this.erro = 'Supabase não configurado'; throw new Error(this.erro) }
    if (this._busy) { this._again = true; return false } this._busy = true;
    try {
      const r = await this.via(() => c.from(this.T).select('chave,status,atualizado_por_nome,atualizado_em'));
      if (r.error) { this.ok = false; this.falta = this.faltaTabela(r.error); this.erro = this.msg(r.error); this._sig = ''; this.avisa(); throw new Error(this.erro) }
      const M = {}; (r.data || []).forEach(x => { if (this.valido(x.status)) M[String(x.chave)] = { s: x.status, por: x.atualizado_por_nome || '', em: x.atualizado_em || '' } });
      const sig = JSON.stringify(Object.keys(M).sort().map(k => [k, M[k].s, M[k].em])), mudou = sig != this._sig || !this.ok;
      this.M = M; this.ok = true; this.falta = false; this.erro = ''; this._sig = sig; this.iniciar(); if (mudou) this.avisa(); return mudou
    } finally { this._busy = false; if (this._again) { this._again = false; this.carregar().catch(() => { }) } }
  },
  avisa() { this.ouv.forEach(o => { try { o.fn() } catch (e) { console.error(e) } }) },
  on(fn) { this.ouv.push({ fn }) },
  iniciar() {
    if (this._ch) return; const c = this.cli(); if (!c || typeof c.channel != 'function') return;
    try { this._ch = c.channel('fundo-status').on('postgres_changes', { event: '*', schema: 'public', table: this.T }, () => this.carregar().catch(() => { })).subscribe() } catch (e) { }
  },
  /* grava o status da NF (só o administrador; o banco confere). status '' = apagar o registro (volta a "sem status"). Atualiza a memória só depois que o banco confirmou. */
  async definir(chave, status) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    chave = String(chave || '').trim(); if (!chave) throw new Error('Esta NF não tem um identificador válido (DOC FISCAL ou Data_Base).');
    if (status !== '' && !this.valido(status)) throw new Error('Escolha um status: Aguardando Aprovação, Transferido ou A Receber.');
    if (status === '') {
      const r = await this.via(() => c.from(this.T).delete().eq('chave', chave).select());
      if (r.error) throw new Error(this.msg(r.error));
      /* o RLS não dá erro no DELETE de quem não pode: a linha só não aparece no retorno. Se o status existia na tela e nada foi apagado, a mudança NÃO valeu */
      if ((!r.data || !r.data.length) && this.M[chave]) { await this.carregar().catch(() => { }); throw new Error('Não removi o status: ele já tinha sido removido ou você não tem permissão (só o administrador altera).') }
      delete this.M[chave]; this._sig = ''; return null
    }
    const r = await this.via(() => c.from(this.T).upsert({ chave, status }, { onConflict: 'chave' }).select().single());
    if (r.error) throw new Error(this.msg(r.error));
    const d = r.data || {}; this.M[chave] = { s: d.status || status, por: d.atualizado_por_nome || '', em: d.atualizado_em || '' }; this._sig = ''; return this.M[chave]
  }
};
