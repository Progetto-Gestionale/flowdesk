import { IconStethoscope } from '../../../components/icons'

export default function PazientiPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-12 h-12 rounded-xl bg-electric-blue/10 text-electric-blue flex items-center justify-center p-3 mb-4">
        <IconStethoscope />
      </div>
      <h1 className="text-xl font-bold text-ink-navy">Gestione Pazienti</h1>
      <p className="text-ink-navy/35 text-sm mt-2">Sezione in arrivo — Flowest Care</p>
    </div>
  )
}
