import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import Layout from '../components/Layout'

const READER_ID = 'qr-reader'

// Navegadores embebidos dentro de otras apps (bloquean la cámara)
const INAPP_BROWSER = /FBAN|FBAV|Instagram|WhatsApp|Line|WeChat|Snapchat|TikTok|musical_ly|Twitter/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

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

  // iOS/Safari exige que getUserMedia se dispare DENTRO del gesto del usuario (el toque).
  // flushSync hace visible el contenedor #qr-reader sincrónicamente antes de arrancar,
  // sin salir del stack del click -> así funciona en iPhone.
  function activate() {
    setCameraError('')
    flushSync(() => setStatus('scanning'))
    startScanner()
  }

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
  }

  async function startScanner() {
    setCameraError('')
    // Pre-chequeo: navegador sin API de cámara (típico de navegadores embebidos: WhatsApp, Instagram, Facebook...)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('idle')
      setCameraError(
        INAPP_BROWSER
          ? 'Estás abriendo el link dentro de otra app (WhatsApp/Instagram/etc.) y ahí la cámara está bloqueada. Tocá los ⋮ y elegí "Abrir en Chrome" (Android) o "Safari" (iPhone).'
          : 'Este navegador no permite acceder a la cámara. Probá con Chrome (Android) o Safari (iPhone) actualizado.'
      )
      return
    }
    // Pedimos el permiso de cámara EXPLÍCITAMENTE antes de arrancar el escáner.
    // Así el diálogo "¿Permitir cámara?" aparece de forma fiable en el celular del
    // guardia (algunos navegadores no lo muestran bien si sólo lo dispara html5-qrcode).
    // Soltamos el stream de inmediato para que html5-qrcode pueda tomar la cámara.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      probe.getTracks().forEach((t) => t.stop())
    } catch (permErr) {
      setStatus('idle')
      setCameraError(describeCamError(permErr))
      return
    }

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
            {INAPP_BROWSER && (
              <div className="alert-error" style={{ marginTop: 14, textAlign: 'left' }}>
                ⚠️ Estás abriendo esto dentro de otra app (WhatsApp/Instagram/etc.), donde la cámara suele estar bloqueada.
                Tocá los <b>⋮</b> arriba a la derecha y elegí <b>"Abrir en Chrome"</b> (Android) o <b>Safari</b> (iPhone).
              </div>
            )}
            <button className="btn-primary" onClick={activate} style={{ marginTop: 8 }}>Activar cámara</button>
            {cameraError && <div className="alert-error" style={{ marginTop: 14, textAlign: 'left' }}>{cameraError}</div>}
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
