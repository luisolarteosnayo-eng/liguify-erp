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
      const mt = meta.mime_type || '';
      const ext = mt.includes('pdf') ? 'pdf' : mt.includes('png') ? 'png'
        : mt.includes('ogg') ? 'ogg' : mt.includes('mpeg') && m.type === 'audio' ? 'mp3'
        : mt.includes('mp4') && m.type === 'audio' ? 'm4a' : mt.includes('aac') ? 'aac'
        : mt.includes('amr') ? 'amr' : 'jpg';
      const ruta = `wsp/${convId}/${Date.now()}-${String(m.id).replace(/[^a-zA-Z0-9]/g, '').slice(-24)}.${ext}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`, {
        method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': meta.mime_type || 'image/jpeg', 'x-upsert': 'true' }, body: bin,
      });
      if (up.ok) return `vstore:${ruta}`;
      console.error('[media] upload', up.status, await up.text()); return null;
    } catch (e) { console.error('[media]', e); return null; }
  };
  const enviarTexto = async (to: string, texto: string, fromId?: string) => {
    const r = await fetch(`${GRAPH}/${fromId || PHONE_ID}/messages`, {
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

          // --- Enrutado DETERMINISTA por número RECEPTOR: cada app tiene su
          // número de WhatsApp. Lo que llega al número de Torneos es Torneos;
          // lo que llega al de Academias es Academias. Solo en TRANSICIÓN (un
          // club escribiendo al número viejo) se usa el match por teléfono. ---
          const PHONE_TOR = Deno.env.get('WHATSAPP_PHONE_ID_TORNEOS') || '';
          const phoneRx = String((v.metadata && v.metadata.phone_number_id) || '');
          const esNumeroTorneos = !!PHONE_TOR && phoneRx === PHONE_TOR;

          // --- Candidato ACADEMIAS: tutor por teléfono o, si no está en tutores,
          // la ficha del ALUMNO (datos migrados guardan el celular en el jugador) ---
          let tutor: any = null, jugadorId = null, sedeW: any = null, sedeId = null, acaId = null, tutorIdA = null;
          if (!esNumeroTorneos) {
            const tuts = await dbA('GET', `tutores?select=id,academia_id,nombres&telefono_norm=like.*${last9}&limit=1`);
            if (Array.isArray(tuts) && tuts[0]) {
              tutor = tuts[0]; tutorIdA = tutor.id; acaId = tutor.academia_id;
              // Preferir al hijo ACTIVO (un tutor puede tener hermanos: uno de
              // baja y otro activo; la conversación se vincula al vigente)
              let js = await dbA('GET', `jugadores?select=id,sede_id&tutor_id=eq.${tutor.id}&estado_alumno=neq.baja&limit=1`);
              if (!Array.isArray(js) || !js[0]) js = await dbA('GET', `jugadores?select=id,sede_id&tutor_id=eq.${tutor.id}&limit=1`);
              if (Array.isArray(js) && js[0]) { jugadorId = js[0].id; sedeId = js[0].sede_id; }
            } else {
              const js = await dbA('GET', `jugadores?select=id,sede_id,tutor_id&telefono_norm=like.*${last9}&limit=1`);
              if (Array.isArray(js) && js[0]) { jugadorId = js[0].id; sedeId = js[0].sede_id; tutorIdA = js[0].tutor_id || null; }
            }
            if (sedeId) {
              const sds = await dbA('GET', `sedes?select=whatsapp_respuestas,nombre_sede,academia_id&id=eq.${sedeId}&limit=1`);
              if (Array.isArray(sds) && sds[0]) { sedeW = sds[0]; if (!acaId) acaId = sds[0].academia_id; }
            }
          }
          const matchAca = !!(tutor || jugadorId);
          // --- Candidato TORNEOS: su número propio o, en transición, un club
          // que escribe al número viejo y no corresponde a ninguna academia ---
          let club: any = null;
          if (esNumeroTorneos || !matchAca) {
            const cls = await dbT('GET', `clubes?select=id,org_id,nombre,delegado&telefono_norm=like.*${last9}&limit=1`);
            if (Array.isArray(cls) && cls[0]) club = cls[0];
            else {
              const eqs = await dbT('GET', `equipos?select=club_id&contacto_tel_norm=like.*${last9}&estado=eq.activo&limit=1`);
              if (Array.isArray(eqs) && eqs[0]) {
                const c2 = await dbT('GET', `clubes?select=id,org_id,nombre,delegado&id=eq.${eqs[0].club_id}&limit=1`);
                if (Array.isArray(c2) && c2[0]) club = c2[0];
              }
            }
          }
          const destino: 'academias' | 'torneos' = esNumeroTorneos ? 'torneos'
            : (matchAca ? 'academias' : (club ? 'torneos' : 'academias'));
          if (destino === 'torneos' && !club) {
            // Número de Torneos con remitente no registrado como club: se deja
            // constancia en el log y no se crea conversación (org desconocida)
            console.warn('[torneos] mensaje de numero no registrado', telefono);
            continue;
          }

          const tipo = m.type === 'text' ? 'texto' : m.type === 'image' ? 'imagen'
            : m.type === 'document' ? 'documento' : m.type === 'audio' ? 'audio' : 'texto';
          const cuerpoBase = m.type === 'text' ? (m.text && m.text.body)
            : (m.type === 'image' || m.type === 'document') ? ((m[m.type] && m[m.type].caption) || null)
            : m.type === 'audio' ? null
            : `(${m.type})`;
          const resumen = tipo === 'texto' ? (cuerpoBase || '').slice(0, 120)
            : tipo === 'imagen' ? '📷 Imagen' : tipo === 'audio' ? '🎵 Audio' : '📄 Documento';
          const ahora = new Date().toISOString();

          if (destino === 'torneos') {
            // ================= TORNEOS (esquema public) =================
            const orgId = club.org_id;
            let conv = (await dbT('GET', `wsp_conversaciones?select=*&telefono=eq.${telefono}&org_id=eq.${orgId}&limit=1`) || [])[0];
            if (!conv) conv = ((await dbT('POST', 'wsp_conversaciones', { org_id: orgId, club_id: club.id, telefono, nombre: nombrePerfil || club.delegado || null })) || [])[0];
            if (!conv) continue;
            if (!conv.club_id) await dbT('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { club_id: club.id }, 'return=minimal');
            const esPrimeroEn20h = !conv.ultimo_entrante_at || (Date.now() - new Date(conv.ultimo_entrante_at).getTime()) > 20 * 3600 * 1000;
            const mediaPath = (m.type === 'image' || m.type === 'document' || m.type === 'audio') ? await guardarMedia(m, 'vouchers', conv.id) : null;
            await dbT('POST', `wsp_mensajes?on_conflict=wa_id`, { conversacion_id: conv.id, org_id: orgId, direccion: 'in', tipo, cuerpo: cuerpoBase, media_path: mediaPath, wa_id: m.id }, 'return=minimal,resolution=ignore-duplicates');
            await dbT('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { ultimo_mensaje: resumen, ultimo_mensaje_at: ahora, ultimo_entrante_at: ahora, no_leidos: (+conv.no_leidos || 0) + 1, nombre: conv.nombre || nombrePerfil, marcada: 'sin_respuesta' }, 'return=minimal');
            if (esPrimeroEn20h && TOKEN && PHONE_ID) {
              const org = (await dbT('GET', `organizaciones?select=nombre,whatsapp_respuestas&id=eq.${orgId}&limit=1`) || [])[0];
              if (org && org.whatsapp_respuestas) {
                const texto = `Gracias por tu mensaje 🙌. Este es el canal de avisos de ${org.nombre || 'la organización'}. ` +
                  `Tu mensaje fue registrado; para una atención más rápida también puedes escribirnos al WhatsApp del torneo: ${org.whatsapp_respuestas}`;
                const r = await enviarTexto(telefono, texto, phoneRx);
                await dbT('POST', 'wsp_mensajes', { conversacion_id: conv.id, org_id: orgId, direccion: 'out', tipo: 'texto', cuerpo: texto, wa_id: r.waId || null, enviado_por: 'auto', estado: r.ok ? 'sent' : 'failed' }, 'return=minimal');
              }
            }
            continue;
          }

          // ================= ACADEMIAS (esquema academias) =================
          const academiaId = acaId;
          const filtroAca = academiaId ? `academia_id=eq.${academiaId}` : 'academia_id=is.null';
          let conv = (await dbA('GET', `wsp_conversaciones?select=*&telefono=eq.${telefono}&${filtroAca}&limit=1`) || [])[0];
          if (!conv) conv = ((await dbA('POST', 'wsp_conversaciones', { academia_id: academiaId, sede_id: sedeId, tutor_id: tutorIdA, jugador_id: jugadorId, telefono, nombre: nombrePerfil })) || [])[0];
          if (!conv) continue;
          if (!conv.jugador_id && jugadorId) {
            await dbA('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { tutor_id: tutorIdA, jugador_id: jugadorId, sede_id: sedeId }, 'return=minimal');
            conv.jugador_id = jugadorId;
          }
          const esPrimeroEn20h = !conv.ultimo_entrante_at || (Date.now() - new Date(conv.ultimo_entrante_at).getTime()) > 20 * 3600 * 1000;
          const mediaPath = (m.type === 'image' || m.type === 'document' || m.type === 'audio') ? await guardarMedia(m, 'academias-vouchers', conv.id) : null;
          await dbA('POST', `wsp_mensajes?on_conflict=wa_id`, { conversacion_id: conv.id, academia_id: academiaId, direccion: 'in', tipo, cuerpo: cuerpoBase, media_path: mediaPath, wa_id: m.id }, 'return=minimal,resolution=ignore-duplicates');
          await dbA('PATCH', `wsp_conversaciones?id=eq.${conv.id}`, { ultimo_mensaje: resumen, ultimo_mensaje_at: ahora, ultimo_entrante_at: ahora, no_leidos: (+conv.no_leidos || 0) + 1, nombre: conv.nombre || nombrePerfil, marcada: 'sin_respuesta' }, 'return=minimal');
          if (esPrimeroEn20h && TOKEN && PHONE_ID && sedeW && sedeW.whatsapp_respuestas) {
            try {
              const texto = `Gracias por tu mensaje 🙌. Este es el canal de avisos de ${sedeW.nombre_sede || 'la academia'}. ` +
                `Tu mensaje fue registrado; para una atención más rápida también puedes escribirnos al WhatsApp de la sede: ${sedeW.whatsapp_respuestas}`;
              const r = await enviarTexto(telefono, texto, phoneRx);
              await dbA('POST', 'wsp_mensajes', { conversacion_id: conv.id, academia_id: academiaId, direccion: 'out', tipo: 'texto', cuerpo: texto, wa_id: r.waId || null, enviado_por: 'auto', estado: r.ok ? 'sent' : 'failed' }, 'return=minimal');
            } catch (e) { console.error('[auto-reply]', e); }
          }
        }
      }
    }
  } catch (e) { console.error('[webhook]', e); }
  return new Response('ok', { status: 200 });
});
