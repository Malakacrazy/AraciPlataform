import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
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
    if (invoice.nfseChaveAcesso) {
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
}
