import { ImageResponse } from 'next/og'

// Icona per iOS/iPadOS: usata quando si aggiunge Flowest alla Home ("Aggiungi a Home").
// Aprendo da lì, l'app parte a schermo intero (grazie ai meta apple-mobile-web-app-*).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F52FF',
          color: '#ffffff',
          fontSize: 118,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </div>
    ),
    { ...size },
  )
}
