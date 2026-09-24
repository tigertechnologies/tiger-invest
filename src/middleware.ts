import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieList = { name: string; value: string; options: CookieOptions }[];

const PUBLIC = ['/login', '/join', '/auth', '/privacy', '/terms', '/termos', '/about', '/api', '/planos', '/assinar', '/redefinir'];
// áreas pessoais: sempre exigem login
const PRIVATE = ['/admin', '/invest', '/indicacoes'];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let res = NextResponse.next({ request: req });
  if (!url || !key) return res;

  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieList) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  const requireLogin = process.env.NEXT_PUBLIC_REQUIRE_LOGIN === 'true';
  const needsAuth = PRIVATE.some((p) => path.startsWith(p)) || (requireLogin && !PUBLIC.some((p) => path.startsWith(p)));
  if (needsAuth && !data.user) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.searchParams.set('next', path);
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif)$).*)'],
};
