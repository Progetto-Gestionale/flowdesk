# FlowDesk — Guida per Claude

## Cos'è FlowDesk
SaaS multi-tenant per ristoranti e locali italiani. Gestione tavoli, prenotazioni, staff, ordini, menu digitale, chatbot AI, CRM clienti.

## Stack Tecnico
- **Frontend + Backend**: Next.js 16 App Router, TypeScript, Tailwind CSS
- **Auth**: Clerk v7
- **Database**: PostgreSQL su Supabase (Prisma 5)
- **AI**: Claude API via Anthropic SDK
- **Hosting**: Vercel + dominio flowest.it

## Regole Fondamentali
1. **Mai usare `sudo`**
2. **Mai usare `prisma migrate dev`** — usare sempre `prisma db push`
3. Dopo modifiche allo schema Prisma: `npx prisma generate` + `rm -rf .next` + riavvio server
4. Params nelle route con [id] sono `Promise` in Next.js 16: `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params`
5. Conferma prima di operazioni distruttive

## Comandi Utili
```bash
# Avvio server
cd "/Users/ciccocioppotommaso/Desktop/progetto gestionale/flowdesk"
npm run dev

# Aggiorna schema DB
npx prisma db push

# Rigenera client Prisma (dopo modifiche schema)
npx prisma generate

# Pulisci cache Next.js (dopo prisma generate)
rm -rf .next

# Push su GitHub (triggera deploy automatico su Vercel)
git add .
git commit -m "descrizione"
git push
```

## Struttura Cartelle Principali
```
app/
├── dashboard/
│   ├── tavoli/          ← Gestione tavoli + mappa interattiva
│   ├── ordini/          ← Ordini in tempo reale
│   ├── menu/            ← Menu digitale (categorie + piatti)
│   ├── staff/           ← Dipendenti + turni + AI genera turni
│   ├── impostazioni/    ← Impostazioni generali + staff fabbisogno
│   └── clienti/
│       ├── calendario/  ← Appuntamenti/prenotazioni
│       ├── inbox/       ← Messaggi chatbot
│       ├── crm/         ← Pipeline clienti
│       └── preventivi/  ← Preventivi + richieste
├── ordina/[publicId]/[tavolo]/  ← Pagina pubblica ordini QR
├── chat/[publicId]/             ← Widget chatbot pubblico
└── api/                         ← Tutte le API routes

lib/
├── prisma.ts       ← PrismaClient singleton
└── getAuthUser.ts  ← Helper auth Clerk

prisma/
└── schema.prisma   ← Schema DB
```

## Database — Modelli Principali
- `User` — account proprietario locale (ha `fabbisognoStaff`, `turniServizio`, `publicId`, ecc.)
- `Tavolo` — tavoli del locale
- `GruppoTavoli` — fusione di tavoli
- `Appuntamento` — prenotazioni (ha `tavoliIds` JSON per multi-tavolo)
- `Dipendente` — staff con disponibilità e richieste
- `Turno` — turni di lavoro generati
- `DisponibilitaDipendente` — disponibilità per mese (campo `mese` non `settimana`, campo `giorni` non `disponibilita`)
- `Ordine` / `RigaOrdine` — ordini dal QR
- `MenuCategoria` / `MenuPiatto` — menu digitale
- `Conversazione` — messaggi chatbot
- `Preventivo` — preventivi/richieste clienti

## Timezone — Regola Critica
Tutti gli appuntamenti sono salvati in UTC nel DB. Gli orari di apertura, turni e confronti devono usare **ora locale italiana (Europe/Rome)**. Non usare mai `d.getHours()` o `toISOString().split('T')[0]` per confrontare date/ore — usare sempre:
```typescript
const dLocal = new Date(new Date(a.data).toLocaleString('en-US', { timeZone: 'Europe/Rome' }))
const oraMin = dLocal.getHours() * 60 + dLocal.getMinutes()
const dateStr = `${dLocal.getFullYear()}-${String(dLocal.getMonth()+1).padStart(2,'0')}-${String(dLocal.getDate()).padStart(2,'0')}`
```

## Prenotazioni Tavoli — Flusso
- `Preventivo` = richiesta pubblica del cliente (da `/prenota/[publicId]`)
- Quando accettata → crea `Appuntamento` con `note: "Da richiesta #001"`
- `tavoliIds: String?` (JSON array `["id1","id2"]`) su entrambi `Preventivo` e `Appuntamento`
- `tavoloId` = singolo tavolo (legacy), `tavoliIds` = multi-tavolo
- `bloccoAutoTavoli` e `modalitaOrario: 'libero'|'turni'` sono in `User.regolePrenotazione` (JSON)
- `turniServizio` è JSON in `User`: `[{ id, nome, oraInizio: "HH:MM", oraFine: "HH:MM" }]`
- API disponibilità pubblica: `app/api/public/disponibilita/route.ts`

## Calendario — Colonne Tavoli
- Vista giornaliera: una colonna per tavolo + colonna "Non assegnati" (sx) per app senza tavolo
- Header e body colonne usano entrambi `flex-1 minWidth:140` — non cambiare o si disallineano
- Un appuntamento multi-tavolo appare come "primary" nella prima colonna e "ghost" nelle altre

## Note Importanti
- **Connessioni DB su Vercel**: usare porta `6543` con `?pgbouncer=true` nel DATABASE_URL (transaction mode). In locale va bene porta `5432`.
- **Polling**: le pagine principali si aggiornano ogni 15 secondi automaticamente.
- **Multi-tenant**: ogni dato è separato per `userId`.
- **Middleware**: `proxy.ts` (non `middleware.ts`) gestisce auth Clerk.
- **fabbisognoStaff**: salvato come JSON in `User.fabbisognoStaff`, gestito da Impostazioni → Staff.
- **Turni AI**: `app/api/genera-turni/route.ts` usa Claude per generare turni basandosi su disponibilità dipendenti e fabbisogno impostazioni.

## Variabili d'Ambiente (.env.local)
```
DATABASE_URL="postgresql://...@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard/check
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard/check
ANTHROPIC_API_KEY=sk-ant-...
```
> Le chiavi esatte vanno chieste al proprietario del progetto — non vanno mai committate su GitHub.

## Deploy
- Ogni `git push` su `main` trigera deploy automatico su Vercel
- Vercel usa le chiavi `pk_live_` di Clerk e porta `6543` di Supabase
- Se il build fallisce per TypeScript: controllare i log su Vercel → Deployments

## Collaborazione in Team
**Repository:** https://github.com/Progetto-Gestionale/flowdesk

**Prima volta (setup):**
```bash
git clone https://github.com/Progetto-Gestionale/flowdesk.git
cd flowdesk
npm install
```
Poi creare `.env.local` con le chiavi fornite dal proprietario del progetto.

**Flusso di lavoro quotidiano:**
```bash
git pull                        # sempre prima di iniziare
# ...lavora e modifica file...
git add -A                      # sempre -A, mai un sottoinsieme
git commit -m "descrizione"
git push                        # trigera deploy automatico su Vercel
```

**Regola fondamentale:** fare sempre `git pull` prima di iniziare a lavorare per evitare conflitti.
