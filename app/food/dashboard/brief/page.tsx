import { redirect } from 'next/navigation'

// Brief e Assistente sono stati unificati nel Copilota AI: il brief vive ora in
// cima alla pagina dell'assistente, con la chat agganciata sotto. Vecchi link e
// bookmark a /brief atterrano lì.
export default function BriefPage() {
  redirect('/food/dashboard/assistente')
}
