import { useMemo, useState } from 'react'
import { Eye, EyeOff, Shield, Skull } from 'lucide-react'
import type { AnyCreature, RoomCreature } from '../../../types/rooms'
import { isFullCreature } from '../../../types/rooms'
import { DirectoryList } from '../../../ui/directory/DirectoryList'
import { useDirectory } from '../../../ui/directory/useDirectory'
import { useRoom } from '../../RoomProvider'
import { addCreatures, patchRoomCreature, removeRoomCreature, revealCreature } from '../../roomsApi'
import { CardEffects, CreatureBack, HpControls, STAT_RU, statsOf } from '../Cards'
import { creatureArt, creatureHp, creatureName, errText, Hex, HpVessel, SIZE_RU } from '../parts'
import { Img } from '../../../media'
import { EncounterMeter } from '../../gm/EncounterMeter'
import { AddCreature } from './AddCreature'

/** Строка полки: жетон, имя и где существо — за ширмой или на столе */
function ShelfToken({ c }: { c: AnyCreature }) {
  const hp = creatureHp(c)
  const hidden = isFullCreature(c) && c.on_screen_only
  return (
    <>
      <span className={`dir-creature${hidden ? ' is-hidden' : ' is-out'}${hp.ratio === 0 ? ' is-down' : ''}`} title={hidden ? 'За ширмой. Перетащите на стол, чтобы показать игрокам' : 'На столе'}>
        <Hex plain={creatureArt(c)} name={creatureName(c)} tone="enemy" />
        <span className="dir-name">{creatureName(c)}</span>
      </span>
      <i className={`dir-state${hidden ? ' is-hidden' : ''}`}>{hidden ? 'за ширмой' : 'на столе'}</i>
    </>
  )
}

