import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- última
// seção do arquivo original, sem comentário de cabeçalho próprio ali
// (ficava colado depois da seção de LGPD). Self-contido: conecta e
// desconecta a credencial Google fictícia da PRÓPRIA sessão smoke-test,
// sem criar nenhum outro registro, então não precisa de cleanup externo
// -- o DELETE no fim já apaga o que o POST criou.
export async function runGoogleCredentialChecks({
  api,
  report,
  userId,
}: {
  api: ApiFn;
  report: ReportFn;
  userId: string;
}) {
  const googleStatusAntesRes = await api("/v1/office/google-credential");
  report(
    "GET /office/google-credential antes de conectar → connected: false",
    googleStatusAntesRes.status === 200 && googleStatusAntesRes.body?.data?.connected === false,
    googleStatusAntesRes.body
  );

  const fakeRefreshToken = `fake-refresh-token-smoketest-${Date.now()}`;
  const fakeScope = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly";
  const saveGoogleCredentialRes = await api("/v1/office/google-credential", {
    method: "POST",
    body: JSON.stringify({ refreshToken: fakeRefreshToken, scope: fakeScope }),
  });
  report("POST /office/google-credential → 201", saveGoogleCredentialRes.status === 201, saveGoogleCredentialRes.body);

  const googleStatusDepoisRes = await api("/v1/office/google-credential");
  report(
    "GET /office/google-credential depois de conectar → connected: true, com o scope certo",
    googleStatusDepoisRes.status === 200 &&
      googleStatusDepoisRes.body?.data?.connected === true &&
      googleStatusDepoisRes.body?.data?.scope === fakeScope,
    googleStatusDepoisRes.body
  );

  const storedCredential = await prisma.googleCredential.findUnique({ where: { userId } });
  report(
    "Refresh token nunca é guardado em texto puro (refreshTokenEnc ≠ valor original)",
    !!storedCredential && storedCredential.refreshTokenEnc !== fakeRefreshToken,
    { refreshTokenEnc: storedCredential?.refreshTokenEnc }
  );

  // Revogação no Google é best-effort (ver GoogleCredentialsService) --
  // um refresh token fictício faz a chamada de revogação real da Google
  // falhar (token inválido), e mesmo assim isto tem que dar 204 e apagar
  // o registro local.
  const disconnectGoogleRes = await api("/v1/office/google-credential", { method: "DELETE" });
  report(
    "DELETE /office/google-credential (token fictício, revogação no Google falha) → 204 mesmo assim",
    disconnectGoogleRes.status === 204,
    disconnectGoogleRes.body
  );

  const googleStatusAposDesconectarRes = await api("/v1/office/google-credential");
  report(
    "GET /office/google-credential depois de desconectar → connected: false de novo",
    googleStatusAposDesconectarRes.status === 200 && googleStatusAposDesconectarRes.body?.data?.connected === false,
    googleStatusAposDesconectarRes.body
  );
}
