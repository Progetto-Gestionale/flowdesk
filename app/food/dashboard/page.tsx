import ResocontoSerata from './components/ResocontoSerata'
import StaffInServizio from './components/StaffInServizio'
import IntestazioneLocale from './components/IntestazioneLocale'

export default function DashboardHome() {
  return (
    // Occupa tutta l'altezza disponibile: intestazione in cima, sotto i box che si distendono a riempire.
    <div className="h-full flex flex-col gap-5">
      <IntestazioneLocale />
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* Colonna principale: box resoconto serata + tavoli/coperti liberi (riempiono la colonna) */}
        <div className="min-w-0 h-full">
          <ResocontoSerata />
        </div>
        {/* Colonna destra a tutta altezza: chi è in servizio ora */}
        <StaffInServizio />
      </div>
    </div>
  )
}
