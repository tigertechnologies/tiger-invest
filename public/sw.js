// Bump a versão a cada deploy que precise furar cache antigo.
const CACHE = 'tiger-labs-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // apaga TODOS os caches de versões anteriores — impede o app de ficar preso em build velho
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// Navegações (HTML) e chunks JS/CSS do Next: SEMPRE rede primeiro; cache só como fallback offline.
// Assim, todo deploy novo aparece na hora que o usuário tem conexão.
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // nunca intercepta APIs nem chamadas externas (CoinGecko etc.) — deixa passar direto
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req))
  )
})
