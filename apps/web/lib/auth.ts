'use client';

/**
 * Inicio de sesión en dos modos:
 * - desarrollo: se ingresa solo el correo y la API lo acepta tal cual (solo para trabajar en local).
 * - firebase: Firebase Authentication con Google o correo y contraseña.
 */
export const MODO_AUTH = (process.env.NEXT_PUBLIC_AUTH_MODE ?? 'desarrollo') as 'desarrollo' | 'firebase';

const CLAVE_DESARROLLO = 'erp.correoDesarrollo';

async function firebaseAuth() {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  return getAuth(app);
}

/** Cabecera Authorization para la API, o null si no hay sesión. */
export async function cabeceraAutorizacion(): Promise<string | null> {
  if (MODO_AUTH === 'desarrollo') {
    const correo = leerLocal(CLAVE_DESARROLLO);
    return correo ? `Desarrollo ${correo}` : null;
  }
  const auth = await firebaseAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  return token ? `Bearer ${token}` : null;
}

export async function ingresarDesarrollo(correo: string): Promise<void> {
  guardarLocal(CLAVE_DESARROLLO, correo.trim().toLowerCase());
}

export async function ingresarConGoogle(): Promise<void> {
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  await signInWithPopup(await firebaseAuth(), new GoogleAuthProvider());
}

export async function ingresarConCorreo(correo: string, clave: string): Promise<void> {
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(await firebaseAuth(), correo, clave);
}

export async function salir(): Promise<void> {
  if (MODO_AUTH === 'desarrollo') {
    borrarLocal(CLAVE_DESARROLLO);
  } else {
    const { signOut } = await import('firebase/auth');
    await signOut(await firebaseAuth());
  }
  borrarLocal('erp.compania');
}

export function leerLocal(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
export function guardarLocal(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento local: la sesión dura lo que dure la pestaña */
  }
}
export function borrarLocal(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* nada que hacer */
  }
}
