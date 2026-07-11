import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.DIPENDENTE_JWT_SECRET ?? 'dipendente-secret-change-in-prod-32chars'
)
const COOKIE = 'dip_session'
const TTL = 60 * 60 * 24 * 30 // 30 giorni

export interface DipToken {
  dipendenteId: string
  userId: string   // userId del titolare (per scope)
  slug: string     // publicId del locale (per redirect post-logout)
}

export async function signDipToken(payload: DipToken): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, string>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${TTL}s`)
    .setIssuedAt()
    .sign(SECRET)
}

export async function verifyDipToken(token: string): Promise<DipToken | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as DipToken
  } catch {
    return null
  }
}

export async function getDipSession(req?: NextRequest): Promise<DipToken | null> {
  let token: string | undefined
  if (req) {
    token = req.cookies.get(COOKIE)?.value
  } else {
    const jar = await cookies()
    token = jar.get(COOKIE)?.value
  }
  if (!token) return null
  return verifyDipToken(token)
}

export function dipCookieOptions(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: TTL,
    path: '/',
  }
}

export function generateUsername(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove accenti
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
}
