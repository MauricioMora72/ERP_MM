/**
 * Definición de las entidades de la fase 0.
 * Con estos metadatos la API arma sus rutas y validaciones, y la interfaz arma listas y formularios.
 * Agregar una entidad nueva aquí la deja disponible en la API y en la web sin código adicional.
 */

export type TipoCampo =
  | 'texto'
  | 'entero'
  | 'decimal'
  | 'fecha'
  | 'booleano'
  | 'referencia'
  | 'catalogo'
  | 'opcion'
  | 'json';

export interface Campo {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Longitud máxima para texto. */
  max?: number;
  /** Para decimal: decimales permitidos. */
  escala?: number;
  /** Para referencia: entidad destino. */
  referencia?: string;
  /** Para catálogo: código del catálogo en cat_catalogos (módulo + código). */
  catalogo?: { modulo: string; codigo: string };
  /** Para opción: valores fijos del producto (no configurables). */
  opciones?: { valor: string; etiqueta: string }[];
  /** Valor por defecto al crear. */
  defecto?: string | number | boolean;
  /** No se puede modificar después de crear. */
  soloAlta?: boolean;
  ayuda?: string;
}

export interface Entidad {
  /** Nombre en la URL: /api/companias */
  nombre: string;
  /** Tabla en PostgreSQL (esquema erp). */
  tabla: string;
  titulo: string;
  tituloSingular: string;
  modulo: 'Sistema' | 'Catálogos' | 'Maestros' | 'Contabilidad';
  campos: Campo[];
  /** Columnas que se muestran en la lista. */
  listado: string[];
  /** Columnas donde busca el filtro de texto. */
  busqueda: string[];
  /** Columna que se usa como texto al mostrar una referencia a esta entidad. */
  etiqueta: string[];
  orden: string;
  /** La tabla tiene columna activo: se inactiva en vez de borrar. */
  inactivable: boolean;
}

const activo: Campo = { nombre: 'activo', etiqueta: 'Activo', tipo: 'booleano', defecto: true };

