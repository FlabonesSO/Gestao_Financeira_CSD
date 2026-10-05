// Edge Function: admin-usuarios — única parte que usa a chave service_role (fica no servidor, nunca no site).
// Ações (campo "a"): create | update | reset | toggle | delete. Só administradores ativos podem chamar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const LRX = /^[a-z0-9._-]{3,30}$/
const pwOk = (p: unknown) => typeof p === 'string' && p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p)
const DOMAIN = Deno.env.get('EMAIL_DOMAIN') ?? 'csd.example.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Não autenticado.' }, 401)

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await db.from('perfis').select('login,papel,ativo').eq('id', user.id).single()
    if (!me || me.papel !== 'admin' || !me.ativo) return json({ error: 'Acesso negado.' }, 403)

    const b = await req.json()
    const log = (e: string) => db.from('auditoria').insert({ usuario: me.login, evento: e })
    const alvo = async (id: string) => {
      const { data } = await db.from('perfis').select('id,login,papel,ativo').eq('id', id).single()
      if (!data) throw new Error('Usuário não encontrado.')
      return data
    }
    // garante que sobre ao menos 1 administrador ativo além do alvo
    const outroAdmin = async (id: string) => {
      const { count } = await db.from('perfis').select('id', { count: 'exact', head: true })
        .eq('papel', 'admin').eq('ativo', true).neq('id', id)
      return (count ?? 0) > 0
    }
    const perfilAdminAtivo = (t: { papel: string; ativo: boolean }) => t.papel === 'admin' && t.ativo
    const MANTER = 'É preciso manter ao menos um administrador ativo.'

    if (b.a === 'create') {
      const l = String(b.l ?? '').toLowerCase(), n = String(b.n ?? '').trim()
      if (!LRX.test(l)) return json({ error: 'Login inválido.' }, 400)
      if (!n) return json({ error: 'Informe o nome.' }, 400)
      if (!['admin', 'viewer'].includes(b.r)) return json({ error: 'Perfil inválido.' }, 400)
      if (!pwOk(b.pw)) return json({ error: 'A senha deve ter ao menos 8 caracteres, com letras e números.' }, 400)
      const { data: ex } = await db.from('perfis').select('id').eq('login', l).maybeSingle()
      if (ex) return json({ error: 'Esse usuário já existe.' }, 400)
      const { data: cu, error: e1 } = await db.auth.admin.createUser({
        email: `${l}@${DOMAIN}`, password: b.pw, email_confirm: true,
      })
      if (e1 || !cu.user) return json({ error: 'Não foi possível criar o usuário: ' + (e1?.message ?? '') }, 400)
      const { error: e2 } = await db.from('perfis').insert({ id: cu.user.id, login: l, nome: n, papel: b.r, mc: !!b.mc })
      if (e2) { await db.auth.admin.deleteUser(cu.user.id); return json({ error: 'Falha ao gravar o perfil: ' + e2.message }, 400) }
      await log('criou ' + l)
      return json({ ok: true })
    }

    const t = await alvo(String(b.id))

    if (b.a === 'update') {
      const n = String(b.n ?? '').trim()
      if (!n) return json({ error: 'Informe o nome.' }, 400)
      if (!['admin', 'viewer'].includes(b.r)) return json({ error: 'Perfil inválido.' }, 400)
      if (t.id === user.id && b.r !== t.papel) return json({ error: 'Você não pode alterar o próprio perfil.' }, 400)
      if (perfilAdminAtivo(t) && b.r !== 'admin' && !(await outroAdmin(t.id))) return json({ error: MANTER }, 400)
      await db.from('perfis').update({ nome: n, papel: b.r }).eq('id', t.id)
      await log('editou ' + t.login)
      return json({ ok: true })
    }

    if (b.a === 'reset') {
      if (!pwOk(b.pw)) return json({ error: 'A senha deve ter ao menos 8 caracteres, com letras e números.' }, 400)
      const { error } = await db.auth.admin.updateUserById(t.id, { password: b.pw })
      if (error) return json({ error: 'Não foi possível redefinir: ' + error.message }, 400)
      await db.from('perfis').update({ mc: !!b.mc && t.id !== user.id }).eq('id', t.id)
      await log('redefiniu senha de ' + t.login)
      return json({ ok: true })
    }

    if (b.a === 'toggle') {
      if (t.id === user.id) return json({ error: 'Você não pode desativar o próprio usuário.' }, 400)
      if (perfilAdminAtivo(t) && !(await outroAdmin(t.id))) return json({ error: MANTER }, 400)
      const ativo = !t.ativo
      // ban impede novos logins e renovação de sessão; "none" remove o bloqueio
      const { error } = await db.auth.admin.updateUserById(t.id, { ban_duration: ativo ? 'none' : '876000h' })
      if (error) return json({ error: error.message }, 400)
      await db.from('perfis').update({ ativo }).eq('id', t.id)
      await log((ativo ? 'ativou ' : 'desativou ') + t.login)
      return json({ ok: true })
    }

    if (b.a === 'delete') {
      if (t.id === user.id) return json({ error: 'Você não pode excluir o próprio usuário.' }, 400)
      if (perfilAdminAtivo(t) && !(await outroAdmin(t.id))) return json({ error: MANTER }, 400)
      const { error } = await db.auth.admin.deleteUser(t.id) // perfis some em cascata
      if (error) return json({ error: error.message }, 400)
      await log('excluiu ' + t.login)
      return json({ ok: true })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message || 'Erro interno.' }, 500)
  }
})
