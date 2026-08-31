import { NextRequest, NextResponse } from "next/server";

// Achado de revisão de segurança: o ThrottlerGuard do apps/api existe
// (app.module.ts) mas chaveia por IP de origem -- e apps/api SÓ é chamado
// pelo apps/web, servidor-a-servidor, então todo request chega do mesmo
// IP. Na prática aquilo virou um balde único compartilhado por todo
// mundo: não limita atacante nenhum por si (o IP do atacante nem aparece
// lá) e ainda é um tiro no pé de disponibilidade (um laço numa página
// derruba o limite do estúdio inteiro). O limite que de fato importa é
// este aqui, no único processo que o navegador de um estranho alcança.
//
// Em memória de propósito: o apps/web no Render é um serviço Docker de
// instância única e longa duração (ver render.yaml, plan starter, sem
// autoscaling) -- um Map local é suficiente e não acrescenta Redis à
// infra de um estúdio de 2 pessoas. Se um dia houver mais de uma
// instância, isto vira "por instância" e precisa migrar pra um contador
// compartilhado; registrado aqui pra não virar uma surpresa silenciosa.
const WINDOW_MS = 60_000;

// Alvos de abuso de verdade, cada um com o próprio balde. Os limites são
// generosos pro uso legítimo (um cliente pedindo o link de novo, um
// provedor reenviando webhook) e apertados o suficiente pra script de
// spam não sair de graça.
const RULES: Array<{ prefix: string; methods: string[]; limit: number }> = [
  // Formulário público de lead e pedido de magic link: as duas escritas
  // que um estranho alcança sem credencial nenhuma. Server Actions são
  // POST pro próprio path da página, por isso o método importa -- GET
  // (só abrir a página) não é limitado.
  { prefix: "/lead", methods: ["POST"], limit: 10 },
  { prefix: "/portal/login", methods: ["POST"], limit: 10 },
  { prefix: "/colaborador/login", methods: ["POST"], limit: 10 },
  // Achado A51 da auditoria de 30 ago 2026: as Server Actions da página
  // pública de apresentação (aprovar/desaprovar especificação, comentar,
  // salvar snapshot do quadro) fazem POST pro próprio path /present/
  // <token> -- de fora do matcher, nada limitava quem tivesse o link de
  // ficar alternando aprovar/desaprovar (um e-mail via Resend a cada
  // transição, sem teto) ou submetendo snapshot repetidamente.
  { prefix: "/present/", methods: ["POST"], limit: 60 },
  // Troca de token por sessão: UUID v4 não é adivinhável por força bruta
  // (122 bits), mas limitar corta o ruído e o custo de quem tentar.
  { prefix: "/portal/verify", methods: ["GET"], limit: 30 },
  { prefix: "/colaborador/verify", methods: ["GET"], limit: 30 },
  { prefix: "/api/quadro/", methods: ["GET"], limit: 30 },
  // Webhooks: já autenticados por header de segredo do lado do apps/api.
  // Limite alto de propósito -- Asaas/ZapSign reenviam em rajada quando
  // uma entrega falha, e derrubar retry legítimo seria pior que o abuso
  // que isto evita.
  { prefix: "/api/webhooks/", methods: ["POST"], limit: 120 },
];

const hits = new Map<string, { count: number; resetAt: number }>();

// x-forwarded-for pode ser forjado pelo cliente: o Render ANEXA o IP real
// da conexão no fim da lista, então o último elemento é o que o proxy
// escreveu, não o que o cliente mandou. Pegar o primeiro (conselho comum)
// deixaria qualquer um trocar de "IP" a cada request e escapar do limite.
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

// Nome do arquivo/função: "proxy", não "middleware" -- o Next 16 depreciou
// a convenção antiga e avisa no build (a função faz exatamente o mesmo).
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rule = RULES.find(
    (r) => pathname.startsWith(r.prefix) && r.methods.includes(request.method),
  );
  if (!rule) {
    return NextResponse.next();
  }

  const now = Date.now();
  const key = `${rule.prefix}:${clientIp(request)}`;
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return new NextResponse("Muitas tentativas. Espere um pouco e tente de novo.", {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  } else {
    entry.count += 1;
  }

  // Limpeza oportunista -- sem isto o Map cresceria pra sempre num
  // processo de longa duração (um IP novo = uma chave nova, nunca
  // removida). Roda junto de um request que já ia pagar o custo do
  // limitador, não num timer próprio.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }

  return NextResponse.next();
}

// Só os paths com regra -- deixa o resto do app (dashboard interno,
// assets, proxy BFF autenticado) fora do caminho crítico do middleware.
export const config = {
  matcher: [
    "/lead",
    "/portal/login",
    "/portal/verify",
    "/colaborador/login",
    "/colaborador/verify",
    "/api/quadro/:path*",
    "/api/webhooks/:path*",
    "/present/:path*",
  ],
};
