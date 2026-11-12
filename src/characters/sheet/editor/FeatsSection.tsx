/** Раздел «Черты»: черты из каталога */
import { BookOpen, X } from 'lucide-react'
import type { Feat } from '../../../api'
import type { Character } from '../../../types/character'
import { CatalogSearch, EdSection } from '../../editorFields'

type Props = {
  c: Character
  set: (patch: Partial<Character>) => void
  featCatalog: Feat[]
  featNames: Set<string>
}

export function FeatsSection({ c, set, featCatalog, featNames }: Props) {
  return (
    <EdSection
      id="feats"
      icon={BookOpen}
      title="Черты"
      lead="Черты из каталога. Их умения и бонусы выдаёт сервер; умения класса и расы — на странице «Умения» листа."
    >
      <div className="ed-chips">
        {c.feat_ids.map((fid) => (
          <span key={fid} className="ed-chip">
            {featCatalog.find((f) => f.id === fid)?.feat_name ?? 'Черта'}
            <button type="button" onClick={() => set({ feat_ids: c.feat_ids.filter((x) => x !== fid) })} aria-label="Убрать черту">
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        {c.feat_ids.length === 0 && <span className="ed-empty">черт нет</span>}
      </div>
      <CatalogSearch
        items={featCatalog}
        label={(f) => f.feat_name}
        sub={(f) => (f.prerequisite ? `требование: ${f.prerequisite}` : '')}
        exclude={featNames}
        placeholder="Найти черту в каталоге и добавить…"
        onPick={(f) => set({ feat_ids: [...c.feat_ids, f.id] })}
      />
    </EdSection>
  )
}
