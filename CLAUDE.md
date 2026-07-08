# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

MVP de software para gestionar la **estructura financiera** (no deportiva) de torneos de fútbol: categorías, inscripciones, pagos y cuentas por cobrar. El sistema es un SaaS web centralizado operado exclusivamente por el equipo organizador del torneo.

## Comandos principales

### Generar el documento Word de especificación funcional
```bash
npm install docx
node build_doc.js
# Produce: Especificacion_Funcional_Torneos_v3_2.docx
```

### Mockup interactivo
Abrir `mockup.html` directamente en el navegador — sin build step, sin servidor. Usa Tailwind CDN + JS vanilla en un solo archivo.

## Arquitectura técnica sugerida (Sección 5 del Word)

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js / React + Tailwind CSS |
| Backend | Node.js (NestJS o Express) + WebSockets |
| Base de datos | PostgreSQL — tipos `DECIMAL` para montos (nunca `float`) |
| Almacenamiento de vouchers | AWS S3 o Firebase Storage |

## Modelo de dominio (financiero, sin gestión deportiva)

**Jerarquía:** `Torneo → Categoría → Equipo (Club)`

- No existe el concepto de Grupo; la Categoría es la unidad mínima de agrupación.
- Un **Club** tiene una **cuenta corriente única** que persiste entre torneos. `Saldo = Cargos − Abonos Aprobados`. Puede quedar en saldo a favor (crédito).
- Un **Equipo** es la instancia de un Club en una Categoría de un Torneo. Un club puede tener múltiples equipos en distintas categorías.
- Los equipos nunca se eliminan, solo se **inactivan** (preservar trazabilidad de pagos).
- Los **Equipos Interesados/Prospectos** no ocupan aforo y no generan cargos hasta que el Operador confirme la inscripción manualmente.

## Roles y permisos

| Rol | Puede |
|-----|-------|
| **Organizador** | Configurar torneo y categorías, ver todo |
| **Operador** | Inscribir clubes/equipos, registrar pagos (no aprobar), recibe notificaciones WS |
| **Tesorero** | Aprobar/rechazar pagos, ver saldos (no inscribe) |

El menú lateral se filtra dinámicamente según el rol.

## Estados de pago

`Pendiente → Aprobado | Rechazado` — **sin reversión** en el piloto. Una vez procesado, el estado es definitivo. Ajustes excepcionales se hacen manualmente fuera del sistema.

## Reglas de negocio clave

- **Precio libre por equipo**: el monto total se digita libremente; los campos Inscripción, Arbitraje y N° Fechas son solo referencia de cálculo, no fórmula obligatoria.
- **Voucher obligatorio**: el sistema no permite enviar un pago a Tesorería sin imagen adjunta.
- **Auditoría inmutable**: cada pago almacena `created_by`, `created_at`, `processed_by`, `processed_at` y, si aplica, `rejection_reason`. Se recomienda además una tabla de log append-only.
- **Moneda**: soles (S/.) únicamente, 2 decimales. Sin multi-moneda en el MVP.
- **Notificaciones**: al aprobar/rechazar un pago, WebSocket notifica al Operador que lo registró (no al club directamente).

## Estructura del mockup (`mockup.html`)

El archivo es autocontenido (HTML + JS inline). Pantallas implementadas como `<div id="pX" class="screen">`, controladas por `showScreen(id)`. El menú se regenera con `renderNav()` al cambiar de rol mediante el selector del sidebar.

## Preguntas abiertas (pendientes de decisión antes de desarrollo)

1. Aplicación del saldo a favor: ¿automática al generarse un cargo, o acción manual del Tesorero?
2. Inactivación de equipo: ¿congela cargos futuros? ¿libera cupo de aforo?
3. Edición/eliminación de categorías ya creadas (hoy solo creación).
