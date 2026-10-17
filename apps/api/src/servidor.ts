import { crearDb } from '@erp/db';
import { construirApp } from './app.js';
import { crearVerificador } from './autenticacion.js';
import { leerConfiguracion } from './config.js';

const config = leerConfiguracion();
const db = crearDb(config.databaseUrl);
const verificar = await crearVerificador(config);
const app = await construirApp({ db, verificar }, { origenWeb: config.origenWeb, registro: true });

await app.listen({ port: config.puerto, host: '0.0.0.0' });
app.log.info(`API del ERP escuchando en el puerto ${config.puerto} (autenticación: ${config.modoAuth})`);
