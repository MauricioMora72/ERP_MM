import type { Campo, Entidad } from './entidades';

/** Entidades de configuración y consulta de la fase 1: servicios, ventas, inventario, contabilidad y localización. */

const t = (nombre: string, etiqueta: string, extra: Partial<Campo> = {}): Campo => ({ nombre, etiqueta, tipo: 'texto', max: 200, ...extra });
const ref = (nombre: string, etiqueta: string, referencia: string, extra: Partial<Campo> = {}): Campo => ({ nombre, etiqueta, tipo: 'referencia', referencia, ...extra });
const ent = (nombre: string, etiqueta: string, extra: Partial<Campo> = {}): Campo => ({ nombre, etiqueta, tipo: 'entero', ...extra });
const dec = (nombre: string, etiqueta: string, escala: number, extra: Partial<Campo> = {}): Campo => ({ nombre, etiqueta, tipo: 'decimal', escala, ...extra });
const fec = (nombre: string, etiqueta: string, extra: Partial<Campo> = {}): Campo => ({ nombre, etiqueta, tipo: 'fecha', ...extra });
const bool = (nombre: string, etiqueta: string, defecto = false): Campo => ({ nombre, etiqueta, tipo: 'booleano', defecto });
const opc = (nombre: string, etiqueta: string, valores: [string, string][], extra: Partial<Campo> = {}): Campo => ({
  nombre, etiqueta, tipo: 'opcion', opciones: valores.map(([valor, e]) => ({ valor, etiqueta: e })), ...extra,
});
const activo = bool('activo', 'Activo', true);
const cod = (max = 20) => t('codigo', 'Código', { requerido: true, max, soloAlta: true });
const desc = t('descripcion', 'Descripción', { requerido: true });

const TIPOS_OBJETO: [string, string][] = [['PACIENTE', 'Paciente'], ['EQUIPO', 'Equipo'], ['VEHICULO', 'Vehículo'], ['INSTALACION', 'Instalación'], ['OTRO', 'Otro']];
const COBERTURAS: [string, string][] = [['FACTURABLE', 'Facturable'], ['GARANTIA', 'Garantía'], ['CONTRATO', 'Contrato'], ['INTERNO', 'Interno']];
const ABIERTO: [string, string][] = [['ABIERTO', 'Abierto'], ['CERRADO', 'Cerrado']];

const base = (e: Omit<Entidad, 'inactivable'> & { inactivable?: boolean }): Entidad => ({ inactivable: false, ...e });

