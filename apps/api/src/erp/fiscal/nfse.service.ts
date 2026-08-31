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
  //
  // Achado A68 da auditoria de 30 ago 2026: accountId é sempre resolvido
  // corretamente pra ler a fatura/Account (taxRegime, nfseAmbiente,
  // cbsIbsEffectiveRatePercent), mas o PRESTADOR da DPS vinha só de
  // NFSE_CERTIFICATE_CPFCNPJ -- global de processo, nunca contra
  // Account.cnpj. Com uma conta só (Fase 1) isso só detecta o
  // certificado/env estarem inconsistentes ENTRE SI e ainda errados em
  // relação à conta cadastrada; se um dia existir mais de uma Account no
  // mesmo processo, é o que impede a NFS-e de uma conta sair autorizada
  // com o CNPJ de outra. Normaliza os dois lados (só dígitos) antes de
  // comparar -- Account.cnpj é texto livre digitado por um admin
  // (account.service.ts: z.string().min(1), sem máscara garantida).
  // accountId opcional: emitirTeste() não tem fatura/conta nenhuma no
  // meio (é só um teste de conectividade com a SEFIN, ver comentário no
  // controller) -- sem accountId, pula a checagem, mesmo comportamento
  // de antes desta correção pra esse caminho específico.
  private async loadValidCertificate(accountId?: string): Promise<NfseCertificateConfig & { info: CertificateInfo }> {
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

    if (accountId) {
      const account = await this.accountService.getAccount(accountId);
      const onlyDigits = (value: string) => value.replace(/\D/g, '');
      if (account.cnpj && onlyDigits(account.cnpj) !== onlyDigits(info.cnpj)) {
        throw new ApiError(
          'CERTIFICATE_ACCOUNT_CNPJ_MISMATCH',
          `O certificado fiscal configurado é do CNPJ ${info.cnpj}, mas esta conta está cadastrada com o CNPJ ${account.cnpj} -- corrija um dos dois antes de emitir.`,
          422,
        );
      }
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
    const cert = await this.loadValidCertificate();
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
    //
    // Achado A28 da auditoria de 30 ago 2026: só bloqueia quando a chave
    // atual é de uma emissão REAL (produção) -- uma emissão em
    // homologação (ambiente padrão da conta hoje) é só um teste, sem
    // validade fiscal nenhuma, e tratá-la como "já emitida" impediria
    // emitir de novo depois de trocar pra produção (ver bloco de
    // persistência abaixo pro resto do raciocínio).
    if (invoice.nfseChaveAcesso && !invoice.nfseCanceladaEm && invoice.nfseAmbienteEmissao === 'producao') {
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

    const cert = await this.loadValidCertificate(accountId);
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

      // Achado A26 (regressão de 'paga' pra 'emitida') + A28 (homologação
      // não é emissão de verdade), corrigidos juntos porque são a mesma
      // decisão: só uma emissão REAL (produção) grava status/nfseNumber/
      // issuedAt. O fluxo normal do produto é webhook marca 'paga' →
      // notifica "falta emitir NFS-e" → admin clica Emitir -- sem isto,
      // esse clique regredia a fatura de volta pra 'emitida' e sumia com
      // a receita realizada de todo número financeiro derivado (BI).
      // Homologação nunca marca 'emitida' nem preenche nfseNumber -- o
      // billing.service.ts já usa `!invoice.nfseNumber` como sinal de
      // "falta emitir NFS-e de verdade", então uma emissão de teste
      // deixa esse aviso aceso de propósito, e o guard acima já para de
      // bloquear reemissão quando o ambiente não é produção.
      const isRealEmission = ambiente === AMBIENTE_PRODUCAO;

      // Achado A30 (janela irreconciliável): persiste os campos que a
      // SEFIN devolveu ANTES de arquivar no Drive, não depois -- entre
      // Autorizacao e este primeiro update não há chamada de rede
      // nenhuma, então uma queda do processo bem no meio já não deixa
      // mais uma NFS-e real autorizada sem nenhum rastro no banco (só o
      // arquivamento em si, um passo auxiliar, ficaria pendente).
      // Reconciliação completa via Consulta/ConsultarDPS fica de fora
      // desta rodada -- ver nota no roadmap.
      await this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          status: isRealEmission ? (invoice.status === 'paga' ? undefined : 'emitida') : undefined,
          issuedAt: isRealEmission ? (invoice.issuedAt ?? new Date()) : undefined,
          nfseNumber: isRealEmission ? resultado.response.chaveAcesso : undefined,
          nfseChaveAcesso: resultado.response.chaveAcesso,
          nfseIdDps: resultado.response.idDps,
          nfseNumeroDps: dps.infDps.nDPS,
          nfseAmbienteEmissao: isRealEmission ? 'producao' : 'homologacao',
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

      const nfseXmlArchiveError = await this.archiveXmlBestEffort(
        accountId,
        invoice.projectId,
        `NFS-e ${resultado.response.chaveAcesso}.xml`,
        resultado.response.nfseXmlGZipB64,
      );
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: { nfseXmlArchiveError },
        include: { lines: true },
      });
    } catch (error: any) {
      const mensagem = this.extractRejectionMessage(error, 'Falha desconhecida ao autorizar a NFS-e.');
      // Achado A31: antes de gravar a rejeição, reconfere se uma
      // requisição concorrente já autorizou com sucesso -- sem isto, um
      // duplo clique podia gravar "rejeitada" DEPOIS do sucesso da outra
      // requisição, deixando uma NFS-e válida com uma mensagem de erro
      // permanente na tela (a SEFIN só autoriza uma das duas -- é o nDPS
      // estável que impede duas NFS-e de verdade, não isto -- isto só
      // evita que o texto de erro pareça mais recente/verdadeiro que o
      // sucesso real).
      const atual = await this.prisma.db.invoice.findUnique({ where: { id: invoice.id } });
      if (atual?.nfseChaveAcesso && !atual.nfseCanceladaEm) {
        throw new ApiError('NFSE_AUTORIZACAO_FAILED', mensagem, 502);
      }
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

    const cert = await this.loadValidCertificate(accountId);
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

      // Achado A30: persiste o cancelamento ANTES de arquivar no Drive
      // (mesmo raciocínio de emitirParaFatura) -- o evento já foi aceito
      // pela SEFIN neste ponto, então uma queda do processo antes do
      // arquivamento não pode deixar isso sem registro.
      await this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: {
          nfseCanceladaEm: new Date(),
          nfseMotivoCancelamento: input.motivo,
          nfseJustificativaCancelamento: input.justificativa,
          nfseRejectionReason: null,
        },
        include: { lines: true },
      });

      const nfseXmlArchiveError = await this.archiveXmlBestEffort(
        accountId,
        invoice.projectId,
        `NFS-e ${invoice.nfseChaveAcesso} - cancelamento.xml`,
        resultadoEvento.eventoXmlGZipB64,
      );
      return this.prisma.db.invoice.update({
        where: { id: invoice.id },
        data: { nfseXmlArchiveError },
        include: { lines: true },
      });
    } catch (error: any) {
      const mensagem = this.extractRejectionMessage(error, 'Falha desconhecida ao cancelar a NFS-e.');
      // Achado A31 -- mesmo guard de emitirParaFatura: não sobrescreve um
      // cancelamento que uma requisição concorrente já registrou.
      const atual = await this.prisma.db.invoice.findUnique({ where: { id: invoice.id } });
      if (atual?.nfseCanceladaEm) {
        throw new ApiError('NFSE_CANCELAMENTO_FAILED', mensagem, 502);
      }
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
    // Achado A29 da auditoria de 30 ago 2026: usa o ambiente ONDE a NFS-e
    // atual vive (invoice.nfseAmbienteEmissao), não account.nfseAmbiente
    // -- os dois podem divergir se a conta trocou de ambiente depois da
    // emissão original (mesmo raciocínio que cancelarParaFatura já
    // aplica). Sem isto, substituir uma nota antiga de homologação depois
    // de a conta virar produção mandaria a DPS substituta pro webservice
    // ERRADO, com um bloco `subst` referenciando uma chave que só existe
    // no outro ambiente. Recusa em vez de adivinhar -- a decisão de
    // reemitir em produção precisa ser explícita (trocar Account.nfseAmbiente
    // primeiro), não um efeito colateral de clicar Substituir.
    if (invoice.nfseAmbienteEmissao !== account.nfseAmbiente) {
      throw new ApiError(
        'NFSE_AMBIENTE_MISMATCH',
        `Esta NFS-e foi emitida em ${invoice.nfseAmbienteEmissao === 'producao' ? 'produção' : 'homologação'}, mas a conta está configurada pra ${account.nfseAmbiente === 'producao' ? 'produção' : 'homologação'} agora — mude o ambiente da conta antes de substituir.`,
        422,
      );
    }
    const ambiente = invoice.nfseAmbienteEmissao === 'producao' ? AMBIENTE_PRODUCAO : AMBIENTE_HOMOLOGACAO;
    const chaveAntiga = invoice.nfseChaveAcesso;

    const cert = await this.loadValidCertificate(accountId);
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
      // Achado A31 -- mesmo guard de emitirParaFatura: não sobrescreve
      // uma substituição que uma requisição concorrente já autorizou
      // (chaveAcesso já teria mudado da chaveAntiga capturada acima).
      const atual = await this.prisma.db.invoice.findUnique({ where: { id: invoice.id } });
      if (atual?.nfseChaveAcesso && atual.nfseChaveAcesso !== chaveAntiga) {
        throw new ApiError('NFSE_AUTORIZACAO_FAILED', mensagem, 502);
      }
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
    //
    // Achado A24: nfseNumber precisa mudar junto -- é o campo que a tela
    // (e BillingService) exibe como "o número da NFS-e", e sem isto
    // continuava mostrando a chave da nota CANCELADA depois da
    // substituição. Só quando é uma substituição de verdade (produção) --
    // mesma simetria de A28 em emitirParaFatura: substituir uma nota de
    // TESTE (homologação) continua sem nfseNumber, senão o aviso "falta
    // emitir NFS-e" desapareceria por causa de um teste.
    //
    // Achado A30: persiste ANTES de arquivar no Drive (mesmo raciocínio
    // de emitirParaFatura/cancelarParaFatura) -- a nova já está
    // autorizada (e a antiga já cancelada, efeito colateral da SEFIN)
    // neste ponto; uma queda do processo não pode deixar isso sem
    // registro só porque o Drive ainda não respondeu.
    const isRealSubstitution = ambiente === AMBIENTE_PRODUCAO;
    await this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: {
        nfseNumber: isRealSubstitution ? resultadoNova.response.chaveAcesso : undefined,
        nfseChaveAcesso: resultadoNova.response.chaveAcesso,
        nfseIdDps: resultadoNova.response.idDps,
        nfseNumeroDps: dpsNova.infDps.nDPS,
        nfseAmbienteEmissao: ambiente === AMBIENTE_PRODUCAO ? 'producao' : 'homologacao',
        nfseChaveAcessoAnterior: chaveAntiga,
        nfseRejectionReason: null,
        nfseJustificativaCancelamento: input.justificativa,
      },
      include: { lines: true },
    });

    const nfseXmlArchiveError = await this.archiveXmlBestEffort(
      accountId,
      invoice.projectId,
      `NFS-e ${resultadoNova.response.chaveAcesso}.xml`,
      resultadoNova.response.nfseXmlGZipB64,
    );
    return this.prisma.db.invoice.update({
      where: { id: invoice.id },
      data: { nfseXmlArchiveError },
      include: { lines: true },
    });
  }
}
