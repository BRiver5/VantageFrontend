/**
 * Текст атласа: Markdown базы знаний, где [[ссылки]] ведут по атласу (метка,
 * лор, год) или в FR Wiki. Плюс инфобокс статьи и подпись источника.
 */
import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { MarkdownBody, type PageLookup } from '../rooms/kb/Markdown'
import type { Infobox } from '../api/atlas'
import { useAtlas } from './AtlasContext'
import { linkHint } from './links'

export function AtlasText({ src, inline = false }: { src: string; inline?: boolean }) {
  const { links, go } = useAtlas()
  const pages = useMemo<PageLookup>(
    () => ({ has: (t) => links?.internal(t) ?? false, body: () => null, titles: [] }),
    [links],
  )
  const onOpen = (title: string) => links && go(links.resolve(title))
  const hint = (title: string) => (links ? linkHint(links.resolve(title), title) : title)
  return (
    <div className={`atlas-md${inline ? ' is-inline' : ''}`}>
      <MarkdownBody src={src} pages={pages} onOpen={onOpen} linkHint={hint} />
    </div>
  )
}

export function InfoboxCard({ box, title }: { box: Infobox; title: string }) {
  if (!box.image && box.groups.length === 0) return null
  return (
    <aside className="atlas-infobox">
      {box.image && (
        <figure>
          <img src={box.image} alt={title} loading="lazy" />
          {box.caption && <figcaption>{box.caption}</figcaption>}
        </figure>
      )}
      {box.groups.map((g, i) => (
        <section key={i}>
          {g.title && <h4>{g.title}</h4>}
          <dl>
            {g.rows.map((r, j) => (
              <div key={j}>
                <dt>{r.label}</dt>
                <dd>
                  <AtlasText src={r.value} inline />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </aside>
  )
}

export function WikiSource({ url, title }: { url: string; title: string }) {
  return (
    <a className="atlas-source" href={url} target="_blank" rel="noreferrer noopener">
      <ExternalLink aria-hidden="true" /> «{title}» — Forgotten Realms Wiki, CC BY-SA
    </a>
  )
}
