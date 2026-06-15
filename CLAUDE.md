# FlowDesk — Contesto Progetto

## Cos'è FlowDesk
SaaS multi-tenant per freelancer e PMI italiane. Automatizza marketing, lead e gestione clienti in un unico posto. Powered by Claude AI. Made in Italy.

## Moduli
- **Modulo 1 — Marketing Intelligence**: analytics social, content repurposing AI, piano editoriale, report ROI
- **Modulo 2 — Lead & Client Hub**: CRM pipeline, inbox messaggi, preventivi, calendario appuntamenti, chatbot AI

## Piani e Prezzi
- Modulo 1 solo: €39/mese (€390/anno)
- Modulo 2 solo: €49/mese (€490/anno)
- Bundle completo: €69/mese (€690/anno)
- Trial: 30 giorni gratuiti, nessuna carta

## Stack Tecnico
- **Frontend + Backend**: Next.js 16 (TypeScript), App Router
- **Stile**: Tailwind CSS
- **Auth**: Clerk v7
- **Database**: SQLite locale (Prisma 5) — migrare su PostgreSQL/Supabase al deploy
- **AI**: Claude API (claude-haiku-4-5-20251001) — Anthropic SDK
- **Pagamenti**: Stripe (da installare)
- **Hosting**: Vercel + Hetzner (da fare)

## Struttura Cartelle
```
flowdesk/
├── app/
│   ├── page.tsx                          ← Landing page con ChatWidget
│   ├── layout.tsx                        ← ClerkProvider
│   ├── components/
│   │   └── ChatWidget.tsx                ← Widget chat floating (landing page)
│   ├── dashboard/
│   │   ├── layout.tsx                    ← Layout con Sidebar + TopBar
│   │   ├── page.tsx                      ← Overview dashboard
│   │   ├── check/page.tsx                ← Redirect logica (nuovo→onboarding, esistente→dashboard)
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── marketing/
│   │   │   ├── analytics/page.tsx        ← Placeholder
│   │   │   ├── content/page.tsx          ← Content repurposing AI ✅ FUNZIONANTE
│   │   │   ├── piano/page.tsx            ← Placeholder
│   │   │   └── roi/page.tsx              ← Placeholder
│   │   └── clienti/
│   │       ├── crm/page.tsx              ← Pipeline kanban ✅ FUNZIONANTE
│   │       ├── inbox/page.tsx            ← Messaggi chatbot ✅ FUNZIONANTE
│   │       ├── preventivi/page.tsx       ← Preventivi ✅ FUNZIONANTE
│   │       └── calendario/page.tsx       ← Calendario appuntamenti ✅ FUNZIONANTE
│   ├── onboarding/page.tsx               ← 3 step (nome, settore, obiettivi)
│   ├── sign-in/[[...sign-in]]/page.tsx
│   ├── sign-up/[[...sign-up]]/page.tsx
│   └── api/
│       ├── chat/route.ts                 ← Chatbot AI (Claude) — crea lead + preventivo + conversazione
│       ├── leads/route.ts                ← GET + POST contatti
│       ├── leads/[id]/route.ts           ← PATCH + DELETE contatto
│       ├── preventivi/route.ts           ← GET + POST preventivi
│       ├── preventivi/[id]/route.ts      ← PATCH + DELETE preventivo
│       ├── conversazioni/route.ts        ← GET conversazioni inbox
│       ├── conversazioni/[id]/route.ts   ← PATCH (segna letta)
│       ├── profile/route.ts              ← GET + PATCH profilo utente
│       └── content/repurpose/route.ts    ← AI content repurposing
├── lib/
│   └── prisma.ts                         ← PrismaClient singleton
├── middleware.ts                         ← Clerk auth + redirect
├── prisma/
│   ├── schema.prisma                     ← Schema DB
│   ├── dev.db                            ← SQLite locale
│   └── migrations/
├── prisma.config.ts                      ← Config Prisma 7 (anche se usiamo v5)
├── .env.local                            ← Chiavi API
├── .env                                  ← DATABASE_URL per Prisma CLI
└── CLAUDE.md                             ← Questo file
```

