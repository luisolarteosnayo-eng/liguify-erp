// ============================================================================
// 💬 whatsapp-entrante · Supabase Edge Function (Deno) — Liguify (Academias + Torneos)
// Webhook de la WhatsApp Cloud API (Meta, SIN Twilio). El número de la
// PLATAFORMA es UNO para las dos apps, y Meta solo admite un webhook por
// número: esta función recibe TODO y enruta cada mensaje por el teléfono:
//   · tutor de una academia     → esquema academias (wsp_conversaciones/mensajes)
//   · club/contacto de Torneos  → esquema public   (wsp_conversaciones/mensajes)
//   · ambos                     → el que tenga la conversación más reciente
//   · ninguno                   → academias con academia_id NULL (solo visible por SQL)
// Guarda conversación y mensaje (imágenes/documentos al bucket privado),
// actualiza estados de los enviados (en ambos esquemas) y manda un auto-reply
// con el WhatsApp propio de la sede / organización.
//
// DESPLIEGUE: Edge Functions → nombre: whatsapp-entrante · DESACTIVAR "Verify JWT".
// SECRETOS: WHATSAPP_TOKEN · WHATSAPP_PHONE_ID · WHATSAPP_VERIFY_TOKEN
// Meta → WhatsApp → Configuration → Webhook: Callback URL
//   https://<proyecto>.supabase.co/functions/v1/whatsapp-entrante · campo "messages"
// ============================================================================

