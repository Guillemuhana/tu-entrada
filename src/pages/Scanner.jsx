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

  async function startScanner() {
    setCameraError('')
    setStatus('scanning')
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {} // ignore per-frame decode failures
      )
    } catch (err) {
      setCameraError('No se pudo acceder a la cámara. Revisá los permisos del navegador.')
      setStatus('idle')
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
            <button className="btn-primary" onClick={startScanner} style={{ marginTop: 8 }}>Activar cámara</button>
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
