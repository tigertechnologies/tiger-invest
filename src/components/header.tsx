'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CreditCard, Gift, Globe, LogIn, LogOut, Menu, Moon, Shield, Sun, Wallet, X } from 'lucide-react';
import { NAV, type NavGroup, type NavItem } from '@/lib/site';
import { LANGS } from '@/lib/i18n';
import { Logo } from './logo';
import { useApp } from './providers';
import { cx } from './ui';

const isGroup = (x: NavItem | NavGroup): x is NavGroup => 'items' in x;

export function Header() {
  const path = usePathname();
  const { t } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [path]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <div ref={ref} className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 text-muted hover:text-neon xl:hidden" onClick={() => setMobile(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" aria-label="Tiger Labs — início">
            <Logo />
          </Link>
        </div>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((n) =>
            isGroup(n) ? (
              <div key={n.key} className="relative">
                <button
                  onClick={() => setOpen(open === n.key ? null : n.key)}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition hover:text-neon',
                    n.items.some((i) => active(i.href)) ? 'text-neon' : 'text-fg/90',
                  )}
                  aria-expanded={open === n.key}
                >
                  {t(n.label)} <ChevronDown className={cx('h-4 w-4 transition', open === n.key && 'rotate-180')} />
                </button>
                {open === n.key && (
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-line bg-card p-2 shadow-2xl shadow-black/40">
                    {n.items.map((i) => (
                      <Link key={i.href} href={i.href} className={cx('block rounded-xl px-3 py-2.5 transition hover:bg-neon/10', active(i.href) && 'bg-neon/10')}>
                        <div className={cx('text-sm font-semibold', active(i.href) ? 'text-neon' : 'text-fg')}>{t(i.label)}</div>
                        {i.desc && <div className="text-xs text-muted">{i.desc}</div>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  'rounded-lg px-3 py-2 text-sm font-medium hover:text-neon',
                  n.href === '/invest' && 'mr-1 border border-neon/40 bg-neon/10 text-neon shadow-neon-sm',
                  active(n.href) ? 'text-neon' : 'text-fg/90',
                )}
              >
                {t(n.label)}
              </Link>
            ),
          )}
        </nav>

        <UserMenu open={open === 'user'} setOpen={(v) => setOpen(v ? 'user' : null)} />
      </div>

      {mobile && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-[86%] max-w-sm overflow-y-auto border-r border-line bg-bg p-4">
            <div className="mb-4 flex items-center justify-between">
              <Logo small />
              <button className="rounded-lg p-2 text-muted" onClick={() => setMobile(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {NAV.map((n) =>
              isGroup(n) ? (
                <div key={n.key} className="mb-4">
                  <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">{t(n.label)}</div>
                  {n.items.map((i) => (
                    <Link key={i.href} href={i.href} className={cx('block rounded-lg px-3 py-2 text-sm', active(i.href) ? 'bg-neon/10 text-neon' : 'text-fg')}>
                      {t(i.label)}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={n.href} href={n.href} className="mb-3 block rounded-lg px-3 py-2 text-sm font-semibold text-fg">
                  {t(n.label)}
                </Link>
              ),
            )}
          </aside>
        </div>
      )}
    </header>
  );
}

function UserMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { user, profile, t, theme, setTheme, lang, setLang, signOut } = useApp();
  const initials = (profile?.full_name || user?.email || '?').slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="grid h-10 w-10 place-items-center rounded-full border border-neon/50 bg-neon/10 font-display text-sm font-bold text-neon shadow-neon-sm"
        aria-label="Menu da conta"
      >
        {user ? initials : <LogIn className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-line bg-card p-2 shadow-2xl shadow-black/40">
          {user && (
            <div className="border-b border-line px-3 pb-2 pt-1">
              <div className="truncate text-sm font-semibold">{profile?.full_name || 'Minha conta'}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
              {profile?.is_subscriber && <span className="chip-up mt-1">Assinante</span>}
            </div>
          )}
          <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <Globe className="mr-1 inline h-3 w-3" /> {t('Idioma')}
          </div>
          <div className="grid grid-cols-3 gap-1 px-2 pb-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => setLang(l.code)} className={cx('rounded-lg px-2 py-1.5 text-xs', lang === l.code ? 'bg-neon/15 text-neon' : 'text-muted hover:text-fg')}>
                {l.flag} {l.code.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? t('Modo claro') : t('Modo escuro')}
          </button>
          {user && (
            <>
              <Link href="/invest" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
                <Wallet className="h-4 w-4" /> {t('Minha Carteira')}
              </Link>
              <Link href="/assinar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
                <CreditCard className="h-4 w-4" /> {t('Assinatura')}
              </Link>
              <Link href="/indicacoes" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
                <Gift className="h-4 w-4" /> {t('Indique e ganhe')}
              </Link>
            </>
          )}
          {profile?.role === 'admin' && (
            <>
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
                <Shield className="h-4 w-4" /> {t('Painel admin')}
              </Link>
              <Link href="/admin/assinaturas" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10">
                <CreditCard className="h-4 w-4" /> {t('Assinaturas')}
              </Link>
            </>
          )}
          {user ? (
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-down hover:bg-down/10">
              <LogOut className="h-4 w-4" /> {t('Sair')}
            </button>
          ) : (
            <Link href="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neon hover:bg-neon/10">
              <LogIn className="h-4 w-4" /> {t('Entrar')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
