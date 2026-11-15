/**
 * Клавиши в текстах туров: `{key:ruler.toggle}` превращается в текущую комбинацию
 * из реестра — человек мог переназначить её в «Управлении». Несколько комбинаций
 * пишутся через «или»; действие без комбинации — «(клавиша не назначена)».
 */
import { combosOf, type ActionId } from '../input/keybindings'

const TOKEN = /\{key:([a-z0-9._-]+)\}/gi

export function formatKeys(text: string, lookup: (id: ActionId) => readonly string[] = combosOf): string {
  return text.replace(TOKEN, (_, id: string) => {
    const combos = lookup(id as ActionId)
    return combos.length ? combos.join(' или ') : '(клавиша не назначена)'
  })
}
