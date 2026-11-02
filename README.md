# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.


## Комнаты (совместная игра)

Раздел `/rooms`: мастер создаёт комнату, игроки входят по коду со своим персонажем, всё обновляется по WebSocket.

Переменные окружения (`.env`, в Vercel — Project Settings → Environment Variables):

| Переменная | Назначение |
| --- | --- |
| `VITE_API_BASE` | Адрес REST API, если он не на том же домене. |
| `VITE_WS_BASE` | База WebSocket, например `wss://api.example.com/api`. Vercel не проксирует WebSocket, поэтому в проде указывайте адрес бэкенда напрямую. Если не задана, берётся адрес страницы (`ws(s)://<host>/api`), а в dev это работает через прокси Vite (`ws: true`). |
| `VITE_DICE_TEST_HOOK` | `1` — оставить в продакшен-сборке тестовый вызов `window.__playForcedRoll` (нужен только для автотестов костей). |
| `API_TARGET` | Только dev: куда Vite проксирует `/api` (по умолчанию боевой бэкенд). Удобно для мок-сервера: `API_TARGET=http://localhost:5300 npm run dev`. |

Заметки по устройству:

- Состояние комнаты строится из снимка `GET /rooms/{id}/state` и событий сокета (`src/rooms/applyEvent.ts`). Ответы REST экран не меняют — только события.
- Кубики в комнате бросает сервер; 3D-кости у всех ложатся на присланные значения (`src/dice/forcedFaces.ts`: библиотека не умеет задавать грань, поэтому после остановки кубик доворачивается до нужной грани).
- Ширма и дашборд мастера рассчитаны на компьютер; игроки могут играть и с телефона (горизонтально).
