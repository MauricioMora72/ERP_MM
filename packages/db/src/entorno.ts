import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Carga el archivo .env de la raíz del repositorio, si existe. No sobrescribe variables ya definidas. */
export function cargarEntorno(desde: string = process.cwd()): void {
  let dir = desde;
  for (let i = 0; i < 6; i++) {
    const ruta = join(dir, '.env');
    if (existsSync(ruta)) {
      process.loadEnvFile(ruta);
      return;
    }
    const padre = dirname(dir);
    if (padre === dir) return;
    dir = padre;
  }
}

export function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}. Revise su archivo .env.`);
  return valor;
}
