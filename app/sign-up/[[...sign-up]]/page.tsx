import { SignUp } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function SignUpPage() {
  // Se sono già autenticato (es. "mi registro" con un account già esistente, o via Google)
  // salto la registrazione e vado dritto al mio dashboard.
  const { userId } = await auth()
  if (userId) redirect('/dashboard/check')

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist">
      <SignUp
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard/check"
        appearance={{
          variables: {
            colorPrimary: '#1F52FF',
            colorForeground: '#0B1533',
          },
        }}
      />
    </main>
  )
}