const GRAPH = 'https://graph.facebook.com/v21.0';

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const TOKEN = Deno.env.get('WHATSAPP_TOKEN') || '';
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID') || '';

  if (req.method === 'GET') {
    const u = new URL(req.url);
    if (u.searchParams.get('hub.mode') === 'subscribe'
      && u.searchParams.get('hub.verify_token') === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  // REST con service role, parametrizado por esquema ('academias' | 'public')
  const dbS = (schema: string) => async (method: string, path: string, body?: unknown, prefer?: string) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Accept-Profile': schema, 'Content-Profile': schema,
        'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await r.text();
    let out = null; try { out = txt ? JSON.parse(txt) : null; } catch { /* no json */ }
    if (!r.ok) console.error('[db:' + schema + ']', method, path, r.status, txt.slice(0, 300));
    return out;
  };
  const dbA = dbS('academias'), dbT = dbS('public');

  // Descarga un media de Meta y lo sube al bucket indicado; devuelve 'vstore:<ruta>' o null
  const guardarMedia = async (m: any, bucket: string, convId: unknown) => {
    const mediaId = m[m.type] && m[m.type].id;
    if (!mediaId || !TOKEN) return null;
    try {
      const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const meta = await metaRes.json().catch(() => null);
      if (!meta || !meta.url) { console.error('[media] meta sin url', metaRes.status); return null; }
      const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Liguify/1.0' } });
      if (!binRes.ok) { console.error('[media] download', binRes.status); return null; }
      const bin = await binRes.arrayBuffer();
      const ext = (meta.mime_type || '').includes('pdf') ? 'pdf' : (meta.mime_type || '').includes('png') ? 'png' : 'jpg';
      const ruta = `wsp/${convId}/${Date.now()}-${String(m.id).replace(/[^a-zA-Z0-9]/g, '').slice(-24)}.${ext}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, {
        method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': meta.mime_type || 'image/jpeg', 'x-upsert': 'true' }, body: bin,
      });
      if (up.ok) return `vstore:${ruta}`;
      console.error('[media] upload', up.status, await up.text()); return null;
    } catch (e) { console.error('[media]', e); return null; }
  };
  const enviarTexto = async (to: string, texto: string) => {
    const r = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
    });
    const rb = await r.json().catch(() => null);
    return { ok: r.ok, waId: rb && rb.messages && rb.messages[0] && rb.messages[0].id };
  };

  try {
    const payload = await req.json();
    for (const entry of payload.entry || []) {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};

        // --- Estados de salientes: el wa_id vive en uno de los dos esquemas ---
        for (const st of v.statuses || []) {
          if (st.id && st.status) {
            const f = `wsp_mensajes?wa_id=eq.${encodeURIComponent(st.id)}`;
            await dbA('PATCH', f, { estado: st.status }, 'return=minimal');
            await dbT('PATCH', f, { estado: st.status }, 'return=minimal');
          }
        }

        for (const m of v.messages || []) {
          const telefono = String(m.from || '');
          if (!telefono) continue;
          const nombrePerfil = (v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name) || null;
          const last9 = telefono.slice(-9);

          // --- Candidato ACADEMIAS: tutor por teléfono ---
          let tutor: any = null, jugadorId = null, sedeW: any = null, sedeId = null;
          const tuts = await dbA('GET', `tutores?select=id,academia_id,nombres&telefono_norm=like.*${last9}&limit=1`);
          if (Array.isArray(tuts) && tuts[0]) {
            tutor = tuts[0];
            const js = await dbA('GET', `jugadores?select=id,sede_id&tutor_id=eq.${tutor.id}&limit=1`);
            if (Array.isArray(js) && js[0]) {
              jugadorId = js[0].id; sedeId = js[0].sede_id;
              const sds = await dbA('GET', `sedes?select=whatsapp_respuestas,nombre_sede&id=eq.${js[0].sede_id}&limit=1`);
              if (Array.isArray(sds) && sds[0]) sedeW = sds[0];
            }
          }
          // --- Candidato TORNEOS: club por teléfono del club o del contacto de un equipo ---
          let club: any = null;
          const cls = await dbT('GET', `clubes?select=id,org_id,nombre,delegado&telefono_norm=like.*${last9}&limit=1`);
          if (Array.isArray(cls) && cls[0]) club = cls[0];
          else {
            const eqs = await dbT('GET', `equipos?select=club_id&contacto_tel_norm=like.*${last9}&estado=eq.activo&limit=1`);
            if (Array.isArray(eqs) && eqs[0]) {
              const c2 = await dbT('GET', `clubes?select=id,org_id,nombre,delegado&id=eq.${eqs[0].club_id}&limit=1`);
              if (Array.isArray(c2) && c2[0]) club = c2[0];
            }
          }
          // --- Enrutar: si el teléfono está en ambas apps, gana la conversación más reciente ---
          let destino: 'academias' | 'torneos' = tutor ? 'academias' : (club ? 'torneos' : 'academias');
          if (tutor && club) {
            const ca = (await dbA('GET', `wsp_conversaciones?select=ultimo_mensaje_at&telefono=eq.${telefono}&academia_id=eq.${tutor.academia_id}&limit=1`) || [])[0];
            const ct = (await dbT('GET', `wsp_conversaciones?select=ultimo_mensaje_at&telefono=eq.${telefono}&org_id=eq.${club.org_id}&limit=1`) || [])[0];
            const ta = ca && ca.ultimo_mensaje_at ? new Date(ca.ultimo_mensaje_at).getTime() : 0;
            const tt = ct && ct.ultimo_mensaje_at ? new Date(ct.ultimo_mensaje_at).getTime() : 0;
            destino = tt > ta ? 'torneos' : 'academias';
          }

          const tipo = m.type === 'text' ? 'texto' : m.type === 'image' ? 'imagen' : m.type === 'document' ? 'documento' : 'texto';
          const cuerpoBase = m.type === 'text' ? (m.text && m.text.body)
            : (m.type === 'image' || m.type === 'document') ? ((m[m.type] && m[m.type].caption) || null)
            : `(${m.type})`;
          const resumen = tipo === 'texto' ? (cuerpoBase || '').slice(0, 120) : (tipo === 'imagen' ? '📷 Imagen' : '📄 Documento');
          const ahora = new Date().toISOString();

          if (destino === 'torneos') {
            // ================= TORNEOS (esquema public) =================
            const orgId = club.org_id;
            let conv = (await dbT('GET', `wsp_conversaciones?select=*&telefono=eq.${telefono}&org_id=eq.${orgId}&limit=1`) || [])[0];
            if (!conv) conv = ((await dbT('POST', 'wsp_conversaciones', { org_id: orgId, club_id: club.id, telefono, nombre: nombrePerfil || club.delegado || null })) || [])[0];
            if (!conv) continue;
            if (!conv.club_id) await dbT('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { club_id: club.id }, 'return=minimal');
            const esPrimeroEn20h = !conv.ultimo_entrante_at || (Date.now() - new Date(conv.ultimo_entrante_at).getTime()) > 20 * 3600 * 1000;
            const mediaPath = (m.type === 'image' || m.type === 'document') ? await guardarMedia(m, 'vouchers', conv.id) : null;
            await dbT('POST', `wsp_mensajes?on_conflict=wa_id`, { conversacion_id: conv.id, org_id: orgId, direccion: 'in', tipo, cuerpo: cuerpoBase, media_path: mediaPath, wa_id: m.id }, 'return=minimal,resolution=ignore-duplicates');
            await dbT('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { ultimo_mensaje: resumen, ultimo_mensaje_at: ahora, ultimo_entrante_at: ahora, no_leidos: (+conv.no_leidos || 0) + 1, nombre: conv.nombre || nombrePerfil }, 'return=minimal');
            if (esPrimeroEn20h && TOKEN && PHONE_ID) {
              const org = (await dbT('GET', `organizaciones?select=nombre,whatsapp_respuestas&id=eq.${orgId}&limit=1`) || [])[0];
              if (org && org.whatsapp_respuestas) {
                const texto = `Gracias por tu mensaje 🙌. Este es el canal de avisos de ${org.nombre || 'la organización'}. ` +
                  `Tu mensaje fue registrado; para una atención más rápida también puedes escribirnos al WhatsApp del torneo: ${org.whatsapp_respuestas}`;
                const r = await enviarTexto(telefono, texto);
                await dbT('POST', 'wsp_mensajes', { conversacion_id: conv.id, org_id: orgId, direccion: 'out', tipo: 'texto', cuerpo: texto, wa_id: r.waId || null, enviado_por: 'auto', estado: r.ok ? 'sent' : 'failed' }, 'return=minimal');
              }
            }
            continue;
          }

          // ================= ACADEMIAS (esquema academias) =================
          const academiaId = tutor ? tutor.academia_id : null;
          const filtroAca = academiaId ? `academia_id=eq.${academiaId}` : 'academia_id=is.null';
          let conv = (await dbA('GET', `wsp_conversaciones?select=*&telefono=eq.${telefono}&${filtroAca}&limit=1`) || [])[0];
          if (!conv) conv = ((await dbA('POST', 'wsp_conversaciones', { academia_id: academiaId, sede_id: sedeId, tutor_id: tutor ? tutor.id : null, jugador_id: jugadorId, telefono, nombre: nombrePerfil })) || [])[0];
          if (!conv) continue;
          if (tutor && !conv.jugador_id && jugadorId) {
            await dbA('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { tutor_id: tutor.id, jugador_id: jugadorId, sede_id: sedeId }, 'return=minimal');
            conv.jugador_id = jugadorId;
          }
          const esPrimeroEn20h = !conv.ultimo_entrante_at || (Date.now() - new Date(conv.ultimo_entrante_at).getTime()) > 20 * 3600 * 1000;
          const mediaPath = (m.type === 'image' || m.type === 'document') ? await guardarMedia(m, 'academias-vouchers', conv.id) : null;
          await dbA('POST', `wsp_mensajes?on_conflict=wa_id`, { conversacion_id: conv.id, academia_id: academiaId, direccion: 'in', tipo, cuerpo: cuerpoBase, media_path: mediaPath, wa_id: m.id }, 'return=minimal,resolution=ignore-duplicates');
          await dbA('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { ultimo_mensaje: resumen, ultimo_mensaje_at: ahora, ultimo_entrante_at: ahora, no_leidos: (+conv.no_leidos || 0) + 1, nombre: conv.nombre || nombrePerfil }, 'return=minimal');
          if (esPrimeroEn20h && TOKEN && PHONE_ID && sedeW && sedeW.whatsapp_respuestas) {
            try {
              const texto = `Gracias por tu mensaje 🙌. Este es el canal de avisos de ${sedeW.nombre_sede || 'la academia'}. ` +
                `Tu mensaje fue registrado; para una atención más rápida también puedes escribirnos al WhatsApp de la sede: ${sedeW.whatsapp_respuestas}`;
              const r = await enviarTexto(telefono, texto);
              await dbA('POST', 'wsp_mensajes', { conversacion_id: conv.id, academia_id: academiaId, direccion: 'out', tipo: 'texto', cuerpo: texto, wa_id: r.waId || null, enviado_por: 'auto', estado: r.ok ? 'sent' : 'failed' }, 'return=minimal');
            } catch (e) { console.error('[auto-reply]', e); }
          }
        }
      }
    }
  } catch (e) { console.error('[webhook]', e); }
  return new Response('ok', { status: 200 });
});
