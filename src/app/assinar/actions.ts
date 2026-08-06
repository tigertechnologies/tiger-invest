'use server'

import { createClient } from '@/lib/supabase/server'
import { criarPagamentoPix } from '@/lib/mercadopago'
import { PLANS } from '@/lib/plans'

/** Preço em centavos calculado no SERVIDOR (banco → fallback defaults). Nunca confia no cliente. */
async function amountCents(planId: string, cycle: string): Promise<{ cents: number; name: string } | null> {
  const supabase = createClient()
  let baseCents: number | null = null
  let name = ''
  try {
    const { data } = await supabase.from('plans').select('name,price_cents,active').eq('id', planId).maybeSingle()
    if (data && data.active !== false) { baseCents = data.price_cents as number; name = data.name as string }
  } catch {}
  if (baseCents == null) {
    const p = PLANS.find(x => x.id === planId)
    if (!p) return null
    baseCents = Math.round(p.price * 100); name = p.name
  }
  const cents = cycle === 'anual' ? baseCents * 12 : baseCents
  return { cents, name }
}

export type PixResultado =
  | { ok: true; orderId: string; qrCode: string; qrBase64: string; amountCents: number }
  | { ok: false; erro: string }

/** Cria o pedido do plano e devolve o PIX (QR + copia-e-cola). */
export async function criarPedidoEPix(planId: string, cycle: string): Promise<PixResultado> {
  const ciclo = cycle === 'anual' ? 'anual' : 'mensal'
  const preco = await amountCents(planId, ciclo)
  if (!preco) return { ok: false, erro: 'Plano inválido.' }

  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return { ok: false, erro: 'Sessão expirada. Entre novamente para pagar.' }

  const { data: order, error } = await supabase
    .from('plan_orders')
    .insert({ user_id: user.id, plan_id: planId, cycle: ciclo, amount_cents: preco.cents, status: 'pending' })
    .select('id')
    .single()

  if (error || !order) {
    const m = (error?.message || '').toLowerCase()
    if (m.includes('does not exist') || m.includes('could not find') || m.includes('relation')) {
      return { ok: false, erro: 'Cobrança ainda não configurada no banco (rode a migration v7).' }
    }
    return { ok: false, erro: error?.message || 'Não foi possível criar o pedido.' }
  }

  try {
    const pagamento = await criarPagamentoPix({
      orderId: order.id,
      valorCentavos: preco.cents,
      descricao: `Assinatura ${preco.name} (${ciclo})`,
      pagador: { email: user.email || `pedido-${order.id}@tigerinvest.com.br`, nome: (user.user_metadata as any)?.full_name },
    })
    const td = pagamento.point_of_interaction?.transaction_data
    if (!td?.qr_code) return { ok: false, erro: 'Não foi possível gerar o PIX. Tente novamente.' }
    return { ok: true, orderId: order.id, qrCode: td.qr_code, qrBase64: td.qr_code_base64 || '', amountCents: preco.cents }
  } catch (e) {
    return { ok: false, erro: (e as Error).message || 'Falha ao gerar o PIX.' }
  }
}

/** Estado do pedido — o app fica consultando enquanto o cliente paga. */
export async function consultarStatusPedido(orderId: string): Promise<{ status: string } | { erro: string }> {
  if (!orderId) return { erro: 'Pedido inválido.' }
  const supabase = createClient()
  const { data } = await supabase.from('plan_orders').select('status').eq('id', orderId).maybeSingle()
  if (!data) return { erro: 'Pedido não encontrado.' }
  return { status: data.status as string }
}