export const ENTIDADES: Entidad[] = [
  {
    nombre: 'monedas',
    tabla: 'mae_monedas',
    titulo: 'Monedas',
    tituloSingular: 'Moneda',
    modulo: 'Maestros',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código ISO', tipo: 'texto', requerido: true, max: 3, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'decimales', etiqueta: 'Decimales', tipo: 'entero', requerido: true, defecto: 2 },
    ],
    listado: ['codigo', 'descripcion', 'decimales'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo'],
    orden: 'codigo',
    inactivable: false,
  },
  {
    nombre: 'direcciones',
    tabla: 'mae_direcciones',
    titulo: 'Libro de direcciones',
    tituloSingular: 'Dirección',
    modulo: 'Maestros',
    campos: [
      { nombre: 'numero', etiqueta: 'Número', tipo: 'entero', ayuda: 'Se asigna solo si se deja vacío' },
      { nombre: 'nombre', etiqueta: 'Nombre o razón social', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'nombre_comercial', etiqueta: 'Nombre comercial', tipo: 'texto', max: 200 },
      {
        nombre: 'tipo_identificacion',
        etiqueta: 'Tipo de identificación',
        tipo: 'catalogo',
        requerido: true,
        catalogo: { modulo: 'MAE', codigo: 'TIPO_ID' },
      },
      { nombre: 'identificacion', etiqueta: 'Identificación', tipo: 'texto', requerido: true, max: 20 },
      {
        nombre: 'tipo_busqueda',
        etiqueta: 'Tipo de búsqueda',
        tipo: 'catalogo',
        requerido: true,
        catalogo: { modulo: 'MAE', codigo: 'TIPO_BUSQUEDA' },
      },
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'texto', max: 200 },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', max: 30 },
      { nombre: 'direccion_padre_id', etiqueta: 'Pertenece a', tipo: 'referencia', referencia: 'direcciones' },
      activo,
    ],
    listado: ['numero', 'nombre', 'identificacion', 'tipo_busqueda', 'activo'],
    busqueda: ['nombre', 'nombre_comercial', 'identificacion'],
    etiqueta: ['numero', 'nombre'],
    orden: 'numero',
    inactivable: true,
  },
  {
    nombre: 'ubicaciones',
    tabla: 'mae_direcciones_ubicaciones',
    titulo: 'Ubicaciones de terceros',
    tituloSingular: 'Ubicación',
    modulo: 'Maestros',
    campos: [
      { nombre: 'direccion_id', etiqueta: 'Tercero', tipo: 'referencia', referencia: 'direcciones', requerido: true },
      { nombre: 'secuencia', etiqueta: 'Secuencia', tipo: 'entero', requerido: true },
      {
        nombre: 'tipo',
        etiqueta: 'Tipo',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'MATRIZ', etiqueta: 'Matriz' },
          { valor: 'ENTREGA', etiqueta: 'Entrega' },
          { valor: 'FACTURACION', etiqueta: 'Facturación' },
        ],
      },
      { nombre: 'linea1', etiqueta: 'Calle y número', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'linea2', etiqueta: 'Referencia', tipo: 'texto', max: 200 },
      { nombre: 'ciudad', etiqueta: 'Ciudad', tipo: 'texto', max: 100 },
      { nombre: 'provincia', etiqueta: 'Provincia', tipo: 'texto', max: 100 },
      { nombre: 'pais', etiqueta: 'País', tipo: 'texto', requerido: true, max: 2, defecto: 'EC' },
    ],
    listado: ['direccion_id', 'secuencia', 'tipo', 'linea1', 'ciudad'],
    busqueda: ['linea1', 'ciudad'],
    etiqueta: ['linea1'],
    orden: 'secuencia',
    inactivable: false,
  },
  {
    nombre: 'contactos',
    tabla: 'mae_contactos',
    titulo: 'Contactos',
    tituloSingular: 'Contacto',
    modulo: 'Maestros',
    campos: [
      { nombre: 'direccion_id', etiqueta: 'Tercero', tipo: 'referencia', referencia: 'direcciones', requerido: true },
      { nombre: 'secuencia', etiqueta: 'Secuencia', tipo: 'entero', requerido: true },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'cargo', etiqueta: 'Cargo', tipo: 'texto', max: 100 },
      { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'texto', max: 30 },
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'texto', max: 200 },
      { nombre: 'recibe_comprobantes', etiqueta: 'Recibe comprobantes', tipo: 'booleano', defecto: false },
    ],
    listado: ['direccion_id', 'secuencia', 'nombre', 'correo'],
    busqueda: ['nombre', 'correo'],
    etiqueta: ['nombre'],
    orden: 'secuencia',
    inactivable: false,
  },
  {
    nombre: 'companias',
    tabla: 'mae_companias',
    titulo: 'Compañías',
    tituloSingular: 'Compañía',
    modulo: 'Maestros',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      {
        nombre: 'direccion_id',
        etiqueta: 'Datos en el libro de direcciones',
        tipo: 'referencia',
        referencia: 'direcciones',
        requerido: true,
      },
      { nombre: 'moneda_id', etiqueta: 'Moneda base', tipo: 'referencia', referencia: 'monedas', requerido: true },
      { nombre: 'mes_inicio_fiscal', etiqueta: 'Mes de inicio fiscal', tipo: 'entero', requerido: true, defecto: 1 },
      { nombre: 'obligado_contabilidad', etiqueta: 'Obligado a llevar contabilidad', tipo: 'booleano', defecto: false },
      { nombre: 'contribuyente_especial', etiqueta: 'Resolución de contribuyente especial', tipo: 'texto', max: 20 },
      activo,
    ],
    listado: ['codigo', 'direccion_id', 'moneda_id', 'activo'],
    busqueda: ['codigo'],
    etiqueta: ['codigo'],
    orden: 'codigo',
    inactivable: true,
  },
  {
    nombre: 'unidades-negocio',
    tabla: 'mae_unidades_negocio',
    titulo: 'Unidades de negocio',
    tituloSingular: 'Unidad de negocio',
    modulo: 'Maestros',
    campos: [
      { nombre: 'compania_id', etiqueta: 'Compañía', tipo: 'referencia', referencia: 'companias', requerido: true },
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      {
        nombre: 'tipo',
        etiqueta: 'Tipo',
        tipo: 'catalogo',
        requerido: true,
        catalogo: { modulo: 'MAE', codigo: 'TIPO_UN' },
      },
      {
        nombre: 'unidad_padre_id',
        etiqueta: 'Unidad superior',
        tipo: 'referencia',
        referencia: 'unidades-negocio',
      },
      activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo', 'compania_id', 'activo'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: true,
  },
  {
    nombre: 'clases-contables',
    tabla: 'con_clases_contables',
    titulo: 'Clases contables',
    tituloSingular: 'Clase contable',
    modulo: 'Contabilidad',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      {
        nombre: 'aplica_a',
        etiqueta: 'Aplica a',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'ARTICULO', etiqueta: 'Artículo' },
          { valor: 'CLIENTE', etiqueta: 'Cliente' },
          { valor: 'PROVEEDOR', etiqueta: 'Proveedor' },
          { valor: 'IMPUESTO', etiqueta: 'Impuesto' },
          { valor: 'BANCO', etiqueta: 'Banco' },
          { valor: 'GENERAL', etiqueta: 'General' },
        ],
      },
    ],
    listado: ['codigo', 'descripcion', 'aplica_a'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: false,
  },
  {
    nombre: 'impuestos',
    tabla: 'mae_impuestos',
    titulo: 'Impuestos',
    tituloSingular: 'Impuesto',
    modulo: 'Maestros',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20 },
      {
        nombre: 'tipo',
        etiqueta: 'Tipo',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'IVA', etiqueta: 'IVA' },
          { valor: 'ICE', etiqueta: 'ICE' },
          { valor: 'OTRO', etiqueta: 'Otro' },
        ],
      },
      { nombre: 'codigo_sri', etiqueta: 'Código de tarifa SRI', tipo: 'texto', max: 10 },
      { nombre: 'porcentaje', etiqueta: 'Porcentaje', tipo: 'decimal', escala: 4, requerido: true },
      { nombre: 'vigente_desde', etiqueta: 'Vigente desde', tipo: 'fecha', requerido: true },
      { nombre: 'vigente_hasta', etiqueta: 'Vigente hasta', tipo: 'fecha' },
      {
        nombre: 'clase_contable_id',
        etiqueta: 'Clase contable',
        tipo: 'referencia',
        referencia: 'clases-contables',
      },
    ],
    listado: ['codigo', 'tipo', 'porcentaje', 'vigente_desde', 'vigente_hasta'],
    busqueda: ['codigo'],
    etiqueta: ['codigo', 'porcentaje'],
    orden: 'codigo',
    inactivable: false,
  },
  {
    nombre: 'condiciones-pago',
    tabla: 'mae_condiciones_pago',
    titulo: 'Condiciones de pago',
    tituloSingular: 'Condición de pago',
    modulo: 'Maestros',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'cuotas', etiqueta: 'Cuotas', tipo: 'entero', requerido: true, defecto: 1 },
      { nombre: 'dias_primera', etiqueta: 'Días a la primera cuota', tipo: 'entero', requerido: true, defecto: 0 },
      { nombre: 'dias_entre_cuotas', etiqueta: 'Días entre cuotas', tipo: 'entero', requerido: true, defecto: 30 },
    ],
    listado: ['codigo', 'descripcion', 'cuotas', 'dias_primera'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: false,
  },
  {
    nombre: 'articulos',
    tabla: 'mae_articulos',
    titulo: 'Artículos y servicios',
    tituloSingular: 'Artículo',
    modulo: 'Maestros',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 30, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      {
        nombre: 'tipo_existencia',
        etiqueta: 'Tipo de existencia',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'INVENTARIABLE', etiqueta: 'Inventariable' },
          { valor: 'NO_INVENTARIABLE', etiqueta: 'No inventariable' },
          { valor: 'SERVICIO', etiqueta: 'Servicio' },
        ],
      },
      {
        nombre: 'unidad_primaria',
        etiqueta: 'Unidad de medida',
        tipo: 'catalogo',
        requerido: true,
        catalogo: { modulo: 'MAE', codigo: 'UM' },
      },
      { nombre: 'impuesto_id', etiqueta: 'Impuesto', tipo: 'referencia', referencia: 'impuestos' },
      {
        nombre: 'clase_contable_id',
        etiqueta: 'Clase contable',
        tipo: 'referencia',
        referencia: 'clases-contables',
        requerido: true,
      },
      { nombre: 'controla_lote', etiqueta: 'Controla lote o serie', tipo: 'booleano', defecto: false },
      {
        nombre: 'categoria',
        etiqueta: 'Categoría',
        tipo: 'catalogo',
        catalogo: { modulo: 'MAE', codigo: 'CATEGORIA_ART' },
      },
      activo,
    ],
    listado: ['codigo', 'descripcion', 'tipo_existencia', 'unidad_primaria', 'activo'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: true,
  },
  {
    nombre: 'catalogos',
    tabla: 'cat_catalogos',
    titulo: 'Catálogos',
    tituloSingular: 'Catálogo',
    modulo: 'Catálogos',
    campos: [
      { nombre: 'modulo', etiqueta: 'Módulo', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'longitud', etiqueta: 'Longitud de los códigos', tipo: 'entero', requerido: true, defecto: 10 },
    ],
    listado: ['modulo', 'codigo', 'descripcion'],
    busqueda: ['modulo', 'codigo', 'descripcion'],
    etiqueta: ['modulo', 'codigo'],
    orden: 'modulo',
    inactivable: false,
  },
  {
    nombre: 'valores-catalogo',
    tabla: 'cat_valores',
    titulo: 'Valores de catálogo',
    tituloSingular: 'Valor de catálogo',
    modulo: 'Catálogos',
    campos: [
      { nombre: 'catalogo_id', etiqueta: 'Catálogo', tipo: 'referencia', referencia: 'catalogos', requerido: true },
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20 },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'descripcion2', etiqueta: 'Descripción 2', tipo: 'texto', max: 200 },
      { nombre: 'codigo_especial', etiqueta: 'Código especial', tipo: 'texto', max: 20 },
      { nombre: 'orden', etiqueta: 'Orden', tipo: 'entero' },
      activo,
    ],
    listado: ['catalogo_id', 'codigo', 'descripcion', 'activo'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: true,
  },
  {
    nombre: 'tipos-documento',
    tabla: 'sis_tipos_documento',
    titulo: 'Tipos de documento',
    tituloSingular: 'Tipo de documento',
    modulo: 'Sistema',
    campos: [
      {
        nombre: 'modulo',
        etiqueta: 'Módulo',
        tipo: 'opcion',
        requerido: true,
        soloAlta: true,
        opciones: [
          { valor: 'VEN', etiqueta: 'Ventas' },
          { valor: 'COM', etiqueta: 'Compras' },
          { valor: 'INV', etiqueta: 'Inventarios' },
          { valor: 'SRV', etiqueta: 'Servicios' },
          { valor: 'CXC', etiqueta: 'Cuentas por cobrar' },
          { valor: 'CXP', etiqueta: 'Cuentas por pagar' },
          { valor: 'CON', etiqueta: 'Contabilidad' },
        ],
      },
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      {
        nombre: 'clase',
        etiqueta: 'Comportamiento',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'COTIZACION', etiqueta: 'Cotización' },
          { valor: 'ORDEN', etiqueta: 'Orden' },
          { valor: 'REQUISICION', etiqueta: 'Requisición' },
          { valor: 'DEVOLUCION', etiqueta: 'Devolución' },
          { valor: 'AJUSTE', etiqueta: 'Ajuste' },
          { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
          { valor: 'FACTURA', etiqueta: 'Factura' },
          { valor: 'NOTA_CREDITO', etiqueta: 'Nota de crédito' },
          { valor: 'ASIENTO', etiqueta: 'Asiento contable' },
        ],
      },
      { nombre: 'afecta_inventario', etiqueta: 'Afecta inventario', tipo: 'booleano', defecto: false },
      { nombre: 'genera_contabilidad', etiqueta: 'Genera contabilidad', tipo: 'booleano', defecto: false },
      { nombre: 'estado_inicial', etiqueta: 'Estado inicial de las líneas', tipo: 'entero' },
      activo,
    ],
    listado: ['modulo', 'codigo', 'descripcion', 'clase', 'activo'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['modulo', 'codigo', 'descripcion'],
    orden: 'codigo',
    inactivable: true,
  },
  {
    nombre: 'flujos-estado',
    tabla: 'sis_flujos_estado',
    titulo: 'Flujos de estado',
    tituloSingular: 'Estado',
    modulo: 'Sistema',
    campos: [
      {
        nombre: 'tipo_documento_id',
        etiqueta: 'Tipo de documento',
        tipo: 'referencia',
        referencia: 'tipos-documento',
        requerido: true,
      },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'entero', requerido: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'estado_siguiente', etiqueta: 'Estado siguiente', tipo: 'entero' },
      { nombre: 'accion', etiqueta: 'Proceso que lo ejecuta', tipo: 'texto', max: 100 },
    ],
    listado: ['tipo_documento_id', 'estado', 'descripcion', 'estado_siguiente'],
    busqueda: ['descripcion'],
    etiqueta: ['estado', 'descripcion'],
    orden: 'estado',
    inactivable: false,
  },
  {
    nombre: 'numeradores',
    tabla: 'sis_numeradores',
    titulo: 'Numeradores',
    tituloSingular: 'Numerador',
    modulo: 'Sistema',
    campos: [
      { nombre: 'compania_id', etiqueta: 'Compañía', tipo: 'referencia', referencia: 'companias', requerido: true },
      {
        nombre: 'tipo_documento_id',
        etiqueta: 'Tipo de documento',
        tipo: 'referencia',
        referencia: 'tipos-documento',
        requerido: true,
      },
      { nombre: 'anio', etiqueta: 'Año (0 si no reinicia)', tipo: 'entero', requerido: true, defecto: 0 },
      { nombre: 'siguiente', etiqueta: 'Siguiente número', tipo: 'entero', requerido: true, defecto: 1 },
    ],
    listado: ['compania_id', 'tipo_documento_id', 'anio', 'siguiente'],
    busqueda: [],
    etiqueta: ['anio', 'siguiente'],
    orden: 'anio',
    inactivable: false,
  },
  {
    nombre: 'usuarios',
    tabla: 'sis_usuarios',
    titulo: 'Usuarios',
    tituloSingular: 'Usuario',
    modulo: 'Sistema',
    campos: [
      {
        nombre: 'firebase_uid',
        etiqueta: 'Identificador de inicio de sesión',
        tipo: 'texto',
        requerido: true,
        max: 128,
        soloAlta: true,
        ayuda: 'En modo de desarrollo es el mismo correo',
      },
      { nombre: 'correo', etiqueta: 'Correo', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 200 },
      { nombre: 'direccion_id', etiqueta: 'Empleado', tipo: 'referencia', referencia: 'direcciones' },
      {
        nombre: 'compania_defecto_id',
        etiqueta: 'Compañía por defecto',
        tipo: 'referencia',
        referencia: 'companias',
      },
      activo,
    ],
    listado: ['correo', 'nombre', 'activo'],
    busqueda: ['correo', 'nombre'],
    etiqueta: ['nombre'],
    orden: 'correo',
    inactivable: true,
  },
  {
    nombre: 'roles',
    tabla: 'sis_roles',
    titulo: 'Roles',
    tituloSingular: 'Rol',
    modulo: 'Sistema',
    campos: [
      { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 20, soloAlta: true },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', requerido: true, max: 200 },
    ],
    listado: ['codigo', 'descripcion'],
    busqueda: ['codigo', 'descripcion'],
    etiqueta: ['codigo'],
    orden: 'codigo',
    inactivable: false,
  },
  {
    nombre: 'permisos',
    tabla: 'sis_roles_permisos',
    titulo: 'Permisos de roles',
    tituloSingular: 'Permiso',
    modulo: 'Sistema',
    campos: [
      { nombre: 'rol_id', etiqueta: 'Rol', tipo: 'referencia', referencia: 'roles', requerido: true },
      {
        nombre: 'recurso',
        etiqueta: 'Recurso',
        tipo: 'texto',
        requerido: true,
        max: 100,
        ayuda: 'Nombre de la entidad, por ejemplo articulos, o * para todas',
      },
      {
        nombre: 'accion',
        etiqueta: 'Acción',
        tipo: 'opcion',
        requerido: true,
        opciones: [
          { valor: 'VER', etiqueta: 'Ver' },
          { valor: 'CREAR', etiqueta: 'Crear' },
          { valor: 'MODIFICAR', etiqueta: 'Modificar' },
          { valor: 'ANULAR', etiqueta: 'Anular o inactivar' },
          { valor: '*', etiqueta: 'Todas' },
        ],
      },
    ],
    listado: ['rol_id', 'recurso', 'accion'],
    busqueda: ['recurso'],
    etiqueta: ['recurso', 'accion'],
    orden: 'recurso',
    inactivable: false,
  },
  {
    nombre: 'usuarios-roles',
    tabla: 'sis_usuarios_roles',
    titulo: 'Roles por usuario',
    tituloSingular: 'Rol de usuario',
    modulo: 'Sistema',
    campos: [
      { nombre: 'usuario_id', etiqueta: 'Usuario', tipo: 'referencia', referencia: 'usuarios', requerido: true },
      { nombre: 'rol_id', etiqueta: 'Rol', tipo: 'referencia', referencia: 'roles', requerido: true },
      {
        nombre: 'compania_id',
        etiqueta: 'Compañía',
        tipo: 'referencia',
        referencia: 'companias',
        ayuda: 'Vacío significa todas las compañías',
      },
    ],
    listado: ['usuario_id', 'rol_id', 'compania_id'],
    busqueda: [],
    etiqueta: ['usuario_id'],
    orden: 'creado_en',
    inactivable: false,
  },
];

export function buscarEntidad(nombre: string): Entidad | undefined {
  return ENTIDADES.find((e) => e.nombre === nombre);
}

export const MODULOS_MENU: Entidad['modulo'][] = ['Maestros', 'Catálogos', 'Contabilidad', 'Sistema'];
