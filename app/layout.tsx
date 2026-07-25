import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'
import { Manrope, Space_Mono } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['400', '500', '600', '700', '800'],
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-space-mono',
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: 'Flowest',
  description: 'Il tuo business gestisce se stesso. Tu pensi a crescere.',
  applicationName: 'Flowest',
  // Abilita l'apertura a schermo intero su iOS/iPadOS quando aggiunto alla Home
  // (aggiunge apple-mobile-web-app-capable, -title, -status-bar-style).
  appleWebApp: {
    capable: true,
    title: 'Flowest',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // usa tutta l'area anche sui tablet/telefoni con notch/home indicator
  themeColor: '#0B1533', // colore della barra di stato in modalità standalone
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="it" className={`${manrope.variable} ${spaceMono.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}