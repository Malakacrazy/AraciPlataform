import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { ApiError, NotFoundError } from '../../common/api-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountService } from '../account.service';
import { GoogleDriveService } from '../../office/google-drive.service';
import {
  loadCertificateFileFromEnv,
  loadCertificateConfigFromEnv,
  createNfseClient,
  AMBIENTE_HOMOLOGACAO,
  AMBIENTE_PRODUCAO,
  type NfseCertificateConfig,
} from './nfse-client';
import { readCertificateInfo, type CertificateInfo } from './nfse-certificate-info';
import { buildTestDps } from './nfse-test-dps';
import { buildInvoiceDps } from './nfse-invoice-dps';
import { buildCancelamentoEvento } from './nfse-cancelamento-evento';

// cMotivo é um código fechado da SEFIN Nacional pro evento e101101: 1
// (erro na emissão), 2 (serviço não prestado), 9 (outros) -- não é texto
// livre, union literal em vez de z.number() pra rejeitar qualquer outro
// valor antes de sequer montar o evento.
export const cancelarNfseSchema = z.object({
  motivo: z.union([z.literal(1), z.literal(2), z.literal(9)]),
  justificativa: z.string().min(1).max(255),
});
export type CancelarNfseInput = z.infer<typeof cancelarNfseSchema>;

// justificativa vira o xMotivo (livre, opcional) do bloco `subst` na DPS
// nova -- cMotivo em si é fixo em '99' (ver InvoiceDpsInput.substituicao),
// a SEFIN não tem um código específico pra "corrigi um erro na fatura".
// Também persistida em nfseJustificativaCancelamento pro nosso registro.
export const substituirNfseSchema = z.object({
  justificativa: z.string().min(1).max(255),
});
export type SubstituirNfseInput = z.infer<typeof substituirNfseSchema>;

