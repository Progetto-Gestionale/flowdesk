import type { MetadataRoute } from 'next'

// Web App Manifest: permette di installare Flowest sulla home (tablet/telefono) e aprirlo
// a SCHERMO INTERO (display: standalone), senza la barra degli indirizzi di Chrome/Safari.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flowest',
    short_name: 'Flowest',
    description: 'Gestionale per ristoranti e locali: tavoli, ordini, prenotazioni, staff e menu.',
    start_url: '/dashboard/check',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0B1533',
    theme_color: '#0B1533',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
