// ============================================================================
// 💬 torneos-whatsapp-enviar · Supabase Edge Function (Deno) — Liguify Torneos
// Gemela de 'whatsapp-enviar' (Academias): mismo número de WhatsApp (Cloud API
// de Meta) y mismos secretos, pero lee/escribe el esquema public de Torneos y
// usa una plantilla propia.
//  · accion 'texto'    → respuesta libre desde la bandeja (ventana de 24h abierta)
//  · accion 'imagen'   → imagen pegada/adjuntada en la bandeja (ventana de 24h abierta)
//  · accion 'cobranza' → plantilla aprobada de recordatorio a 1 número
//
// DESPLIEGUE: Edge Functions → Deploy new function → nombre: torneos-whatsapp-enviar
// (Verify JWT activado: siempre se llama con la sesión del usuario).
//
// SECRETOS: WHATSAPP_TOKEN (compartido, mismo WABA) · WHATSAPP_PHONE_ID_TORNEOS
//   (el numero propio del ERP: +51 986 205 553; si falta, cae al de Academias)
//   WHATSAPP_TPL_COBRANZA_TORNEOS (opcional, default 'cobranza_torneos'; en
//   pruebas con el número de test de Meta usar 'hello_world')
// Plantilla cobranza_torneos (es_PE), 5 variables:
//   {{1}} contacto · {{2}} club · {{3}} monto total · {{4}} torneo · {{5}} medios de pago
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
    const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID_TORNEOS') || Deno.env.get('WHATSAPP_PHONE_ID');
    if (!TOKEN || !PHONE_ID) return json({ error: 'Faltan los secretos WHATSAPP_TOKEN / WHATSAPP_PHONE_ID_TORNEOS' }, 500);
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
    // Conversación propia (RLS) con la ventana de 24h abierta
    const convAbierta = async (conversacion_id: unknown) => {
      const [c] = await apiUser(`wsp_conversaciones?id=eq.${conversacion_id}&select=id,org_id,telefono,ultimo_entrante_at,marcada`);
      if (!c) return { error: json({ error: 'Conversación no encontrada (¿es de tu organización?)' }, 403) };
      const abierta = c.ultimo_entrante_at && (Date.now() - new Date(c.ultimo_entrante_at).getTime()) < 24 * 3600 * 1000;
      if (!abierta) return { error: json({ error: 'La ventana de 24h está cerrada: el cliente no escribió en el último día. Usa el recordatorio (plantilla) o espera su mensaje.' }, 400) };
      return { c };
    };
    // Responder NO borra la clasificación de cobranza; solo quita "sin respuesta"
    const marcaTrasResponder = (c: any) => (c.marcada === 'sin_respuesta' ? null : (c.marcada || null));

    if (body.accion === 'texto') {
      const { conversacion_id, texto } = body;
      if (!conversacion_id || !(texto || '').trim()) return json({ error: 'Faltan conversacion_id o texto' }, 400);
      const r = await convAbierta(conversacion_id); if (r.error) return r.error; const c = r.c;
      const waId = await wa({ to: c.telefono, type: 'text', text: { body: String(texto).slice(0, 4000) } });
      await dbWrite('POST', 'wsp_mensajes', { conversacion_id: c.id, org_id: c.org_id, direccion: 'out', tipo: 'texto',
        cuerpo: texto, wa_id: waId || null, enviado_por: quien, estado: 'sent' });
      await dbWrite('PATCH', `wsp_conversaciones?id=eq.${c.id}`,
        { ultimo_mensaje: String(texto).slice(0, 120), ultimo_mensaje_at: new Date().toISOString(), no_leidos: 0, marcada: marcaTrasResponder(c) });
      return json({ ok: true, wa_id: waId });
    }

    if (body.accion === 'imagen') {
      const { conversacion_id, imagen, texto } = body;
      const data = String(imagen || '');
      if (!conversacion_id || !/^data:image\//.test(data)) return json({ error: 'Faltan conversacion_id o imagen' }, 400);
      const r = await convAbierta(conversacion_id); if (r.error) return r.error; const c = r.c;
      const mime = data.slice(5, data.indexOf(';')) || 'image/jpeg';
      const bytes = Uint8Array.from(atob(data.split(',')[1] || ''), (ch) => ch.charCodeAt(0));
      if (!bytes.length) return json({ error: 'La imagen llegó vacía' }, 400);
      if (bytes.length > 4.5 * 1024 * 1024) return json({ error: 'La imagen supera el límite de WhatsApp (5 MB)' }, 400);
      const fd = new FormData();
      fd.append('messaging_product', 'whatsapp');
      fd.append('file', new Blob([bytes], { type: mime }), 'imagen.jpg');
      const up = await fetch(`${GRAPH}/${PHONE_ID}/media`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: fd });
      const ub = await up.json().catch(() => null);
      if (!up.ok || !ub || !ub.id) return json({ error: 'Meta rechazó la imagen: ' + ((ub && ub.error && ub.error.message) || up.status) }, 502);
      const cap = String(texto || '').trim();
      const waId = await wa({ to: c.telefono, type: 'image', image: cap ? { id: ub.id, caption: cap.slice(0, 1024) } : { id: ub.id } });
      // Copia al bucket privado 'vouchers' para que la bandeja pueda mostrarla
      let mediaPath = null;
      const ruta = `wsp/${c.id}/out-${Date.now()}.jpg`;
      const st = await fetch(`${SUPABASE_URL}/storage/v1/object/vouchers/${ruta}`, {
        method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
      });
      if (st.ok) mediaPath = `vstore:${ruta}`;
      await dbWrite('POST', 'wsp_mensajes', { conversacion_id: c.id, org_id: c.org_id, direccion: 'out', tipo: 'imagen',
        cuerpo: cap || null, media_path: mediaPath, wa_id: waId || null, enviado_por: quien, estado: 'sent' });
      await dbWrite('PATCH', `wsp_conversaciones?id=eq.${c.id}`,
        { ultimo_mensaje: '📷 Imagen', ultimo_mensaje_at: new Date().toISOString(), no_leidos: 0, marcada: marcaTrasResponder(c) });
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
      const vars = (variables as unknown[]).map((v) => String(v));
      const payload = tpl === 'hello_world'
        ? { to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }
        : { to, type: 'template', template: { name: tpl, language: { code: 'es_PE' },
            components: [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: v.slice(0, 120) })) }] } };
      const waId = await wa(payload);
      // Texto REAL que recibe el cliente: así la bandeja muestra lo mismo que su WhatsApp
      const cuerpoReal = tpl === 'hello_world'
        ? '[plantilla de prueba hello_world]'
        : `Hola ${vars[0]} 👋, le saludamos de VOM SPORT. Le recordamos que ${vars[1]} tiene un saldo pendiente de ${vars[2]} por la inscripción al torneo ${vars[3]}. Puede pagar por ${vars[4]} y enviarnos el voucher respondiendo a este mensaje. ¡Gracias! 🙌`;
      const org = club.org_id;
      let [conv] = await apiUser(`wsp_conversaciones?telefono=eq.${to}&org_id=eq.${org}&select=id&limit=1`);
      if (!conv) {
        await dbWrite('POST', 'wsp_conversaciones', { org_id: org, club_id: club.id, telefono: to, nombre: vars[0] || club.delegado || club.nombre });
        [conv] = await apiUser(`wsp_conversaciones?telefono=eq.${to}&org_id=eq.${org}&select=id&limit=1`);
      }
      if (conv) {
        await dbWrite('POST', 'wsp_mensajes', { conversacion_id: conv.id, org_id: org, direccion: 'out', tipo: 'plantilla',
          cuerpo: cuerpoReal, wa_id: waId || null, enviado_por: quien, estado: 'sent' });
        // Recordatorio enviado → la conversación queda en PENDIENTE DE PAGO
        await dbWrite('PATCH', `wsp_conversaciones?id=eq.${conv.id}`,
          { ultimo_mensaje: '🔔 Recordatorio de cobranza', ultimo_mensaje_at: new Date().toISOString(), marcada: 'pendiente_pago' });
      }
      return json({ ok: true, wa_id: waId });
    }

    return json({ error: "Acción inválida: usa 'texto', 'imagen' o 'cobranza'" }, 400);
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