/** Страница бестиария: всё про выбранное существо на одном развороте */
function BeastPage({ c, onFlip }: { c: RoomCreature; onFlip: () => void }) {
  const { roomId } = useRoom()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hp = creatureHp(c)
  const art = creatureArt(c)
  const s = c.snapshot
  const meta = [s.creature_type, s.size ? (SIZE_RU[s.size] ?? s.size) : null, s.challenge_rating != null ? `ПО ${s.challenge_rating}` : null].filter(Boolean).join(' · ')
  const stats = statsOf(c).filter(([, v]) => v != null)
  const actionText = (name: string, text: string) => (text.startsWith(name) ? text.slice(name.length).replace(/^[.\s:]+/, '') : text)
  return (
    <article className="sc-page">
      <div className="sc-page-art">{art ? <Img src={art} alt="" draggable={false} /> : <Skull aria-hidden="true" />}</div>
      <div className="sc-page-main">
        <header>
          <div>
            <h3>{c.display_name}</h3>
            {meta && <p>{meta}</p>}
          </div>
          {c.on_screen_only ? (
            <button
              type="button"
              className="tb-goldbtn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await revealCreature(roomId, c.id)
                } catch (e) {
                  setError(errText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Eye aria-hidden="true" /> На стол
            </button>
          ) : (
            <span className="sc-page-state">
              <Eye aria-hidden="true" /> на столе
            </span>
          )}
        </header>

        <div className="sc-page-vitals">
          <span className="tb-ac" title="Класс доспеха">
            <Shield aria-hidden="true" />
            <b>{s.ac}</b>
          </span>
          <HpVessel ratio={hp.ratio} current={hp.current} max={hp.max} temp={hp.temp} />
          <HpControls c={c} />
        </div>
        <CardEffects target={{ creature: c }} title={c.display_name} />
        <dl className="sc-page-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{STAT_RU[k] ?? k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="tb-linkbtn" onClick={onFlip}>
          <EyeOff aria-hidden="true" /> что видят игроки
        </button>
        {error && <p className="tb-err">{error}</p>}
      </div>
      {(s.actions?.length ?? 0) > 0 && (
        <ul className="sc-page-acts">
          {s.actions?.map((a, i) => {
            const name = String(a.name ?? a.title ?? '')
            return (
              <li key={i}>
                <b>{name}</b> {actionText(name, String(a.description ?? a.text ?? ''))}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

export function LeafCreatures() {
  const { data, roomId } = useRoom()
  const [sel, setSel] = useState<string | null>(null)
  // пустая полка сразу открывает бестиарий; после первого добавления поиск не закрывается сам
  const [adding, setAdding] = useState(() => (data?.creatures.length ?? 0) === 0)
  const [back, setBack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useMemo(() => (data?.creatures ?? []) as AnyCreature[], [data?.creatures])
  const current = list.find((c) => c.id === sel) ?? list[0] ?? null
  const showAdd = adding || list.length === 0
  const dir = useDirectory('creatures')
  const { folderOf, sortOf } = dir
  const entries = useMemo(() => list.map((c) => ({ c, id: c.id, name: creatureName(c), folderId: folderOf(c), sortOrder: sortOf(c.id) })), [list, folderOf, sortOf])
  const behind = list.some((c) => isFullCreature(c) && c.on_screen_only)

  const reveal = (c: AnyCreature) => {
    setError(null)
    revealCreature(roomId, c.id).catch((e) => setError(errText(e)))
  }

  return (
    <div className="sc-two is-beasts">
      <div className="sc-pane sc-shelf">
        <h4>
          Существа
          {behind && <i>перетащите на стол</i>}
        </h4>
        <DirectoryList
          listId="creatures"
          label="Существа"
          items={entries}
          folders={dir.folders}
          ops={dir.ops}
          selectedId={showAdd ? null : (current?.id ?? null)}
          onCreate={() => setAdding((v) => !v)}
          createLabel="Добавить"
          createActive={showAdd}
          searchPlaceholder="Найти существо…"
          renderItem={(e) => <ShelfToken c={e.c} />}
          onItemDragEnd={(e, _ev, point) => {
            // жетон за ширмой, отпущенный над столом, выходит к игрокам
            const hidden = isFullCreature(e.c) && e.c.on_screen_only
            const sheet = document.querySelector('.sc-sheet')?.getBoundingClientRect()
            if (hidden && point && sheet && point.y < sheet.top) reveal(e.c)
          }}
          actions={{
            open: (e) => {
              setSel(e.id)
              setAdding(false)
              setBack(false)
            },
            extra: (e) => (isFullCreature(e.c) && e.c.on_screen_only ? [{ id: 'reveal', label: 'На стол', icon: <Eye />, run: () => reveal(e.c) }] : []),
            rename: (e, name) => patchRoomCreature(roomId, e.id, { display_name: name }),
            duplicate: (e) => {
              const c = e.c
              if (!isFullCreature(c)) return
              return addCreatures(roomId, {
                ...(c.catalog_ref ? { catalog_ref: c.catalog_ref } : { snapshot: c.snapshot }),
                display_name: `${c.display_name} (копия)`,
                public_name: c.public_name,
                image_url: c.image_url,
                visibility: c.visibility,
                on_screen_only: true,
                quick_access: c.quick_access,
              })
            },
            permissions: 'creatures',
            exportJson: (e) => e.c,
            remove: (e) => removeRoomCreature(roomId, e.id),
          }}
        />
        {(error || dir.error) && <p className="tb-err">{error || dir.error}</p>}
        <EncounterMeter compact creatures={list.filter((c) => (creatureHp(c).ratio ?? 1) > 0)} />
      </div>
      <div className="sc-pane sc-detail">
        {showAdd ? (
          <AddCreature onClose={() => setAdding(false)} />
        ) : current && isFullCreature(current) ? (
          back ? (
            <CreatureBack c={current} onFlip={() => setBack(false)} />
          ) : (
            <BeastPage c={current} onFlip={() => setBack(true)} />
          )
        ) : null}
      </div>
    </div>
  )
}