@Injectable()
export class NfseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  // gzip+base64 -> XML de verdade. Mesmo formato nos dois casos que a lib
  // devolve (Autorizacao.response.nfseXmlGZipB64,
  // RegistrarEvento(...).eventoXmlGZipB64) -- extraído porque os três
  // fluxos abaixo (emitir/cancelar/substituir) precisam da mesma
  // descompactação.
  private decodeXmlGZipB64(gzipB64: string): string {
    return gunzipSync(Buffer.from(gzipB64, 'base64')).toString('utf-8');
  }

  // Nunca lança -- pedido explícito do usuário: a ação fiscal (emissão/
  // cancelamento/substituição) já aconteceu de verdade na SEFIN nesse
  // ponto, falhar a resposta por causa do Drive seria errado (acabaria
  // parecendo que a NFS-e falhou, quando na verdade só o arquivamento
  // falhou). Em vez disso, devolve a mensagem de erro (ou null se deu
  // certo) pra quem chama persistir em nfseXmlArchiveError -- mesmo
  // espírito de nfseRejectionReason: registrado, não escondido atrás de
  // um retorno silencioso.
  private async archiveXmlBestEffort(
    accountId: string,
    projectId: string,
    fileName: string,
    gzipB64: string | undefined,
  ): Promise<string | null> {
    if (!gzipB64) {
      return 'A SEFIN não devolveu o XML assinado nesta resposta -- nada pra arquivar.';
    }
    try {
      const xml = this.decodeXmlGZipB64(gzipB64);
      await this.googleDriveService.archiveFiscalXml(accountId, projectId, fileName, xml);
      return null;
    } catch (error: any) {
      return `Falha ao arquivar o XML no Drive: ${error?.message ?? 'erro desconhecido'}.`;
    }
  }

  // Só lê o certificado e devolve os metadados públicos dele (CNPJ,
  // validade) -- não fala com nenhum webservice. Passo de baixo risco
  // pra confirmar que path/senha estão certos antes de tentar de fato
  // uma emissão em Homologação (ver emitirTeste).
  inspectCertificate() {
    const cert = loadCertificateFileFromEnv();
    const buffer = readFileSync(cert.path);
    const info = readCertificateInfo(buffer, cert.password);

    if (info.validTo < new Date()) {
      throw new ApiError(
        'CERTIFICATE_EXPIRED',
        `O certificado venceu em ${info.validTo.toLocaleDateString('pt-BR')} — não pode ser usado para emitir.`,
        422,
      );
    }

    return {
      cnpj: info.cnpj,
      subjectCn: info.subjectCn,
      validFrom: info.validFrom.toISOString(),
      validTo: info.validTo.toISOString(),
    };
  }

  // Extraído de emitirTeste/emitirParaFatura -- as duas checagens
  // (CNPJ do certificado bate com o configurado, ainda não venceu) eram
  // idênticas nos dois métodos antes desta emissão real existir.
  private loadValidCertificate(): NfseCertificateConfig & { info: CertificateInfo } {
    const cert = loadCertificateConfigFromEnv();
    const buffer = readFileSync(cert.path);
    const info = readCertificateInfo(buffer, cert.password);

    if (info.cnpj !== cert.cpfCnpj) {
      throw new ApiError(
        'CERTIFICATE_CNPJ_MISMATCH',
        `NFSE_CERTIFICATE_CPFCNPJ ("${cert.cpfCnpj}") não bate com o CNPJ real do certificado ("${info.cnpj}") — corrija a variável de ambiente.`,
        422,
      );
    }
    if (info.validTo < new Date()) {
      throw new ApiError(
        'CERTIFICATE_EXPIRED',
        `O certificado venceu em ${info.validTo.toLocaleDateString('pt-BR')} — não pode ser usado para emitir.`,
        422,
      );
    }

    return { ...cert, info };
  }

  // Também extraído de emitirTeste -- a lib anexa o detalhe real da
  // rejeição da SEFIN em error.nfseErrorDetail
  // (codigo/descricao/complemento/statusHttp); error.message sozinho só
  // traz o texto genérico do axios ("Request failed with status code
  // 400"), que não serve pra diagnosticar nada.
  private extractRejectionMessage(error: any, fallback: string): string {
    const detalhe = error?.nfseErrorDetail;
    return detalhe
      ? `[${detalhe.codigo ?? '?'}] ${detalhe.descricao ?? error.message}${detalhe.complemento ? ` — ${detalhe.complemento}` : ''}`
      : (error?.message ?? fallback);
  }

  // Emissão de teste com DPS fictício (ver nfse-test-dps.ts) contra o
  // ambiente de Homologação da SEFIN Nacional -- existe só para validar
  // que certificado, assinatura e chamada ao webservice funcionam de
  // ponta a ponta; não é o fluxo real de faturamento (ver
  // emitirParaFatura, abaixo).
  async emitirTeste() {
    const cert = this.loadValidCertificate();
    const client = createNfseClient(cert);
    const dps = buildTestDps(cert.info.cnpj);

    try {
      const resultado = await client.Autorizacao({ DPS: dps });
      return {
        chaveAcesso: resultado.response.chaveAcesso,
        idDps: resultado.response.idDps,
        dataHoraProcessamento: resultado.response.dataHoraProcessamento,
      };
    } catch (error: any) {
      throw new ApiError(
        'NFSE_AUTORIZACAO_FAILED',
        this.extractRejectionMessage(error, 'Falha desconhecida ao autorizar a NFS-e de teste.'),
        502,
      );
    }
  }

  // Lacuna da matriz (NFS-e dentro do fluxo real de faturamento) --
  // diferente de emitirTeste, esta liga o que já existia (certificado,
  // assinatura, webservice) a uma Invoice real do estúdio. "Idempotente"
  // aqui significa: nfseChaveAcesso preenchida já barra reemissão antes
  // de qualquer chamada à SEFIN (achado da auditoria: uma fatura nunca
  // pode ser emitida duas vezes), e o nDPS é estável por fatura (ver
  // nfse-invoice-dps.ts) -- uma tentativa reenviada depois de uma falha
  // de rede cai no mesmo nDPS, então a pior consequência de duplicar a
  // chamada é a SEFIN rejeitar como duplicata, nunca autorizar duas DPS.
  async emitirParaFatura(accountId: string, invoiceId: string) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id: invoiceId, project: { accountId } },
      include: { project: { include: { client: true } } },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    // nfseCanceladaEm presente = a chave atual não vale mais (cancelamento
    // simples, ver cancelarParaFatura) -- reemitir do zero é legítimo
    // nesse caso, só não quando a chave atual ainda está válida.
    if (invoice.nfseChaveAcesso && !invoice.nfseCanceladaEm) {
      throw new ApiError(
        'NFSE_ALREADY_ISSUED',
        'Esta fatura já tem uma NFS-e emitida e autorizada — não é possível emitir de novo.',
        422,
      );
    }
    // Mesmo código/mensagem de CLIENT_MISSING_DOCUMENT em
    // billing.service.ts#ensureAsaasCustomer -- mesma exigência (CPF/CNPJ
    // do tomador), mesmo achado.
    if (!invoice.project.client.document) {
      throw new ApiError(
        'CLIENT_MISSING_DOCUMENT',
        'Este cliente não tem CPF/CNPJ cadastrado — obrigatório para identificar o tomador na NFS-e.',
        422,
      );
    }

    const account = await this.accountService.getAccount(accountId);
    const taxRegime: 'MEI' | 'ME' = account.taxRegime === 'ME' ? 'ME' : 'MEI';
    const ambiente = account.nfseAmbiente === 'producao' ? AMBIENTE_PRODUCAO : AMBIENTE_HOMOLOGACAO;

    const cert = this.loadValidCertificate();
    const dps = buildInvoiceDps({
      prestadorCnpj: cert.info.cnpj,
      taxRegime,
      ambiente,
      invoiceId: invoice.id,
      valorServico: Number(invoice.amount),
      tomador: { documento: invoice.project.client.document, nome: invoice.project.client.name },
      cbsIbsEffectiveRatePercent: Number(account.cbsIbsEffectiveRatePercent),
      // nDPS variante quando reemitindo após cancelamento -- reusar o nDPS
      // original arriscaria a SEFIN rejeitar como duplicata da DPS já
      // registrada (cancelada ou não, o par CNPJ+série+nDPS já existe lá).
      // Baseado no timestamp do cancelamento (estável), não Date.now()
      // (mudaria a cada retry, quebrando a idempotência de reenvio).
      nDpsVariant: invoice.nfseCanceladaEm ? `reemissao-${invoice.nfseCanceladaEm.getTime()}` : undefined,
    });

    const client = createNfseClient(cert, ambiente);

    try {
      const resultado = await client.Autorizacao({ DPS: dps });
      const nfseXmlArchiveError = await this.archiveXmlBestEffort(
        accountId,
        invoice.projectId,
        `NFS-e ${resultado.response.chaveAcesso}.xml`,
        resultado.response.nfseXmlGZipB64,
      );
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'emitida',
          issuedAt: new Date(),
          nfseNumber: resultado.response.chaveAcesso,
          nfseChaveAcesso: resultado.response.chaveAcesso,
          nfseIdDps: resultado.response.idDps,
          nfseNumeroDps: dps.infDps.nDPS,
          nfseAmbienteEmissao: ambiente === AMBIENTE_PRODUCAO ? 'producao' : 'homologacao',
          nfseRejectionReason: null,
          nfseXmlArchiveError,
          // Limpa o rastro do cancelamento anterior -- guarda a chave
          // cancelada em nfseChaveAcessoAnterior antes de sobrescrever
          // nfseChaveAcesso, mesma disciplina de nunca perder o
          // histórico fiscal (ver substituirParaFatura).
          nfseCanceladaEm: null,
          nfseMotivoCancelamento: null,
          nfseJustificativaCancelamento: null,
          nfseChaveAcessoAnterior: invoice.nfseChaveAcesso ?? null,
        },
        include: { lines: true },
      });
    } catch (error: any) {
      const mensagem = this.extractRejectionMessage(error, 'Falha desconhecida ao autorizar a NFS-e.');
      // Persistida pra sobreviver a um refresh de página -- achado da
      // auditoria: hoje esse detalhe é capturado e descartado, a usuária
      // só vê um 502 genérico. Não muda status/issuedAt: uma rejeição não
      // é uma emissão, a fatura continua exatamente como estava.
      await this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: { nfseRejectionReason: mensagem },
      });
      throw new ApiError('NFSE_AUTORIZACAO_FAILED', mensagem, 502);
    }
  }

  // Lacuna da matriz (NFS-e: cancelamento) -- evento e101101, não emite
  // nada novo, só invalida a chave atual. nfseChaveAcesso continua com a
  // chave cancelada (histórico); reemitir do zero depois disso é
  // legítimo (ver guard em emitirParaFatura). tpAmb do EVENTO precisa
  // bater com o ambiente ONDE a NFS-e foi emitida (nfseAmbienteEmissao),
  // não necessariamente Account.nfseAmbiente hoje -- os dois podem
  // divergir se a conta trocou de ambiente depois da emissão original.
  async cancelarParaFatura(accountId: string, invoiceId: string, input: CancelarNfseInput) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id: invoiceId, project: { accountId } },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    if (!invoice.nfseChaveAcesso) {
      throw new ApiError('NFSE_NOT_ISSUED', 'Esta fatura não tem NFS-e emitida — não há o que cancelar.', 422);
    }
    if (invoice.nfseCanceladaEm) {
      throw new ApiError('NFSE_ALREADY_CANCELED', 'A NFS-e desta fatura já está cancelada.', 422);
    }

    const cert = this.loadValidCertificate();
    const ambiente = invoice.nfseAmbienteEmissao === 'producao' ? AMBIENTE_PRODUCAO : AMBIENTE_HOMOLOGACAO;
    const client = createNfseClient(cert, ambiente);
    const pedRegEvento = buildCancelamentoEvento({
      ambiente,
      prestadorCnpj: cert.info.cnpj,
      chaveAcesso: invoice.nfseChaveAcesso,
      motivo: input.motivo,
      justificativa: input.justificativa,
    });

    try {
      const resultadoEvento = await client.RegistrarEvento({ chaveAcesso: invoice.nfseChaveAcesso, pedRegEvento });
      const nfseXmlArchiveError = await this.archiveXmlBestEffort(
        accountId,
        invoice.projectId,
        `NFS-e ${invoice.nfseChaveAcesso} - cancelamento.xml`,
        resultadoEvento.eventoXmlGZipB64,
      );
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseCanceladaEm: new Date(),
          nfseMotivoCancelamento: input.motivo,
          nfseJustificativaCancelamento: input.justificativa,
          nfseRejectionReason: null,
          nfseXmlArchiveError,
        },
        include: { lines: true },
      });
    } catch (error: any) {
      const mensagem = this.extractRejectionMessage(error, 'Falha desconhecida ao cancelar a NFS-e.');
      await this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: { nfseRejectionReason: mensagem },
      });
      throw new ApiError('NFSE_CANCELAMENTO_FAILED', mensagem, 502);
    }
  }

  // Lacuna da matriz (NFS-e: substituição) -- REDESENHADO depois de achar,
  // rodando de verdade contra Homologação, que o design original (emitir
  // a nova, depois cancelar a antiga com um evento e105102 separado via
  // RegistrarEvento) é estruturalmente impossível: SEFIN Nacional sempre
  // rejeita e105102 vindo do prestador com E1861 ("não é aceito pelo
  // método POST da API Eventos") -- é um evento gerado pelo sistema
  // municipal, não algo que o contribuinte possa registrar (nenhuma
  // combinação de campo/cMotivo corrige isso, é arquitetural). Esse bug
  // ficou invisível por muito tempo porque nada verificava
  // nfseRejectionReason depois de uma substituição "bem-sucedida" -- os
  // campos de chave nova/anterior já tinham sido persistidos ANTES da
  // chamada que sempre falhava.
  //
  // Design correto, confirmado no XSD oficial (NFSe-ESQUEMAS_XSD-v1.01,
  // TCSubstituicao): a substituição é UMA ÚNICA autorização -- a DPS nova
  // carrega o bloco `subst` referenciando a chave antiga (ver
  // buildInvoiceDps/InvoiceDpsInput.substituicao), e a própria SEFIN
  // cancela a antiga como efeito colateral de autorizar esta. Não existe
  // mais um segundo passo pra falhar: nfseRejectionReason só fica não-nulo
  // se a ÚNICA chamada (Autorizacao) falhar, igual emitirParaFatura.
  async substituirParaFatura(accountId: string, invoiceId: string, input: SubstituirNfseInput) {
    const invoice = await this.prisma.db.invoice.findFirst({
      where: { id: invoiceId, project: { accountId } },
      include: { project: { include: { client: true } } },
    });
    if (!invoice) {
      throw new NotFoundError('Fatura');
    }
    if (!invoice.nfseChaveAcesso) {
      throw new ApiError('NFSE_NOT_ISSUED', 'Esta fatura não tem NFS-e emitida — não há o que substituir.', 422);
    }
    if (invoice.nfseCanceladaEm) {
      throw new ApiError(
        'NFSE_ALREADY_CANCELED',
        'A NFS-e desta fatura já está cancelada — emita uma nova do zero em vez de substituir.',
        422,
      );
    }
    if (!invoice.project.client.document) {
      throw new ApiError(
        'CLIENT_MISSING_DOCUMENT',
        'Este cliente não tem CPF/CNPJ cadastrado — obrigatório para identificar o tomador na NFS-e.',
        422,
      );
    }

    const account = await this.accountService.getAccount(accountId);
    const taxRegime: 'MEI' | 'ME' = account.taxRegime === 'ME' ? 'ME' : 'MEI';
    const ambiente = account.nfseAmbiente === 'producao' ? AMBIENTE_PRODUCAO : AMBIENTE_HOMOLOGACAO;
    const chaveAntiga = invoice.nfseChaveAcesso;

    const cert = this.loadValidCertificate();
    const dpsNova = buildInvoiceDps({
      prestadorCnpj: cert.info.cnpj,
      taxRegime,
      ambiente,
      invoiceId: invoice.id,
      valorServico: Number(invoice.amount),
      tomador: { documento: invoice.project.client.document, nome: invoice.project.client.name },
      cbsIbsEffectiveRatePercent: Number(account.cbsIbsEffectiveRatePercent),
      // chaveAntiga, não Date.now() -- achado real de revisão: Date.now()
      // muda a cada retry, quebrando a mesma idempotência que
      // emitirParaFatura já garante na reemissão (nDpsVariant baseado em
      // nfseCanceladaEm.getTime(), estável). Uma queda de rede depois da
      // SEFIN autorizar mas antes da resposta chegar aqui produziria uma
      // SEGUNDA DPS distinta no retry, em vez de a SEFIN rejeitar como
      // duplicata da mesma tentativa. chaveAntiga é estável entre retries
      // desta MESMA substituição (só muda quando ela de fato suceder) e
      // naturalmente diferente de uma substituição futura (a chave atual
      // já terá mudado).
      nDpsVariant: `substituicao-${chaveAntiga}`,
      substituicao: { chaveAcessoAntiga: chaveAntiga, xMotivo: input.justificativa },
    });

    const client = createNfseClient(cert, ambiente);

    let resultadoNova;
    try {
      resultadoNova = await client.Autorizacao({ DPS: dpsNova });
    } catch (error: any) {
      const mensagem = this.extractRejectionMessage(error, 'Falha desconhecida ao autorizar a NFS-e substituta.');
      await this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: { nfseRejectionReason: mensagem },
      });
      throw new ApiError('NFSE_AUTORIZACAO_FAILED', mensagem, 502);
    }

    // Chamada única -- a SEFIN já cancela a chave antiga como efeito
    // colateral de autorizar esta (bloco `subst` na DPS, ver comentário
    // acima). Nada mais pode falhar depois disto: nfseRejectionReason:
    // null aqui é definitivo, não "só a nova deu certo" como no design
    // antigo.
    const nfseXmlArchiveError = await this.archiveXmlBestEffort(
      accountId,
      invoice.projectId,
      `NFS-e ${resultadoNova.response.chaveAcesso}.xml`,
      resultadoNova.response.nfseXmlGZipB64,
    );
    return this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: {
        nfseChaveAcesso: resultadoNova.response.chaveAcesso,
        nfseIdDps: resultadoNova.response.idDps,
        nfseNumeroDps: dpsNova.infDps.nDPS,
        nfseAmbienteEmissao: ambiente === AMBIENTE_PRODUCAO ? 'producao' : 'homologacao',
        nfseChaveAcessoAnterior: chaveAntiga,
        nfseRejectionReason: null,
        nfseXmlArchiveError,
        nfseJustificativaCancelamento: input.justificativa,
      },
      include: { lines: true },
    });
  }
}
