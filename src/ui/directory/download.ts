/** «Экспорт JSON»: скачать данные записи файлом */
export function downloadJson(name: string, data: unknown): void {
  const safe = name.replace(/[\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'export'
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safe}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
