import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/baseUrl'

export async function GET() {
  const res = NextResponse.redirect(`${getBaseUrl()}/sign-in`)
  // Cancella tutti i cookie di sessione Clerk
  const cookieNames = ['__session', '__client_uat', '__clerk_db_jwt', '__clerk_handshake']
  for (const name of cookieNames) {
    res.cookies.set(name, '', { maxAge: 0, path: '/' })
  }
  return res
}
