import type { Metadata, Viewport } from 'next';
import './globals.css';
import './invest.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ChatWidget } from '@/components/chat-widget';
import RegisterSW from '@/components/invest/RegisterSW';
import InstallPrompt from '@/components/invest/InstallPrompt';
import { SITE } from '@/lib/site';
import { FOOTER_DEFAULT, getSetting, type FooterSettings } from '@/lib/supabase/public';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  manifest: '/manifest.json',
  applicationName: 'Tiger Labs',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Tiger Labs' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  openGraph: { title: SITE.name, description: SITE.description, type: 'website', locale: 'pt_BR' },
};

export const viewport: Viewport = { themeColor: '#040706', width: 'device-width', initialScale: 1 };

// aplica o tema salvo antes da pintura (evita "piscar")
const themeScript = `try{var t=localStorage.getItem('tl-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light')}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const footer = await getSetting<FooterSettings>('footer', FOOTER_DEFAULT).catch(() => FOOTER_DEFAULT);
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main className="container py-6 md:py-8">{children}</main>
          <Footer s={{ ...FOOTER_DEFAULT, ...footer }} />
          <ChatWidget />
          <RegisterSW />
          <div className="ti"><InstallPrompt /></div>
        </Providers>
      </body>
    </html>
  );
}
