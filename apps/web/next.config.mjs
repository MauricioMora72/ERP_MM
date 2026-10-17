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
};
export default config;
