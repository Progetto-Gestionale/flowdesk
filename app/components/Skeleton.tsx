// Placeholder "scheletro" grigio pulsante da mostrare durante il caricamento, al posto di
// "Caricamento…". Solo estetica: nessuna logica, nessun dato. Fa percepire la pagina come
// "già arrivata" invece di uno schermo vuoto in attesa.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-navy/[0.08] ${className}`} />
}

// Un blocco "card" con dentro qualche riga: usato per liste di ordini/conti/prenotazioni.
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white border border-ink-navy/10 rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

// N card di fila (per griglie o liste).
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return <>{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</>
}
