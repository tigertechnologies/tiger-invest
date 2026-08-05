'use client'
import { useEffect, useState } from 'react'

const DISMISS_KEY = 'ti_install_dismissed'
const DISMISS_DAYS = 7

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // já instalado (standalone) → não mostra
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    if (standalone) return

    // dispensado recentemente → não mostra
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw && Date.now() - Number(raw) < DISMISS_DAYS * 864e5) return
    } catch {}

    const ua = navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)

    if (ios && isSafari) {
      setIsIOS(true)
      setShow(true)
      return
    }

    // Android / Chrome / desktop instalável
    const onPrompt = (e: any) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setShow(false))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
    setShow(false)
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={icon}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff">
            <path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={ttl}>Instalar TIGER INVEST</div>
          {isIOS ? (
            <div style={sub}>
              Toque em <b style={{ color: '#fff' }}>Compartilhar</b> <span style={shareGlyph}>⎋</span> e escolha{' '}
              <b style={{ color: '#fff' }}>“Adicionar à Tela de Início”</b>.
            </div>
          ) : (
            <div style={sub}>Adicione o app à tela inicial do seu celular.</div>
          )}
        </div>
        {!isIOS && (
          <button onClick={install} style={btn}>Instalar</button>
        )}
        <button onClick={dismiss} aria-label="Fechar" style={close}>✕</button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
  padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
  display: 'flex', justifyContent: 'center', pointerEvents: 'none',
}
const card: React.CSSProperties = {
  pointerEvents: 'auto', width: '100%', maxWidth: 460,
  display: 'flex', alignItems: 'center', gap: 12,
  background: 'rgba(16,12,26,.94)', backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,46,154,.35)', borderRadius: 16,
  padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.5), 0 0 24px rgba(255,46,154,.15)',
  fontFamily: 'Inter, system-ui, sans-serif',
}
const icon: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(145deg,#FF2E9A,#A855F7)',
  boxShadow: '0 0 18px rgba(255,46,154,.5)',
}
const ttl: React.CSSProperties = {
  fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: '.3px',
}
const sub: React.CSSProperties = {
  fontSize: 11.5, color: 'rgba(255,255,255,.62)', marginTop: 2, lineHeight: 1.35,
}
const shareGlyph: React.CSSProperties = {
  display: 'inline-block', transform: 'translateY(1px)', fontSize: 13,
}
const btn: React.CSSProperties = {
  flexShrink: 0, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(145deg,#FF2E9A,#A855F7)', color: '#fff',
  fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 13,
  padding: '9px 16px', borderRadius: 10, boxShadow: '0 0 16px rgba(255,46,154,.4)',
}
const close: React.CSSProperties = {
  flexShrink: 0, border: 'none', background: 'transparent',
  color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 14, padding: '4px 2px',
}
