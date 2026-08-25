'use client'
import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // quando um SW novo assume o controle, recarrega UMA vez pra pegar o build novo
    let reloaded = false
    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // procura atualização assim que carrega e sempre que a aba volta ao foco
      reg.update().catch(() => {})
      const onFocus = () => reg.update().catch(() => {})
      window.addEventListener('focus', onFocus)
      // se já houver um SW esperando, ativa na hora
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }).catch(() => {})

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return null
}
