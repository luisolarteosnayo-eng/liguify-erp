const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');

// ---------- helpers ----------
const COLOR_PRIMARY = "1F3A5F";   // azul oscuro corporativo
const COLOR_ACCENT = "2E75B6";    // azul medio
const COLOR_GOOD = "2E7D32";      // verde
const COLOR_WARN = "B45309";      // ámbar/naranja
const COLOR_BAD = "B91C1C";       // rojo
const COLOR_LIGHTBG = "EEF3F8";
const COLOR_GREYTEXT = "555555";

const border = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cellMargins() {
  return { top: 100, bottom: 100, left: 140, right: 140 };
}

function headerCell(text, width, fillColor = COLOR_PRIMARY) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: fillColor, type: ShadingType.CLEAR },
    margins: cellMargins(),
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })]
    })]
  });
}

function bodyCell(text, width, opts = {}) {
  const { bold = false, color = "222222", fill = "FFFFFF", size = 20, italics = false } = opts;
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: cellMargins(),
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, bold, color, size, italics })]
    })]
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  const { bold = false, italics = false, color, size } = opts;
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, bold, italics, color, size })]
  });
}
function bullet(text, opts = {}) {
  const { bold = false, ref = "bullets" } = opts;
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, bold })]
  });
}
function bulletL2(text) {
  return new Paragraph({
    numbering: { reference: "bullets2", level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text })]
  });
}
function numbered(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text })]
  });
}

function calloutBox(label, text, color) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: COLOR_LIGHTBG, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color },
              bottom: { style: BorderStyle.SINGLE, size: 4, color },
              left: { style: BorderStyle.SINGLE, size: 24, color },
              right: { style: BorderStyle.SINGLE, size: 4, color },
            },
            margins: { top: 160, bottom: 160, left: 220, right: 220 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: label, bold: true, color, size: 20 })]
              }),
              new Paragraph({
                children: [new TextRun({ text, color: "333333", size: 20 })]
              })
            ]
          })
        ]
      })
    ]
  });
}

function spacer(h = 160) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 1 } },
    children: []
  });
}

// ---------- document ----------
const children = [];

// Title page
children.push(
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "DOCUMENTO DE ESPECIFICACIÓN FUNCIONAL", bold: true, size: 44, color: COLOR_PRIMARY })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "MVP — Software de Gestión Financiera de Torneos", size: 30, color: COLOR_ACCENT })] }),
  new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: "Versión 3.2  ·  Pantalla del Tesorero fusionada: saldos + aprobación de pagos", italics: true, size: 22, color: COLOR_GREYTEXT })] }),
);

children.push(calloutBox(
  "CONTROL DE VERSIONES",
  "Versión 3.2 fusiona, para el Tesorero, la vista de Cuentas por Cobrar del torneo dentro de la pantalla Aprobar Pagos (3.2): una sola pantalla con el resumen de saldos por club arriba y la bandeja de pagos pendientes abajo. El ítem de menú \"1.1 Cuentas por Cobrar (torneo)\" desaparece; \"1.1 Clubes Interesados\" toma su lugar como único submenú de Torneos. La pantalla \"4. Cuentas por Cobrar\" (consolidado de todos los torneos) se mantiene sin cambios. Mantiene todas las decisiones de versiones previas: alcance acotado a estructura financiera sin gestión de grupos, precio libre por equipo, saldo a favor, exclusión de reversión de pagos para el piloto, registro de auditoría, Equipos Interesados/Prospectos, Delegado/Provincia del club, y campos completos del formulario de pago.",
  COLOR_ACCENT
));
children.push(spacer(200));
children.push(new Paragraph({ children: [new PageBreak()] }));

