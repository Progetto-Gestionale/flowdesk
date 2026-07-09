import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher([
  '/',
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
  '/ordina(.*)',
  '/api/ordina(.*)',
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
