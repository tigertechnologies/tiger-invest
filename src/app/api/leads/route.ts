import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fail, ok } from '@/lib/api';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const whatsapp = String(body.whatsapp || '').replace(/[^\d+]/g, '').slice(0, 20);
  const interest = String(body.interest || '').slice(0, 60);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(new Error('Informe nome e e-mail válidos.'), 400);
  const sb = supabaseAdmin();
  if (!sb) return fail(new Error('Banco de dados não configurado (SUPABASE_SERVICE_ROLE_KEY).'), 503);
  const { error } = await sb.from('leads').insert({ name, email, whatsapp: whatsapp || null, interest: interest || null, source: 'site' });
  if (error) return fail(error);
  return ok({ ok: true });
}