// TOC
children.push(h1("Tabla de Contenidos"));
children.push(new TableOfContents("Tabla de Contenidos", { hyperlink: true, headingStyleRange: "1-3" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===================== 1. OBJETIVO =====================
children.push(h1("1. Objetivo del Sistema"));
children.push(p("Construir una plataforma web centralizada (SaaS) para la organización de torneos que permita estructurar competencias por categorías, registrar inscripciones de clubes con costos variables, y controlar el flujo de caja mediante una cuenta corriente única por club basada en la validación manual de comprobantes de pago (vouchers). El sistema gestiona exclusivamente la estructura financiera del torneo; la estructura deportiva (grupos, fixture, cruces, fechas de juego) queda fuera de alcance y se gestiona por otros medios."));

// ===================== 2. ROLES =====================
children.push(h1("2. Modelo de Roles y Permisos (Segregación de Funciones)"));
children.push(p("El sistema cuenta con tres perfiles de usuario, operados exclusivamente por el equipo organizador del torneo (acceso centralizado):"));

children.push(h3("Organizador (Administrador)"));
children.push(p("Configura la estructura del torneo, define el aforo de categorías y establece el número de fechas/partidos de referencia por categoría. Tiene visualización total del sistema, incluyendo el historial financiero de cualquier club."));

children.push(h3("Operador (Gestor de Campo)"));
children.push(p("Inscribe a los clubes, asigna los equipos a sus categorías, digita los montos económicos acordados (inscripción y arbitraje) y sube las capturas de los vouchers recibidos por WhatsApp. No puede aprobar ni rechazar pagos. Recibe notificaciones en tiempo real cuando Tesorería procesa un pago que él registró, para informar al club."));

children.push(h3("Tesorero (Control Financiero)"));
children.push(p("Revisa de forma exclusiva la bandeja de pagos pendientes, valida los abonos contra la cuenta bancaria real, y aprueba o rechaza los movimientos. No realiza inscripciones ni crea cargos."));

children.push(calloutBox(
  "DECISIÓN DE ALCANCE — AUDITORÍA",
  "Todo registro de pago debe almacenar de forma inmutable: quién lo creó (Operador) y cuándo, y quién lo aprobó o rechazó (Tesorero) y cuándo. Este registro es mínimo indispensable y aplica desde la primera versión del MVP.",
  COLOR_ACCENT
));

children.push(new Paragraph({ children: [new PageBreak()] }));


// ===================== 3. LOGICA DE NEGOCIO =====================
children.push(h1("3. Lógica de Negocio y Estructura Relacional"));

children.push(h2("3.1 Estructura de Competencia"));
children.push(bullet("Un Torneo tiene múltiples Categorías (ej. Categoría 2016, Categoría 2013)."));
children.push(bullet("Cada Categoría tiene un Aforo Máximo (capacidad de equipos)."));
children.push(bullet("Cada Categoría define, en su configuración, el Número de Fechas/Partidos Programados que tendrán todos los equipos inscritos en ella, como dato de referencia (ver 3.3)."));
children.push(bullet("Un Equipo es la instancia específica de un Club participando en una Categoría de un Torneo determinado."));

children.push(calloutBox(
  "DECISIÓN DE ALCANCE — SOLO ESTRUCTURA FINANCIERA",
  "El sistema gestiona únicamente la estructura financiera del torneo (Torneo → Categoría → Equipo). La gestión de grupos, fixture, cruces y calendario de partidos pertenece a la estructura deportiva del torneo y queda fuera de alcance: se gestiona por otros medios, ajenos a este sistema. En consecuencia, no existe el concepto de Grupo dentro de la categoría: la Categoría es la unidad mínima de agrupación para fines de aforo y cobro.",
  COLOR_ACCENT
));

children.push(h2("3.2 Reglas Financieras — Cuenta Corriente del Club"));
children.push(p("El software opera bajo el concepto de Cuenta Corriente única por Club, que ahora se extiende para soportar saldos positivos (deuda) y negativos (crédito a favor). No se dividen los pagos por equipo; todo abono impacta el saldo general de la institución."));
children.push(p("Saldo del Club = (Suma de Cargos de todos sus Equipos) − (Suma de Abonos Aprobados)", { bold: true, color: COLOR_PRIMARY }));
children.push(p("Si el resultado es positivo, representa deuda pendiente. Si es negativo, representa saldo a favor (crédito) disponible para aplicar a cargos futuros."));

children.push(h3("Cargos Variables por Equipo — Precio Libre"));
children.push(p("A diferencia de lo planteado en la versión anterior, el precio de un equipo no sigue una fórmula fija ni uniforme dentro de la categoría: se negocia caso por caso y se digita libremente. El sistema mantiene el desglose en dos campos como referencia interna y ayuda de cálculo, pero ninguno de los dos es obligatorio ni está sujeto a una fórmula que el sistema imponga:"));
children.push(bullet("Costo de Inscripción Base (I) — digitado por el Operador, libre."));
children.push(bullet("Costo de Arbitraje/Campo por Partido (A) y Cantidad de Fechas (F) — digitados por el Operador como referencia; el N° de Fechas ya no se hereda de forma forzada desde la Categoría (ver 3.3)."));
children.push(bullet("Monto Total del Equipo — campo editable de forma directa por el Operador. Si se completan I, A y F, el sistema puede sugerir I + (A × F) como punto de partida, pero el Operador puede sobrescribirlo libremente."));

children.push(calloutBox(
  "DECISIÓN DE ALCANCE — PRECIO LIBRE POR EQUIPO",
  "Confirmado: el precio de inscripción puede variar libremente entre equipos de la misma categoría, según negociación particular con cada club. El sistema no debe forzar ni validar que el monto coincida con una fórmula. El desglose Inscripción + Arbitraje × Fecha se conserva únicamente como ayuda de referencia/cálculo, no como regla de negocio.",
  COLOR_ACCENT
));

children.push(h3("Estados de un Pago"));
const tableStates = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2200, 4060, 3100],
  rows: [
    new TableRow({ children: [headerCell("Estado", 2200), headerCell("Descripción", 4060), headerCell("Efecto en el Saldo", 3100)] }),
    new TableRow({ children: [
      bodyCell("Pendiente", 2200, { bold: true, color: COLOR_WARN }),
      bodyCell("Registrado por el Operador junto con el voucher.", 4060),
      bodyCell("No altera el saldo neto cobrable.", 3100)
    ]}),
    new TableRow({ children: [
      bodyCell("Aprobado", 2200, { bold: true, color: COLOR_GOOD }),
      bodyCell("Validado por Tesorería contra la cuenta bancaria real.", 4060),
      bodyCell("Resta de forma inmediata el saldo pendiente del club. Si excede la deuda, genera saldo a favor.", 3100)
    ]}),
    new TableRow({ children: [
      bodyCell("Rechazado", 2200, { bold: true, color: COLOR_BAD }),
      bodyCell("Denegado por Tesorería con motivo obligatorio.", 4060),
      bodyCell("El saldo no varía.", 3100)
    ]}),
  ]
});
children.push(tableStates);
children.push(spacer());

