import { sql, type Trx } from '@erp/db';
import { ErrorNegocio } from '../errores.js';
import { tipoDocumento } from '../nucleo/documentos.js';

/**
 * Plantillas de industria: con un clic dejan configurado el módulo para un tipo de empresa de servicios.
 * Todo lo que crean es de EJEMPLO y el cliente lo ajusta. El contenido clínico de los temparios médicos
 * lo define cada institución con su personal; aquí solo hay ejemplos ilustrativos.
 */

interface Campo { campo: string; etiqueta: string; tipo: 'TEXTO' | 'NUMERO' | 'FECHA' | 'SI_NO'; obligatorio?: boolean; sensible?: boolean }
interface TipoOrden { codigo: string; descripcion: string; objeto: string; cobertura?: string; modoHoras?: 'RANGO' | 'TOTAL' | 'AMBOS'; plantilla?: string; campos?: Campo[] }
interface LineaTempario { tipo: 'ACTIVIDAD' | 'MATERIAL' | 'TERCERO'; descripcion: string; perfil?: string; articulo?: string; personas?: number; horas?: number; cantidad?: number; costo?: number }
interface Tempario { codigo: string; descripcion: string; tipoOrden: string; precioCerrado?: number; lineas: LineaTempario[] }

export interface Industria {
  codigo: string;
  nombre: string;
  descripcion: string;
  perfiles: { codigo: string; descripcion: string; costo: number; venta: number }[];
  articulos: { codigo: string; descripcion: string; unidad: string; clase: 'ART-CONS' | 'ART-INV' }[];
  tiposOrden: TipoOrden[];
  temparios: Tempario[];
}

const CAMPOS_PACIENTE: Campo[] = [
  { campo: 'historia_clinica', etiqueta: 'Número de historia clínica', tipo: 'TEXTO' },
  { campo: 'aseguradora', etiqueta: 'Aseguradora o convenio', tipo: 'TEXTO' },
  { campo: 'diagnostico', etiqueta: 'Diagnóstico', tipo: 'TEXTO', sensible: true },
  { campo: 'alergias', etiqueta: 'Alergias declaradas', tipo: 'TEXTO', sensible: true },
  { campo: 'antecedentes', etiqueta: 'Antecedentes relevantes', tipo: 'TEXTO', sensible: true },
];

