import { createHmac } from 'crypto'

const secret = process.env.DIPENDENTE_JWT_SECRET ?? 'dipendente-secret-change-in-prod-32chars'

export function currentMinute() {
  return Math.floor(Date.now() / 60000)
}

export function generateQrToken(userId: string): string {
  const minute = currentMinute()
  const payload = `${userId}:${minute}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

// Token FISSO (non scade): usato per il QR stampabile. Meno sicuro del ciclante
// perché una foto del QR permette di timbrare da remoto — è una scelta del titolare.
export function generateFixedQrToken(userId: string): string {
  const payload = `${userId}:fixed`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${hmac}`).toString('base64url')
}

export function verifyQrToken(token: string): { userId: string; fisso: boolean } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length < 3) return null
    const hmac = parts.pop()!
    const [userId, minuteStr] = parts
    // Token fisso (stampabile): nessun controllo temporale, solo HMAC.
    if (minuteStr === 'fixed') {
      const expected = createHmac('sha256', secret).update(`${userId}:fixed`).digest('hex')
      return hmac === expected ? { userId, fisso: true } : null
    }
    const minute = parseInt(minuteStr)
    const now = currentMinute()
    if (Math.abs(now - minute) > 1) return null // accetta minuto corrente e precedente
    const expected = createHmac('sha256', secret).update(`${userId}:${minute}`).digest('hex')
    if (hmac !== expected) return null
    return { userId, fisso: false }
  } catch {
    return null
  }
}
