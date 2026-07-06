import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Panel from './pages/Panel'
import EventDetail from './pages/EventDetail'
import Scanner from './pages/Scanner'
import Ticket from './pages/Ticket'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Entrada virtual pública: la ve el invitado, no requiere login */}
          <Route path="/entrada/:code" element={<Ticket />} />

          <Route path="/login" element={<Login />} />

          <Route path="/panel" element={
            <ProtectedRoute><Panel /></ProtectedRoute>
          } />
          <Route path="/panel/evento/:eventId" element={
            <ProtectedRoute adminOnly><EventDetail /></ProtectedRoute>
          } />
          <Route path="/scanner" element={
            <ProtectedRoute><Scanner /></ProtectedRoute>
          } />

          {/* Pantalla de inicio: el flyer. Al tocarlo lleva al login. */}
          <Route path="/" element={<Landing />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
