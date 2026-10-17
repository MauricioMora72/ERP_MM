import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// La configuración vive en el .env de la raíz del repositorio.
if (existsSync(join(raiz, '.env'))) process.loadEnvFile(join(raiz, '.env'));

/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@erp/shared'],
  outputFileTracingRoot: raiz,
  // La web reenvía /api a la API. Así el navegador siempre llama al mismo origen:
  // funciona igual en local, en GitHub Codespaces y en Cloud Run, sin problemas de CORS.
  async rewrites() {
    const api = process.env.API_URL_INTERNA ?? 'http://localhost:4000';
    return { beforeFiles: [{ source: '/api/:ruta*', destination: `${api}/api/:ruta*` }] };
  },
};
export default config;
