import './domGuard' // ДО первого рендера: защита от расширений-переводчиков
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { TermsProvider } from './terms/terms.tsx'
import { EquipmentDrawerProvider } from './equipmentDrawer.tsx'

// StrictMode отключён: двойной dev-монтаж ломает инициализацию 3D-кубиков —
// @3d-dice/dice-box поднимает свой WebGL-контекст и WASM-физику на общем
// контейнере #dice-box-stage (см. src/dice/DiceRoller.tsx) и не переживает
// повторный init. В проде StrictMode и так не действует.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <TermsProvider>
          <EquipmentDrawerProvider>
            <App />
          </EquipmentDrawerProvider>
        </TermsProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
)
