import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'
import Layout from '../components/Layout'

const TICKET_TYPES = ['General', 'VIP', 'Prensa', 'Staff', 'Proveedor']

export default function EventDetail() {
  const { eventId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', ticket_type: 'General', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrGuest, setQrGuest] = useState(null)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [bulkForm, setBulkForm] = useState({ ticket_type: 'General', quantity: 10, label: 'Invitado General' })
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [filterKind, setFilterKind] = useState('todos') // todos | nominadas | genericas

  const ticketBaseUrl = `${window.location.origin}/entrada`

  async function loadData() {
    setLoading(true)
    const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single()
    const { data: gs } = await supabase
      .from('guests')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    setEvent(ev)
    setGuests(gs || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [eventId])

  async function handleAddGuest(e) {
    e.preventDefault()
    setError('')
    if (!form.full_name.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('guests').insert({
      event_id: eventId,
      full_name: form.full_name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      ticket_type: form.ticket_type,
      notes: form.notes || null,
      created_by: user.id,
    })
    setSaving(false)
    if (err) { setError('No se pudo agregar: ' + err.message); return }
    setForm({ full_name: '', email: '', phone: '', ticket_type: 'General', notes: '' })
    setShowForm(false)
    loadData()
  }

  async function handleBulkGenerate(e) {
    e.preventDefault()
    setBulkError('')
    const qty = parseInt(bulkForm.quantity, 10)
    if (!qty || qty < 1 || qty > 500) { setBulkError('Ingresá una cantidad entre 1 y 500.'); return }
    if (!bulkForm.label.trim()) { setBulkError('El nombre base es obligatorio (ej: "Invitado General").'); return }

    setBulkSaving(true)
    // Para numerar sin pisar lotes ya generados, seguimos desde el máximo existente de ese tipo
    const existingCount = guests.filter((g) => g.is_generic && g.ticket_type === bulkForm.ticket_type).length
    const rows = Array.from({ length: qty }, (_, i) => ({
      event_id: eventId,
      full_name: `${bulkForm.label.trim()} #${existingCount + i + 1}`,
      ticket_type: bulkForm.ticket_type,
      is_generic: true,
      created_by: user.id,
    }))
    const { error: err } = await supabase.from('guests').insert(rows)
    setBulkSaving(false)
    if (err) { setBulkError('No se pudo generar el lote: ' + err.message); return }
    setShowBulkForm(false)
    setBulkForm({ ticket_type: 'General', quantity: 10, label: 'Invitado General' })
    loadData()
  }

  function printQRs(list) {
    const items = list.length ? list : filtered
    const win = window.open('', '_blank')
    const cards = items.map((g) => {
      const url = `${ticketBaseUrl}/${g.code}`
      return `
        <div class="card">
          <div class="name">${g.full_name}</div>
          <div class="type">${g.ticket_type}</div>
          <div class="qr" data-url="${url}"></div>
          <div class="code">#${g.code.slice(0, 10).toUpperCase()}</div>
        </div>`
    }).join('')

    win.document.write(`
      <html>
      <head>
        <title>Entradas — ${event?.name || ''}</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
          body { font-family: -apple-system, Arial, sans-serif; margin: 24px; background: #fff; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .card { border: 1px dashed #999; border-radius: 10px; padding: 14px; text-align: center; page-break-inside: avoid; }
          .name { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
          .type { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
          .qr { display: flex; justify-content: center; margin-bottom: 6px; }
          .code { font-family: monospace; font-size: 10px; color: #888; }
          @media print { .card { border: 1px solid #ccc; } }
        </style>
      </head>
      <body>
        <div class="grid">${cards}</div>
        <script>
          document.querySelectorAll('.qr').forEach(function(el) {
            new QRCode(el, { text: el.dataset.url, width: 130, height: 130 });
          });
          window.onload = function() { setTimeout(function(){ window.print(); }, 400); };
        </script>
      </body>
      </html>
    `)
    win.document.close()
  }

  function mailtoLink(guest) {
    const url = `${ticketBaseUrl}/${guest.code}`
    const subject = `Tu entrada para ${event?.name || 'el evento'}`
    const body = `Hola ${guest.full_name}!\n\nTe compartimos tu entrada digital para ${event?.name}.\nMostrá este link (o el QR que contiene) en la entrada:\n\n${url}\n\nNo hace falta imprimir nada.`
    return `mailto:${guest.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  async function toggleAnular(guest) {
    const nextStatus = guest.status === 'anulado' ? 'pendiente' : 'anulado'
    await supabase.from('guests').update({ status: nextStatus }).eq('id', guest.id)
    loadData()
  }

  async function deleteGuest(guest) {
    if (!confirm(`¿Eliminar la entrada de ${guest.full_name}? Esta acción no se puede deshacer.`)) return
    await supabase.from('guests').delete().eq('id', guest.id)
    loadData()
  }

  function copyLink(guest) {
    const url = `${ticketBaseUrl}/${guest.code}`
    navigator.clipboard.writeText(url)
    setCopiedId(guest.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  function exportCSV() {
    const rows = [['Nombre', 'Email', 'Telefono', 'Tipo', 'Genérica', 'Estado', 'Codigo', 'Link']]
    guests.forEach((g) => {
      rows.push([g.full_name, g.email || '', g.phone || '', g.ticket_type, g.is_generic ? 'Sí' : 'No', g.status, g.code, `${ticketBaseUrl}/${g.code}`])
    })
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `invitados-${event?.name || 'evento'}.csv`
    link.click()
  }

  const filtered = guests
    .filter((g) => filterKind === 'todos' || (filterKind === 'nominadas' ? !g.is_generic : g.is_generic))
    .filter((g) =>
      g.full_name.toLowerCase().includes(search.toLowerCase()) ||
      g.ticket_type.toLowerCase().includes(search.toLowerCase())
    )
  const total = guests.length
  const ingresados = guests.filter((g) => g.status === 'ingresado').length
  const pendientes = guests.filter((g) => g.status === 'pendiente').length
  const genericas = guests.filter((g) => g.is_generic).length

  if (loading) return <Layout><div className="center-loader"><div className="spinner" /></div></Layout>
  if (!event) return <Layout><div className="empty-state">Evento no encontrado.</div></Layout>

  return (
    <Layout>
      <Link to="/panel" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>&larr; Volver a eventos</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '10px 0 18px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow">EVENTO</div>
          <h1 className="section-title">{event.name}</h1>
          <p className="section-sub" style={{ marginBottom: 0 }}>
            {event.event_date ? new Date(event.event_date).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => printQRs(guests)}>Imprimir QRs</button>
          <button className="btn-secondary" onClick={exportCSV}>Exportar CSV</button>
          <button className="btn-secondary" onClick={() => setShowBulkForm(true)}>+ Entradas genéricas</button>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Agregar invitado</button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-pill"><div className="num">{total}</div><div className="label">Total entradas</div></div>
        <div className="stat-pill green"><div className="num">{ingresados}</div><div className="label">Ingresados</div></div>
        <div className="stat-pill gold"><div className="num">{pendientes}</div><div className="label">Pendientes</div></div>
        <div className="stat-pill"><div className="num">{genericas}</div><div className="label">Genéricas</div></div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Buscar por nombre o tipo de entrada..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200, background: 'var(--panel-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          />
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            style={{
              background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '9px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          >
            <option value="todos">Todas</option>
            <option value="nominadas">Nominadas</option>
            <option value="genericas">Genéricas</option>
          </select>
          <button className="btn-ghost" onClick={() => printQRs(filtered)}>Imprimir esta lista</button>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🎫</div>
            <p>No hay invitados cargados todavía.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="guest-table">
              <thead>
                <tr>
                  <th>Invitado</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Ingreso</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {g.full_name}
                        {g.is_generic && (
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            genérica
                          </span>
                        )}
                      </div>
                      {g.email && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{g.email}</div>}
                    </td>
                    <td>{g.ticket_type}</td>
                    <td><span className={`badge ${g.status}`}>{g.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {g.checked_in_at ? new Date(g.checked_in_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn-ghost" onClick={() => setQrGuest(g)}>Ver QR</button>
                        <button className="btn-ghost" onClick={() => copyLink(g)}>{copiedId === g.id ? 'Copiado ✓' : 'Copiar link'}</button>
                        {g.email && <a className="btn-ghost" style={{ textDecoration: 'none' }} href={mailtoLink(g)}>Email</a>}
                        <button className="btn-ghost" onClick={() => toggleAnular(g)}>{g.status === 'anulado' ? 'Reactivar' : 'Anular'}</button>
                        <button className="btn-danger" onClick={() => deleteGuest(g)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: 19 }}>Agregar invitado</h3>
            <form onSubmit={handleAddGuest} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <label className="field">
                <span>Nombre completo *</span>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </label>
              <label className="field">
                <span>Tipo de entrada</span>
                <select value={form.ticket_type} onChange={(e) => setForm({ ...form, ticket_type: e.target.value })}>
                  {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Email (opcional)</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="field">
                <span>Teléfono / WhatsApp (opcional)</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+54 9 351..." />
              </label>
              <label className="field">
                <span>Notas (opcional)</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              {error && <div className="alert-error">{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Agregar y generar QR'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkForm && (
        <div className="modal-backdrop" onClick={() => setShowBulkForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ fontSize: 19 }}>Generar entradas genéricas</h3>
            <p className="section-sub">
              Se crean entradas con QR propio y trackeable cada una, pero sin nombre de invitado real
              (ej: "Invitado General #1", "#2"...). Sirven para repartir sin cargar datos persona por persona.
              Vas a poder ver en las estadísticas cuántas de éstas ingresaron.
            </p>
            <form onSubmit={handleBulkGenerate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              <label className="field">
                <span>Nombre base</span>
                <input value={bulkForm.label} onChange={(e) => setBulkForm({ ...bulkForm, label: e.target.value })} placeholder="Ej: Invitado General" />
              </label>
              <label className="field">
                <span>Tipo de entrada</span>
                <select value={bulkForm.ticket_type} onChange={(e) => setBulkForm({ ...bulkForm, ticket_type: e.target.value })}>
                  {TICKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Cantidad (1 a 500)</span>
                <input type="number" min="1" max="500" value={bulkForm.quantity} onChange={(e) => setBulkForm({ ...bulkForm, quantity: e.target.value })} />
              </label>
              {bulkError && <div className="alert-error">{bulkError}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowBulkForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={bulkSaving}>{bulkSaving ? 'Generando...' : 'Generar lote'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {qrGuest && (
        <div className="modal-backdrop" onClick={() => setQrGuest(null)}>
          <div className="modal-card qr-ticket" onClick={(e) => e.stopPropagation()}>
            {/* Encabezado: evento + fecha */}
            <div className="qr-ticket-head">
              <div className="eyebrow">ENTRADA</div>
              <h3 className="qr-ticket-event">{event.name}</h3>
              {(event.event_date || event.location) && (
                <p className="qr-ticket-eventmeta">
                  {event.event_date ? new Date(event.event_date).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) : ''}
                  {event.location ? ` · ${event.location}` : ''}
                </p>
              )}
            </div>

            {/* Tipo de entrada */}
            <div className="qr-ticket-type">{qrGuest.ticket_type}</div>

            {/* QR */}
            <div className="credential-qr">
              <QRCodeSVG value={`${ticketBaseUrl}/${qrGuest.code}`} size={190} />
            </div>

            <div className="qr-ticket-perf" />

            {/* Datos del cliente */}
            <div className="qr-ticket-info">
              <div className="qr-ticket-name">{qrGuest.full_name}</div>
              <dl className="qr-ticket-details">
                {qrGuest.email && (<><dt>Email</dt><dd>{qrGuest.email}</dd></>)}
                {qrGuest.phone && (<><dt>Teléfono</dt><dd>{qrGuest.phone}</dd></>)}
                <dt>Estado</dt>
                <dd><span className={`badge ${qrGuest.status}`}>{qrGuest.status}</span></dd>
                <dt>Código</dt>
                <dd className="mono">#{qrGuest.code.slice(0, 12).toUpperCase()}</dd>
              </dl>
            </div>

            <div className="qr-ticket-link">
              <div className="link-copy"><span>{`${ticketBaseUrl}/${qrGuest.code}`}</span></div>
            </div>

            <div className="qr-ticket-actions">
              <button className="btn-secondary" onClick={() => copyLink(qrGuest)}>
                {copiedId === qrGuest.id ? 'Copiado ✓' : 'Copiar link'}
              </button>
              {qrGuest.email && (
                <a className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }} href={mailtoLink(qrGuest)}>
                  Email
                </a>
              )}
              <a
                className="btn-primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                href={`https://wa.me/${(qrGuest.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                  `¡Hola ${qrGuest.full_name}! Te compartimos tu entrada digital para ${event.name}. Mostrá este link en la entrada:\n${ticketBaseUrl}/${qrGuest.code}`
                )}`}
                target="_blank" rel="noreferrer"
              >
                Enviar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
