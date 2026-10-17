export class ErrorNegocio extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
    public readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

interface ErrorPostgres {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** Traduce los errores de PostgreSQL a mensajes comprensibles para el usuario. */
export function traducirErrorBase(error: unknown): ErrorNegocio | null {
  const e = error as ErrorPostgres;
  switch (e.code) {
    case '23505':
      return new ErrorNegocio(409, 'Ya existe un registro con esos datos.');
    case '23503':
      return new ErrorNegocio(
        409,
        'La operación no es posible: el registro está relacionado con otros datos o la referencia no existe.',
      );
    case '23502':
      return new ErrorNegocio(400, 'Falta un dato obligatorio.');
    case '23514':
      return new ErrorNegocio(400, 'Los datos no cumplen una regla de validación.');
    case '42501':
      return new ErrorNegocio(403, 'No tiene acceso a este registro.');
    case '22P02':
      return new ErrorNegocio(400, 'Uno de los valores no tiene el formato correcto.');
    default:
      return null;
  }
}
