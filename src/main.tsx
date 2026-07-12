import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// StrictMode отключён: двойной dev-монтаж ломает WebGL-контекст/WASM-инициализацию
// rapier у 3D-кубика (see src/dice/DiceRoller.tsx) — известная несовместимость
// react-three-fiber/rapier со StrictMode. В проде (без StrictMode) всё работает штатно.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
