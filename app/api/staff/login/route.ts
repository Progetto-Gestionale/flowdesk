import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmailStaff } from '@/lib/email'
import { getAuthUser } from '@/lib/getAuthUser'
import crypto from 'crypto'

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email obbligatoria' }, { status: 400 })

  const dipendenti = await prisma.dipendente.findMany({ where: { email, userId: user.id } })
  if (dipendenti.length === 0) return NextResponse.json({ error: 'Email non trovata' }, { status: 404 })

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 giorni

  await Promise.all(dipendenti.map(async d => {
    const token = crypto.randomBytes(32).toString('hex')
    await prisma.dipendente.update({ where: { id: d.id }, data: { token, tokenExpiry } })
    const link = `${BASE_URL}/staff/${token}`
    await sendEmailStaff(email, d.nome, link)
  }))

  return NextResponse.json({ ok: true })
}
