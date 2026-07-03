import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Layout from '../components/Layout'

export default function EventsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', event_date: '', location: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadEvents() {
    setLoading(true)
    const { data: eventsData, error: err } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })

    if (!err && eventsData) {
      setEvents(eventsData)
      const { data: guestsData } = await supabase.from('guests').select('event_id, status')
      const c = {}
      guestsData?.forEach((g) => {
        c[g.event_id] = c[g.event_id] || { total: 0, ingresado: 0 }
        c[g.event_id].total += 1
        if (g.status === 'ingresado') c[g.event_id].ingresado += 1
      })
      setCounts(c)
    }
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('El nombre del evento es obligatorio.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('events').insert({
      name: form.name.trim(),
      event_date: form.event_date || null,
      location: form.location || null,
      description: form.description || null,
      created_by: user.id,
    })
    setSaving(false)
    if (err) { setError('No se pudo crear el evento: ' + err.message); return }
    setForm({ name: '', event_date: '', location: '', description: '' })
    setShowForm(false)
    loadEvents()
  }

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div className="eyebrow">EVENTOS</div>
          <h1 className="section-title">Tus eventos</h1>
          <p className="section-sub" style={{ marginBottom: 0 }}>Creá un evento y cargá invitados con entrada digital por QR.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nuevo evento</button>
      </div>

      {loading && (
        <div className="center-loader" style={{ minHeight: 200 }}><div className="spinner" /></div>
      )}

      {!loading && events.length === 0 && (
        <div className="panel empty-state">
          <div className="icon">🗂️</div>
          <p>Todavía no creaste ningún evento.</p>
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ marginTop: 8 }}>Crear el primero</button>
        </div>
      )}

      {!loading && events.map((ev) => {
        const c = counts[ev.id] || { total: 0, ingresado: 0 }
        return (
          <div key={ev.id} className="event-card" onClick={() => navigate(`/panel/evento/${ev.id}`)}>
            <div>
              <h3>{ev.name}</h3>
              <p>
                {ev.event_date ? new Date(ev.event_date).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}
                {ev.location ? ` · ${ev.location}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>
                {c.ingresado}/{c.total}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ingresados</div>
            </div>
          </div>
        )
      })}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: 19 }}>Nuevo evento</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <label className="field">
                <span>Nombre del evento *</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Aniversario NINIT Group" required />
              </label>
              <label className="field">
                <span>Fecha y hora</span>
                <input type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              </label>
              <label className="field">
                <span>Lugar</span>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ej: Salón Córdoba" />
              </label>
              <label className="field">
                <span>Descripción</span>
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              {error && <div className="alert-error">{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creando...' : 'Crear evento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
