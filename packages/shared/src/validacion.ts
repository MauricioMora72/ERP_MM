import { z } from 'zod';
import type { Campo, Entidad } from './entidades';

const vacioANulo = (v: unknown) => (v === '' || v === undefined ? null : v);

function esquemaCampo(campo: Campo): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (campo.tipo) {
    case 'texto':
    case 'catalogo':
      base = z
        .string()
        .trim()
        .min(1, `${campo.etiqueta} es obligatorio`)
        .max(campo.max ?? 200, `${campo.etiqueta} admite hasta ${campo.max ?? 200} caracteres`);
      break;
    case 'opcion': {
      const valores = (campo.opciones ?? []).map((o) => o.valor);
      base = z.string().refine((v) => valores.includes(v), `${campo.etiqueta} no tiene un valor válido`);
      break;
    }
    case 'entero':
      base = z.coerce
        .number({ invalid_type_error: `${campo.etiqueta} debe ser un número entero` })
        .int(`${campo.etiqueta} debe ser un número entero`);
      break;
    case 'decimal': {
      const escala = campo.escala ?? 2;
      const patron = new RegExp(`^-?\\d+(\\.\\d{1,${escala}})?$`);
      // Los montos viajan como texto para no perder precisión con números de punto flotante.
      base = z
        .union([z.string(), z.number()])
        .transform((v) => String(v).trim())
        .refine((v) => patron.test(v), `${campo.etiqueta} debe tener hasta ${escala} decimales`);
      break;
    }
    case 'fecha':
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${campo.etiqueta} debe tener el formato AAAA-MM-DD`);
      break;
    case 'fechaHora':
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${campo.etiqueta} debe tener fecha y hora`);
      break;
    case 'booleano':
      base = z.boolean();
      break;
    case 'referencia':
      base = z.string().uuid(`${campo.etiqueta} no es una referencia válida`);
      break;
    case 'json':
      base = z.record(z.unknown());
      break;
  }
  if (campo.tipo === 'booleano') return base;
  return campo.requerido ? z.preprocess(vacioANulo, base) : z.preprocess(vacioANulo, base.nullable());
}

/** Esquema para crear un registro: los campos obligatorios deben venir. */
export function esquemaAlta(entidad: Entidad) {
  const forma: Record<string, z.ZodTypeAny> = {};
  for (const campo of entidad.campos) {
    let s = esquemaCampo(campo);
    // Un campo obligatorio con valor por defecto puede omitirse: la base pone el defecto.
    if (campo.defecto !== undefined || campo.tipo === 'booleano' || (entidad.nombre === 'direcciones' && campo.nombre === 'numero')) {
      s = s.optional();
    }
    forma[campo.nombre] = s;
  }
  return z.object(forma).strict();
}

/** Esquema para modificar: todo es opcional y los campos de solo alta no se aceptan. */
export function esquemaCambio(entidad: Entidad) {
  const forma: Record<string, z.ZodTypeAny> = {};
  for (const campo of entidad.campos) {
    if (campo.soloAlta) continue;
    forma[campo.nombre] = esquemaCampo(campo).optional();
  }
  return z.object(forma).strict();
}

export const esquemaAltaSuscriptor = z.object({
  suscriptor: z.object({
    codigo: z.string().trim().min(1).max(20),
    nombre: z.string().trim().min(1).max(200),
  }),
  compania: z.object({
    codigo: z.string().trim().min(1).max(20),
    razonSocial: z.string().trim().min(1).max(200),
    ruc: z.string().trim().regex(/^\d{13}$/, 'El RUC debe tener 13 dígitos'),
  }),
  administrador: z.object({
    nombre: z.string().trim().min(1).max(200),
    correo: z.string().trim().email('Correo no válido').max(200),
  }),
});
export type AltaSuscriptor = z.infer<typeof esquemaAltaSuscriptor>;

/** Convierte los errores de Zod en mensajes por campo, en español. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join('.') || '_';
    if (salida[clave]) continue;
    salida[clave] =
      issue.code === 'invalid_type' && issue.received === 'null'
        ? 'Este campo es obligatorio'
        : issue.code === 'unrecognized_keys'
          ? `Campos no permitidos: ${issue.keys.join(', ')}`
          : issue.message;
  }
  return salida;
}
