import { ClassesCatalog } from './CatalogPage'
import { ClassDetailView } from './DetailPages'

/** Каталог и деталь класса — одна оболочка; URL `/classes` ⇄ `/classes/:id`. */
export default function ClassesPage() {
  return (
    <ClassesCatalog
      inlineDetail={({ selected, onClose }) => (
        <ClassDetailView id={selected.id} onBack={onClose} />
      )}
    />
  )
}
