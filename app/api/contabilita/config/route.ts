import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Configurazione contabile del locale (aliquota default, accantonamento imposte, ecc.).
// GET restituisce i valori (o i default se non ancora configurata); POST fa upsert.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const cfg = await prisma.contabilitaConfig.findUnique({ where: { userId: user.id } })
  return NextResponse.json(cfg ?? {
    aliquotaVenditaDefault: 0.1,
    percentualeAccantonamentoImposte: 0.15,
    moltiplicatoreLaborDefault: 1.4,
    regimeFiscale: 'ordinario',
    coefficienteRedditivita: 0.40,
    aliquotaImpostaForfettario: 0.15,
    fonteOreLabor: 'turni',
  })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clampPct = (v: unknown, def: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : def
  }
  const data = {
    aliquotaVenditaDefault: clampPct(body.aliquotaVenditaDefault, 0.1),
    percentualeAccantonamentoImposte: clampPct(body.percentualeAccantonamentoImposte, 0.15),
    moltiplicatoreLaborDefault: Math.max(1, Number(body.moltiplicatoreLaborDefault) || 1.4),
    regimeFiscale: body.regimeFiscale === 'forfettario' ? 'forfettario' : 'ordinario',
    coefficienteRedditivita: clampPct(body.coefficienteRedditivita, 0.40),
    aliquotaImpostaForfettario: clampPct(body.aliquotaImpostaForfettario, 0.15),
    fonteOreLabor: body.fonteOreLabor === 'timbrature' ? 'timbrature' : 'turni',
  }

  const cfg = await prisma.contabilitaConfig.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  })
  return NextResponse.json(cfg)
}
