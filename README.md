# Sistema de Gestión Financiera de Torneos — MVP

Este proyecto especifica un MVP de software para gestionar la estructura financiera
(no deportiva) de torneos de fútbol: categorías, inscripciones, pagos y cuentas
por cobrar.

## Archivos

- `build_doc.js` — Script Node.js que genera el documento Word de especificación
  funcional (usa la librería `docx`). Ejecutar con:
  ```
  npm install docx
  node build_doc.js
  ```
  Genera `Especificacion_Funcional_Torneos_v3_2.docx`.

- `mockup.html` — Mockup interactivo de las pantallas del sistema (HTML + Tailwind
  CDN + JS vanilla, un solo archivo, sin build step). Abrir directamente en el
  navegador. Incluye un selector de rol en el sidebar para simular el menú según
  Organizador / Operador / Tesorero.

- `Especificacion_Funcional_Torneos_v3_2.docx` — Última versión generada del documento.

## Estado del proyecto (v3.2)

### Roles
- **Organizador**: configura torneo, categorías, ve todo.
- **Operador**: inscribe clubes/equipos, registra pagos (no aprueba).
- **Tesorero**: aprueba/rechaza pagos, ve saldos (no inscribe).

### Estructura de datos (solo financiera, sin gestión deportiva)
Torneo → Categoría → Equipo (Club). **No hay Grupos** — la gestión de grupos,
fixture y calendario deportivo está fuera de alcance.

### Reglas de negocio clave
- Precio por equipo es **libre**, no sigue fórmula fija (cada club se negocia
  individualmente). Inscripción + Arbitraje×Fecha quedan solo como referencia.
- Cuenta corriente única por Club (no por equipo): saldo = cargos − abonos
  aprobados. Puede quedar en **saldo a favor** (crédito) si el club paga de más;
  ese crédito es persistente entre torneos.
- No hay pagos "adicionales", solo adelantados.
- Sin reversión de pagos aprobados/rechazados en este piloto (limitación conocida).
- Auditoría obligatoria: quién registró, quién aprobó/rechazó, cuándo.
- Equipos no se eliminan, solo se inactivan (preserva trazabilidad de pagos).
- Equipos "Interesados/Prospectos": no ocupan aforo, lista separada, conversión
  manual a inscripción confirmada.
- Formulario de pago: Monto, Medio (Efectivo/BCP/Interbank/Yape/Plin), Fecha de
  pago, N° de Operación, Descripción, Voucher (**obligatorio**).
- Datos de Club: Delegado, Teléfono, Provincia (default "Lima").

### Menú / Navegación (filtrado por rol)
```
1. Torneos                  (Organizador, Operador, Tesorero)
   1.1 Clubes Interesados    (Organizador, Operador)
2. Clubes                   (Organizador, Tesorero) — historial multi-torneo
3. Pagos
   3.1 Registrar Pagos       (Operador)
   3.2 Aprobar Pagos         (Tesorero) — FUSIONADA: saldos del torneo + bandeja de aprobación
4. Cuentas por Cobrar        (Organizador, Tesorero) — consolidado de TODOS los torneos
```

## Preguntas abiertas / pendientes de decisión
1. ¿La aplicación del saldo a favor a un cargo nuevo es automática o manual?
2. Reglas de inactivación de equipo: ¿se congelan cargos futuros? ¿libera el cupo
   de aforo?
3. Edición/eliminación de categorías ya creadas (hoy solo se contempla creación).
4. ¿Un mismo club puede tener más de un equipo en la misma categoría? (no resuelto
   aún, ver última conversación del hilo original).

## Arquitectura técnica sugerida (documentada en la Sección 5 del Word)
- Frontend: Next.js / React + Tailwind
- Backend: Node.js (NestJS/Express) + WebSockets (notificaciones en tiempo real)
- DB: PostgreSQL (tipos DECIMAL para montos, nunca float)
- Storage de vouchers: AWS S3 / Firebase Storage