export const INDUSTRIAS: Industria[] = [
  {
    codigo: 'ODONTOLOGIA',
    nombre: 'Clínica odontológica',
    descripcion: 'Consultas, tratamientos y controles por paciente, con odontólogos y auxiliares.',
    perfiles: [
      { codigo: 'ODONTOLOGO', descripcion: 'Odontólogo', costo: 15, venta: 40 },
      { codigo: 'AUX-ODONT', descripcion: 'Auxiliar de odontología', costo: 5, venta: 0 },
    ],
    articulos: [
      { codigo: 'ANEST-CART', descripcion: 'Cartucho de anestesia local', unidad: 'UN', clase: 'ART-CONS' },
      { codigo: 'KIT-ENDO', descripcion: 'Kit de endodoncia (limas y conos)', unidad: 'UN', clase: 'ART-CONS' },
      { codigo: 'RESINA', descripcion: 'Resina compuesta', unidad: 'UN', clase: 'ART-CONS' },
    ],
    tiposOrden: [
      { codigo: 'CONSULTA-ODO', descripcion: 'Consulta odontológica', objeto: 'PACIENTE', modoHoras: 'TOTAL', campos: [{ campo: 'pieza_dental', etiqueta: 'Pieza dental', tipo: 'TEXTO' }, ...CAMPOS_PACIENTE] },
      { codigo: 'TRATAMIENTO-ODO', descripcion: 'Tratamiento odontológico', objeto: 'PACIENTE', plantilla: 'ENDODONCIA', campos: [{ campo: 'pieza_dental', etiqueta: 'Pieza dental', tipo: 'TEXTO', obligatorio: true }, ...CAMPOS_PACIENTE] },
      { codigo: 'CONTROL-ODO', descripcion: 'Control odontológico', objeto: 'PACIENTE', modoHoras: 'TOTAL', campos: CAMPOS_PACIENTE },
    ],
    temparios: [
      {
        codigo: 'ENDODONCIA', descripcion: 'Endodoncia unirradicular', tipoOrden: 'TRATAMIENTO-ODO',
        lineas: [
          { tipo: 'ACTIVIDAD', descripcion: 'Evaluación y anestesia', perfil: 'ODONTOLOGO', horas: 0.25 },
          { tipo: 'ACTIVIDAD', descripcion: 'Endodoncia unirradicular', perfil: 'ODONTOLOGO', horas: 1 },
          { tipo: 'ACTIVIDAD', descripcion: 'Asistencia', perfil: 'AUX-ODONT', horas: 1.25 },
          { tipo: 'MATERIAL', descripcion: 'Anestesia', articulo: 'ANEST-CART', cantidad: 2 },
          { tipo: 'MATERIAL', descripcion: 'Limas y conos', articulo: 'KIT-ENDO', cantidad: 1 },
        ],
      },
      {
        codigo: 'PROFILAXIS', descripcion: 'Profilaxis y limpieza', tipoOrden: 'CONSULTA-ODO', precioCerrado: 35,
        lineas: [{ tipo: 'ACTIVIDAD', descripcion: 'Profilaxis', perfil: 'ODONTOLOGO', horas: 0.5 }],
      },
    ],
  },
  {
    codigo: 'SALUD',
    nombre: 'Clínica u hospital',
    descripcion: 'Consultas, emergencias y cirugías por paciente, con equipos médicos y de enfermería.',
    perfiles: [
      { codigo: 'MED-GENERAL', descripcion: 'Médico general', costo: 15, venta: 35 },
      { codigo: 'CIRUJANO', descripcion: 'Médico cirujano', costo: 40, venta: 120 },
      { codigo: 'ANESTESIOLOGO', descripcion: 'Anestesiólogo', costo: 35, venta: 100 },
      { codigo: 'ENF-INSTRUM', descripcion: 'Enfermera instrumentista', costo: 8, venta: 25 },
      { codigo: 'ENFERMERA', descripcion: 'Enfermera', costo: 6, venta: 18 },
    ],
    articulos: [
      { codigo: 'KIT-LAPAROT', descripcion: 'Kit quirúrgico de laparotomía', unidad: 'UN', clase: 'ART-CONS' },
      { codigo: 'SUTURA', descripcion: 'Sutura según protocolo', unidad: 'UN', clase: 'ART-CONS' },
      { codigo: 'SOL-SALINA', descripcion: 'Solución salina 1000 ml', unidad: 'UN', clase: 'ART-CONS' },
    ],
    tiposOrden: [
      { codigo: 'CONSULTA-MED', descripcion: 'Consulta médica', objeto: 'PACIENTE', modoHoras: 'TOTAL', campos: CAMPOS_PACIENTE },
      { codigo: 'EMERGENCIA', descripcion: 'Atención de emergencia', objeto: 'PACIENTE', modoHoras: 'RANGO', campos: CAMPOS_PACIENTE },
      { codigo: 'CIRUGIA', descripcion: 'Cirugía', objeto: 'PACIENTE', modoHoras: 'RANGO', campos: [{ campo: 'quirofano', etiqueta: 'Quirófano', tipo: 'TEXTO' }, ...CAMPOS_PACIENTE] },
    ],
    temparios: [
      {
        codigo: 'PERITONITIS', descripcion: 'Atención quirúrgica de peritonitis (ejemplo ilustrativo)', tipoOrden: 'CIRUGIA',
        lineas: [
          { tipo: 'ACTIVIDAD', descripcion: 'Valoración prequirúrgica', perfil: 'CIRUJANO', horas: 0.5 },
          { tipo: 'ACTIVIDAD', descripcion: 'Cirugía', perfil: 'CIRUJANO', personas: 2, horas: 2 },
          { tipo: 'ACTIVIDAD', descripcion: 'Anestesia', perfil: 'ANESTESIOLOGO', horas: 2.5 },
          { tipo: 'ACTIVIDAD', descripcion: 'Instrumentación', perfil: 'ENF-INSTRUM', horas: 2.5 },
          { tipo: 'MATERIAL', descripcion: 'Kit quirúrgico', articulo: 'KIT-LAPAROT', cantidad: 1 },
          { tipo: 'MATERIAL', descripcion: 'Suturas', articulo: 'SUTURA', cantidad: 4 },
          { tipo: 'MATERIAL', descripcion: 'Soluciones', articulo: 'SOL-SALINA', cantidad: 3 },
          { tipo: 'TERCERO', descripcion: 'Estudio de laboratorio externo', costo: 25 },
        ],
      },
      {
        codigo: 'CONSULTA-GEN', descripcion: 'Consulta de medicina general', tipoOrden: 'CONSULTA-MED', precioCerrado: 30,
        lineas: [{ tipo: 'ACTIVIDAD', descripcion: 'Consulta', perfil: 'MED-GENERAL', horas: 0.5 }],
      },
    ],
  },
  {
    codigo: 'MANTENIMIENTO',
    nombre: 'Mantenimiento de equipos',
    descripcion: 'Correctivos, preventivos e instalaciones sobre equipos de clientes, con técnicos en campo.',
    perfiles: [
      { codigo: 'TEC-ELECTRICO', descripcion: 'Técnico eléctrico', costo: 8, venta: 25 },
      { codigo: 'TEC-MECANICO', descripcion: 'Técnico mecánico', costo: 8, venta: 25 },
      { codigo: 'AYUDANTE', descripcion: 'Ayudante técnico', costo: 4, venta: 12 },
    ],
    articulos: [
      { codigo: 'FILTRO-AIRE', descripcion: 'Filtro de aire', unidad: 'UN', clase: 'ART-INV' },
      { codigo: 'ACEITE-LT', descripcion: 'Aceite lubricante', unidad: 'LT', clase: 'ART-CONS' },
      { codigo: 'KIT-MANT', descripcion: 'Kit de mantenimiento', unidad: 'UN', clase: 'ART-INV' },
    ],
    tiposOrden: [
      { codigo: 'CORRECTIVO', descripcion: 'Mantenimiento correctivo', objeto: 'EQUIPO', campos: [{ campo: 'falla_reportada', etiqueta: 'Falla reportada', tipo: 'TEXTO', obligatorio: true }, { campo: 'horometro', etiqueta: 'Horómetro', tipo: 'NUMERO' }] },
      { codigo: 'PREVENTIVO', descripcion: 'Mantenimiento preventivo', objeto: 'EQUIPO', plantilla: 'PREV-TRIMESTRAL', campos: [{ campo: 'horometro', etiqueta: 'Horómetro', tipo: 'NUMERO' }] },
      { codigo: 'INSTALACION', descripcion: 'Instalación', objeto: 'EQUIPO' },
    ],
    temparios: [
      {
        codigo: 'PREV-TRIMESTRAL', descripcion: 'Mantenimiento preventivo trimestral', tipoOrden: 'PREVENTIVO',
        lineas: [
          { tipo: 'ACTIVIDAD', descripcion: 'Inspección y limpieza', perfil: 'TEC-MECANICO', horas: 1.5 },
          { tipo: 'ACTIVIDAD', descripcion: 'Revisión eléctrica', perfil: 'TEC-ELECTRICO', horas: 1 },
          { tipo: 'MATERIAL', descripcion: 'Filtro', articulo: 'FILTRO-AIRE', cantidad: 1 },
          { tipo: 'MATERIAL', descripcion: 'Lubricante', articulo: 'ACEITE-LT', cantidad: 2 },
        ],
      },
    ],
  },
  {
    codigo: 'TALLER',
    nombre: 'Taller automotriz',
    descripcion: 'Mantenimientos por kilometraje, diagnósticos y reparaciones de vehículos.',
    perfiles: [
      { codigo: 'MECANICO', descripcion: 'Mecánico automotriz', costo: 7, venta: 22 },
      { codigo: 'ELEC-AUTO', descripcion: 'Electricista automotriz', costo: 8, venta: 25 },
    ],
    articulos: [
      { codigo: 'ACEITE-MOTOR', descripcion: 'Aceite de motor', unidad: 'LT', clase: 'ART-INV' },
      { codigo: 'FILTRO-ACEITE', descripcion: 'Filtro de aceite', unidad: 'UN', clase: 'ART-INV' },
      { codigo: 'PASTILLAS', descripcion: 'Pastillas de freno (juego)', unidad: 'UN', clase: 'ART-INV' },
    ],
    tiposOrden: [
      { codigo: 'MANT-KM', descripcion: 'Mantenimiento por kilometraje', objeto: 'VEHICULO', plantilla: 'MANT-5000', campos: [{ campo: 'kilometraje', etiqueta: 'Kilometraje', tipo: 'NUMERO', obligatorio: true }] },
      { codigo: 'DIAGNOSTICO', descripcion: 'Diagnóstico', objeto: 'VEHICULO', campos: [{ campo: 'kilometraje', etiqueta: 'Kilometraje', tipo: 'NUMERO', obligatorio: true }, { campo: 'sintoma', etiqueta: 'Síntoma reportado', tipo: 'TEXTO' }] },
      { codigo: 'REPARACION', descripcion: 'Reparación', objeto: 'VEHICULO', campos: [{ campo: 'kilometraje', etiqueta: 'Kilometraje', tipo: 'NUMERO', obligatorio: true }] },
    ],
    temparios: [
      {
        codigo: 'MANT-5000', descripcion: 'Mantenimiento de 5.000 km', tipoOrden: 'MANT-KM',
        lineas: [
          { tipo: 'ACTIVIDAD', descripcion: 'Cambio de aceite y filtro', perfil: 'MECANICO', horas: 0.75 },
          { tipo: 'ACTIVIDAD', descripcion: 'Revisión de 20 puntos', perfil: 'MECANICO', horas: 0.5 },
          { tipo: 'MATERIAL', descripcion: 'Aceite', articulo: 'ACEITE-MOTOR', cantidad: 4 },
          { tipo: 'MATERIAL', descripcion: 'Filtro', articulo: 'FILTRO-ACEITE', cantidad: 1 },
        ],
      },
    ],
  },
];

