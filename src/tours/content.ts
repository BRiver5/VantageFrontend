/**
 * Тексты туров. Якоря — атрибуты data-tour в разметке; если якоря нет на
 * экране (другая роль, телефон, пустая комната), шаг тихо пропускается.
 * Клавиши — `{key:id}`: при показе подставляется текущая комбинация (tours/keys.ts).
 */
import type { Tour, TourContextId } from './types'

/** Селектор якоря `[data-tour="…"]` */
export const at = (name: string): string => `[data-tour="${name}"]`

const openLeaf = (leaf: string, shown: string) => ({ click: at(`gm-leaf-${leaf}`), unless: at(shown) })
const pickTool = (tool: string) => ({ click: at(`map-tool-${tool}`), unless: `${at(`map-tool-${tool}`)}[aria-pressed="true"]` })

export const TOURS: Tour[] = [
  {
    id: 'first-visit',
    title: 'Первый вход',
    summary: 'Справочник, поиск по {key:search.open} и ваши персонажи',
    audience: 'all',
    context: 'site',
    steps: [
      {
        title: 'Добро пожаловать в Vantage',
        text: 'Справочник D&D 5e, создание героев и общий стол для игры — в одном месте. Покажем главное, это займёт минуту.',
      },
      {
        selector: at('sidebar-nav'),
        placement: 'right',
        title: 'Все разделы',
        text: 'Эта кнопка открывает меню: «Играть», персонажи, классы, расы, заклинания, снаряжение, бестиарий. Логотип ведёт на главную, стрелка у края сворачивает панель.',
      },
      {
        selector: at('sidebar-search'),
        placement: 'right',
        title: 'Поиск по всему сайту',
        text: 'Заклинание, монстр или термин находятся за пару букв. С любой страницы — {key:search.open}.',
      },
      {
        selector: at('nav-characters'),
        before: [{ click: at('sidebar-nav'), unless: at('nav-characters') }],
        placement: 'right',
        title: 'Ваши персонажи',
        text: 'Создание героя по шагам, лист персонажа и повышение уровня. Играть вместе — «Комнаты» рядом. Про конструктор есть отдельный тур «Создание персонажа».',
      },
      {
        selector: at('sidebar-account'),
        placement: 'right',
        title: 'Профиль',
        text: 'Войдите, чтобы хранить героев и садиться за стол. В профиле — аватар и цвет кубиков.',
      },
      {
        selector: at('sidebar-tours'),
        placement: 'right',
        title: 'Обучение',
        text: 'Здесь все туры: пройти заново, продолжить с места остановки или сбросить прогресс.',
      },
    ],
  },
  {
    id: 'create-character',
    title: 'Создание персонажа',
    summary: 'Конструктор героя по шагам: редакция правил, раса, класс, характеристики и итог',
    audience: 'all',
    context: 'site',
    steps: [
      {
        before: [{ navigate: '/characters/new' }],
        title: 'Конструктор героя',
        text: 'Герой собирается по шагам — от расы до снаряжения. Всё, что выбрано, можно поменять позже в «Правке листа».',
      },
      {
        selector: at('create-edition'),
        placement: 'bottom',
        title: 'Правила героя: 2014 или 2024',
        text: 'Редакция, по которой считается лист. У каталога каждого шага свой переключатель — расу можно взять из 2014, а класс из 2024.',
      },
      {
        selector: at('create-steps'),
        placement: 'bottom',
        title: 'Шаги',
        text: 'Раса, класс, предыстория, характеристики, снаряжение, имя, уровень. На пройденный шаг можно вернуться кликом.',
      },
      {
        selector: at('create-stage'),
        placement: 'top',
        title: 'Выбор на шаге',
        text: 'Карточки открывают подробности: умения, бонусы, владения. Выбранное сразу попадает в предпросмотр листа.',
      },
      {
        selector: at('create-foot'),
        placement: 'top',
        title: 'Дальше и назад',
        text: '«Далее» загорается, когда шаг заполнен; подсказка слева скажет, чего не хватает. На последнем шаге — «Создать героя».',
      },
      {
        title: 'После создания',
        text: 'Решения, которые остались (языки, умения черт), появятся плашкой «Требует решения» над листом. Новый уровень — кнопкой «Новый уровень».',
      },
    ],
  },
  {
    id: 'gm-room',
    title: 'Мастер: первая комната',
    summary: 'Приглашение, ширма мастера, карта на столе и начало боя',
    audience: 'gm',
    context: 'room-gm',
    steps: [
      {
        title: 'Ваша комната',
        text: 'Комнату создают на странице «Комнаты» кнопкой «Создать комнату». Здесь вы мастер: стол, ширма и решения — ваши.',
      },
      {
        selector: at('room-members'),
        placement: 'bottom',
        title: 'Пригласите игроков',
        text: 'В «Участниках» — ссылка и код приглашения. Отправьте их игрокам, а заявки подтвердите здесь же.',
      },
      {
        selector: at('gm-screen'),
        placement: 'top',
        title: 'Ширма мастера',
        text: 'Створки внизу видите только вы. Нажмите створку, чтобы раскрыть её, ещё раз — чтобы сложить.',
      },
      {
        selector: at('gm-leaf-creatures'),
        placement: 'top',
        title: 'Существа и добыча',
        text: '«Существа» — монстры из бестиария и свои, готовые к бою. «Добыча» — предметы и монеты для партии.',
      },
      {
        selector: at('gm-leaf-notes'),
        placement: 'top',
        title: 'Кодекс',
        text: 'Заметки, NPC, квесты и лавки. Любую страницу можно показать игрокам.',
      },
      {
        selector: at('gm-leaf-tables'),
        placement: 'top',
        title: 'Таблицы и сцена',
        text: 'Случайные таблицы бросаются в один клик. «Сцена» показывает всем картинку, реплику или рассказ.',
      },
      {
        selector: at('gm-leaf-archive'),
        placement: 'top',
        title: 'Архив',
        text: 'Выгрузка комнаты пакетом приключения, загрузка чужих пакетов и снимки для отката.',
      },
      {
        selector: at('maps-shelf'),
        before: [openLeaf('maps', 'maps-shelf')],
        placement: 'top',
        title: 'Карты',
        text: 'Карта из картинки, пустая или импорт .dd2vtt. Карандаш открывает конструктор: стены, свет, этажи.',
      },
      {
        selector: at('map-to-table'),
        before: [openLeaf('maps', 'maps-shelf')],
        placement: 'top',
        title: 'Карта на стол',
        text: '«На стол» показывает карту всем и ставит жетоны героев. «Убрать» — снова к пустому столу.',
      },
      {
        selector: at('gm-fight'),
        before: [{ click: at('gm-screen-close') }],
        placement: 'top',
        title: 'В бой',
        text: 'Выберите участников — стол сменится сценой боя с инициативой и ходами.',
      },
      {
        selector: at('room-tours'),
        placement: 'bottom',
        title: 'Подсказки рядом',
        text: 'Кнопка «?» открывает туры. «Игрок: за столом» покажет, что видят ваши игроки, «Редактор карт» — конструктор.',
      },
    ],
  },
  {
    id: 'player-table',
    title: 'Игрок: за столом',
    summary: 'Лист героя, ход по карте, линейка, пинги и быстрые действия',
    audience: 'player',
    context: 'room',
    steps: [
      {
        selector: at('room-sheet'),
        placement: 'bottom',
        title: 'Лист героя',
        text: 'Характеристики, заклинания и снаряжение вашего героя открываются поверх стола.',
      },
      {
        selector: at('map-field'),
        placement: 'center',
        title: 'Ход по карте',
        text: 'Перетащите свой жетон. Пока тащите, {key:ruler.waypoint} ставит точку маршрута, {key:ruler.unwaypoint} убирает её — цена пути видна сразу.',
      },
      {
        selector: at('map-field'),
        placement: 'center',
        title: 'Панель жетона',
        text: 'Правый клик по жетону открывает его панель: хиты, состояния и действия.',
      },
      {
        selector: at('ruler'),
        placement: 'left',
        title: 'Линейка',
        text: '{key:ruler.toggle} включает линейку: клики ставят точки, {key:ruler.up} и {key:ruler.down} меняют высоту. Правый клик или Esc — сбросить.',
      },
      {
        selector: at('map-field'),
        placement: 'center',
        title: 'Пинги',
        text: 'Долгое нажатие на карту — пинг, его увидят все. Alt+клик — сигнал «Внимание!».',
      },
      {
        selector: at('hotbar'),
        placement: 'top',
        title: 'Быстрые действия',
        text: 'Перетащите сюда заклинание, атаку или предмет из листа. Клавиши 1–0 запускают ячейки.',
      },
      {
        selector: at('party-bar'),
        placement: 'right',
        title: 'Отряд',
        text: 'Портреты партии: хиты и эффекты союзников. Нажмите портрет, чтобы увидеть подробности.',
      },
      {
        selector: at('room-chat'),
        placement: 'bottom',
        title: 'Чат и броски',
        text: 'Пишите партии и мастеру. Команда /r 1d20+5 бросает кубики, /w — шёпот.',
      },
      {
        selector: at('room-tours'),
        placement: 'bottom',
        title: 'Подсказки рядом',
        text: 'Если мастер поставил игру на паузу, стол замрёт до его команды. А туры всегда здесь, под «?».',
      },
    ],
  },
  {
    id: 'map-editor',
    title: 'Редактор карт',
    summary: 'Инструменты, палитра, стены, свет, слои, этажи и импорт .dd2vtt',
    audience: 'gm',
    context: 'room-gm',
    steps: [
      {
        selector: at('map-import'),
        before: [openLeaf('maps', 'maps-shelf')],
        skipIf: at('map-editor'),
        placement: 'top',
        title: 'Импорт .dd2vtt',
        text: 'Карты из Dungeondraft, DungeonFog и других редакторов приезжают сразу со стенами, дверями и светом.',
      },
      {
        selector: at('map-blank'),
        skipIf: `${at('map-editor')}, ${at('map-edit')}`,
        placement: 'top',
        title: 'Сначала карта',
        text: 'Создайте карту — пустую или из картинки — и запустите тур снова: дальше он покажет конструктор.',
      },
      {
        selector: at('map-editor-tools'),
        before: [{ click: at('map-edit'), unless: at('map-editor') }],
        placement: 'right',
        title: 'Инструменты',
        text: 'Выбор, стены, двери, окна, ассеты, рельеф, свет, зоны, жетоны. Клавиша каждого — в подсказке.',
      },
      {
        selector: at('map-editor-palette'),
        placement: 'bottom',
        title: 'Палитра',
        text: 'Задаёт, какими будут новые стены, объекты и жетоны, и правит всё выбранное разом.',
      },
      {
        selector: at('map-wall-presets'),
        before: [pickTool('wall')],
        placement: 'left',
        title: 'Заготовки стен',
        text: 'Сплошная, невидимая, дверь, окно… Выберите и рисуйте: клик — точка, двойной клик или Enter — конец.',
      },
      {
        selector: at('map-tool-light'),
        placement: 'right',
        title: 'Свет',
        text: 'L и клик по карте ставят источник. Радиус, цвет и мерцание — справа, тени падают от стен.',
      },
      {
        selector: at('map-tool-note'),
        placement: 'right',
        title: 'Слои',
        text: 'Метки, звуки местности и рисунки лежат на своих слоях и сохраняются сразу. «Список» показывает всё на карте.',
      },
      {
        selector: at('map-levels'),
        before: [pickTool('select')],
        placement: 'left',
        title: 'Этажи',
        text: 'У этажа — высота от и до в футах и своя подложка. Лестница — зона со ссылкой на другой этаж.',
      },
      {
        selector: `${at('map-editor')} .me-head`,
        placement: 'bottom',
        title: 'Сохранение',
        text: 'Правки сохраняются сами, Ctrl+Z отменяет. Крестик закрывает конструктор и возвращает к полке карт.',
      },
    ],
  },
]

export const tourById = (id: string): Tour | undefined => TOURS.find((t) => t.id === id)

export const CONTEXT_HINT: Record<TourContextId, string> = {
  site: 'Запускается на страницах сайта, вне комнаты',
  room: 'Запускается за столом в комнате',
  'room-gm': 'Запускается в комнате, где вы мастер',
}

export const AUDIENCE_LABEL = { all: 'Всем', gm: 'Мастеру', player: 'Игроку' } as const
