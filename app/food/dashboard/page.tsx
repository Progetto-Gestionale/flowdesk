import ResocontoSerata from './components/ResocontoSerata'
import StaffInServizio from './components/StaffInServizio'

export default function DashboardHome() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-stretch">
      {/* Colonna principale: box resoconto serata + tavoli/coperti liberi */}
      <div className="min-w-0">
        <ResocontoSerata />
      </div>
      {/* Colonna destra a tutta altezza: chi è in servizio ora (copia dal box presenze staff) */}
      <StaffInServizio />
    </div>
  )
}
