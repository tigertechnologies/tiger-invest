'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import { translate, type Lang } from '@/lib/i18n';

export type Profile = { id: string; email: string | null; full_name: string | null; role: 'user' | 'admin'; is_subscriber: boolean; language: Lang; theme: 'dark' | 'light' };

type Ctx = {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
  user: User | null;
  profile: Profile | null;
  authReady: boolean;
  signOut: () => Promise<void>;
};

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error('useApp fora do provider');
  return c;
};

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem storage */
  }
};

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [lang, setLangState] = useState<Lang>('pt');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const t = read('tl-theme');
    if (t === 'light' || t === 'dark') setThemeState(t);
    const l = read('tl-lang') as Lang | null;
    if (l === 'pt' || l === 'en' || l === 'es') setLangState(l);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  }, [lang]);

  const loadProfile = useCallback(async (u: User | null) => {
    const sb = supabaseBrowser();
    if (!sb || !u) return setProfile(null);
    const { data } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) {
      setAuthReady(true);
      return;
    }
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user);
      loadProfile(data.user).finally(() => setAuthReady(true));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const persist = useCallback(
    (patch: Partial<Profile>) => {
      const sb = supabaseBrowser();
      if (sb && user) sb.from('profiles').update(patch).eq('id', user.id).then(() => undefined);
    },
    [user],
  );

  const setTheme = (t: 'dark' | 'light') => {
    setThemeState(t);
    write('tl-theme', t);
    persist({ theme: t });
  };
  const setLang = (l: Lang) => {
    setLangState(l);
    write('tl-lang', l);
    persist({ language: l });
  };

  const signOut = async () => {
    await supabaseBrowser()?.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = '/';
  };

  return (
    <C.Provider value={{ theme, setTheme, lang, setLang, t: (k) => translate(lang, k), user, profile, authReady, signOut }}>
      {children}
    </C.Provider>
  );
}