## Schema Database (Prisma)
```prisma
model User         { id, clerkId, name, email, niche, objectives, plan }
model Lead         { id, userId, name, email, phone, status, notes }
model Content      { id, userId, originalText, channel, result }
model Preventivo   { id, userId, numero, clienteName, clienteEmail, items(JSON), totale, status, note }
model Conversazione { id, userId, clienteNome, clienteEmail, canale, messaggi(JSON), letta }
model Appuntamento  { id, userId, clienteNome, clienteEmail, servizio, data, durata, status, note }
model SlotDisponibile { id, userId, giornoSettimana, oraInizio, oraFine, durata }
```

## Variabili d'Ambiente (.env.local)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard/check
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard/check
DATABASE_URL="file:/Users/ciccocioppotommaso/Desktop/progetto gestionale/flowdesk/prisma/dev.db"
ANTHROPIC_API_KEY=sk-ant-api03-...
NEXT_PUBLIC_OWNER_ID=cmqdr185o00007mvo9f5gw6y6
```

## Stato Avanzamento
- [x] Landing page
- [x] Auth Clerk (login, registrazione, Google OAuth, logout)
- [x] Onboarding 3 step (solo nuovi utenti)
- [x] Dashboard con sidebar navigabile
- [x] Impostazioni profilo (salva nome + settore nel DB)
- [x] Contatti & Pipeline (CRM kanban, modifica, elimina)
- [x] Preventivi (crea, modifica, cambia stato, elimina)
- [x] Content Repurposing AI
- [x] Chatbot AI sulla landing (crea lead + preventivo + conversazione automaticamente)
- [x] Inbox messaggi (mostra conversazioni chatbot)
- [x] Calendario appuntamenti (vista appuntamenti + gestione slot disponibilità)
- [x] Chatbot aggiornato per proporre slot calendario
- [ ] Deploy online
- [ ] Stripe pagamenti
- [ ] Integrazioni esterne (WhatsApp, Instagram, Google Calendar)

## Prossimo Step
Costruire la pagina calendario e aggiornare il chatbot per proporre slot liberi.
1. API slot disponibili (CRUD)
2. API appuntamenti (CRUD)
3. Pagina calendario con vista settimanale
4. Aggiornare /api/chat per leggere slot liberi e prenotare

## Regole di Sviluppo
1. Mai usare `sudo`
2. Sempre dalla cartella: `/Users/ciccocioppotommaso/Desktop/progetto gestionale/flowdesk`
3. Usare Claude Code per modificare file — non far copiare codice a mano
4. Conferma prima di operazioni distruttive
5. Permessi ristretti alla cartella progetto

## Comandi Utili
```bash
# Avvio server (terminale 1)
cd "/Users/ciccocioppotommaso/Desktop/progetto gestionale/flowdesk"
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev

# Migrazione DB (terminale 2)
NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma migrate dev --name nome-migrazione

# Rigenera client Prisma
NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate
```

## Info Ambiente
- Mac macOS 13 Ventura
- Node.js v20.20.2 (/usr/local/opt/node@20/bin)
- Cartella progetto: `/Users/ciccocioppotommaso/Desktop/progetto gestionale/flowdesk`
- Wireframes: `/Users/ciccocioppotommaso/Desktop/progetto gestionale/FlowDesk Wireframes/`

## Note Architetturali
- SSL locale disabilitato: tutti i comandi npm/npx con NODE_TLS_REJECT_UNAUTHORIZED=0
- Anthropic SDK: fetchOptions con rejectUnauthorized:false per stesso motivo
- Prisma 5 (downgrade da v7 per compatibilità)
- Multi-tenant: dati separati per userId nel DB
- ChatWidget usa NEXT_PUBLIC_OWNER_ID per sapere a chi mandare i lead
- Middleware protegge tutto tranne /, /sign-in, /sign-up, /api/chat
