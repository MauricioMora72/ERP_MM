'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ingresarConCorreo, ingresarConGoogle, ingresarDesarrollo, MODO_AUTH } from '@/lib/auth';

export default function Ingresar() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (MODO_AUTH === 'desarrollo') await ingresarDesarrollo(correo);
      else await ingresarConCorreo(correo, clave);
      router.replace('/');
    } catch {
      setError('No se pudo iniciar sesión. Revise sus datos.');
    }
  }

  return (
    <div className="tarjeta-ingreso">
      <h1>Ingresar</h1>
      {MODO_AUTH === 'desarrollo' && (
        <p className="aviso">Modo de desarrollo local: basta con el correo. Este modo no existe en producción.</p>
      )}
      {error && <p className="aviso error">{error}</p>}
      <form onSubmit={enviar}>
        <label>
          Correo
          <input type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} autoFocus />
        </label>
        {MODO_AUTH === 'firebase' && (
          <label>
            Contraseña
            <input type="password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
        )}
        <button type="submit">Ingresar</button>
        {MODO_AUTH === 'firebase' && (
          <button
            type="button"
            className="secundario"
            onClick={async () => {
              try {
                await ingresarConGoogle();
                router.replace('/');
              } catch {
                setError('No se pudo iniciar sesión con Google.');
              }
            }}
          >
            Ingresar con Google
          </button>
        )}
      </form>
    </div>
  );
}
