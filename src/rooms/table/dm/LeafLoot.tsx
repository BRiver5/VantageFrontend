import { useMemo, useState } from 'react'
import { Backpack, Coins, Crown, Gem, ImagePlus, Package, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { realImage, uploadMedia, type Equipment, type Item } from '../../../api'
import { useCatalogList } from '../../../create/useCatalog'
import type { RoomItem, ScreenItemTemplate } from '../../../types/rooms'
import { useRoom } from '../../RoomProvider'
import { claimItem, createTemplate, deleteTemplate, issueItem, issueTemplate, listTemplates, patchTemplate } from '../../roomsApi'
import { DirectoryList } from '../../../ui/directory/DirectoryList'
import { useDirectory } from '../../../ui/directory/useDirectory'
import { errText, Hex, itemArt, itemName } from '../parts'
import { Img } from '../../../media'
import { type Pick, useList } from './common'
import { SplitCoins } from './SplitCoins'

/** Куда отдать: стол, ширма или любой герой — одно нажатие */
function GiveBar({ pick, onDone }: { pick: Pick; onDone: (msg: string) => void }) {
  const { data, roomId } = useRoom()
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const give = async (target: string, where: string) => {
    setBusy(true)
    setError(null)
    try {
      if (pick.source === 'template') await issueTemplate(roomId, pick.id, { quantity: qty, target })
      else await issueItem(roomId, { kind: pick.kind, catalog_ref: pick.id, quantity: qty, target })
      onDone(`${pick.name}${qty > 1 ? ` ×${qty}` : ''}: ${where}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sc-give">
      <b className="sc-give-name">{pick.name}</b>
      <span className="sc-count" aria-label="Количество">
        <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Меньше">
          −
        </button>
        <b>×{qty}</b>
        <button type="button" onClick={() => setQty((n) => Math.min(99, n + 1))} aria-label="Больше">
          +
        </button>
      </span>
      <button type="button" className="tb-goldbtn" disabled={busy} onClick={() => void give('table', 'на столе')}>
        <Package aria-hidden="true" /> На стол
      </button>
      <button type="button" className="tb-goldbtn is-quiet" disabled={busy} onClick={() => void give('screen', 'за ширмой')}>
        За ширму
      </button>
      <span className="sc-give-heroes">
        {data?.characters.map((c) => (
          <button key={c.id} type="button" disabled={busy} className="sc-mini" onClick={() => void give(c.id, c.name)} title={`Отдать: ${c.name}`} aria-label={`Отдать: ${c.name}`}>
            <Hex raw={c.avatar_url} name={c.name} />
          </button>
        ))}
      </span>
      {error && <span className="tb-err">{error}</span>}
    </div>
  )
}

/** Новый предмет: лист бумаги рядом с каталогом, чтобы подсматривать в готовые */
function NewTemplate({ onSaved, onClose }: { onSaved: (t: ScreenItemTemplate) => void; onClose: () => void }) {
  const { roomId } = useRoom()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [magic, setMagic] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="sc-newtpl"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Назовите предмет')
        setBusy(true)
        setError(null)
        try {
          onSaved(await createTemplate(roomId, { name: name.trim(), description, base_kind: magic ? 'magic_item' : 'equipment', image_url: image, tags: [] }))
          onClose()
        } catch (err) {
          setError(errText(err))
          setBusy(false)
        }
      }}
    >
      <div className="sc-newtpl-top">
        <label className={`sc-newtpl-art${magic ? ' is-magic' : ''}${uploading ? ' is-busy' : ''}`} title="Картинка предмета">
          {image ? <Img src={image} alt="" /> : <ImagePlus aria-hidden="true" />}
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label="Картинка предмета"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setUploading(true)
              try {
                setImage((await uploadMedia(f)).url)
              } catch (err) {
                setError(errText(err))
              } finally {
                setUploading(false)
              }
            }}
          />
        </label>
        <div className="sc-newtpl-head">
          <input className="sc-note-title" value={name} maxLength={120} placeholder="Название предмета" aria-label="Название" onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="button" className={`sc-newtpl-magic${magic ? ' is-on' : ''}`} aria-pressed={magic} onClick={() => setMagic((v) => !v)}>
            <Gem aria-hidden="true" /> {magic ? 'Магический предмет' : 'Обычный предмет'}
          </button>
        </div>
      </div>
      <textarea value={description} placeholder="Что это, откуда взялось, что умеет…" aria-label="Описание" onChange={(e) => setDescription(e.target.value)} />
      {error && <p className="sc-newtpl-err">{error}</p>}
      <footer>
        <button type="button" className="sc-newtpl-cancel" onClick={onClose}>
          отмена
        </button>
        <button type="submit" className="tb-goldbtn" disabled={busy || uploading}>
          Создать
        </button>
      </footer>
    </form>
  )
}

export function LeafLoot() {
  const { data, roomId } = useRoom()
  const [tab, setTab] = useState<'equipment' | 'magic' | 'own'>('equipment')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [screenPick, setScreenPick] = useState<RoomItem | null>(null)
  // предмет из-за ширмы уже отдаётся: второй щелчок получил бы 409
  const [giving, setGiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { items: equipment } = useCatalogList<Equipment>('equipment')
  const { items: magic } = useCatalogList<Item>('items')
  const tpl = useList<ScreenItemTemplate>(listTemplates)
  // шаблон, который удаляем: второй щелчок не шлёт запрос ещё раз
  const [deleting, setDeleting] = useState<string | null>(null)

  const list = useMemo<Pick[]>(() => {
    const needle = q.trim().toLocaleLowerCase('ru')
    const src: Pick[] =
      tab === 'equipment'
        ? equipment.map((e) => ({ source: 'catalog' as const, kind: 'equipment' as const, id: e.id, name: e.equipment_name, sub: e.subcategory ?? e.category ?? '', art: realImage(e.equipment_image_gallery) }))
        : tab === 'magic'
          ? magic.map((m) => ({ source: 'catalog' as const, kind: 'magic_item' as const, id: m.id, name: m.item_name, sub: m.rarity ?? m.item_type ?? '', art: realImage(m.item_image_gallery) }))
          : (tpl.items ?? []).map((t) => ({ source: 'template' as const, kind: t.base_kind, id: t.id, name: t.name, sub: t.description.slice(0, 40), art: t.image_url }))
    return src.filter((p) => !needle || p.name.toLocaleLowerCase('ru').includes(needle)).sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 60)
  }, [tab, q, equipment, magic, tpl.items])

  const screen = useMemo(() => data?.items.filter((i) => i.holder === 'screen') ?? [], [data?.items])
  // у своих заготовок и у вещей за ширмой — свои папки (виды item_templates и items)
  const ownDir = useDirectory('item_templates')
  const dir = useDirectory('items')
  const { folderOf, sortOf } = dir
  const { folderOf: ownFolderOf, sortOf: ownSortOf } = ownDir
  const own = useMemo(() => (tpl.items ?? []).map((t) => ({ t, id: t.id, name: t.name, folderId: ownFolderOf(t), sortOrder: ownSortOf(t.id) })), [tpl.items, ownFolderOf, ownSortOf])
  const behind = useMemo(() => screen.map((it) => ({ it, id: it.id, name: itemName(it), folderId: folderOf(it), sortOrder: sortOf(it.id) })), [screen, folderOf, sortOf])
  const pickTemplate = (t: ScreenItemTemplate) => {
    setPick({ source: 'template', kind: t.base_kind, id: t.id, name: t.name, sub: t.description.slice(0, 40), art: t.image_url })
    setDone(null)
    setScreenPick(null)
  }
  const give = (it: RoomItem, characterId: string) => {
    setGiving(true)
    setError(null)
    claimItem(roomId, it.id, characterId)
      .then(
        () => setScreenPick(null),
        (e) => setError(errText(e)),
      )
      .finally(() => setGiving(false))
  }

  return (
    <div className="sc-loot">
      <div className="sc-loot-bar">
        <div className="tb-tri" role="tablist" aria-label="Откуда">
          {(
            [
              ['equipment', 'Снаряжение', Backpack],
              ['magic', 'Магия', Gem],
              ['own', 'Свои', Crown],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
              <Icon aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {tab !== 'own' && (
          <label className="sc-search">
            <Search aria-hidden="true" />
            <input type="search" value={q} placeholder="Найти предмет…" onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        <button type="button" className={`tb-goldbtn${creating ? '' : ' is-quiet'}`} aria-pressed={creating} onClick={() => setCreating((v) => !v)}>
          <Plus aria-hidden="true" /> Свой предмет
        </button>
        <button type="button" className={`tb-goldbtn${splitting ? '' : ' is-quiet'}`} aria-pressed={splitting} onClick={() => setSplitting((v) => !v)} title="Разделить монеты поровну между героями">
          <Coins aria-hidden="true" /> Разделить монеты
        </button>
      </div>

      <div className={`sc-loot-main${creating ? ' is-split' : ''}`}>
      {creating && (
        <NewTemplate
          onSaved={(t) => {
            void tpl.reload()
            setTab('own')
            setPick({ source: 'template', kind: t.base_kind, id: t.id, name: t.name, sub: t.description.slice(0, 40), art: t.image_url })
            setDone(null)
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {tab === 'own' ? (
        <DirectoryList
          listId="loot-own"
          label="Свои предметы"
          items={own}
          folders={ownDir.folders}
          ops={ownDir.ops}
          selectedId={pick?.source === 'template' ? pick.id : null}
          query={q}
          onQueryChange={setQ}
          searchPlaceholder="Найти предмет…"
          renderItem={({ t }) => (
            <>
              <span className="dir-thumb">{t.image_url ? <Img src={t.image_url} alt="" loading="lazy" draggable={false} /> : t.base_kind === 'magic_item' ? <Gem aria-hidden="true" /> : <Backpack aria-hidden="true" />}</span>
              <span className="dir-name" title={t.description.slice(0, 80)}>
                {t.name}
              </span>
            </>
          )}
          actions={{
            open: ({ t }) => pickTemplate(t),
            rename: async ({ t }, name) => {
              await patchTemplate(roomId, t.id, { name })
              await tpl.reload()
            },
            duplicate: async ({ t }) => {
              await createTemplate(roomId, { name: `${t.name} (копия)`, description: t.description, base_kind: t.base_kind, base_ref: t.base_ref, overrides: t.overrides, image_url: t.image_url, tags: t.tags })
              await tpl.reload()
            },
            exportJson: ({ t }) => t,
            remove: async ({ t }) => {
              await deleteTemplate(roomId, t.id)
              if (pick?.id === t.id) setPick(null)
              await tpl.reload()
            },
          }}
          empty={tpl.items ? <p className="tb-hint">Придумайте предмет один раз и выдавайте сколько угодно.</p> : null}
        />
      ) : (
      <ul className="sc-tiles">
        {list.map((p) => (
          <li key={`${p.source}-${p.id}`}>
            <button
              type="button"
              className={pick?.id === p.id ? 'is-on' : ''}
              onClick={() => {
                setPick(p)
                setDone(null)
                setScreenPick(null)
              }}
              aria-pressed={pick?.id === p.id}
              title={p.sub}
            >
              <span className={`sc-tile-art${p.kind === 'magic_item' ? ' is-magic' : ''}`}>{p.art ? <Img src={p.art} alt="" loading="lazy" draggable={false} /> : p.kind === 'magic_item' ? <Gem aria-hidden="true" /> : <Backpack aria-hidden="true" />}</span>
              <b>{p.name}</b>
            </button>
            {p.source === 'template' && (
              <button
                type="button"
                className="sc-tile-del"
                aria-label={`Удалить «${p.name}»`}
                disabled={deleting === p.id}
                onClick={() => {
                  if (deleting || !confirm(`Удалить «${p.name}»?`)) return
                  setDeleting(p.id)
                  void deleteTemplate(roomId, p.id)
                    .then(tpl.reload, (e) => setError(errText(e)))
                    .finally(() => setDeleting(null))
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      )}
      </div>

      {screen.length > 0 && (
        <div className="sc-behind is-column">
          <span>За ширмой:</span>
          <DirectoryList
            listId="loot-screen"
            label="Предметы за ширмой"
            className="sc-behind-list"
            items={behind}
            folders={dir.folders}
            ops={dir.ops}
            selectedId={screenPick?.id ?? null}
            searchPlaceholder="Найти за ширмой…"
            renderItem={({ it }) => (
              <>
                <span className="dir-thumb">{itemArt(it) ? <Img src={itemArt(it) as string} alt="" /> : <Package aria-hidden="true" />}</span>
                <span className="dir-name">{itemName(it)}</span>
                {it.quantity > 1 && <i className="dir-count">×{it.quantity}</i>}
              </>
            )}
            actions={{
              open: ({ it }) => setScreenPick(screenPick?.id === it.id ? null : it),
              extra: ({ it }) => (data?.characters ?? []).map((c) => ({ id: `give-${c.id}`, label: `Отдать: ${c.name}`, icon: <UserRound />, disabled: giving, run: () => give(it, c.id) })),
              permissions: 'items',
              exportJson: ({ it }) => it,
            }}
          />
          {screenPick && (
            <span className="sc-give-heroes">
              отдать:
              {data?.characters.map((c) => (
                <button key={c.id} type="button" className="sc-mini" title={c.name} aria-label={`Отдать: ${c.name}`} disabled={giving} onClick={() => give(screenPick, c.id)}>
                  <Hex raw={c.avatar_url} name={c.name} />
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {splitting && <SplitCoins onClose={() => setSplitting(false)} />}
      <footer className="sc-loot-foot">
        {pick ? <GiveBar key={pick.id} pick={pick} onDone={setDone} /> : <p className="tb-hint">Выберите предмет, затем решите, кому он достанется.</p>}
        {done && (
          <p className="sc-done" role="status">
            {done}
          </p>
        )}
        {(error || tpl.error) && <p className="tb-err">{error || tpl.error}</p>}
      </footer>
    </div>
  )
}
