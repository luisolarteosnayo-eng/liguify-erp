// ============================================================================
// 🧾 emitir-comprobante-torneos · Supabase Edge Function (Deno) — Liguify Torneos
// (Nombre distinto al de Academias: ambas apps comparten el mismo proyecto Supabase.)
// Emite una BOLETA o FACTURA electrónica vía Nubefact (PSE) para un pago
// aprobado y devuelve los enlaces al PDF/XML que entrega SUNAT.
// Misma lógica que en Liguify Academias, adaptada al esquema de Torneos
// (schema public: pagos, clubes, torneos, organizaciones).
//
// DESPLIEGUE: Supabase → Edge Functions → Deploy new function → nombre:
// emitir-comprobante-torneos (pegar este archivo). NO sobrescribir la de Academias.
//
// SECRETOS (por RUC emisor — Nubefact entrega una RUTA y un TOKEN por RUC):
//   NUBEFACT_RUTA_<RUC>   p.ej. NUBEFACT_RUTA_20123456789 = https://api.nubefact.com/api/v1/xxxx
//   NUBEFACT_TOKEN_<RUC>
//
// Entrada (POST con la sesión del usuario): { pago_id, tipo:'boleta'|'factura', serie, numero }.
// Las lecturas usan el token del usuario (RLS): solo el staff de la organización puede emitir.
// Los montos YA INCLUYEN IGV (18%): valor = total / 1.18.
// ============================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Falta la sesión del usuario' }, 401);

    const { pago_id, tipo, serie, numero, consultar } = await req.json();
    if (!pago_id || !['boleta', 'factura'].includes(tipo) || !serie || !(+numero > 0)) {
      return json({ error: 'Faltan pago_id, tipo, serie o numero' }, 400);
    }

    const api = async (path: string) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: auth } });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error((body && body.message) || `Error ${r.status}`);
      return body;
    };

    const [p] = await api(`pagos?id=eq.${pago_id}&select=id,club_id,clasificatorio_id,torneo_id,monto,estado,doc_tipo,contacto,descripcion,org_id`);
    if (!p) return json({ error: 'Pago no encontrado (¿es de tu organización?)' }, 403);
    if (p.estado !== 'aprobado') return json({ error: 'El pago no está aprobado' }, 400);
    if (p.doc_tipo) return json({ error: 'El pago ya tiene comprobante emitido' }, 400);

    const [c] = p.club_id ? await api(`clubes?id=eq.${p.club_id}&select=nombre,delegado,dni,ruc,razon_social,email`) : [null];
    const [cl] = p.clasificatorio_id ? await api(`clasificatorios?id=eq.${p.clasificatorio_id}&select=nombre,contacto`) : [null];
    const [t] = await api(`torneos?id=eq.${p.torneo_id}&select=nombre`);
    const [o] = await api(`organizaciones?id=eq.${p.org_id}&select=nombre,ruc_emisor,razon_social_emisor,direccion_fiscal`);
    if (!o || !o.ruc_emisor) return json({ error: 'La empresa no tiene RUC emisor configurado (Configuración → Medios de Pago → Facturación)' }, 400);

    const RUTA = Deno.env.get(`NUBEFACT_RUTA_${o.ruc_emisor}`);
    const TOKEN = Deno.env.get(`NUBEFACT_TOKEN_${o.ruc_emisor}`);
    if (!RUTA || !TOKEN) return json({ error: `Faltan los secretos NUBEFACT_RUTA_${o.ruc_emisor} / NUBEFACT_TOKEN_${o.ruc_emisor}` }, 500);

    // Solo CONSULTA (vincular manualmente un comprobante ya emitido): devuelve
    // los datos del serie-número en Nubefact sin emitir nada
    if (consultar) {
      const q = await fetch(RUTA, {
        method: 'POST',
        headers: { Authorization: `Token token="${TOKEN}"`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: 'consultar_comprobante', tipo_de_comprobante: tipo === 'factura' ? 1 : 2, serie, numero: +numero }),
      });
      const qb = await q.json().catch(() => null);
      if (!q.ok || !qb || qb.errors) {
        return json({ error: (qb && (qb.errors || qb.error)) || `Nubefact ${q.status}: no se pudo consultar ${serie}-${numero}` }, 502);
      }
      return json({
        ok: true, consulta: true, serie, numero: +numero,
        total: qb.total != null ? +qb.total : null,
        cliente: qb.cliente_denominacion || null,
        cliente_doc: qb.cliente_numero_de_documento != null ? String(qb.cliente_numero_de_documento) : null,
        pdf: qb.enlace_del_pdf || null,
        xml: qb.enlace_del_xml || null,
        cdr: qb.enlace_del_cdr || null,
        aceptada_por_sunat: qb.aceptada_por_sunat,
      });
    }

    // Cliente: factura exige RUC del club; boleta usa DNI del contacto o "CLIENTE VARIOS"
    const esFactura = tipo === 'factura';
    if (esFactura && !(c && /^\d{11}$/.test(String(c.ruc || '').trim()) && c.razon_social)) {
      return json({ error: 'La factura requiere RUC (11 dígitos) y razón social del club' }, 400);
    }
    const dniOk = c && /^\d{8}$/.test(String(c.dni || '').trim());
    const cliente = esFactura
      ? { tipo_de_documento: 6, numero: String(c.ruc).trim(), denominacion: c.razon_social }
      : dniOk
        ? { tipo_de_documento: 1, numero: String(c.dni).trim(), denominacion: p.contacto || c.delegado || c.nombre }
        : { tipo_de_documento: '-', numero: '-', denominacion: 'CLIENTE VARIOS' };

    // Un ítem: inscripción al torneo (monto con IGV incluido)
    const pagador = c ? c.nombre : (cl ? cl.nombre : '');
    const precio = r2(+p.monto);
    const valor = r2(precio / 1.18);
    const items = [{
      unidad_de_medida: 'ZZ',
      descripcion: `Inscripción ${t ? t.nombre : 'torneo'}${pagador ? ' - ' + pagador : ''}${p.descripcion ? ' · ' + p.descripcion : ''}`.slice(0, 250),
      cantidad: 1,
      valor_unitario: valor,
      precio_unitario: precio,
      subtotal: valor,
      tipo_de_igv: 1,
      igv: r2(precio - valor),
      total: precio,
    }];
    const total = precio, gravada = valor;

    const cuerpo = {
      operacion: 'generar_comprobante',
      tipo_de_comprobante: esFactura ? 1 : 2,
      serie, numero: +numero,
      sunat_transaction: 1,
      cliente_tipo_de_documento: cliente.tipo_de_documento,
      cliente_numero_de_documento: cliente.numero,
      cliente_denominacion: cliente.denominacion,
      cliente_direccion: '',
      cliente_email: (c && c.email) || '',
      fecha_de_emision: new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).split('/').map((x) => x.padStart(2, '0')).join('-'),
      moneda: 1,
      porcentaje_de_igv: 18.0,
      total_gravada: gravada,
      total_igv: r2(total - gravada),
      total,
      enviar_automaticamente_a_la_sunat: true,
      enviar_automaticamente_al_cliente: !!(c && c.email),
      items,
    };

    const resp = await fetch(RUTA, {
      method: 'POST',
      headers: { Authorization: `Token token="${TOKEN}"`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const rb = await resp.json().catch(() => null);
    if (!resp.ok || (rb && rb.errors)) {
      const errRaw = (rb && (rb.errors || rb.error)) || `Nubefact ${resp.status}`;
      // Idempotencia: si el serie-número ya está ocupado en Nubefact (reintento
      // de una emisión que sí llegó, o correlativo local desfasado), se consulta
      // ese comprobante y se devuelve para que el cliente decida: adoptarlo si
      // es el mismo pago (mismo total y cliente) o avanzar al siguiente número.
      if (/ya existe/i.test(JSON.stringify(errRaw))) {
        const q = await fetch(RUTA, {
          method: 'POST',
          headers: { Authorization: `Token token="${TOKEN}"`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ operacion: 'consultar_comprobante', tipo_de_comprobante: esFactura ? 1 : 2, serie, numero: +numero }),
        });
        const qb = await q.json().catch(() => null);
        if (q.ok && qb && !qb.errors) {
          return json({
            ya_existia: true, serie, numero: +numero,
            total_existente: qb.total != null ? +qb.total : null,
            cliente_existente: qb.cliente_denominacion || null,
            cliente_doc_existente: qb.cliente_numero_de_documento != null ? String(qb.cliente_numero_de_documento) : null,
            pdf: qb.enlace_del_pdf || null,
            xml: qb.enlace_del_xml || null,
            cdr: qb.enlace_del_cdr || null,
            aceptada_por_sunat: qb.aceptada_por_sunat,
          });
        }
      }
      return json({ error: errRaw }, 502);
    }
    return json({
      ok: true, serie, numero: +numero,
      pdf: (rb && rb.enlace_del_pdf) || null,
      xml: (rb && rb.enlace_del_xml) || null,
      cdr: (rb && rb.enlace_del_cdr) || null,
      aceptada_por_sunat: rb && rb.aceptada_por_sunat,
    });
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