export const ENTIDADES_FASE1: Entidad[] = [
  // ------------------------------------------------------------ Servicios
  base({
    nombre: 'tipos-orden', tabla: 'srv_tipos_orden', titulo: 'Tipos de orden', tituloSingular: 'Tipo de orden', modulo: 'Servicios',
    campos: [
      cod(), desc,
      ref('tipo_documento_id', 'Tipo de documento y flujo', 'tipos-documento', { requerido: true }),
      opc('tipo_objeto', 'Qué se atiende', TIPOS_OBJETO),
      opc('cobertura_defecto', 'Cobertura por defecto', COBERTURAS, { requerido: true, defecto: 'FACTURABLE' }),
      opc('modo_horas', 'Registro de horas', [['AMBOS', 'Inicio y fin, o total'], ['RANGO', 'Solo inicio y fin'], ['TOTAL', 'Solo total de horas']], { requerido: true, defecto: 'AMBOS' }),
      ref('clase_contable_id', 'Clase contable', 'clases-contables'),
      ref('articulo_mano_obra_id', 'Servicio para facturar mano de obra', 'articulos'),
      ref('plantilla_defecto_id', 'Tempario sugerido', 'temparios'),
      dec('margen_terceros', 'Margen sobre servicios de terceros (%)', 4, { defecto: '0' }),
      activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo_objeto', 'cobertura_defecto', 'activo'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'], orden: 'codigo', inactivable: true,
    hijos: [{ entidad: 'campos-orden', campo: 'tipo_orden_id', titulo: 'Campos propios' }],
  }),
  base({
    nombre: 'campos-orden', tabla: 'srv_campos', titulo: 'Campos propios de órdenes', tituloSingular: 'Campo propio', modulo: 'Servicios', oculta: true,
    campos: [
      ref('tipo_orden_id', 'Tipo de orden', 'tipos-orden', { requerido: true }),
      t('campo', 'Nombre técnico', { requerido: true, max: 50, soloAlta: true, ayuda: 'Sin espacios, por ejemplo pieza_dental' }),
      t('etiqueta', 'Etiqueta en pantalla', { requerido: true }),
      opc('tipo_dato', 'Tipo de dato', [['TEXTO', 'Texto'], ['NUMERO', 'Número'], ['FECHA', 'Fecha'], ['SI_NO', 'Sí o no']], { requerido: true }),
      bool('obligatorio', 'Obligatorio'),
      bool('sensible', 'Dato sensible (solo con permiso)'),
      ent('orden', 'Orden en pantalla'),
    ],
    listado: ['tipo_orden_id', 'etiqueta', 'tipo_dato', 'obligatorio', 'sensible'], busqueda: ['campo', 'etiqueta'],
    etiqueta: ['etiqueta'], orden: 'orden',
  }),
  base({
    nombre: 'objetos', tabla: 'srv_objetos', titulo: 'Objetos atendidos', tituloSingular: 'Objeto atendido', modulo: 'Servicios',
    campos: [
      t('codigo', 'Código', { requerido: true, max: 30, soloAlta: true }), desc,
      opc('tipo_objeto', 'Tipo', TIPOS_OBJETO, { requerido: true }),
      ref('cliente_id', 'Cliente o paciente', 'direcciones'),
      t('serie', 'Serie, placa o historia clínica', { max: 50 }),
      ref('articulo_origen_id', 'Artículo vendido', 'articulos', { ayuda: 'Con la fecha de venta calcula la garantía' }),
      fec('fecha_venta', 'Fecha de venta o instalación'),
      ref('fabricante_id', 'Fabricante o proveedor de garantía', 'direcciones'),
      activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo_objeto', 'cliente_id', 'serie'], busqueda: ['codigo', 'descripcion', 'serie'],
    etiqueta: ['codigo', 'descripcion'], orden: 'codigo', inactivable: true,
    hijos: [{ entidad: 'garantias-objeto', campo: 'objeto_id', titulo: 'Garantías' }],
  }),
  base({
    nombre: 'perfiles', tabla: 'srv_perfiles', titulo: 'Perfiles y especialidades', tituloSingular: 'Perfil', modulo: 'Servicios',
    campos: [cod(), desc, activo], listado: ['codigo', 'descripcion', 'activo'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['descripcion'], orden: 'codigo', inactivable: true,
  }),
  base({
    nombre: 'recursos', tabla: 'srv_recursos', titulo: 'Recursos', tituloSingular: 'Recurso', modulo: 'Servicios',
    campos: [
      cod(), desc,
      opc('tipo', 'Tipo', [['PERSONA', 'Persona'], ['SALA', 'Sala o consultorio'], ['VEHICULO', 'Vehículo'], ['EQUIPO', 'Equipo']], { requerido: true }),
      ref('direccion_id', 'Empleado', 'direcciones'),
      ref('unidad_negocio_id', 'Sucursal', 'unidades-negocio'),
      dec('costo_hora', 'Costo por hora (si no hay tarifa)', 6),
      activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo', 'unidad_negocio_id', 'activo'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['descripcion'], orden: 'codigo', inactivable: true,
    hijos: [{ entidad: 'recursos-perfiles', campo: 'recurso_id', titulo: 'Perfiles que cubre' }],
  }),
  base({
    nombre: 'recursos-perfiles', tabla: 'srv_recursos_perfiles', titulo: 'Perfiles por recurso', tituloSingular: 'Perfil del recurso', modulo: 'Servicios', oculta: true,
    campos: [ref('recurso_id', 'Recurso', 'recursos', { requerido: true }), ref('perfil_id', 'Perfil', 'perfiles', { requerido: true })],
    listado: ['recurso_id', 'perfil_id'], busqueda: [], etiqueta: ['perfil_id'], orden: 'creado_en',
  }),
  base({
    nombre: 'tarifas', tabla: 'srv_tarifas', titulo: 'Tarifas de mano de obra', tituloSingular: 'Tarifa', modulo: 'Servicios',
    campos: [
      ref('perfil_id', 'Perfil', 'perfiles'), ref('recurso_id', 'Recurso (tarifa particular)', 'recursos'),
      ref('lista_precios_id', 'Lista de precios', 'listas-precios'),
      dec('costo_hora', 'Costo por hora', 6, { requerido: true }), dec('venta_hora', 'Venta por hora', 6, { requerido: true }),
      fec('vigente_desde', 'Vigente desde', { requerido: true }), fec('vigente_hasta', 'Vigente hasta'),
    ],
    listado: ['perfil_id', 'recurso_id', 'costo_hora', 'venta_hora', 'vigente_desde'], busqueda: [], etiqueta: ['venta_hora'], orden: 'vigente_desde',
  }),
  base({
    nombre: 'temparios', tabla: 'srv_plantillas', titulo: 'Temparios', tituloSingular: 'Tempario', modulo: 'Servicios',
    campos: [
      cod(), desc, ref('tipo_orden_id', 'Tipo de orden', 'tipos-orden'),
      dec('precio_cerrado', 'Precio cerrado', 6, { ayuda: 'Si se llena, se factura este precio en lugar de horas y materiales' }),
      ref('articulo_id', 'Servicio del precio cerrado', 'articulos'), activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo_orden_id', 'precio_cerrado', 'activo'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'], orden: 'codigo', inactivable: true,
    hijos: [{ entidad: 'temparios-lineas', campo: 'plantilla_id', titulo: 'Personas y materiales' }],
  }),
  base({
    nombre: 'temparios-lineas', tabla: 'srv_plantillas_lineas', titulo: 'Líneas de tempario', tituloSingular: 'Línea de tempario', modulo: 'Servicios', oculta: true,
    campos: [
      ref('plantilla_id', 'Tempario', 'temparios', { requerido: true }), ent('linea', 'Línea', { requerido: true }),
      opc('tipo_linea', 'Clase', [['ACTIVIDAD', 'Actividad'], ['MATERIAL', 'Material'], ['TERCERO', 'Servicio de tercero']], { requerido: true }),
      t('descripcion', 'Descripción'), ref('perfil_id', 'Perfil requerido', 'perfiles'),
      ent('personas', 'Personas', { defecto: 1 }), dec('horas', 'Tiempo estándar (horas)', 4),
      ref('articulo_id', 'Material', 'articulos'), dec('cantidad', 'Cantidad', 4),
      bool('facturable', 'Facturable', true), dec('costo_estimado', 'Costo estimado (terceros)', 6),
    ],
    listado: ['linea', 'tipo_linea', 'descripcion', 'perfil_id', 'personas', 'horas', 'articulo_id', 'cantidad'], busqueda: ['descripcion'],
    etiqueta: ['linea', 'descripcion'], orden: 'linea',
  }),
  base({
    nombre: 'garantias', tabla: 'srv_garantias_definicion', titulo: 'Reglas de garantía', tituloSingular: 'Regla de garantía', modulo: 'Servicios',
    campos: [
      cod(), desc, ref('articulo_id', 'Artículo', 'articulos'),
      { nombre: 'categoria', etiqueta: 'Categoría de artículo', tipo: 'catalogo', catalogo: { modulo: 'MAE', codigo: 'CATEGORIA_ART' } },
      ent('meses', 'Meses de garantía', { requerido: true }),
      dec('pct_mano_obra', 'Cubre mano de obra (%)', 4, { defecto: '100' }), dec('pct_materiales', 'Cubre materiales (%)', 4, { defecto: '100' }),
      bool('respaldo_fabricante', 'Respaldada por el fabricante (se puede reclamar)'), activo,
    ],
    listado: ['codigo', 'descripcion', 'meses', 'pct_mano_obra', 'pct_materiales'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo'], orden: 'codigo', inactivable: true,
  }),
  base({
    nombre: 'garantias-objeto', tabla: 'srv_garantias_objeto', titulo: 'Garantías de objetos', tituloSingular: 'Garantía', modulo: 'Servicios', oculta: true, soloLectura: true,
    campos: [
      ref('objeto_id', 'Objeto', 'objetos'), fec('fecha_inicio', 'Desde'), fec('fecha_fin', 'Hasta'),
      dec('pct_mano_obra', 'Mano de obra (%)', 4), dec('pct_materiales', 'Materiales (%)', 4), ref('fabricante_id', 'Fabricante', 'direcciones'),
    ],
    listado: ['fecha_inicio', 'fecha_fin', 'pct_mano_obra', 'pct_materiales', 'fabricante_id'], busqueda: [], etiqueta: ['fecha_fin'], orden: 'fecha_inicio',
  }),
  base({
    nombre: 'contratos', tabla: 'ven_contratos', titulo: 'Contratos de servicio', tituloSingular: 'Contrato', modulo: 'Servicios',
    campos: [
      ref('compania_id', 'Compañía', 'companias', { requerido: true }), ent('numero', 'Número', { requerido: true, soloAlta: true }),
      ref('cliente_id', 'Cliente', 'direcciones', { requerido: true }), fec('fecha_inicio', 'Inicio', { requerido: true }), fec('fecha_fin', 'Fin'),
      opc('frecuencia', 'Frecuencia de facturación', [['MENSUAL', 'Mensual'], ['TRIMESTRAL', 'Trimestral'], ['ANUAL', 'Anual']], { requerido: true }),
      ent('dia_facturacion', 'Día de facturación'),
      opc('estado', 'Estado', [['VIGENTE', 'Vigente'], ['SUSPENDIDO', 'Suspendido'], ['TERMINADO', 'Terminado']], { requerido: true, defecto: 'VIGENTE' }),
    ],
    listado: ['numero', 'cliente_id', 'fecha_inicio', 'fecha_fin', 'estado'], busqueda: [], etiqueta: ['numero'], orden: 'numero',
    hijos: [
      { entidad: 'contratos-lineas', campo: 'contrato_id', titulo: 'Coberturas' },
      { entidad: 'preventivos', campo: 'contrato_id', titulo: 'Preventivos programados' },
    ],
  }),
  base({
    nombre: 'contratos-lineas', tabla: 'ven_contratos_lineas', titulo: 'Coberturas de contrato', tituloSingular: 'Cobertura', modulo: 'Servicios', oculta: true,
    campos: [
      ref('contrato_id', 'Contrato', 'contratos', { requerido: true }), ent('linea', 'Línea', { requerido: true }),
      ref('articulo_id', 'Servicio del contrato', 'articulos', { requerido: true }), dec('cantidad', 'Cantidad por período', 4, { defecto: '1' }),
      dec('precio', 'Precio por período', 6, { requerido: true }),
      ref('tipo_orden_id', 'Tipo de orden cubierto (vacío: todos)', 'tipos-orden'),
      dec('pct_mano_obra', 'Cubre mano de obra (%)', 4, { defecto: '100' }), dec('pct_materiales', 'Cubre materiales (%)', 4, { defecto: '0' }),
      ent('tope_ordenes', 'Tope de órdenes'),
    ],
    listado: ['linea', 'articulo_id', 'tipo_orden_id', 'pct_mano_obra', 'pct_materiales', 'tope_ordenes'], busqueda: [], etiqueta: ['linea'], orden: 'linea',
  }),
  base({
    nombre: 'preventivos', tabla: 'ven_contratos_preventivos', titulo: 'Preventivos programados', tituloSingular: 'Preventivo', modulo: 'Servicios', oculta: true,
    campos: [
      ref('contrato_id', 'Contrato', 'contratos', { requerido: true }), ref('objeto_id', 'Objeto', 'objetos'),
      ref('tipo_orden_id', 'Tipo de orden', 'tipos-orden', { requerido: true }), ref('plantilla_id', 'Tempario', 'temparios'),
      ent('frecuencia_meses', 'Cada cuántos meses', { requerido: true }), fec('proxima_fecha', 'Próxima fecha', { requerido: true }), activo,
    ],
    listado: ['objeto_id', 'tipo_orden_id', 'frecuencia_meses', 'proxima_fecha', 'activo'], busqueda: [], etiqueta: ['proxima_fecha'], orden: 'proxima_fecha', inactivable: true,
  }),
  base({
    nombre: 'agenda', tabla: 'srv_agenda', titulo: 'Agenda de recursos', tituloSingular: 'Reserva', modulo: 'Servicios',
    campos: [
      ref('recurso_id', 'Recurso', 'recursos', { requerido: true }),
      { nombre: 'inicio', etiqueta: 'Inicio', tipo: 'fechaHora', requerido: true }, { nombre: 'fin', etiqueta: 'Fin', tipo: 'fechaHora', requerido: true },
      ref('cliente_id', 'Cliente o paciente', 'direcciones'),
      opc('estado', 'Estado', [['RESERVADA', 'Reservada'], ['CONFIRMADA', 'Confirmada'], ['ATENDIDA', 'Atendida'], ['CANCELADA', 'Cancelada']], { requerido: true, defecto: 'RESERVADA' }),
    ],
    listado: ['inicio', 'fin', 'recurso_id', 'cliente_id', 'estado'], busqueda: [], etiqueta: ['inicio'], orden: 'inicio', ordenDescendente: true,
  }),

  // ------------------------------------------------------------ Ventas
  base({
    nombre: 'clientes', tabla: 'mae_clientes', titulo: 'Clientes', tituloSingular: 'Cliente', modulo: 'Ventas',
    campos: [
      ref('direccion_id', 'Libro de direcciones', 'direcciones', { requerido: true, soloAlta: true }),
      ref('compania_id', 'Compañía', 'companias', { requerido: true, soloAlta: true }),
      ref('condicion_pago_id', 'Condición de pago', 'condiciones-pago'), ref('lista_precios_id', 'Lista de precios', 'listas-precios'),
      ref('clase_contable_id', 'Clase contable', 'clases-contables', { requerido: true }),
      dec('limite_credito', 'Límite de crédito', 2, { defecto: '0' }), ref('vendedor_id', 'Vendedor', 'direcciones'), bool('bloqueado', 'Crédito bloqueado'),
    ],
    listado: ['direccion_id', 'compania_id', 'lista_precios_id', 'limite_credito', 'bloqueado'], busqueda: [], etiqueta: ['direccion_id'], orden: 'creado_en',
  }),
  base({
    nombre: 'proveedores', tabla: 'mae_proveedores', titulo: 'Proveedores', tituloSingular: 'Proveedor', modulo: 'Ventas',
    campos: [
      ref('direccion_id', 'Libro de direcciones', 'direcciones', { requerido: true, soloAlta: true }),
      ref('compania_id', 'Compañía', 'companias', { requerido: true, soloAlta: true }),
      ref('condicion_pago_id', 'Condición de pago', 'condiciones-pago'), ref('clase_contable_id', 'Clase contable', 'clases-contables', { requerido: true }),
      t('codigo_ret_renta', 'Retención de renta por defecto', { max: 10 }), t('codigo_ret_iva', 'Retención de IVA por defecto', { max: 10 }),
    ],
    listado: ['direccion_id', 'compania_id', 'condicion_pago_id'], busqueda: [], etiqueta: ['direccion_id'], orden: 'creado_en',
  }),
  base({
    nombre: 'listas-precios', tabla: 'mae_listas_precios', titulo: 'Listas de precios', tituloSingular: 'Lista de precios', modulo: 'Ventas',
    campos: [cod(), desc, ref('moneda_id', 'Moneda', 'monedas', { requerido: true }), bool('incluye_impuestos', 'Precios con IVA incluido')],
    listado: ['codigo', 'descripcion', 'moneda_id'], busqueda: ['codigo', 'descripcion'], etiqueta: ['codigo', 'descripcion'], orden: 'codigo',
    hijos: [{ entidad: 'precios', campo: 'lista_precios_id', titulo: 'Precios' }],
  }),
  base({
    nombre: 'precios', tabla: 'mae_precios', titulo: 'Precios', tituloSingular: 'Precio', modulo: 'Ventas', oculta: true,
    campos: [
      ref('lista_precios_id', 'Lista', 'listas-precios', { requerido: true }), ref('articulo_id', 'Artículo', 'articulos', { requerido: true }),
      { nombre: 'unidad', etiqueta: 'Unidad', tipo: 'catalogo', requerido: true, catalogo: { modulo: 'MAE', codigo: 'UM' } },
      fec('vigente_desde', 'Vigente desde', { requerido: true }), fec('vigente_hasta', 'Vigente hasta'), dec('precio', 'Precio', 6, { requerido: true }),
    ],
    listado: ['articulo_id', 'unidad', 'precio', 'vigente_desde', 'vigente_hasta'], busqueda: [], etiqueta: ['precio'], orden: 'vigente_desde',
  }),
  base({
    nombre: 'facturas', tabla: 'ven_facturas', titulo: 'Facturas emitidas', tituloSingular: 'Factura', modulo: 'Ventas', soloLectura: true, ordenDescendente: true,
    campos: [
      t('establecimiento', 'Establecimiento'), t('punto_emision', 'Punto de emisión'), ent('secuencial', 'Secuencial'), fec('fecha', 'Fecha'),
      ref('cliente_id', 'Cliente', 'direcciones'), dec('subtotal', 'Subtotal', 2), dec('descuento', 'Cubierto o descuento', 2),
      dec('impuestos', 'Impuestos', 2), dec('total', 'Total', 2), t('estado', 'Estado'),
    ],
    listado: ['secuencial', 'fecha', 'cliente_id', 'subtotal', 'descuento', 'impuestos', 'total'], busqueda: [], etiqueta: ['secuencial'], orden: 'secuencial',
    hijos: [{ entidad: 'facturas-lineas', campo: 'factura_id', titulo: 'Detalle' }],
  }),
  base({
    nombre: 'facturas-lineas', tabla: 'ven_facturas_lineas', titulo: 'Detalle de facturas', tituloSingular: 'Línea de factura', modulo: 'Ventas', oculta: true, soloLectura: true,
    campos: [
      ref('factura_id', 'Factura', 'facturas'), ent('linea', 'Línea'), t('descripcion', 'Descripción'), dec('cantidad', 'Cantidad', 4),
      dec('precio', 'Precio', 6), dec('descuento', 'Cubierto o descuento', 2), dec('valor_impuesto', 'IVA', 2), dec('total', 'Total', 2),
    ],
    listado: ['linea', 'descripcion', 'cantidad', 'precio', 'descuento', 'valor_impuesto', 'total'], busqueda: [], etiqueta: ['linea'], orden: 'linea',
  }),

  // ------------------------------------------------------------ Inventario
  base({
    nombre: 'kardex', tabla: 'inv_kardex', titulo: 'Kardex', tituloSingular: 'Movimiento', modulo: 'Inventario', soloLectura: true, ordenDescendente: true,
    campos: [
      fec('fecha', 'Fecha'), ref('articulo_id', 'Artículo', 'articulos'), ref('unidad_negocio_id', 'Bodega', 'unidades-negocio'),
      ref('tipo_documento_id', 'Documento', 'tipos-documento'), ent('numero_documento', 'Número'), t('origen_modulo', 'Módulo'),
      dec('cantidad', 'Cantidad', 4), dec('costo_unitario', 'Costo unitario', 6), dec('costo_total', 'Costo total', 2),
    ],
    listado: ['fecha', 'articulo_id', 'unidad_negocio_id', 'tipo_documento_id', 'numero_documento', 'cantidad', 'costo_unitario', 'costo_total'],
    busqueda: [], etiqueta: ['fecha'], orden: 'creado_en',
  }),

  // ------------------------------------------------------------ Contabilidad
  base({
    nombre: 'cuentas', tabla: 'con_cuentas', titulo: 'Plan de cuentas', tituloSingular: 'Cuenta', modulo: 'Contabilidad',
    campos: [
      ref('compania_id', 'Compañía', 'companias', { requerido: true, soloAlta: true }), t('codigo', 'Código', { requerido: true, max: 30, soloAlta: true }), desc,
      ent('nivel', 'Nivel', { requerido: true }), ref('cuenta_padre_id', 'Cuenta superior', 'cuentas'),
      opc('naturaleza', 'Naturaleza', [['D', 'Deudora'], ['A', 'Acreedora']], { requerido: true }),
      opc('tipo', 'Tipo', [['BALANCE', 'Balance'], ['RESULTADOS', 'Resultados']], { requerido: true }),
      bool('acepta_movimiento', 'Acepta movimiento'), bool('exige_centro_costo', 'Exige centro de costo'), bool('exige_tercero', 'Exige tercero'), activo,
    ],
    listado: ['codigo', 'descripcion', 'naturaleza', 'tipo', 'acepta_movimiento'], busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'], orden: 'codigo', inactivable: true,
  }),
  base({
    nombre: 'conceptos', tabla: 'con_tipos_transaccion', titulo: 'Conceptos contables', tituloSingular: 'Concepto contable', modulo: 'Contabilidad',
    campos: [cod(), desc], listado: ['codigo', 'descripcion'], busqueda: ['codigo', 'descripcion'], etiqueta: ['codigo', 'descripcion'], orden: 'codigo',
  }),
  base({
    nombre: 'reglas-contables', tabla: 'con_reglas_contables', titulo: 'Reglas contables', tituloSingular: 'Regla contable', modulo: 'Contabilidad',
    campos: [
      ref('compania_id', 'Compañía', 'companias', { requerido: true }), ref('tipo_transaccion_id', 'Concepto', 'conceptos', { requerido: true }),
      ref('clase_contable_id', 'Clase contable (vacío: todas)', 'clases-contables'), ref('unidad_negocio_id', 'Unidad de negocio (vacío: todas)', 'unidades-negocio'),
      ref('cuenta_id', 'Cuenta', 'cuentas', { requerido: true }), ref('centro_costo_id', 'Centro de costo fijo', 'unidades-negocio'),
      ent('prioridad', 'Prioridad', { defecto: 0 }),
    ],
    listado: ['tipo_transaccion_id', 'clase_contable_id', 'unidad_negocio_id', 'cuenta_id'], busqueda: [], etiqueta: ['tipo_transaccion_id'], orden: 'creado_en',
  }),
  base({
    nombre: 'periodos', tabla: 'con_periodos', titulo: 'Períodos contables', tituloSingular: 'Período', modulo: 'Contabilidad',
    campos: [
      ref('compania_id', 'Compañía', 'companias', { requerido: true }), ent('anio', 'Año', { requerido: true }), ent('periodo', 'Período', { requerido: true }),
      fec('fecha_desde', 'Desde', { requerido: true }), fec('fecha_hasta', 'Hasta', { requerido: true }),
      opc('estado_ventas', 'Ventas', ABIERTO, { defecto: 'ABIERTO' }), opc('estado_compras', 'Compras', ABIERTO, { defecto: 'ABIERTO' }),
      opc('estado_inventario', 'Inventario', ABIERTO, { defecto: 'ABIERTO' }), opc('estado_contabilidad', 'Contabilidad', ABIERTO, { defecto: 'ABIERTO' }),
    ],
    listado: ['anio', 'periodo', 'fecha_desde', 'fecha_hasta', 'estado_contabilidad'], busqueda: [], etiqueta: ['anio', 'periodo'], orden: 'fecha_desde',
  }),
  base({
    nombre: 'asientos', tabla: 'con_asientos', titulo: 'Asientos contables', tituloSingular: 'Asiento', modulo: 'Contabilidad', soloLectura: true, ordenDescendente: true,
    campos: [ent('numero', 'Número'), fec('fecha', 'Fecha'), t('glosa', 'Glosa'), t('origen_modulo', 'Módulo de origen'), t('estado', 'Estado')],
    listado: ['numero', 'fecha', 'glosa', 'origen_modulo', 'estado'], busqueda: ['glosa'], etiqueta: ['numero'], orden: 'creado_en',
    hijos: [{ entidad: 'asientos-lineas', campo: 'asiento_id', titulo: 'Líneas' }],
  }),
  base({
    nombre: 'asientos-lineas', tabla: 'con_asientos_lineas', titulo: 'Líneas de asiento', tituloSingular: 'Línea', modulo: 'Contabilidad', oculta: true, soloLectura: true,
    campos: [
      ref('asiento_id', 'Asiento', 'asientos'), ent('linea', 'Línea'), ref('cuenta_id', 'Cuenta', 'cuentas'),
      ref('centro_costo_id', 'Centro de costo', 'unidades-negocio'), ref('tercero_id', 'Tercero', 'direcciones'),
      dec('debito', 'Débito', 2), dec('credito', 'Crédito', 2),
    ],
    listado: ['linea', 'cuenta_id', 'centro_costo_id', 'tercero_id', 'debito', 'credito'], busqueda: [], etiqueta: ['linea'], orden: 'linea',
  }),

  // ------------------------------------------------------------ Localización
  base({
    nombre: 'establecimientos', tabla: 'ec_establecimientos', titulo: 'Establecimientos SRI', tituloSingular: 'Establecimiento', modulo: 'Localización',
    campos: [
      ref('compania_id', 'Compañía', 'companias', { requerido: true }), t('establecimiento', 'Establecimiento', { requerido: true, max: 3 }),
      t('punto_emision', 'Punto de emisión', { requerido: true, max: 3 }), ref('unidad_negocio_id', 'Sucursal', 'unidades-negocio'),
      t('direccion', 'Dirección', { requerido: true, max: 300 }),
      opc('ambiente', 'Ambiente', [['1', 'Pruebas'], ['2', 'Producción']], { requerido: true, defecto: '1' }), activo,
    ],
    listado: ['establecimiento', 'punto_emision', 'direccion', 'ambiente', 'activo'], busqueda: [], etiqueta: ['establecimiento', 'punto_emision'],
    orden: 'establecimiento', inactivable: true,
  }),
];
