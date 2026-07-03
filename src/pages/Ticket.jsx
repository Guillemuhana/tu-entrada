import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabaseClient'

export default function Ticket() {
  const { code } = useParams()
  const [guest, setGuest] = useState(null)
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: g } = await supabase.from('guests').select('*').eq('code', code).maybeSingle()
      if (!g) { setNotFound(true); setLoading(false); return }
      setGuest(g)
      const { data: ev } = await supabase.from('events').select('*').eq('id', g.event_id).maybeSingle()
      setEvent(ev)
      setLoading(false)
    }
    load()
  }, [code])

  if (loading) {
    return <div className="ticket-screen"><div className="spinner" /></div>
  }

  if (notFound || !guest) {
    return (
      <div className="ticket-screen">
        <div className="credential">
          <div className="credential-body">
            <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
            <h2 className="credential-name" style={{ fontSize: 20 }}>Entrada no encontrada</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Este link no corresponde a ninguna entrada válida. Consultá con la organización del evento.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const statusLabel = { pendiente: 'Entrada válida — sin usar', ingresado: 'Ya utilizada', anulado: 'Entrada anulada' }[guest.status]
  const ticketUrl = window.location.href

  return (
    <div className="ticket-screen">
      <div className="credential">
        <div className="credential-hole" />
        <div className="credential-header">
          <div className="brand-mark" style={{ justifyContent: 'center' }}>
            <div className="brand-badge">TE</div>
            <div style={{ textAlign: 'left' }}>
              <div className="brand-name" style={{ fontSize: 14 }}>TU ENTRADA</div>
              <div className="brand-sub">Entrada digital</div>
            </div>
          </div>
        </div>

        <div className={`credential-status ${guest.status}`}>{statusLabel}</div>

        <div className="credential-body">
          <div className="credential-name">{guest.full_name}</div>
          <div className="credential-type">{guest.ticket_type}</div>

          <div className="credential-qr">
            <QRCodeSVG value={ticketUrl} size={190} />
          </div>
          <div className="credential-code">#{guest.code.slice(0, 10).toUpperCase()}</div>
        </div>

        <div className="credential-perforation" />

        <div className="credential-footer">
          <div className="event-name">{event?.name}</div>
          <div className="event-meta">
            {event?.event_date ? new Date(event.event_date).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
            {event?.location ? ` · ${event.location}` : ''}
          </div>
        </div>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 18, textAlign: 'center', maxWidth: 320 }}>
        Presentá este QR desde tu celular en el ingreso. No es necesario imprimirlo.
      </p>
    </div>
  )
}
