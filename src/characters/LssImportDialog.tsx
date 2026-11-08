/**
 * Окно импорта из Long Story Short: по каждому герою — что нашлось в каталоге
 * уверенно (✓), что похоже (на выбор игрока) и что уйдёт в заметки. Игрок
 * правит выбор и жмёт «Импортировать»; затем — отчёт и ссылки на листы.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleHelp, FileUp, Loader2, X } from 'lucide-react'
import { DEFAULT_SKILLS } from '../types/character'
import { importHero, matchHero, type Candidate, type ImportReport, type LssHero, type Matched } from './lssImport'

const SKILL_RU = new Map(DEFAULT_SKILLS.map((s) => [s.key, s.label]))

type Row = { hero: LssHero; m: Matched | null; on: boolean; state: 'matching' | 'ready' | 'running' | 'done' | 'error'; steps: string[]; report?: ImportReport; error?: string }

export function LssImportDialog({ heroes, onClose, onDone }: { heroes: LssHero[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => heroes.map((hero) => ({ hero, m: null, on: true, state: 'matching', steps: [] })))
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let on = true
    heroes.forEach((h, i) => {
      matchHero(h).then(
        (m) => on && setRows((rs) => rs.map((r, j) => (j === i ? { ...r, m, state: 'ready' } : r))),
        (e) => on && setRows((rs) => rs.map((r, j) => (j === i ? { ...r, state: 'error', error: e instanceof Error ? e.message : 'Каталог недоступен' } : r))),
      )
    })
    return () => {
      on = false
    }
  }, [heroes])

  const patch = (i: number, fn: (m: Matched) => Matched) => setRows((rs) => rs.map((r, j) => (j === i && r.m ? { ...r, m: fn(r.m) } : r)))

  const run = async () => {
    setRunning(true)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.on || !r.m) continue
      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: 'running' } : x)))
      try {
        const report = await importHero(r.hero, r.m, (t) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, steps: [...x.steps, t] } : x))))
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: 'done', report } : x)))
      } catch (e) {
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: 'error', error: e instanceof Error ? e.message : 'Не получилось' } : x)))
      }
    }
    setRunning(false)
    onDone()
  }

  const ready = rows.every((r) => r.state !== 'matching')
  const finished = rows.some((r) => r.state === 'done') && !running
  const count = rows.filter((r) => r.on && r.m && r.state === 'ready').length

  return (
    <div className="lss-backdrop" role="dialog" aria-modal="true" aria-label="Импорт из Long Story Short">
      <div className="lss-dialog">
        <header className="lss-head">
          <FileUp aria-hidden="true" />
          <div>
            <h2>Импорт из Long Story Short</h2>
            <p>Мы сопоставили лист с нашим каталогом по названиям. ✓ — нашлось точно, ? — похоже, выберите сами. Всё, чему нет места в листе, уйдёт в заметки.</p>
          </div>
          <button type="button" className="lss-x" onClick={onClose} disabled={running} aria-label="Закрыть">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="lss-list">
          {rows.map((r, i) => (
            <article key={r.hero.key} className={`lss-hero is-${r.state}${r.on ? '' : ' is-off'}`}>
              <header>
                <label className="lss-pick">
                  <input type="checkbox" checked={r.on} disabled={running || r.state === 'done'} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  <b>{r.hero.name}</b>
                </label>
                <span className="lss-meta">
                  {r.hero.classes.map((c) => `${c.name} ${c.level}`).join(' / ')} · {r.hero.race?.name || 'раса?'} · редакция {r.hero.edition}
                </span>
                {r.state === 'matching' && (
                  <span className="lss-busy">
                    <Loader2 aria-hidden="true" /> ищем в каталоге…
                  </span>
                )}
              </header>

              {r.m && r.state !== 'done' && (
                <div className="lss-grid">
                  {r.m.classes.map((c, ci) => (
                    <Pick key={ci} label={r.m!.classes.length > 1 ? `Класс ${ci + 1}` : 'Класс'} lss={`${c.lss.name} (${c.lss.level})`} cands={c.cands} value={c.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, classes: m.classes.map((x, k) => (k === ci ? { ...x, pick: v } : x)) }))} />
                  ))}
                  {r.m.subclass && <Pick label="Подкласс" lss={r.hero.subclass?.name ?? ''} cands={r.m.subclass.cands} value={r.m.subclass.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, subclass: m.subclass && { ...m.subclass, pick: v } }))} />}
                  {r.m.race && <Pick label="Раса" lss={r.hero.race?.name ?? ''} cands={r.m.race.cands} value={r.m.race.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, race: m.race && { ...m.race, pick: v } }))} />}
                  {r.m.subrace && <Pick label="Подраса" lss={r.hero.subrace?.name ?? ''} cands={r.m.subrace.cands} value={r.m.subrace.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, subrace: m.subrace && { ...m.subrace, pick: v } }))} />}
                  {r.m.background && <Pick label="Предыстория" lss={r.hero.background?.name ?? ''} cands={r.m.background.cands} value={r.m.background.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, background: m.background && { ...m.background, pick: v } }))} />}
                  {r.m.feats.map((f, fi) => (
                    <Pick key={`f${fi}`} label="Черта" lss={f.lss} cands={f.cands} value={f.pick} disabled={running} onChange={(v) => patch(i, (m) => ({ ...m, feats: m.feats.map((x, k) => (k === fi ? { ...x, pick: v } : x)) }))} />
                  ))}
                </div>
              )}

              {r.m && r.state !== 'done' && (
                <>
                  <p className="lss-line">
                    <span>Навыки:</span> {r.hero.skills.map((k) => SKILL_RU.get(k) ?? k).join(', ') || '—'}
                    <i> — выберем, где сервер спросит</i>
                  </p>
                  <p className="lss-line">
                    <span>Характеристики:</span> {Object.entries(r.hero.scores).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ')}
                    <i> — итог совпадёт, бонусы не задвоятся</i>
                  </p>
                  {r.m.gear.length > 0 && (
                    <div className="lss-gear">
                      <span>Снаряжение:</span>
                      {r.m.gear.map((g, gi) => {
                        const c = g.cands.find((x) => x.id === g.pick)
                        return (
                          <label key={gi} className={`lss-chip${g.pick ? ' is-on' : ''}`} title={g.pick ? `→ ${c?.title}` : g.cands[0] ? `похоже на «${g.cands[0].title}» — отметьте, чтобы взять` : 'нет в каталоге — уйдёт в заметки'}>
                            <input
                              type="checkbox"
                              checked={!!g.pick}
                              disabled={running || g.cands.length === 0}
                              onChange={(e) => patch(i, (m) => ({ ...m, gear: m.gear.map((x, k) => (k === gi ? { ...x, pick: e.target.checked ? (x.cands.find((y) => y.sure) ?? x.cands[0])?.id ?? null : null } : x)) }))}
                            />
                            {g.lss.qty > 1 ? `${g.lss.qty}× ` : ''}
                            {g.pick ? c?.title : g.lss.name}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {(r.state === 'running' || r.state === 'done') && (
                <ul className="lss-log">
                  {r.steps.map((s, k) => (
                    <li key={k}>
                      <Check aria-hidden="true" /> {s}
                    </li>
                  ))}
                  {r.state === 'running' && (
                    <li>
                      <Loader2 aria-hidden="true" className="lss-spin" /> работаем…
                    </li>
                  )}
                </ul>
              )}
              {r.report && (
                <div className="lss-report">
                  {r.report.left.length > 0 && (
                    <ul>
                      {r.report.left.map((t, k) => (
                        <li key={k}>{t}</li>
                      ))}
                    </ul>
                  )}
                  <Link to={`/characters/${r.report.id}`} className="cs-btn">
                    Открыть лист «{r.hero.name}»
                  </Link>
                </div>
              )}
              {r.error && <p className="auth-error">{r.error}</p>}
            </article>
          ))}
        </div>

        <footer className="lss-foot">
          {finished ? (
            <button type="button" className="cs-btn" onClick={onClose}>
              Готово
            </button>
          ) : (
            <>
              <button type="button" className="cs-btn cs-btn--ghost" onClick={onClose} disabled={running}>
                Отмена
              </button>
              <button type="button" className="cs-btn" onClick={() => void run()} disabled={!ready || running || count === 0}>
                {running ? 'Импортируем…' : `Импортировать${count > 1 ? ` (${count})` : ''}`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

/** Строка сопоставления: что было в LSS → что берём из каталога */
function Pick({ label, lss, cands, value, onChange, disabled }: { label: string; lss: string; cands: Candidate[]; value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const cur = cands.find((c) => c.id === value)
  const sure = !!cur?.sure
  return (
    <div className={`lss-row${value ? (sure ? ' is-sure' : ' is-guess') : cands.length ? ' is-guess' : ' is-none'}`}>
      <span className="lss-label">{label}</span>
      <span className="lss-from" title="как было в Long Story Short">
        {lss || '—'}
      </span>
      <span className="lss-mark" aria-hidden="true">
        {value && sure ? <Check /> : <CircleHelp />}
      </span>
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={`${label}: из каталога`}>
        <option value="">{cands.length ? 'не брать (в заметки)' : 'нет в каталоге — в заметки'}</option>
        {cands.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
            {c.sure ? '' : ' — похоже'}
          </option>
        ))}
      </select>
    </div>
  )
}
