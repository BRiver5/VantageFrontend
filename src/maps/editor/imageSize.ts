
export function imageSize(f: File): Promise<{ w: number; h: number }> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      ok({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => fail(new Error('Картинка не читается'))
    img.src = url
  })
}