children.push(calloutBox(
  "DECISIÓN DE ALCANCE — SIN REVERSIÓN DE PAGOS (PILOTO)",
  "Una vez que un pago pasa a estado Aprobado o Rechazado, el estado es definitivo dentro del sistema. El MVP no contempla reversa, edición posterior ni corrección del estado de un pago ya procesado. Casos excepcionales (aprobación por error, depósito rechazado posteriormente por el banco, etc.) quedan fuera de alcance para el piloto y, de ocurrir, requieren ajuste manual fuera del sistema por parte del equipo organizador. Esta limitación debe quedar visible para el equipo de desarrollo y reevaluarse en una siguiente fase.",
  COLOR_BAD
));

children.push(h3("Notificación de Procesamiento"));
children.push(p("Al aprobar o rechazar un pago, el sistema notifica en tiempo real (vía WebSockets) al Operador que registró el pago — no directamente al club. El Operador es responsable de comunicar al club, por su canal habitual (WhatsApp u otro), si su pago fue confirmado o rechazado y, en este último caso, el motivo."));

children.push(h2("3.3 Configuración de Fechas/Partidos por Categoría (referencial)"));
children.push(p("El Organizador puede definir, al configurar la Categoría, un Número de Fechas/Partidos de referencia para fines de planeación deportiva y como ayuda de cálculo en la Pantalla 2. Sin embargo, dado que el precio es libre por equipo (ver 3.2), este valor ya no es una regla financiera obligatoria: el Operador puede ajustarlo o ignorarlo al definir el monto total de un equipo en particular."));
children.push(p("Se mantiene como buena práctica configurarlo a nivel de Categoría para evitar reescribirlo en cada inscripción, pero no bloquea ni fuerza el cálculo final del cargo."));

children.push(h2("3.4 Saldo a Favor (Crédito del Club)"));
children.push(p("Dado que el modelo de negocio no admite pagos adicionales sobre lo adeudado — solo pagos adelantados —, todo abono que exceda la deuda vigente del club genera un saldo a favor. Este crédito queda disponible en la cuenta corriente del club para aplicarse a:"));
children.push(bullet("Cargos pendientes dentro del mismo torneo (ej. otra fecha de arbitraje aún no facturada)."));
children.push(bullet("Cargos de torneos futuros, dado que la cuenta del club no se reinicia entre torneos."));

children.push(calloutBox(
  "IMPLICACIÓN DE DISEÑO",
  "El saldo del Club deja de ser una propiedad calculada solo dentro de un Torneo y pasa a ser un atributo persistente de la entidad Club a través del tiempo. Esto requiere una vista/pantalla de Club como entidad propia, con su historial de cargos y abonos a través de múltiples torneos (ver Sección 4.5, nueva).",
  COLOR_ACCENT
));

children.push(calloutBox(
  "PREGUNTA ABIERTA",
  "¿La aplicación del saldo a favor a un nuevo cargo es automática (el sistema descuenta el crédito disponible apenas se genera un cargo) o requiere una acción manual del Tesorero/Operador para aplicar el crédito a un cargo específico? Definir antes de especificar la pantalla de Club.",
  COLOR_WARN
));

