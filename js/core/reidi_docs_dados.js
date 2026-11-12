/* Dados dos "Documentos assinados" do REIDI no Supabase — usado pelo botão "Doc. Assinados" do relatório REIDI (js/modulos/reidi_docs.js).
   • public.reidi_docs_assinados → um registro por arquivo anexado: nome, tipo, tamanho, quem anexou e quando (autor e data são carimbados pelo banco;
     cada anexo e cada exclusão vai para a Auditoria por gatilho).
   • Storage · bucket PRIVADO "reidi-docs-assinados" → os arquivos (PDF, PNG, JPG ou WEBP, até 10 MB). O arquivo anexado NUNCA é sobrescrito nem alterado:
     para trocar, exclui-se e anexa-se de novo.
   Quem pode: SÓ o administrador (regras do banco: RLS na tabela e no armazenamento). Instalação: supabase/reidi-docs-assinados.sql.
   Depende de supabase.js (sb_) e app.js (saveAs). */
const RDOC = {
  T: 'reidi_docs_assinados', BK: 'reidi-docs-assinados', MAXB: 10 * 1024 * 1024,
  EXT: { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' },
  ROT: { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP' },
  /* L = a lista lida do banco (mais recente primeiro) · ok = a última leitura deu certo · falta = a tabela não existe (SQL não rodado) · erro = texto do último erro de leitura */
  L: [], ok: false, falta: false, erro: '',
  cli() { return typeof sb_ != 'undefined' && sb_ ? sb_ : null },
  ext(n) { const m = String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : '' },
  uid() { const a = new Uint8Array(16); (self.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join('') },
  /* nome mostrado na lista: sem barras nem caracteres de controle, no máximo 150 caracteres (fica o final, onde está a extensão) */
  nome(n) { return String(n || 'documento').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(-150) || 'documento' },
  tam(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB' },
  faltaTabela(e) { return /PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(String((e && (e.message || e.error_description || e.error)) || e || '') + ' ' + String((e && (e.code || e.statusCode)) || '')) },
  /* mensagens do banco / armazenamento em português */
  msg(e) {
    const tx = v => (typeof v == 'string' ? v : ''),
      m = typeof e == 'string' ? e : (e ? tx(e.message) || tx(e.error_description) || tx(e.error) : ''), cd = String((e && (e.code || e.statusCode)) || ''), t = m + ' ' + cd;
    if (this.faltaTabela(e)) return 'O Doc. Assinados ainda não foi instalado no banco: execute supabase/reidi-docs-assinados.sql no Supabase.';
    if (/bucket not found/i.test(m)) return 'O armazenamento dos documentos assinados ainda não foi criado. Execute supabase/reidi-docs-assinados.sql no Supabase.';
    if (/reidi_docs_assinados_nome_check/i.test(m)) return 'O nome do arquivo deve ter de 1 a 200 caracteres.';
    if (/reidi_docs_assinados_tipo_check|mime type|not supported|invalid_mime/i.test(m)) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (/reidi_docs_assinados_bytes_check|maximum allowed size|too large|payload/i.test(m)) return 'O arquivo passa do limite de 10 MB.';
    if (/jwt|PGRST301|auth session missing|exp claim/i.test(t)) return 'Sua sessão expirou. Entre de novo no sistema.';
    if (/row-level security|42501|permission denied|not authorized|unauthorized|Sem permiss/i.test(t)) return 'Sem permissão para esta operação.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    return m || 'Falha inesperada.'
  },
  /* confere o arquivo escolhido ANTES de enviar → texto do problema ou '' */
  validar(file) {
    if (!file) return 'Selecione o arquivo.';
    if (!this.EXT[this.ext(file.name)]) return 'Tipo de arquivo não aceito. Envie PDF, PNG, JPG ou WEBP.';
    if (!file.size) return 'O arquivo está vazio.';
    if (file.size > this.MAXB) return 'O arquivo tem ' + this.tam(file.size) + ' e passa do limite de 10 MB.';
    return ''
  },
  /* linha do banco → formato usado pela tela */
  de(r) { return { id: r.id, nome: r.nome || 'documento', path: r.path || '', tipo: r.tipo || '', bytes: +r.bytes || 0, por: r.criado_por_nome || '', em: r.criado_em || '' } },
  ordena() { this.L.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0) || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0) || (a.id < b.id ? -1 : 1)) },
  /* uma chamada ao Supabase: falha de rede lançada como exceção vira { error } igual às demais (a tela mostra a mesma mensagem em português) */
  async via(fn) { try { return await fn() } catch (e) { return { data: null, error: e } } },
  /* lê a lista do banco (o RLS só entrega para administrador) */
  async carregar() {
    const c = this.cli(); if (!c) { this.ok = false; this.erro = 'Supabase não configurado'; throw new Error(this.erro) }
    const r = await this.via(() => c.from(this.T).select('id,nome,path,tipo,bytes,criado_por_nome,criado_em').order('criado_em', { ascending: false }));
    if (r.error) { this.ok = false; this.falta = this.faltaTabela(r.error); this.erro = this.msg(r.error); throw new Error(this.erro) }
    this.L = (r.data || []).map(x => this.de(x)); this.ordena(); this.ok = true; this.falta = false; this.erro = ''; return this.L
  },
  async limpar(path) { if (path) { try { await this.cli().storage.from(this.BK).remove([path]) } catch (e) { } } },
  /* sobe o arquivo e grava o registro; se o registro falhar, desfaz o upload. Devolve o documento (formato da tela). Não relê a lista: quem anexa vários chama carregar() no fim */
  async anexar(file) {
    const er = this.validar(file); if (er) throw new Error(er);
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const e = this.ext(file.name), path = this.uid() + '.' + e, tipo = this.EXT[e];
    const u = await this.via(() => c.storage.from(this.BK).upload(path, file, { contentType: tipo, cacheControl: '3600', upsert: false }));
    if (u.error) throw new Error(this.msg(u.error));
    const r = await this.via(() => c.from(this.T).insert({ nome: this.nome(file.name), path, tipo, bytes: file.size }).select().single());
    if (r.error) { await this.limpar(path); throw new Error(this.msg(r.error)) }
    const d = this.de(r.data); this.L = this.L.filter(x => x.id != d.id).concat(d); this.ordena(); return d
  },
  /* exclui o registro e, depois, o arquivo (este em melhor esforço) */
  async excluir(id) {
    const a = this.L.find(x => x.id == id), c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await this.via(() => c.from(this.T).delete().eq('id', id).select());
    if (r.error) throw new Error(this.msg(r.error));
    if (!r.data || !r.data.length) { await this.carregar().catch(() => { }); throw new Error('Não excluí: o documento já tinha sido excluído ou você não tem permissão para excluir.') }
    await this.limpar(a ? a.path : (r.data[0] && r.data[0].path));
    this.L = this.L.filter(x => x.id != id)
  },
  /* ---------- abrir / baixar (só o administrador recebe o arquivo: regra do armazenamento) ---------- */
  async blob(path) {
    const c = this.cli(); if (!c) throw new Error('Supabase não configurado');
    const r = await this.via(() => c.storage.from(this.BK).download(path)); if (r.error) throw new Error(this.msg(r.error)); return r.data
  },
  async baixar(path, nome) { await saveAs(nome || 'documento', await this.blob(path)) }
};
