import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globales.css';

export const metadata: Metadata = {
  title: 'ERP',
  description: 'ERP web para empresas de servicios',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
