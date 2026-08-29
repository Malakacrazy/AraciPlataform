// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts). Roda via
// ts-node (não tsx), mesmo motivo de emitDecoratorMetadata documentado em
// verify-stalled-cron.ts -- NfseService/AccountService são resolvidos via
// injeção de dependência do Nest.
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@araci/db";
import { AppModule } from "../src/app.module";
import { NfseService } from "../src/erp/fiscal/nfse.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const nfseService = app.get(NfseService);

  const account = await prisma.account.findFirst();
  if (!account) throw new Error("Nenhuma conta encontrada — rode isto contra um banco de dev já provisionado.");
  console.log(`Conta real -- taxRegime=${account.taxRegime}, nfseAmbiente=${account.nfseAmbiente}`);

  // CPF fictício padrão de teste BR (dígitos verificadores válidos, não
  // pertence a ninguém de verdade) -- mesmo valor já usado em
  // nfse-test-dps.ts.
  const clientComDocumento = await prisma.client.create({
    data: { accountId: account.id, name: "Cliente NFS-e real (verify)", document: "11144477735" },
  });
  const clientSemDocumento = await prisma.client.create({
    data: { accountId: account.id, name: "Cliente sem CPF (verify-nfse-invoice)" },
  });

  const projectComDocumento = await prisma.project.create({
    data: { accountId: account.id, clientId: clientComDocumento.id, name: "Projeto NFS-e real (verify)", status: "ativo", feeModel: "hora_tecnica" },
  });
  const projectSemDocumento = await prisma.project.create({
    data: { accountId: account.id, clientId: clientSemDocumento.id, name: "Projeto sem CPF (verify)", status: "ativo", feeModel: "hora_tecnica" },
  });

  const invoiceComDocumento = await prisma.invoice.create({
    data: { projectId: projectComDocumento.id, amount: 1, status: "pendente" },
  });
  const invoiceSemDocumento = await prisma.invoice.create({
    data: { projectId: projectSemDocumento.id, amount: 1, status: "pendente" },
  });

  try {
    console.log("Emitindo NFS-e pra cliente SEM CPF/CNPJ (esperado: rejeitar antes de chamar a SEFIN)...");
    try {
      await nfseService.emitirParaFatura(account.id, invoiceSemDocumento.id);
      console.log("  ✗ Deveria ter rejeitado — emitiu mesmo sem documento");
    } catch (error: any) {
      console.log(
        error?.code === "CLIENT_MISSING_DOCUMENT"
          ? "  ✓ CLIENT_MISSING_DOCUMENT, como esperado"
          : `  ✗ Código inesperado: ${error?.code} — ${error?.message}`
      );
    }

    console.log("Emitindo NFS-e de verdade (Homologação) pra fatura real com cliente documentado...");
    const emitida = await nfseService.emitirParaFatura(account.id, invoiceComDocumento.id);
    console.log(
      emitida.nfseChaveAcesso && emitida.status === "emitida"
        ? `  ✓ Emitida — chaveAcesso=${emitida.nfseChaveAcesso}, idDps=${emitida.nfseIdDps}, ambiente=${emitida.nfseAmbienteEmissao}, nDPS=${emitida.nfseNumeroDps}`
        : `  ✗ Não persistiu como esperado: ${JSON.stringify(emitida)}`
    );

    console.log("Emitindo de novo pra MESMA fatura (esperado: 422 NFSE_ALREADY_ISSUED, sem chamar a SEFIN)...");
    try {
      await nfseService.emitirParaFatura(account.id, invoiceComDocumento.id);
      console.log("  ✗ Deveria ter rejeitado — emitiu duas vezes");
    } catch (error: any) {
      console.log(
        error?.code === "NFSE_ALREADY_ISSUED"
          ? "  ✓ NFSE_ALREADY_ISSUED, como esperado"
          : `  ✗ Código inesperado: ${error?.code} — ${error?.message}`
      );
    }

    // Lacuna da matriz (NFS-e: cancelamento/substituição) -- cancelamento
    // simples primeiro: chaveAcesso original continua (histórico),
    // nfseCanceladaEm passa a marcar que não vale mais.
    console.log("Cancelando a NFS-e de verdade (evento e101101, Homologação)...");
    const chaveOriginal = emitida.nfseChaveAcesso!;
    const cancelada = await nfseService.cancelarParaFatura(account.id, invoiceComDocumento.id, {
      motivo: 1,
      justificativa: "Teste de cancelamento (verify-nfse-invoice)",
    });
    console.log(
      cancelada.nfseCanceladaEm && cancelada.nfseChaveAcesso === chaveOriginal
        ? `  ✓ Cancelada — chaveAcesso preservada (${cancelada.nfseChaveAcesso}), nfseCanceladaEm=${cancelada.nfseCanceladaEm}`
        : `  ✗ Não persistiu como esperado: ${JSON.stringify(cancelada)}`
    );

    console.log("Cancelando de novo a MESMA NFS-e (esperado: 422 NFSE_ALREADY_CANCELED)...");
    try {
      await nfseService.cancelarParaFatura(account.id, invoiceComDocumento.id, { motivo: 1, justificativa: "x" });
      console.log("  ✗ Deveria ter rejeitado — cancelou duas vezes");
    } catch (error: any) {
      console.log(
        error?.code === "NFSE_ALREADY_CANCELED"
          ? "  ✓ NFSE_ALREADY_CANCELED, como esperado"
          : `  ✗ Código inesperado: ${error?.code} — ${error?.message}`
      );
    }

    // Guard de emitirParaFatura mudou pra permitir reemissão pós-
    // cancelamento -- verifica que a chave antiga migra pra
    // nfseChaveAcessoAnterior e a nova NFS-e nasce sem cancelamento.
    console.log("Reemitindo do zero pra MESMA fatura, agora que a NFS-e anterior foi cancelada...");
    const reemitida = await nfseService.emitirParaFatura(account.id, invoiceComDocumento.id);
    console.log(
      reemitida.nfseChaveAcesso &&
        reemitida.nfseChaveAcesso !== chaveOriginal &&
        reemitida.nfseChaveAcessoAnterior === chaveOriginal &&
        !reemitida.nfseCanceladaEm
        ? `  ✓ Reemitida — nova chaveAcesso=${reemitida.nfseChaveAcesso}, anterior preservada em nfseChaveAcessoAnterior`
        : `  ✗ Não persistiu como esperado: ${JSON.stringify(reemitida)}`
    );

    // Substituição: emite uma DPS corrigida nova e cancela a atual
    // (chaveAntiga = a que acabou de ser reemitida acima) referenciando a
    // nova (evento e105102).
    console.log("Substituindo a NFS-e atual (emite corrigida nova + cancela a atual por substituição)...");
    const chaveAntesDaSubstituicao = reemitida.nfseChaveAcesso!;
    const substituida = await nfseService.substituirParaFatura(account.id, invoiceComDocumento.id, {
      justificativa: "Teste de substituição (verify-nfse-invoice)",
    });
    console.log(
      substituida.nfseChaveAcesso &&
        substituida.nfseChaveAcesso !== chaveAntesDaSubstituicao &&
        substituida.nfseChaveAcessoAnterior === chaveAntesDaSubstituicao &&
        !substituida.nfseCanceladaEm
        ? `  ✓ Substituída — nova chaveAcesso=${substituida.nfseChaveAcesso}, chave anterior (${chaveAntesDaSubstituicao}) cancelada por substituição`
        : `  ✗ Não persistiu como esperado: ${JSON.stringify(substituida)}`
    );
  } finally {
    await prisma.invoice.deleteMany({ where: { id: { in: [invoiceComDocumento.id, invoiceSemDocumento.id] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectComDocumento.id, projectSemDocumento.id] } } });
    await prisma.client.deleteMany({ where: { id: { in: [clientComDocumento.id, clientSemDocumento.id] } } });
    await app.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