children.push(h2("3.5 Inactivación de Equipos (no eliminación)"));
children.push(p("Los equipos no se eliminan del sistema bajo ninguna circunstancia, para preservar la trazabilidad de los pagos asociados. En su lugar, un equipo puede pasar a estado Inactivo dentro del torneo."));
children.push(bullet("Un equipo Inactivo conserva su historial de cargos y pagos íntimamente ligado al saldo del club."));
children.push(bullet("Un equipo Inactivo se muestra visualmente diferenciado (atenuado / con etiqueta) en la tabla de equipos inscritos, fuera del flujo deportivo activo."));

children.push(calloutBox(
  "PREGUNTA ABIERTA",
  "Al inactivar un equipo: (a) ¿se congelan los cargos ya generados hasta ese momento (el equipo no genera más arbitraje de fechas futuras), o (b) se eliminan/ajustan los cargos no devengados? (c) ¿La inactivación libera el cupo de aforo de la categoría para que otro equipo pueda inscribirse en su lugar? Estas reglas afectan directamente el cálculo del saldo y deben definirse antes de construir la pantalla.",
  COLOR_WARN
));

children.push(h2("3.7 Equipos Interesados (Prospectos)"));
children.push(p("Se incorpora un nuevo concepto, distinto de los estados Activo/Inactivo de un equipo ya inscrito: el Equipo Interesado o Prospecto. Es un club que ha manifestado intención de participar en una Categoría específica, pero que aún no ha sido inscrito ni tiene cargos o pagos asociados."));

children.push(h3("Reglas"));
children.push(bullet("Un Equipo Interesado NO ocupa cupo del Aforo de la Categoría. El aforo solo contabiliza inscripciones confirmadas."));
children.push(bullet("Vive en una lista separada de prospectos por Categoría, visible para el Operador y el Organizador."));
children.push(bullet("Su utilidad principal es operativa en la recta final de las inscripciones: cuando a una Categoría le faltan uno o dos equipos para completar el aforo, el equipo organizador revisa esta lista para hacer outreach u ofertas especiales a los prospectos de esa categoría."));

children.push(h3("Datos mínimos de un Prospecto"));
children.push(bullet("Nombre del Club/Equipo."));
children.push(bullet("Categoría de interés."));
children.push(bullet("Datos de contacto: nombre del Delegado y teléfono."));
children.push(bullet("Nota libre (ej. \"pidió descuento\", \"a la espera de presupuesto del club\")."));

children.push(h3("Conversión a Inscripción Confirmada"));
children.push(p("El paso de Interesado a Inscrito es manual y deliberado: el Operador primero mueve al equipo de la lista de Prospectos a la tabla de equipos inscritos de la Categoría (acción explícita, p. ej. botón \"Confirmar Inscripción\"). Solo después de ese paso se habilita el registro de cargos y pagos para ese equipo. No existe conversión automática por el solo hecho de registrar un pago."));

children.push(calloutBox(
  "IMPLICACIÓN DE DISEÑO",
  "La Pantalla 1 (Configuración del Torneo) y/o la Pantalla 2 (Inscripción) necesitan una vista adicional de \"Equipos Interesados\" por Categoría, separada de la cuadrícula de aforo y de la tabla de equipos inscritos. Ver Pantalla 1B propuesta en la Sección 4.",
  COLOR_ACCENT
));

children.push(h2("3.8 Delegado / Contacto y Provincia del Club"));
children.push(p("Se incorporan como datos del Club: Delegado (nombre de contacto), Teléfono del Delegado, y Provincia. Para torneos en Perú, la Provincia sugiere por defecto \"Lima\", editable por el Operador al registrar el club. Estos datos son informativos y no participan en el cálculo financiero."));

children.push(h2("3.9 Datos del Pago (registro del Operador)"));
children.push(p("El formulario de registro de pago de la Pantalla 2 incorpora los siguientes campos, en línea con el flujo real de trabajo del Operador:"));
children.push(bullet("Monto (S/.)."));
children.push(bullet("Medio de Pago: Efectivo, BCP, Interbank, Yape o Plin."));
children.push(bullet("Fecha del Pago: fecha en que se realizó la transacción (puede ser distinta a la fecha de registro en el sistema)."));
children.push(bullet("N° de Operación: número de operación bancaria o de la transacción, para conciliación."));
children.push(bullet("Descripción: texto libre breve."));
children.push(bullet("Voucher/comprobante: obligatorio. El sistema no permite enviar el pago a Tesorería sin una imagen adjunta."));
children.push(p("El pago se registra de forma global contra la Cuenta Corriente del Club, no contra una categoría o equipo específico (Sección 3.2)."));

