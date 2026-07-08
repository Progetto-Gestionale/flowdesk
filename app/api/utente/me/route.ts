import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  return NextResponse.json({ verticale: user.verticale, id: user.id })
}
