export default function AnalyticsSocial() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Analytics Social</h1>
      <p className="text-gray-500 mb-8">Statistiche da Instagram, Facebook e Google in un unico posto.</p>
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
        <div className="text-4xl mb-3">📊</div>
        <p className="font-medium">Collega i tuoi account social per vedere le statistiche</p>
        <p className="text-sm mt-1">Instagram · Facebook · Google · TikTok</p>
        <button className="mt-4 bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Connetti account
        </button>
      </div>
    </div>
  )
}
