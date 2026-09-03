import { getAuthUser } from '@/lib/getAuthUser'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TIPI_TARIFFA, mergeMaggiorazioni } from '@/lib/contabilita/labor'

// Moltiplicatori "maggiorazione" preferiti dal titolare per ogni tipoTariffa (owner-only).
// GET restituisce i default effettivi (sistema + preferenze salvate). POST ne memorizza uno:
// quando il titolare cambia il moltiplicatore di un turno, quel valore diventa il nuovo default
// per quel tipo (festivo/evento/straordinario…) finché non lo ricambia. Non tocca i turni già
// salvati (ognuno conserva la propria maggiorazione): cambia solo il valore proposto in futuro.

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const cfg = await prisma.contabilitaConfig.findUnique({ where: { userId: user.id }, select: { maggiorazioniDefault: true } })
  return NextResponse.json({ maggiorazioni: mergeMaggiorazioni(cfg?.maggiorazioniDefault) })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const b = await req.json().catch(() => ({}))
  const tipo = String(b.tipoTariffa)
  const m = Number(b.maggiorazione)
  // forfait non ha maggiorazione; gli altri tipi accettano solo valori nel range di sicurezza.
  if (!(TIPI_TARIFFA as readonly string[]).includes(tipo) || tipo === 'forfait') {
    return NextResponse.json({ error: 'Tipo tariffa non valido' }, { status: 400 })
  }
  if (!Number.isFinite(m) || m < 0.1 || m > 5) {
    return NextResponse.json({ error: 'Moltiplicatore non valido' }, { status: 400 })
  }

  // Leggi il JSON attuale, aggiorna il singolo tipo, riscrivi (merge lato applicazione così
  // partiamo sempre da valori validi anche se il DB avesse un JSON corrotto/vuoto).
  const cfg = await prisma.contabilitaConfig.findUnique({ where: { userId: user.id }, select: { maggiorazioniDefault: true } })
  const correnti = mergeMaggiorazioni(cfg?.maggiorazioniDefault)
  correnti[tipo] = Math.round(m * 100) / 100
  const json = JSON.stringify(correnti)

  await prisma.contabilitaConfig.upsert({
    where: { userId: user.id },
    update: { maggiorazioniDefault: json },
    create: { userId: user.id, maggiorazioniDefault: json },
  })
  return NextResponse.json({ maggiorazioni: correnti })
}
