/**
 * @3d-dice/dice-box не поставляет собственных типов — минимальное типирование
 * той части API, которую реально используем (конструктор, init, roll, колбэки).
 */
declare module '@3d-dice/dice-box' {
  export interface DieRollResult {
    sides: number | string
    value: number
    groupId?: number
    rollId?: number
    theme?: string
  }

  export interface RollGroupResult {
    sides: string
    qty: number
    modifier: number
    value: number
    rolls: DieRollResult[]
  }

  export type DiceNotation =
    | string
    | Array<string | { qty: number; sides: number | string }>
    | { qty: number; sides: number | string }

  /** результат отдельной кости — то, чем реально резолвится roll()/add() */
  export interface RollResult {
    sides: number | string
    value: number
    groupId: number
    rollId: number
    theme?: string
    themeColor?: string
  }

  export interface DiceBoxConfig {
    id?: string
    assetPath: string
    container?: string
    origin?: string
    theme?: string
    themeColor?: string
    scale?: number
    gravity?: number
    mass?: number
    friction?: number
    restitution?: number
    angularDamping?: number
    linearDamping?: number
    spinForce?: number
    throwForce?: number
    startingHeight?: number
    settleTimeout?: number
    offscreen?: boolean
    delay?: number
    lightIntensity?: number
    enableShadows?: boolean
    shadowTransparency?: number
    preloadThemes?: string[]
    externalThemes?: Record<string, string>
    suspendSimulation?: boolean
  }

  export default class DiceBox {
    constructor(config: DiceBoxConfig)
    init(): Promise<void>
    roll(notation: DiceNotation, options?: { theme?: string; themeColor?: string; newStartPoint?: boolean }): Promise<RollResult[]>
    add(notation: DiceNotation, options?: { theme?: string; themeColor?: string; newStartPoint?: boolean }): Promise<RollResult[]>
    reroll(notation: unknown, options?: { remove?: boolean; newStartPoint?: boolean }): Promise<RollResult[]>
    remove(notation: unknown): Promise<RollResult[]>
    clear(): void
    hide(transitionClass?: string): void
    show(): void
    getRollResults(): RollGroupResult[]
    updateConfig(config: Partial<DiceBoxConfig>): Promise<void>
    onBeforeRoll: (parsedNotation: unknown) => void
    onDieComplete: (die: DieRollResult) => void
    onRollComplete: (results: RollGroupResult[]) => void
    onRemoveComplete: (die: DieRollResult) => void
    onThemeConfigLoaded: (config: unknown) => void
    onThemeLoaded: (config: unknown) => void
  }
}