async function idPorCodigo(trx: Trx, tabla: string, codigo: string): Promise<string | null> {
  const r = await sql<{ id: string }>`select id from ${sql.table(`erp.${tabla}`)} where codigo = ${codigo}`.execute(trx);
  return r.rows[0]?.id ?? null;
}

/** Aplica una plantilla de industria. Es idempotente: lo que ya existe con el mismo código no se toca. */
export async function aplicarIndustria(trx: Trx, codigo: string): Promise<Record<string, number>> {
  const ind = INDUSTRIAS.find((i) => i.codigo === codigo);
  if (!ind) throw new ErrorNegocio(404, 'La plantilla de industria no existe.');
  const creados = { perfiles: 0, articulos: 0, tiposOrden: 0, campos: 0, temparios: 0 };
  const tipoOs = await tipoDocumento(trx, 'SRV', 'OS');
  const claseServ = await idPorCodigo(trx, 'con_clases_contables', 'ART-SERV');
  const articuloMo = await idPorCodigo(trx, 'mae_articulos', 'MO-GENERAL');

  for (const p of ind.perfiles) {
    if (await idPorCodigo(trx, 'srv_perfiles', p.codigo)) continue;
    const r = await sql<{ id: string }>`insert into erp.srv_perfiles (codigo, descripcion) values (${p.codigo}, ${p.descripcion}) returning id`.execute(trx);
    await sql`insert into erp.srv_tarifas (perfil_id, costo_hora, venta_hora, vigente_desde)
              values (${r.rows[0]!.id}, ${p.costo}, ${p.venta}, '2024-01-01')`.execute(trx);
    creados.perfiles++;
  }
  for (const a of ind.articulos) {
    if (await idPorCodigo(trx, 'mae_articulos', a.codigo)) continue;
    await sql`insert into erp.mae_articulos (codigo, descripcion, tipo_existencia, unidad_primaria, impuesto_id, clase_contable_id, categoria)
              values (${a.codigo}, ${a.descripcion}, 'INVENTARIABLE', ${a.unidad},
                (select id from erp.mae_impuestos where codigo = 'IVA15' order by vigente_desde desc limit 1),
                (select id from erp.con_clases_contables where codigo = ${a.clase}), 'CONS')`.execute(trx);
    creados.articulos++;
  }
  for (const t of ind.tiposOrden) {
    if (await idPorCodigo(trx, 'srv_tipos_orden', t.codigo)) continue;
    const r = await sql<{ id: string }>`
      insert into erp.srv_tipos_orden (codigo, descripcion, tipo_documento_id, tipo_objeto, cobertura_defecto, modo_horas,
        clase_contable_id, articulo_mano_obra_id)
      values (${t.codigo}, ${t.descripcion}, ${tipoOs.id}, ${t.objeto}, ${t.cobertura ?? 'FACTURABLE'}, ${t.modoHoras ?? 'AMBOS'},
        ${claseServ}, ${articuloMo})
      returning id`.execute(trx);
    let orden = 1;
    for (const c of t.campos ?? []) {
      await sql`insert into erp.srv_campos (tipo_orden_id, campo, etiqueta, tipo_dato, obligatorio, sensible, orden)
                values (${r.rows[0]!.id}, ${c.campo}, ${c.etiqueta}, ${c.tipo}, ${c.obligatorio ?? false}, ${c.sensible ?? false}, ${orden++})`.execute(trx);
      creados.campos++;
    }
    creados.tiposOrden++;
  }
  for (const tp of ind.temparios) {
    if (await idPorCodigo(trx, 'srv_plantillas', tp.codigo)) continue;
    const tipoId = await idPorCodigo(trx, 'srv_tipos_orden', tp.tipoOrden);
    const r = await sql<{ id: string }>`
      insert into erp.srv_plantillas (codigo, descripcion, tipo_orden_id, precio_cerrado, articulo_id)
      values (${tp.codigo}, ${tp.descripcion}, ${tipoId}, ${tp.precioCerrado ?? null}, ${tp.precioCerrado != null ? articuloMo : null})
      returning id`.execute(trx);
    let linea = 1;
    for (const l of tp.lineas) {
      await sql`
        insert into erp.srv_plantillas_lineas (plantilla_id, linea, tipo_linea, descripcion, articulo_id, cantidad, horas, perfil_id, personas, costo_estimado)
        values (${r.rows[0]!.id}, ${linea++}, ${l.tipo}, ${l.descripcion},
          ${l.articulo ? await idPorCodigo(trx, 'mae_articulos', l.articulo) : null}, ${l.cantidad ?? null}, ${l.horas ?? null},
          ${l.perfil ? await idPorCodigo(trx, 'srv_perfiles', l.perfil) : null}, ${l.personas ?? 1}, ${l.costo ?? null})`.execute(trx);
    }
    creados.temparios++;
  }
  // Liga cada tipo de orden con su tempario sugerido.
  for (const t of ind.tiposOrden) {
    if (!t.plantilla) continue;
    await sql`update erp.srv_tipos_orden set plantilla_defecto_id = (select id from erp.srv_plantillas where codigo = ${t.plantilla})
              where codigo = ${t.codigo} and plantilla_defecto_id is null`.execute(trx);
  }
  return creados;
}
