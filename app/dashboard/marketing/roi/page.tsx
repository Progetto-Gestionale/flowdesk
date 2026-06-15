export default function ReportROI() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Report ROI</h1>
      <p className="text-gray-500 mb-8">Calcolo automatico del ritorno sulle campagne.</p>
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-400">
        <div className="text-4xl mb-3">📈</div>
        <p className="font-medium">Collega le tue campagne per vedere il ROI</p>
        <p className="text-sm mt-1">Google Ads · Meta Ads · Campagne email</p>
        <button className="mt-4 bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Connetti campagna
        </button>
      </div>
    </div>
  )
}