children.push(h2("3.10 Moneda y Redondeo"));
children.push(p("El sistema opera exclusivamente en soles (S/.) con manejo estándar a nivel de céntimos (2 decimales). No se contempla multi-moneda ni reglas especiales de redondeo para el MVP."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===================== 4. PANTALLAS =====================
children.push(h1("4. Especificación Detallada de Pantallas (UI/UX)"));

children.push(h2("4.0 Mapa de Navegación (Menú Principal)"));
children.push(p("El sistema se organiza en un menú lateral con la siguiente jerarquía. El menú se adapta según el rol del usuario logueado: un Operador, por ejemplo, no ve las opciones de Aprobar Pagos, Clubes ni Cuentas por Cobrar."));

const tableMenu = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [3700, 3160, 2500],
  rows: [
    new TableRow({ children: [headerCell("Menú", 3700), headerCell("Pantalla / Contenido", 3160), headerCell("Roles con acceso", 2500)] }),
    new TableRow({ children: [
      bodyCell("1. Torneos", 3700, { bold: true }),
      bodyCell("Pantalla principal: categorías, cupos totales/disponibles, interesados por confirmar, y tabla de equipos participantes por categoría.", 3160),
      bodyCell("Organizador, Operador, Tesorero", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("1.1 Clubes Interesados", 3700),
      bodyCell("Lista de prospectos por categoría (Sección 3.7).", 3160),
      bodyCell("Organizador, Operador", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("2. Clubes", 3700, { bold: true }),
      bodyCell("Historial financiero de un club específico a través de todos los torneos en los que ha participado.", 3160),
      bodyCell("Organizador, Tesorero", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("3. Pagos", 3700, { bold: true }),
      bodyCell("Agrupador, sin pantalla propia.", 3160),
      bodyCell("Organizador, Operador, Tesorero", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("3.1 Registrar Pagos", 3700),
      bodyCell("Inscripción de equipos y registro de pagos (antes \"Pantalla 2\").", 3160),
      bodyCell("Operador", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("3.2 Aprobar Pagos", 3700),
      bodyCell("Pantalla fusionada: arriba el resumen de saldos por club de este torneo (antes \"1.1 Cuentas por Cobrar\"), abajo la bandeja de pagos pendientes de aprobación con revisión manual del voucher contra el banco.", 3160),
      bodyCell("Tesorero", 2500)
    ]}),
    new TableRow({ children: [
      bodyCell("4. Cuentas por Cobrar", 3700, { bold: true }),
      bodyCell("Consolidado de saldo por club, sumando todos los torneos. Click lleva al detalle del club (menú 2).", 3160),
      bodyCell("Organizador, Tesorero", 2500)
    ]}),
  ]
});
children.push(tableMenu);
children.push(spacer());

children.push(calloutBox(
  "DECISIÓN DE ALCANCE — FUSIÓN DE PANTALLAS PARA EL TESORERO",
  "La pantalla \"Cuentas por Cobrar del Torneo\" (antes ítem 1.1 independiente) se fusiona dentro de \"3.2 Aprobar Pagos\": el Tesorero ve en una sola pantalla el resumen de saldos por club de este torneo y, debajo, la bandeja de pagos pendientes de aprobación. La pantalla \"4. Cuentas por Cobrar\" (raíz del menú) se mantiene independiente: muestra el saldo consolidado de cada club sumando todos los torneos (Club, Provincia, N° de Torneos, Saldo Consolidado), y permite navegar al detalle de cada club (menú 2).",
  COLOR_ACCENT
));

children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(h2("Pantalla 1: Configuración del Torneo / Torneos (Rol: Organizador, Operador, Tesorero)"));
children.push(bullet("Encabezado: nombre del torneo activo y selector de competencias pasadas."));
children.push(bullet("Acceso rápido en el encabezado (Organizador, Operador): botón [ Clubes Interesados ] hacia 1.1."));
children.push(bullet("Acción principal (Organizador): botón [ + Crear Nueva Categoría ]."));
children.push(bullet("Formulario de Categoría: nombre, aforo máximo y Número de Fechas/Partidos de referencia (informativo, no obligatorio — ver Sección 3.3)."));
children.push(bullet("Cuadrícula de tarjetas de Categorías. Cada tarjeta contiene:"));
children.push(bulletL2("Nombre de la categoría (ej. Categoría 2016)."));
children.push(bulletL2("Barra de progreso visual de aforo (ej. 5 / 8 equipos), calculada únicamente sobre inscripciones confirmadas — los Prospectos/Interesados no cuentan aquí."));
children.push(bulletL2("Comportamiento dinámico: verde/azul en rango normal, amarillo cuando falta 1 cupo, rojo con etiqueta [ CUPO LLENO ] al completarse (bloquea nuevas inscripciones)."));
children.push(bulletL2("Sin subdivisión en grupos: la Categoría es la unidad mínima de agrupación financiera (ver decisión de alcance en 3.1)."));
children.push(bulletL2("Indicador secundario de cantidad de Prospectos/Interesados pendientes en esa categoría (ej. \"3 interesados\"), con enlace a la Pantalla 1.1."));
children.push(bullet("Tabla inferior \"Equipos Participantes por Categoría\": lista plana de todos los equipos del torneo con columnas Categoría, Equipo/Club, Monto Total y Estado (Activo/Inactivo). Es una vista de consulta rápida; la edición de cada equipo se hace desde Registrar Pagos (3.1)."));

children.push(calloutBox(
  "PENDIENTE DE ESPECIFICAR",
  "Edición y eliminación de categorías ya creadas (ej. ajustar aforo después de la creación inicial). La v1 del documento solo contemplaba creación; se recomienda definir antes de pasar a desarrollo.",
  COLOR_WARN
));

children.push(h2("Pantalla 1.1: Equipos Interesados / Prospectos (Rol: Organizador, Operador)"));
children.push(p("Lista separada de la cuadrícula de categorías, pensada para uso operativo en la recta final de inscripciones."));
children.push(bullet("Vista agrupada por Categoría, mostrando para cada una su lista de prospectos."));
children.push(bullet("Cada fila de prospecto muestra: Nombre del Club/Equipo, Delegado, Teléfono, Nota libre, y fecha de registro del interés."));
children.push(bullet("Botón [ + Añadir Interesado ] con formulario mínimo (club, categoría, delegado, teléfono, nota)."));
children.push(bullet("Botón de acción por fila: [ Confirmar Inscripción ] — mueve al equipo a la tabla de inscritos de Registrar Pagos (3.1), habilitando recién ahí el registro de cargos y pagos. Esta acción es manual y explícita; no ocurre automáticamente al registrar un pago."));
children.push(bullet("No participa del cálculo de aforo ni de ningún saldo financiero: es una lista de seguimiento comercial, no de inscripción."));

children.push(h2("Pantalla 3.1: Registrar Pagos (Rol: Operador)"));
children.push(p("Panel dividido en dos columnas fijas (Split Panel 60/40)."));

children.push(h3("Columna Izquierda (60% — Gestión del Club)"));
children.push(bullet("Buscador con autocompletado para seleccionar el Club, con opción [ + Crear Nuevo Club ] si no existe. Si el club proviene de la lista de Prospectos (Pantalla 1B), sus datos de Delegado y Teléfono se prellenan automáticamente."));
children.push(bullet("Formulario de Club nuevo: Nombre del Club, Delegado, Teléfono del Delegado y Provincia (campo con valor sugerido por defecto \"Lima\" para torneos en Perú, editable)."));
children.push(bullet("Selector de Categoría: el Operador asigna al club una o más Categorías ya existentes en el torneo, previamente creadas por el Organizador en la Pantalla 1. El Operador no puede crear categorías nuevas desde esta pantalla, solo seleccionar entre las disponibles."));
children.push(bullet("Tabla de Equipos Inscritos con columnas: Categoría/Equipo, Inscripción (S/., referencial), Arbitraje x Fecha (S/., referencial), N° Fechas (referencial, editable), Monto Total (campo principal, editable libremente — ver Sección 3.2), Estado (Activo/Inactivo) y botón [ Inactivar ] en lugar del anterior botón de eliminar."));
children.push(bullet("Bloque inferior de Resumen Financiero: Deuda Total, Total Aprobado, Saldo Neto Pendiente y, cuando aplique, Saldo a Favor Disponible — en un recuadro de color (verde si saldo en S/.0, ámbar si hay crédito disponible, rojo si hay deuda)."));

children.push(h3("Columna Derecha (40% — Formulario de Pago)"));
children.push(p("El pago se registra de forma global contra el club (no por categoría/equipo individual), en línea con el modelo de Cuenta Corriente única (Sección 3.2)."));
children.push(bullet("Campo numérico para el Monto (S/.)."));
children.push(bullet("Botones de selección rápida para el Medio de Pago ([ Efectivo ], [ BCP ], [ Interbank ], [ Yape ], [ Plin ])."));
children.push(bullet("Campo de Fecha del Pago — la fecha en que se realizó la transacción, que puede ser distinta de la fecha en que el Operador lo registra en el sistema."));
children.push(bullet("Campo de N° de Operación — número de operación bancaria o de la transacción, para fines de conciliación."));
children.push(bullet("Campo de Descripción — texto libre breve sobre el pago (ej. \"Adelanto inscripción Cat. 2016\")."));
children.push(bullet("Zona de arrastre (dropzone) para subir la captura de WhatsApp u otro comprobante. El voucher es obligatorio: el sistema no permite enviar el pago a Tesorería sin una imagen adjunta."));
children.push(bullet("Botón de acción [ Registrar y Enviar a Tesorería ]."));
children.push(bullet("Indicador de notificación (campana) que avisa al Operador cuando Tesorería aprueba o rechaza un pago previamente registrado por él."));

children.push(calloutBox(
  "PENDIENTE DE ESPECIFICAR",
  "Flujo de aplicación del saldo a favor: si existe crédito disponible, ¿se muestra un control para aplicarlo manualmente a un cargo específico, o el sistema lo descuenta automáticamente al generarse el cargo? Ver Sección 3.4.",
  COLOR_WARN
));

children.push(h2("Pantalla 3.2: Aprobar Pagos (Rol: Tesorero)"));
children.push(p("Pantalla fusionada (ver decisión de alcance en la Sección 4.0): combina en una sola vista el resumen de saldos del torneo y la bandeja de pagos pendientes de aprobación."));

children.push(h3("Bloque superior: Saldos por Club (este torneo)"));
children.push(bullet("KPIs: Clubes con deuda, Total por Cobrar (del torneo), Total Aprobado (del torneo)."));
children.push(bullet("Tabla: Club, Deuda Total, Total Aprobado, Saldo Pendiente, y acción [ Ver Club → ] que navega al detalle de Clubes (menú 2)."));

children.push(h3("Bloque inferior: Pagos Pendientes de Aprobación"));
children.push(bullet("Fila de KPIs: Pagos Pendientes (amarillo), Aprobado Hoy (verde), Rechazado Hoy (rojo)."));
children.push(bullet("Tabla de Flujo Pendiente: transacciones ordenadas de más antigua a más reciente, cada fila con botón [ Ver Voucher 👁️ ] y el nombre del Operador que registró el pago."));

children.push(h3("Modal de Inspección (pantalla completa, dividido al 50%)"));
children.push(bullet("Lado izquierdo: visor del voucher en alta resolución con [ 🔍 Acercar ] y [ 🔄 Rotar ]."));
children.push(bullet("Lado derecho: ficha de datos del depósito (Club, monto reportado, banco, Operador que registró) y botones de acción:"));
children.push(bulletL2("[ ✔️ Confirmar Abono en Banco ] — cierra el modal, actualiza saldos y dispara notificación al Operador. Es una revisión manual: el Tesorero verifica el voucher contra el movimiento real en la cuenta bancaria antes de confirmar."));
children.push(bulletL2("[ ✕ Rechazar Pago ] — abre cuadro de texto obligatorio para el motivo, y dispara notificación al Operador."));

children.push(calloutBox(
  "DECISIÓN DE ALCANCE",
  "El registro de auditoría (usuario y fecha/hora) de la acción de aprobar/rechazar se guarda automáticamente al confirmar, sin campos adicionales visibles para el Tesorero — la trazabilidad es responsabilidad del sistema, no una tarea manual del usuario. La validación contra el banco es manual (el Tesorero revisa la cuenta bancaria real fuera del sistema); el sistema no se integra con el banco en el alcance del MVP.",
  COLOR_ACCENT
));

children.push(h2("Pantalla 2 (menú): Clubes — Historial entre Torneos (Rol: Organizador, Tesorero)"));
children.push(p("Confirmada como ítem propio del menú principal (\"2. Clubes\"). Muestra el historial financiero de un club específico a través de todos los torneos en los que ha participado."));
children.push(bullet("Encabezado: nombre del club y Saldo Actual (deuda o crédito), visible de forma prominente."));
children.push(bullet("Selector de Torneo para filtrar el historial, con opción \"Todos los torneos\"."));
children.push(bullet("Tabla de movimientos cronológica: fecha, tipo (cargo/abono), torneo y categoría de origen, monto, estado, y usuario responsable (quién registró / quién aprobó)."));
children.push(bullet("Distinción visual clara entre cargos y abonos (ej. cargos en un color, abonos en otro)."));

children.push(h2("Pantalla 4 (menú): Cuentas por Cobrar — Consolidado (Rol: Organizador, Tesorero)"));
children.push(p("Ítem raíz del menú, independiente de la vista de saldos ya fusionada en 3.2 (ver decisión de alcance en la Sección 4.0). Muestra el saldo de cada club sumando todos los torneos en los que ha participado."));
children.push(bullet("KPI superior: Total por Cobrar consolidado (todos los torneos, todos los clubes)."));
children.push(bullet("Tabla: Club, Provincia, N° de Torneos en los que ha participado, Saldo Consolidado (puede mostrar saldo a favor si aplica), y acción [ Ver Detalle → ] que navega a la Pantalla \"Clubes\" (menú 2)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===================== 5. ARQUITECTURA =====================
children.push(h1("5. Arquitectura Tecnológica Sugerida"));
children.push(p("Combinación recomendada por eficiencia, seguridad y escalabilidad frente a las reglas de negocio descritas:"));

children.push(h3("Frontend"));
children.push(p("Next.js o React.js con Tailwind CSS, para la interfaz y las alertas dinámicas de colores (aforo, estados de pago, saldo)."));

children.push(h3("Backend"));
children.push(p("Node.js (NestJS o Express) junto con WebSockets, para que los pagos que sube el Operador aparezcan al instante en la pantalla del Tesorero, y para las notificaciones de aprobación/rechazo de vuelta al Operador, sin recargar la página."));

children.push(h3("Base de Datos"));
children.push(p("PostgreSQL. Al manejar estados financieros, balances y dinero, es indispensable una base de datos relacional que garantice transacciones seguras (ACID). El campo de saldo del Club y los montos de cargos/abonos deben modelarse como tipo numérico decimal (no float), para evitar errores de redondeo."));

children.push(h3("Almacenamiento de Vouchers"));
children.push(p("AWS S3 o Firebase Storage, para guardar de forma segura las imágenes de los vouchers subidos."));

children.push(h3("Auditoría"));
children.push(p("Cada tabla de movimiento financiero (cargo, abono) debe incluir como mínimo: created_by, created_at, processed_by, processed_at y, si aplica, rejection_reason. Se recomienda además una tabla de log de auditoría de solo-inserción (append-only) independiente, para trazabilidad ante disputas."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ===================== 6. RESUMEN DE PENDIENTES =====================
children.push(h1("6. Resumen de Preguntas Abiertas y Pendientes"));
children.push(p("Antes de pasar este documento a un equipo de desarrollo o diseño, se recomienda cerrar los siguientes puntos:"));

children.push(numbered("¿La aplicación del saldo a favor a un cargo nuevo es automática o manual? (Sección 3.4)"));
children.push(numbered("Reglas de inactivación de equipo: ¿se congelan cargos futuros y se libera el cupo de aforo? (Sección 3.5)"));
children.push(numbered("Edición/eliminación de categorías ya creadas (Pantalla 1)."));

children.push(spacer(100));
children.push(p("Decisiones ya cerradas en esta revisión y reflejadas en el cuerpo del documento: manejo de saldo a favor en lugar de pagos adicionales (3.4), exclusión de reversión de pagos para el piloto (3.2), registro de auditoría de quién y cuándo (2 y 3.2), precio libre por equipo sin fórmula forzada (3.2), número de fechas como dato de referencia no obligatorio (3.3), inactivación en lugar de eliminación de equipos (3.5), incorporación de Equipos Interesados/Prospectos que no ocupan aforo y se confirman manualmente (3.7), Delegado/Contacto y Provincia del club (3.8), campos completos del formulario de pago — Efectivo, Fecha de Pago, N° de Operación, Descripción y voucher obligatorio (3.9), el Operador solo selecciona categorías ya creadas por el Organizador sin poder crear nuevas (Pantalla 3.1), redondeo estándar a céntimos sin reglas especiales (3.10), y estructura definitiva de menú con 4 secciones principales y filtrado de visibilidad por rol (4.0). La pantalla de Clubes (antes \"Pantalla 4 propuesta\") queda confirmada como ítem permanente del menú.", { italics: true, color: COLOR_GREYTEXT }));

// ===================== BUILD DOCUMENT =====================
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "222222" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_ACCENT, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: COLOR_PRIMARY },
        paragraph: { spacing: { before: 260, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: COLOR_ACCENT },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
      { reference: "bullets2",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 880, hanging: 260 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: "Especificación Funcional — Gestión Financiera de Torneos", size: 16, color: COLOR_GREYTEXT }),
            new TextRun({ text: "\tv3.2", size: 16, color: COLOR_GREYTEXT }),
          ]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR_GREYTEXT })]
        })]
      })
    },
    children
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/claude/proyecto/Especificacion_Funcional_Torneos_v3_2.docx", buffer);
  console.log("Documento generado.");
});
