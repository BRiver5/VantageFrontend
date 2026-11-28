/**
 * Лор мира: оглавление по темам (мир, боги, земли, былые державы, события,
 * фракции) и статья выбранного раздела — целиком, со ссылками по атласу.
 */
import { useEffect, useMemo, useState } from 'react'
import { getLoreSection } from '../api/atlas'
import type { LoreSection } from '../api/atlas'
import { useAtlas, useWorldParams } from './AtlasContext'
import { AtlasText, InfoboxCard, WikiSource } from './AtlasText'

export default function AtlasLore() {
  const { world, lore, pick } = useAtlas()
  const { params, set } = useWorldParams()
  const sectionId = params.get('section') ?? lore?.[0]?.id ?? null
  const [section, setSection] = useState<LoreSection | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sectionId) return
    let alive = true
    setSection(null)
    setError(null)
    getLoreSection(world.world, sectionId)
      .then((s) => alive && setSection(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [world.world, sectionId])

  const topics = useMemo(() => {
    const out = new Map<string, LoreSection[]>()
    for (const s of lore ?? []) out.set(s.topic, [...(out.get(s.topic) ?? []), s])
    return [...out]
  }, [lore])

  if (!lore) return <p className="status-line">Раскрываем фолиант…</p>

  return (
    <div className="atlas-lore">
      <nav className="atlas-lore-toc" aria-label="Разделы лора">
        {topics.map(([topic, list]) => (
          <div key={topic} className="atlas-lore-topic">
            <h4>{topic}</h4>
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === sectionId ? 'is-active' : ''}
                onClick={() => {
                  set({ section: s.id })
                  document.querySelector('.atlas-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {s.name_ru}
                <small>{s.title}</small>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <article className="atlas-lore-page">
        {error && <p className="status-line is-error">Раздел не открылся: {error}</p>}
        {!section && !error && <p className="status-line">Открываем раздел…</p>}
        {section && (
          <>
            <h2 className="book-title gold-text">{section.name_ru}</h2>
            <div className="atlas-place-en">{section.title}</div>
            <div className="atlas-article">
              {section.infobox && <InfoboxCard box={pick(section.infobox_ru, section.infobox)} title={section.title} />}
              <AtlasText src={pick(section.body_ru, section.body ?? '')} />
              <WikiSource url={section.url} title={section.title} />
            </div>
          </>
        )}
      </article>
    </div>
  )
}
