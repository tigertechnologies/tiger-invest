import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { consultarPagamento, contaLabel } from '@/lib/mercadopago'

/**
 * TIGER INVEST — webhook do Mercado Pago.
 * 1. valida a assinatura (x-signature) com MP_WEBHOOK_SECRET;
 * 2. consulta o pagamento no MP (nunca confia no corpo do aviso);
 * 3. se aprovado, ativa/renova a assinatura via RPC fulfill_plan_order.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Valida x-signature = "ts=...,v1=...". */
function assinaturaValida(req: Request, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return false

  const xSignature = req.headers.get('x-signature') ?? ''
  const xRequestId = req.headers.get('x-request-id') ?? ''

  const partes = Object.fromEntries(
    xSignature.split(',').map(p => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    }),
  )
  const ts = partes['ts']
  const v1 = partes['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1))
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url)

  let dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? ''
  let tipo = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? ''

  let body: { type?: string; action?: string; data?: { id?: string } } = {}
  try { body = (await req.json()) as typeof body } catch {}
  if (!dataId && body.data?.id) dataId = String(body.data.id)
  if (!tipo && body.type) tipo = body.type

  if (tipo && !tipo.includes('payment')) return Response.json({ ok: true, ignorado: tipo }, { status: 200 })
  if (!dataId) return Response.json({ ok: true, semId: true }, { status: 200 })

  if (!assinaturaValida(req, dataId)) return Response.json({ error: 'assinatura inválida' }, { status: 401 })

  let pagamento
  try {
    pagamento = await consultarPagamento(dataId)
  } catch (e) {
    console.error('[mp webhook] falha ao consultar pagamento:', (e as Error).message)
    return Response.json({ error: 'falha ao consultar' }, { status: 500 })
  }

  if (pagamento.status !== 'approved') return Response.json({ ok: true, status: pagamento.status }, { status: 200 })

  const orderId = pagamento.external_reference
  if (!orderId) return Response.json({ ok: true, semReferencia: true }, { status: 200 })

  const supabase = createAdminClient()
  const { error } = await (supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  }).rpc('fulfill_plan_order', {
    p_order_id: orderId,
    p_gateway: 'mercadopago',
    p_gateway_payment_id: String(pagamento.id),
    p_gateway_account: contaLabel(),
  })

  if (error) {
    console.error('[mp webhook] fulfill_plan_order falhou:', error.message)
    return Response.json({ error: 'falha ao processar' }, { status: 500 })
  }

  // Comissão de indicação (Tigre Embaixador) — não-crítico, idempotente.
  try {
    const { data: ord } = await supabase.from('plan_orders').select('user_id,amount_cents').eq('id', orderId).maybeSingle()
    if (ord?.user_id) {
      await (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: unknown }> })
        .rpc('credit_referral_commission', { p_payer: ord.user_id, p_payment_ref: String(pagamento.id), p_amount_cents: ord.amount_cents })
    }
  } catch (e) { console.error('[mp webhook] comissão indicação (não-crítico):', (e as Error).message) }

  return Response.json({ ok: true }, { status: 200 })
}
