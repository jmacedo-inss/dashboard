/* Cliente Supabase compartilhado entre / (login), /dashboard e /express.
   Requer que a biblioteca oficial do Supabase já tenha sido carregada
   antes deste script:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

   Como o login da tela só pede "usuário" (não e-mail), a função entrar()
   primeiro traduz usuário -> e-mail usando a view pública login_lookup,
   e só depois faz o login de verdade no Supabase Auth. */
(function(){
  const SUPABASE_URL = 'https://szfpbnbzcbumzokftyub.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_wzi3ek8BXkfVwuJ65olvKA_VYZn9HVM';

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  async function entrar(usuario, senha){
    usuario = String(usuario || '').trim();
    if(!usuario || !senha) return { ok:false, error:'Preencha usuário e senha.' };

    const { data: lookup } = await client
      .from('login_lookup')
      .select('email')
      .eq('usuario', usuario)
      .maybeSingle();

    if(!lookup || !lookup.email){
      return { ok:false, error:'Usuário ou senha incorretos.' };
    }

    const { error } = await client.auth.signInWithPassword({ email: lookup.email, password: senha });
    if(error){
      return { ok:false, error:'Usuário ou senha incorretos.' };
    }

    const perfil = await buscarPerfil();
    if(!perfil){
      await client.auth.signOut();
      return { ok:false, error:'Login feito, mas não achei seu cadastro em "usuarios". Fala com o admin.' };
    }
    return { ok:true, perfil };
  }

  async function buscarPerfil(){
    const { data: userData } = await client.auth.getUser();
    if(!userData || !userData.user) return null;

    const { data: perfil, error } = await client
      .from('usuarios')
      .select('id, nome, usuario, nivel, unidade_id, id_consultor')
      .eq('auth_id', userData.user.id)
      .maybeSingle();
    if(error || !perfil) return null;

    let unidade = null;
    if(perfil.unidade_id){
      const { data: u } = await client.from('unidades').select('*').eq('id', perfil.unidade_id).maybeSingle();
      unidade = u || null;
    }
    return Object.assign({}, perfil, { unidade: unidade });
  }

  async function sessaoAtual(){
    const { data } = await client.auth.getSession();
    return data ? data.session : null;
  }

  async function sair(){
    await client.auth.signOut();
  }

  window.SupabaseShared = { client, entrar, sair, buscarPerfil, sessaoAtual };
})();
