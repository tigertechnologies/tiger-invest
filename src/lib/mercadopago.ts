import 'server-only'

/**
 * TIGER INVEST — cliente da API do Mercado Pago (assinatura do usuário → Tiger).
 *
 * Nenhum segredo mora neste arquivo. Tudo vem de variável de ambiente,
 * lida só no servidor (configurar no Vercel → Environment Variables):
 *   MP_ACCESS_TOKEN     → token da conta da Tiger (TEST-... no teste, APP_USR-... em produção)
 *   MP_ACCOUNT_LABEL    → apelido da conta atual (ex.: "pf-jomar" ou "pj-tiger"),
 *                         gravado junto de cada pedido (organiza migração PF→PJ).
 *   MP_WEBHOOK_SECRET   → segredo da assinatura do webhook (painel do MP).
 *   NEXT_PUBLIC_APP_URL → base do site (para montar a notification_url do webhook),
 *                         ex.: https://tigerinvest.tigertechnology.com.br
 */

const MP_BASE = 'https://api.mercadopago.com'

function accessToken(): string {
  const t = process.env.MP_ACCESS_TOKEN
  if (!t) throw new Error('MP_ACCESS_TOKEN ausente. Cadastre o token da conta Tiger no Vercel.')
  return t
}

/** Apelido da conta MP atual — gravado junto de cada pedido. */
export function contaLabel(): string {
  return process.env.MP_ACCOUNT_LABEL || 'principal'
}

function notificationUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL
  return base ? `${base.replace(/\/$/, '')}/api/mercadopago/webhook` : undefined
}

type MpErro = { message?: string; error?: string; cause?: Array<{ description?: string }> }

async function mp<T>(path: string, init?: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken()}`,
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey

  const res = await fetch(`${MP_BASE}${path}`, { ...init, headers, cache: 'no-store' })
  const texto = await res.text()
  const corpo = texto ? (JSON.parse(texto) as unknown) : null

  if (!res.ok) {
    const e = corpo as MpErro | null
    const msg = e?.cause?.[0]?.description ?? e?.message ?? `Mercado Pago respondeu ${res.status}`
    throw new Error(`Mercado Pago: ${msg}`)
  }
  return corpo as T
}

export type MpPayment = {
  id: number
  status: string // approved, pending, rejected, cancelled...
  status_detail?: string
  external_reference?: string // = order_id da Tiger
  transaction_amount?: number
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
  }
}

/** Reais que o MP espera (float com 2 casas) a partir de centavos. */
export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100
}

/** Cobrança Pix avulsa (um ciclo). Idempotente pela chave "order-<id>". */
export async function criarPagamentoPix(input: {
  orderId: string
  valorCentavos: number
  descricao: string
  pagador: { email: string; nome?: string; cpf?: string }
}): Promise<MpPayment> {
  return mp<MpPayment>('/v1/payments', {
    method: 'POST',
    idempotencyKey: `order-${input.orderId}`,
    body: JSON.stringify({
      transaction_amount: centavosParaReais(input.valorCentavos),
      description: input.descricao,
      payment_method_id: 'pix',
      external_reference: input.orderId,
      notification_url: notificationUrl(),
      payer: {
        email: input.pagador.email,
        first_name: input.pagador.nome,
        identification: input.pagador.cpf ? { type: 'CPF', number: input.pagador.cpf } : undefined,
      },
    }),
  })
}

export async function consultarPagamento(paymentId: string | number): Promise<MpPayment> {
  return mp<MpPayment>(`/v1/payments/${paymentId}`)
}
