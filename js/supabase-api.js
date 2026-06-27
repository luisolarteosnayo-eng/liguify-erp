// ============================================================================
//  Liguify ERP — Capa de conexión y autenticación con Supabase
//  Requiere: @supabase/supabase-js v2 (CDN) y js/supabase-config.js antes.
//  Expone window.LiguifyDB con auth + acceso a datos (todo async).
// ============================================================================
(function () {
  const URL = window.SUPABASE_URL, KEY = window.SUPABASE_ANON_KEY;
  const configurado = URL && KEY && !URL.includes('TU-PROYECTO') && !KEY.includes('TU-ANON');

  if (!configurado) {
    console.warn('[Liguify] Supabase no configurado: pega tu URL y anon key en js/supabase-config.js');
  }
  if (!window.supabase) {
    console.error('[Liguify] Falta el SDK de Supabase. Agrega el <script> del CDN @supabase/supabase-js@2.');
  }

  const sb = (configurado && window.supabase)
    ? window.supabase.createClient(URL, KEY)
    : null;

  // --------------------------------------------------------------------------
  //  AUTENTICACIÓN
  // --------------------------------------------------------------------------
  const auth = {
    // Registro con correo + contraseña. nombre opcional → metadata.
    async signUpEmail(email, password, nombre) {
      return sb.auth.signUp({
        email, password,
        options: { data: { full_name: nombre || '' } }
      });
    },
    async signInEmail(email, password) {
      return sb.auth.signInWithPassword({ email, password });
    },
    // OAuth Google (redirige y vuelve a redirectTo).
    async signInGoogle(redirectTo) {
      return sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo || window.location.href }
      });
    },
    async signOut() { return sb.auth.signOut(); },
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    async getUser() { const { data } = await sb.auth.getUser(); return data.user; },
    // Notifica cambios de sesión (login/logout) → callback(session)
    onChange(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session)); },
  };

  // Perfil del usuario logueado (rol, org_id, es_admin_plataforma)
  async function getProfile() {
    const user = await auth.getUser();
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) { console.error(error); return null; }
    return data;
  }

  // Onboarding: crea la organización y deja al usuario como su organizador.
  // nombre = nombre de la organización · contacto = nombre de la persona
  async function completeOnboarding({ nombre, contacto, ruc, telefono, plan }) {
    const user = await auth.getUser();
    if (!user) throw new Error('Sin sesión');
    const { data: org, error: e1 } = await sb.from('organizaciones')
      .insert({ nombre, ruc, telefono, email: user.email, plan: plan || 'free',
                contacto: contacto || '', owner_user_id: user.id })
      .select().single();
    if (e1) throw e1;
    const { error: e2 } = await sb.from('profiles')
      .update({ org_id: org.id, rol: 'organizador', pendiente: false,
                nombre: contacto || nombre })
      .eq('id', user.id);
    if (e2) throw e2;
    return org;
  }

  // --------------------------------------------------------------------------
  //  CARGA DE DATOS — trae todo lo visible para el usuario/organización.
  //  RLS ya filtra por org en el servidor; el admin recibe todo.
  //  Devuelve un objeto con la misma forma que el estado `S` del mockup.
  // --------------------------------------------------------------------------
  async function loadAll() {
    const tablas = ['organizaciones','profiles','categorias','complejos','medios_pago',
                    'clubes','torneos','torneo_categorias','equipos','pagos'];
    const out = {};
    for (const t of tablas) {
      const { data, error } = await sb.from(t).select('*');
      if (error) { console.error('[Liguify] load', t, error); out[t] = []; }
      else out[t] = data;
    }
    return out;
  }

  // --------------------------------------------------------------------------
  //  MUTACIONES clave (devuelven la fila creada/actualizada)
  // --------------------------------------------------------------------------
  const data = {
    loadAll,

    async crearTorneo(torneo, cats) {
      const { data: t, error } = await sb.from('torneos').insert(torneo).select().single();
      if (error) throw error;
      if (cats?.length) {
        const filas = cats.map(c => ({ ...c, torneo_id: t.id, org_id: torneo.org_id }));
        const { error: e2 } = await sb.from('torneo_categorias').insert(filas);
        if (e2) throw e2;
      }
      return t;
    },

    async inscribirEquipo(equipo) {
      const { data, error } = await sb.from('equipos').insert(equipo).select().single();
      if (error) throw error; return data;
    },

    // Registra un pago en estado 'pendiente' (voucher obligatorio: voucher_url).
    async registrarPago(pago) {
      const user = await auth.getUser();
      const fila = { ...pago, estado: 'pendiente', created_by: user?.id };
      const { data, error } = await sb.from('pagos').insert(fila).select().single();
      if (error) throw error;
      await sb.from('pago_log').insert({ pago_id: data.id, accion: 'registrado',
        actor: user?.id, org_id: pago.org_id });
      return data;
    },

    async aprobarPago(pagoId, orgId, medio) {
      const user = await auth.getUser();
      const upd = { estado: 'aprobado', processed_by: user?.id, processed_at: new Date().toISOString() };
      if (medio) upd.medio = medio;
      const { data, error } = await sb.from('pagos').update(upd).eq('id', pagoId).select().single();
      if (error) throw error;
      await sb.from('pago_log').insert({ pago_id: pagoId, accion: 'aprobado', actor: user?.id, org_id: orgId });
      return data;
    },

    async rechazarPago(pagoId, orgId, motivo) {
      const user = await auth.getUser();
      const { data, error } = await sb.from('pagos')
        .update({ estado: 'rechazado', motivo, processed_by: user?.id, processed_at: new Date().toISOString() })
        .eq('id', pagoId).select().single();
      if (error) throw error;
      await sb.from('pago_log').insert({ pago_id: pagoId, accion: 'rechazado', actor: user?.id, motivo, org_id: orgId });
      return data;
    },

    async crearClub(club) {
      const { data, error } = await sb.from('clubes').insert(club).select().single();
      if (error) throw error; return data;
    },

    async guardarMedio(medio, editId) {
      if (editId) {
        const { data, error } = await sb.from('medios_pago').update(medio).eq('id', editId).select().single();
        if (error) throw error; return data;
      }
      const { data, error } = await sb.from('medios_pago').insert(medio).select().single();
      if (error) throw error; return data;
    },

    async toggleMedio(id, activo) {
      const { data, error } = await sb.from('medios_pago').update({ activo }).eq('id', id).select().single();
      if (error) throw error; return data;
    },

    async crearCategoria(cat) {
      const { data, error } = await sb.from('categorias').insert(cat).select().single();
      if (error) throw error; return data;
    },

    // Sube el voucher al bucket 'vouchers' y devuelve una URL firmada.
    async subirVoucher(file, orgId) {
      const path = `${orgId}/${Date.now()}_${file.name}`;
      const { error } = await sb.storage.from('vouchers').upload(path, file);
      if (error) throw error;
      const { data } = await sb.storage.from('vouchers').createSignedUrl(path, 60 * 60 * 24 * 365);
      return data?.signedUrl || path;
    },
  };

  window.LiguifyDB = { configurado, client: sb, auth, getProfile, completeOnboarding, data };
})();
