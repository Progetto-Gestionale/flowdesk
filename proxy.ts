import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher([
  '/',
  '/food',
  '/care',
  '/web',
  '/registrati(.*)',
  '/staff(.*)',
  '/api/staff/(.*)',
  '/api/disponibilita(.*)',
  '/widget/(.*)',
  '/chat/(.*)',
  '/api/chat(.*)',
  '/api/public/(.*)',
  '/menu(.*)',
  '/ordina(.*)',
  '/api/ordina(.*)',
  '/prenota(.*)',
  '/care/prenota(.*)',
  '/dipendente(.*)',
  '/api/dipendente/(.*)',
  '/api/qr-timbratura/scan(.*)',
  '/api/cron/(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
