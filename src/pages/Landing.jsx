import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Pantalla de inicio: muestra el flyer y, al tocarlo (en cualquier lado),
// lleva al login. El flyer es la imagen public/flyer.png.
export default function Landing() {
  const navigate = useNavigate()
  const [imgOk, setImgOk] = useState(true)
  const goLogin = () => navigate('/login')

  return (
    <div className="landing" onClick={goLogin} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goLogin() }}>
      {imgOk ? (
        <img
          src="/img24.png"
          alt="Tu Entrada — Control de acceso a eventos con QR"
          className="landing-flyer"
          onError={() => setImgOk(false)}
        />
      ) : (
        // Fallback por si todavía no cargaste public/flyer.png
        <div className="landing-fallback">
          <img src="/logotuentrada.png" alt="Tu Entrada" />
          <h1>Control de acceso a eventos con QR</h1>
          <p>Gestioná invitados, enviá entradas digitales y validá accesos en segundos.</p>
        </div>
      )}

      <button className="landing-cta" onClick={(e) => { e.stopPropagation(); goLogin() }}>
        Ingresar →
      </button>
    </div>
  )
}
