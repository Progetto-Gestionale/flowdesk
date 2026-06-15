export default function PianoEditoriale() {
  const giorni = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
  const oggi = new Date().getDay()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Piano Editoriale</h1>
          <p className="text-gray-500 mt-0.5">Pianifica e gestisci i tuoi contenuti.</p>
        </div>
        <button className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + Nuovo contenuto
        </button>
      </div>

      {/* Calendario settimanale */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {giorni.map((g, i) => (
            <div
              key={g}
              className={`p-3 text-center text-sm font-medium ${i + 1 === oggi ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500'}`}
            >
              {g}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-32">
          {giorni.map((g, i) => (
            <div
              key={g}
              className={`p-2 border-r border-gray-100 last:border-r-0 ${i + 1 === oggi ? 'bg-indigo-50/30' : ''}`}
            >
              <button className="w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded p-1 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                + aggiungi
              </button>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-400 text-center mt-6">Nessun contenuto pianificato questa settimana.</p>
    </div>
  )
}
