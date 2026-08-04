import type { Metadata, Viewport } from 'next'
import './globals.css'
import RegisterSW from '@/components/RegisterSW'

export const metadata: Metadata = {
  title: 'Tiger Invest',
  description: 'Controle profissional de ativos — cripto, acoes e pools.',
  manifest: '/manifest.json',
  applicationName: 'Tiger Invest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Tiger Invest' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
}
export const viewport: Viewport = {
  themeColor: '#07060E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}<RegisterSW /></body>
    </html>
  )
}
