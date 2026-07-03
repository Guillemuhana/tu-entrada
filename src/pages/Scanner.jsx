import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import Layout from '../components/Layout'

const READER_ID = 'qr-reader'

function extractCode(rawText) {
  // Acepta tanto una URL completa (https://.../entrada/CODIGO) como el código pelado
  try {
    const url = new URL(rawText)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1]
  } catch {
    return rawText.trim()
  }
}

export default function Scanner() {
  const [status, setStatus] = useState('idle') // idle | scanning | processing
  const [result, setResult] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const scannerRef = useRef(null)
  const busyRef = useRef(false)

  async function loadTodayCount() {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('scan_logs')
      .select('id', { count: 'exact', head: true })
      .eq('result', 'aprobado')
      .gte('scanned_at', startOfDay.toISOString())
    setTodayCount(count || 0)
  }

  useEffect(() => { loadTodayCount() }, [])

  // Arranca la cámara SOLO cuando el div #qr-reader ya está renderizado y visible.
  // (Iniciarla mientras el contenedor está en display:none rompe en varios navegadores.)
  useEffect(() => {
    if (status === 'scanning' && !scannerRef.current) startScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function describeCamError(err) {
    const name = err?.name || ''
    if (location.protocol !== 'https:' && location.hostname !== 'localhost')
      return 'La cámara solo funciona por HTTPS. Entrá desde https://tu-entrada.vercel.app (no por IP ni http).'
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
      return 'Permiso de cámara denegado. Tocá el candado 🔒 (o los tres puntos) del navegador → Permisos → Cámara → Permitir, y recargá la página.'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
      return 'No se encontró ninguna cámara en este dispositivo.'
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'La cámara está siendo usada por otra app o pestaña. Cerrala y probá de nuevo.'
    return 'No se pudo iniciar la cámara: ' + (err?.message || name || 'error desconocido')
  }

  // qrbox proporcional al video: evita el error "qrbox mayor que el video" en celulares
  const qrConfig = {
    fps: 10,
    qrbox: (vw, vh) => {
      const s = Math.max(150, Math.floor(Math.min(vw, vh) * 0.7))
      return { width: s, height: s }
    },
    aspectRatio: 1.0,
  }

  async function startScanner() {
    setCameraError('')
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, qrConfig, onScanSuccess, () => {})
    } catch (err) {
      // Fallback: algunos navegadores fallan con facingMode -> elegimos cámara de la lista
      try {
        const cams = await Html5Qrcode.getCameras()
        if (cams && cams.length) {
          const back = cams.find((c) => /back|rear|trase|environment/i.test(c.label)) || cams[cams.length - 1]
          await scanner.start(back.id, qrConfig, onScanSuccess, () => {})
          return
        }
        throw err
      } catch (err2) {
        try { await scanner.clear() } catch { /* noop */ }
        scannerRef.current = null
        setStatus('idle')
        setCameraError(describeCamError(err2))
      }
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
    setStatus('idle')
  }

  async function onScanSuccess(decodedText) {
    if (busyRef.current) return
    busyRef.current = true
    setStatus('processing')

    const code = extractCode(decodedText)
    const { data, error } = await supabase.rpc('validar_entrada', { p_code: code })

    if (error || !data || data.length === 0) {
      setResult({ resultado: 'invalido' })
    } else {
      setResult(data[0])
      if (data[0].resultado === 'aprobado') {
        setTodayCount((c) => c + 1)
        if (navigator.vibrate) navigator.vibrate(80)
      } else if (navigator.vibrate) {
        navigator.vibrate([60, 60, 60])
      }
    }

    if (scannerRef.current) {
      try { await scannerRef.current.pause(true) } catch {}
    }
    setStatus('scanning')
  }

  async function scanNext() {
    setResult(null)
    busyRef.current = false
    if (scannerRef.current) {
      try { scannerRef.current.resume() } catch {}
    }
  }

  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  const resultConfig = {
    aprobado: { icon: '✅', headline: 'INGRESO APROBADO' },
    duplicado: { icon: '⚠️', headline: 'ENTRADA YA UTILIZADA' },
    anulado: { icon: '⛔', headline: 'ENTRADA ANULADA' },
    invalido: { icon: '❌', headline: 'QR NO VÁLIDO' },
  }

  return (
    <Layout>
      <div className="scanner-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div className="eyebrow">CONTROL DE ACCESO</div>
            <h1 className="section-title" style={{ fontSize: 22 }}>Escanear entrada</h1>
          </div>
          <div className="stat-pill green" style={{ minWidth: 90, textAlign: 'center' }}>
            <div className="num">{todayCount}</div>
            <div className="label">Hoy</div>
          </div>
        </div>

        {status === 'idle' && (
          <div className="panel empty-state">
            <div className="icon">📷</div>
            <p>Activá la cámara para empezar a validar entradas.</p>
            <button className="btn-primary" onClick={() => setStatus('scanning')} style={{ marginTop: 8 }}>Activar cámara</button>
            {cameraError && <div className="alert-error" style={{ marginTop: 14 }}>{cameraError}</div>}
          </div>
        )}

        <div id={READER_ID} style={{ display: status === 'idle' ? 'none' : 'block', width: '100%' }} />

        {status !== 'idle' && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="btn-ghost" onClick={stopScanner}>Apagar cámara</button>
          </div>
        )}

        {result && (
          <div className={`scan-result ${result.resultado}`}>
            <div className="icon">{resultConfig[result.resultado]?.icon}</div>
            <div className="headline">{resultConfig[result.resultado]?.headline}</div>
            {result.full_name && <div className="guest-name">{result.full_name}</div>}
            {result.ticket_type && <div className="guest-meta">{result.ticket_type} · {result.event_name}</div>}
            {result.resultado === 'duplicado' && result.checked_in_at && (
              <div className="guest-meta">Ingresó a las {new Date(result.checked_in_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
            )}
            <button className="btn-primary" onClick={scanNext} style={{ marginTop: 16 }}>Siguiente</button>
          </div>
        )}
      </div>
    </Layout>
  )
}
