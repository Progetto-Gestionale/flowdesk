// Ridimensiona e comprime un'immagine lato client → data URL JPEG leggero
// (~30-70KB con i default), utilizzabile direttamente come src o salvato in un
// campo stringa. Nessun servizio esterno richiesto. Solo lato browser.
export function comprimiImmagine(file: File, maxLato = 700, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('lettura file fallita'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width >= height && width > maxLato) { height = Math.round(height * maxLato / width); width = maxLato }
        else if (height > width && height > maxLato) { width = Math.round(width * maxLato / height); height = maxLato }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas non disponibile')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('immagine non valida'))
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
