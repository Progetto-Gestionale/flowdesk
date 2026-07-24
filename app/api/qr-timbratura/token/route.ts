import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { generateQrToken, generateFixedQrToken } from '@/lib/timbratureToken'

export async function GET(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const fisso = new URL(req.url).searchParams.get('fisso') === '1'
  const token = fisso ? generateFixedQrToken(user.id) : generateQrToken(user.id)
  return NextResponse.json({ token })
}
