import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import {
  BestiaryPage,
  BackgroundsPage,
  EquipmentPage,
  FeatsPage,
  ItemsPage,
  RacesPage,
  SpellsPage,
  TerminsPage,
} from './pages/CatalogPage'
import ClassesPage from './pages/ClassesPage'
import BookPage from './pages/BookPage'
import SettingPage from './pages/SettingPage'
import CharacterEditorPage from './pages/CharacterEditorPage'
import CharactersPage from './pages/CharactersPage'
import RoomsPage from './pages/RoomsPage'
import RoomPage from './rooms/RoomPage'
import CreateCharacterWizard from './create/CreateCharacterWizard'
import LevelUpWizard from './create/LevelUpWizard'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfilePage from './pages/ProfilePage'
import ModerationPage from './reviews/ModerationPage'
import {
  BackgroundDetailPage,
  CreatureDetailPage,
  EquipmentDetailPage,
  FeatDetailPage,
  ItemDetailPage,
  RaceDetailPage,
  SpellDetailPage,
  SubclassDetailPage,
  SubraceDetailPage,
  TerminDetailPage,
} from './pages/DetailPages'
import DiceRoller from './dice/DiceRoller'
import RouteReadyGate from './RouteReadyGate'
import { useAppShell } from './shell'
import { SearchProvider } from './search/GlobalSearch'
import { TermDetailPage, TermsIndexPage } from './terms/TermPages'
import { Sidebar } from './shell/Sidebar'
import { HomePage } from './pages/home/HomePage'
import { AppTabBar } from './shell/AppTabBar'
import { ScrollToTop } from './shell/ScrollToTop'

/* ---------- Приложение ---------- */

export default function App() {
  const { app } = useAppShell()
  return (
    <SearchProvider>
    <div className="app-shell">
      <ScrollToTop />
      <Sidebar />
      <main className="page">
        <RouteReadyGate>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/classes" element={<ClassesPage />}>
              <Route index element={null} />
              <Route path=":id" element={null} />
            </Route>
            <Route path="/subclasses/:id" element={<SubclassDetailPage />} />
            <Route path="/races" element={<RacesPage />} />
            <Route path="/races/:id" element={<RaceDetailPage />} />
            <Route path="/subraces/:id" element={<SubraceDetailPage />} />
            <Route path="/backgrounds" element={<BackgroundsPage />} />
            <Route path="/backgrounds/:id" element={<BackgroundDetailPage />} />
            <Route path="/feats" element={<FeatsPage />} />
            <Route path="/feats/:id" element={<FeatDetailPage />} />
            <Route path="/spells" element={<SpellsPage />} />
            <Route path="/spells/:id" element={<SpellDetailPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bestiary" element={<BestiaryPage />} />
            <Route path="/bestiary/:id" element={<CreatureDetailPage />} />
            <Route path="/terms" element={<TermsIndexPage />} />
            <Route path="/terms/:slug" element={<TermDetailPage />} />
            <Route path="/termins" element={<TerminsPage />} />
            <Route path="/termins/:id" element={<TerminDetailPage />} />
            <Route path="/character" element={<Navigate to="/characters" replace />} />
            <Route
              path="/characters"
              element={
                <RequireAuth>
                  <CharactersPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/new"
              element={
                <RequireAuth>
                  <CreateCharacterWizard />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id/level-up"
              element={
                <RequireAuth>
                  <LevelUpWizard />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id"
              element={
                <RequireAuth>
                  <CharacterEditorPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rooms"
              element={
                <RequireAuth>
                  <RoomsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rooms/join/:code"
              element={
                <RequireAuth>
                  <RoomsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rooms/:id"
              element={
                <RequireAuth>
                  <RoomPage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/moderation"
              element={
                <RequireAuth>
                  <ModerationPage />
                </RequireAuth>
              }
            />
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route path="/__cw-preview" element={<CreateCharacterWizard />} />
            <Route path="/books/:id" element={<BookPage />} />
            <Route path="/settings/:id" element={<SettingPage />} />
          </Routes>
        </RouteReadyGate>
      </main>
      <DiceRoller />
      {app && <AppTabBar />}
    </div>
    </SearchProvider>
  )
}
