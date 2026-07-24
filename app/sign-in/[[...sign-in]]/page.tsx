import { SignIn } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  // Già loggato → dritto al proprio dashboard (in base alla verticale).
  const { userId } = await auth()
  if (userId) redirect('/dashboard/check')

  return (
    <main className="flex min-h-screen items-center justify-center bg-mist">
      <SignIn
        signUpUrl="/sign-up"
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