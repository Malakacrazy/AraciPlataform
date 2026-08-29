import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ApiError, NotFoundError } from '../../common/api-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountService } from '../account.service';
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
import { buildCancelamentoEvento, buildCancelamentoPorSubstituicaoEvento } from './nfse-cancelamento-evento';

// cMotivo é um código fechado da SEFIN Nacional pro evento e101101: 1
// (erro na emissão), 2 (serviço não prestado), 9 (outros) -- não é texto
// livre, union literal em vez de z.number() pra rejeitar qualquer outro
// valor antes de sequer montar o evento.
export const cancelarNfseSchema = z.object({
  motivo: z.union([z.literal(1), z.literal(2), z.literal(9)]),
  justificativa: z.string().min(1).max(255),
});
export type CancelarNfseInput = z.infer<typeof cancelarNfseSchema>;

// Sem motivo aqui -- o evento e105102 (cancelamento por substituição) não
// tem cMotivo/xMotivo livre como o e101101, a SEFIN trata "foi
// substituída por uma NFS-e nova" como motivo suficiente por si só.
// justificativa é só pro nosso próprio registro (nfseJustificativaCancelamento),
// nunca enviada à SEFIN.
export const substituirNfseSchema = z.object({
  justificativa: z.string().min(1).max(255),
});
export type SubstituirNfseInput = z.infer<typeof substituirNfseSchema>;

@Injectable()
export class NfseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
  ) {}

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
      await client.RegistrarEvento({ chaveAcesso: invoice.nfseChaveAcesso, pedRegEvento });
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseCanceladaEm: new Date(),
          nfseMotivoCancelamento: input.motivo,
          nfseJustificativaCancelamento: input.justificativa,
          nfseRejectionReason: null,
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

  // Lacuna da matriz (NFS-e: substituição) -- corrige uma NFS-e já
  // autorizada emitindo uma NOVA primeiro (DPS corrigida com os dados
  // atuais da fatura, nDPS diferente da original) e só então cancelando a
  // antiga por substituição (evento e105102, referenciando a nova). A
  // nova NFS-e é persistida ANTES de tentar cancelar a antiga --
  // documento fiscal real de verdade, nunca pode ficar só na memória se o
  // segundo passo falhar (ver comentário no catch abaixo).
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
      nDpsVariant: `substituicao-${Date.now()}`,
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

    // A nova já está autorizada de verdade neste ponto -- persiste antes
    // de tentar cancelar a antiga, pra nunca perder o rastro de um
    // documento fiscal real só porque o segundo passo (RegistrarEvento)
    // falhou.
    await this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: {
        nfseChaveAcesso: resultadoNova.response.chaveAcesso,
        nfseIdDps: resultadoNova.response.idDps,
        nfseNumeroDps: dpsNova.infDps.nDPS,
        nfseAmbienteEmissao: ambiente === AMBIENTE_PRODUCAO ? 'producao' : 'homologacao',
        nfseChaveAcessoAnterior: chaveAntiga,
        nfseRejectionReason: null,
      },
    });

    const pedRegEvento = buildCancelamentoPorSubstituicaoEvento({
      ambiente,
      prestadorCnpj: cert.info.cnpj,
      chaveAcessoAntiga: chaveAntiga,
      chaveAcessoNova: resultadoNova.response.chaveAcesso,
    });

    try {
      await client.RegistrarEvento({ chaveAcesso: chaveAntiga, pedRegEvento });
    } catch (error: any) {
      // A nova NFS-e já está autorizada e salva (acima) -- a antiga ainda
      // está tecnicamente ativa na SEFIN até alguém repetir este
      // cancelamento com sucesso. Fail loud: nfseRejectionReason deixa
      // isso explícito, não esconde a inconsistência atrás de um 200.
      const mensagem = this.extractRejectionMessage(
        error,
        'Falha desconhecida ao cancelar a NFS-e substituída.',
      );
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseRejectionReason: `NFS-e nova emitida (chave ${resultadoNova.response.chaveAcesso}), mas o cancelamento da anterior (chave ${chaveAntiga}) falhou: ${mensagem}. A antiga continua tecnicamente ativa na SEFIN -- repita a substituição ou cancele a chave antiga manualmente.`,
        },
        include: { lines: true },
      });
    }

    return this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: { nfseJustificativaCancelamento: input.justificativa },
      include: { lines: true },
    });
  }
}
