/** Раздел «Герой»: имя, портрет и рамка, фон листа, опыт, мировоззрение */
import type { Dispatch, SetStateAction } from 'react'
import { UserRound } from 'lucide-react'
import { ALIGNMENTS } from '../../../create/steps/AlignmentChart'
import { bgUrl } from '../../../media'
import type { Character } from '../../../types/character'
import { EdField, EdSection, TextField } from '../../editorFields'
import { FaceCropper } from '../../FacePortrait'
import type { FaceCrop, PortraitInfo } from '../../portrait'
import { ImageSource, XpField } from '../editorFields'

type Props = {
  c: Character
  set: (patch: Partial<Character>) => void
  pic: PortraitInfo
  setPic: Dispatch<SetStateAction<PortraitInfo>>
  face: FaceCrop
  setFace: (next: FaceCrop) => void
}

export function HeroSection({ c, set, pic, setPic, face, setFace }: Props) {
  return (
    <EdSection id="hero" icon={UserRound} title="Герой" lead="Имя, портрет и его рамка, фон листа, опыт и мировоззрение.">
      <div className="ed-grid">
        <TextField label="Имя" value={c.character_name} onChange={(v) => set({ character_name: v.slice(0, 120) })} wide />
        <TextField label="Игрок" value={c.player_display_name ?? ''} onChange={(v) => set({ player_display_name: v || null })} />
        <EdField label="Мировоззрение" as="label">
          <select className="ed-input ed-select" value={c.alignment ?? ''} onChange={(e) => set({ alignment: e.target.value || null })}>
            <option value="">—</option>
            {Object.values(ALIGNMENTS).map((a) => (
              <option key={a.abbr} value={a.name}>
                {a.abbr} · {a.name}
              </option>
            ))}
          </select>
        </EdField>
        <XpField value={c.experience_points} onChange={(v) => set({ experience_points: v })} />
        <ImageSource label="Портрет" value={pic.src} maxSide={900} onChange={(src) => setPic((p) => ({ ...p, src }))} />
      </div>
      {pic.src && (
        <div className="ed-sub">
          <h5>Рамка и кадр лица</h5>
          <FaceCropper src={pic.src} crop={face} onChange={setFace} />
        </div>
      )}
      <div className="ed-sub">
        <h5>Фон листа</h5>
        <div className="ed-grid">
          <ImageSource label="Картинка за листом" value={pic.background} maxSide={1600} onChange={(background) => setPic((p) => ({ ...p, background }))} />
        </div>
        {pic.background && <span className="ed-bg-preview" style={{ backgroundImage: `url("${bgUrl(pic.background, 320)}")` }} aria-hidden="true" />}
      </div>
    </EdSection>
  )
}
