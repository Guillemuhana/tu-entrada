import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Layout({ children }) {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/panel" className="topbar-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand-badge">TE</div>
          <div>
            <div className="brand-name">TU ENTRADA</div>
            <div className="brand-sub">{isAdmin ? 'Panel administrador' : 'Control de acceso'}</div>
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{profile?.full_name || profile?.email}</span>
          <button onClick={handleLogout} className="btn-ghost">Salir</button>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  )
}
