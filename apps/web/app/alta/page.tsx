'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ErrorApi } from '@/lib/api';

/** Alta de un cliente nuevo: su suscripción, su primera compañía y su usuario administrador. */
export default function Alta() {
  const router = useRouter();
  const [datos, setDatos] = useState({
    suscriptorCodigo: '',
    suscriptorNombre: '',
    companiaCodigo: '',
    razonSocial: '',
    ruc: '',
    nombre: '',
    correo: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api('/api/sesion').catch((e: unknown) => {
      if (e instanceof ErrorApi && e.estado === 404) {
        const correo = (e.datos as { correo?: string } | undefined)?.correo ?? '';
        setDatos((d) => ({ ...d, correo }));
      } else if (e instanceof ErrorApi && e.estado === 401) {
        router.replace('/ingresar');
      }
    });
  }, [router]);

  const cambiar = (clave: keyof typeof datos) => (e: { target: { value: string } }) =>
    setDatos({ ...datos, [clave]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCampos({});
    setEnviando(true);
    try {
      await api('/api/alta', {
        metodo: 'POST',
        cuerpo: {
          suscriptor: { codigo: datos.suscriptorCodigo, nombre: datos.suscriptorNombre },
          compania: { codigo: datos.companiaCodigo, razonSocial: datos.razonSocial, ruc: datos.ruc },
          administrador: { nombre: datos.nombre, correo: datos.correo },
        },
      });
      router.replace('/');
    } catch (err) {
      if (err instanceof ErrorApi) {
        setError(err.message);
        setCampos(err.campos ?? {});
      } else setError('Ocurrió un error.');
    } finally {
      setEnviando(false);
    }
  }

  const errorDe = (clave: string) => campos[clave] && <small className="aviso error">{campos[clave]}</small>;

  return (
    <div className="tarjeta-ingreso ancha">
      <h1>Crear su cuenta de empresa</h1>
      <p className="tenue">
        Se crearán su suscripción, su primera compañía con una sucursal matriz, catálogos base de ejemplo y su usuario
        administrador.
      </p>
      {error && <p className="aviso error">{error}</p>}
      <form onSubmit={enviar}>
        <h2>Suscripción</h2>
        <label>
          Código corto
          <input type="text" required maxLength={20} value={datos.suscriptorCodigo} onChange={cambiar('suscriptorCodigo')} />
        </label>
        {errorDe('suscriptor.codigo')}
        <label>
          Nombre del cliente
          <input type="text" required value={datos.suscriptorNombre} onChange={cambiar('suscriptorNombre')} />
        </label>
        <h2>Primera compañía</h2>
        <label>
          Código de compañía
          <input type="text" required maxLength={20} value={datos.companiaCodigo} onChange={cambiar('companiaCodigo')} />
        </label>
        <label>
          Razón social
          <input type="text" required value={datos.razonSocial} onChange={cambiar('razonSocial')} />
        </label>
        <label>
          RUC
          <input type="text" required inputMode="numeric" maxLength={13} value={datos.ruc} onChange={cambiar('ruc')} />
        </label>
        {errorDe('compania.ruc')}
        <h2>Administrador</h2>
        <label>
          Nombre
          <input type="text" required value={datos.nombre} onChange={cambiar('nombre')} />
        </label>
        <label>
          Correo
          <input type="email" required value={datos.correo} onChange={cambiar('correo')} />
        </label>
        {errorDe('administrador.correo')}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
}
