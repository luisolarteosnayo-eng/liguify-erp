// ============================================================================
// 💬 torneos-whatsapp-enviar · Supabase Edge Function (Deno) — Liguify Torneos
// Gemela de 'whatsapp-enviar' (Academias): mismo número de WhatsApp (Cloud API
// de Meta) y mismos secretos, pero lee/escribe el esquema public de Torneos y
// usa una plantilla propia.
//  · accion 'texto'    → respuesta libre desde la bandeja (ventana de 24h abierta)
//  · accion 'cobranza' → plantilla aprobada de recordatorio a 1 número
//
// DESPLIEGUE: Edge Functions → Deploy new function → nombre: torneos-whatsapp-enviar
// (Verify JWT activado: siempre se llama con la sesión del usuario).
//
// SECRETOS (ya existen por Academias): WHATSAPP_TOKEN · WHATSAPP_PHONE_ID
//   WHATSAPP_TPL_COBRANZA_TORNEOS (opcional, default 'cobranza_torneos'; en
//   pruebas con el número de test de Meta usar 'hello_world')
// Plantilla cobranza_torneos (es_PE), variables: {{1}} contacto · {{2}} club ·
//   {{3}} monto · {{4}} torneo · {{5}} medios de pago
// ============================================================================

const GRAPH = 'https://graph.facebook.com/v21.0';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const TOKEN = Deno.env.get('WHATSAPP_TOKEN');
    const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');
    if (!TOKEN || !PHONE_ID) return json({ error: 'Faltan los secretos WHATSAPP_TOKEN / WHATSAPP_PHONE_ID' }, 500);
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Falta la sesión del usuario' }, 401);

    // Lecturas con el token del usuario (RLS = su organización) · escrituras con service role
    const apiUser = async (path: string) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: auth } });
      const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error((b && b.message) || `Error ${r.status}`);
      return b;
    };
    const dbWrite = async (method: string, path: string, body: unknown) => {
      await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      });
    };
    const quien = await (async () => {
      try {
        const u = await (await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } })).json();
        return (u && u.email) ? String(u.email).split('@')[0] : 'staff';
      } catch { return 'staff'; }
    })();

    const body = await req.json();
    const wa = async (payload: unknown) => {
      const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload as object }),
      });
      const rb = await r.json().catch(() => null);
      if (!r.ok) throw new Error((rb && rb.error && rb.error.message) || `Meta ${r.status}`);
      return rb && rb.messages && rb.messages[0] && rb.messages[0].id;
    };

    if (body.accion === 'texto') {
      const { conversacion_id, texto } = body;
      if (!conversacion_id || !(texto || '').trim()) return json({ error: 'Faltan conversacion_id o texto' }, 400);
      const [c] = await apiUser(`wsp_conversaciones?id=eq.${conversacion_id}&select=id,org_id,telefono,ultimo_entrante_at`);
      if (!c) return json({ error: 'Conversación no encontrada (¿es de tu organización?)' }, 403);
      const abierta = c.ultimo_entrante_at && (Date.now() - new Date(c.ultimo_entrante_at).getTime()) < 24 * 3600 * 1000;
      if (!abierta) return json({ error: 'La ventana de 24h está cerrada: el cliente no escribió en el último día. Usa el recordatorio (plantilla) o espera su mensaje.' }, 400);
      const waId = await wa({ to: c.telefono, type: 'text', text: { body: String(texto).slice(0, 4000) } });
      await dbWrite('POST', 'wsp_mensajes', { conversacion_id: c.id, org_id: c.org_id, direccion: 'out', tipo: 'texto',
        cuerpo: texto, wa_id: waId || null, enviado_por: quien, estado: 'sent' });
      await dbWrite('PATCH', `wsp_conversaciones?id=eq.${c.id}`,
        { ultimo_mensaje: String(texto).slice(0, 120), ultimo_mensaje_at: new Date().toISOString(), no_leidos: 0 });
      return json({ ok: true, wa_id: waId });
    }

    if (body.accion === 'cobranza') {
      const { telefono, variables, plantilla, club_id } = body;
      const to = String(telefono || '').replace(/\D/g, '');
      if (!to || !Array.isArray(variables)) return json({ error: 'Faltan telefono o variables' }, 400);
      // El usuario debe poder ver el club (RLS = su organización): por id, o por teléfono del club / del contacto
      const last9 = to.slice(-9);
      let [club] = club_id ? await apiUser(`clubes?id=eq.${club_id}&select=id,org_id,nombre,delegado`) : [null];
      if (!club) [club] = await apiUser(`clubes?select=id,org_id,nombre,delegado&telefono_norm=like.*${last9}&limit=1`);
      if (!club) {
        const [eq] = await apiUser(`equipos?select=club_id&contacto_tel_norm=like.*${last9}&estado=eq.activo&limit=1`);
        if (eq) [club] = await apiUser(`clubes?id=eq.${eq.club_id}&select=id,org_id,nombre,delegado`);
      }
      if (!club) return json({ error: 'El teléfono no corresponde a un club de tu organización' }, 403);
      const tpl = plantilla || Deno.env.get('WHATSAPP_TPL_COBRANZA_TORNEOS') || 'cobranza_torneos';
      const payload = tpl === 'hello_world'
        ? { to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }
        : { to, type: 'template', template: { name: tpl, language: { code: 'es_PE' },
            components: [{ type: 'body', parameters: variables.map((v: unknown) => ({ type: 'text', text: String(v).slice(0, 120) })) }] } };
      const waId = await wa(payload);
      // Registrar en la bandeja (crea la conversación si no existe)
      const org = club.org_id;
      let [conv] = await apiUser(`wsp_conversaciones?telefono=eq.${to}&org_id=eq.${org}&select=id&limit=1`);
      if (!conv) {
        await dbWrite('POST', 'wsp_conversaciones', { org_id: org, club_id: club.id, telefono: to, nombre: (variables[0] && String(variables[0])) || club.delegado || club.nombre });
        [conv] = await apiUser(`wsp_conversaciones?telefono=eq.${to}&org_id=eq.${org}&select=id&limit=1`);
      }
      if (conv) {
        await dbWrite('POST', 'wsp_mensajes', { conversacion_id: conv.id, org_id: org, direccion: 'out', tipo: 'plantilla',
          cuerpo: `[recordatorio de cobranza] ${variables.join(' · ')}`, wa_id: waId || null, enviado_por: quien, estado: 'sent' });
        await dbWrite('PATCH', `wsp_conversaciones?id=eq.${conv.id}`,
          { ultimo_mensaje: '🔔 Recordatorio de cobranza', ultimo_mensaje_at: new Date().toISOString() });
      }
      return json({ ok: true, wa_id: waId });
    }

    return json({ error: "Acción inválida: usa 'texto' o 'cobranza'" }, 400);
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
