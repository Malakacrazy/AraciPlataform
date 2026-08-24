import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { ApiError } from '../../common/api-error';
import { loadCertificateFileFromEnv, loadCertificateConfigFromEnv, createNfseClient } from './nfse-client';
import { readCertificateInfo } from './nfse-certificate-info';
import { buildTestDps } from './nfse-test-dps';

@Injectable()
export class NfseService {
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

  // Emissão de teste com DPS fictício (ver nfse-test-dps.ts) contra o
  // ambiente de Homologação da SEFIN Nacional -- existe só para validar
  // que certificado, assinatura e chamada ao webservice funcionam de
  // ponta a ponta; não é o fluxo real de faturamento (que ainda depende
  // de dado fiscal real confirmado pela consultoria contábil, ver
  // docs/fase-0/roadmap-atualizado.md Fase 2).
  async emitirTeste() {
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

    const client = createNfseClient(cert);
    const dps = buildTestDps(info.cnpj);

    try {
      const resultado = await client.Autorizacao({ DPS: dps });
      return {
        chaveAcesso: resultado.response.chaveAcesso,
        idDps: resultado.response.idDps,
        dataHoraProcessamento: resultado.response.dataHoraProcessamento,
      };
    } catch (error: any) {
      // A lib anexa o detalhe real da rejeição da SEFIN em
      // error.nfseErrorDetail (codigo/descricao/complemento/statusHttp) --
      // error.message sozinho só traz o texto genérico do axios ("Request
      // failed with status code 400"), que não serve pra diagnosticar nada.
      const detalhe = error?.nfseErrorDetail;
      const mensagem = detalhe
        ? `[${detalhe.codigo ?? '?'}] ${detalhe.descricao ?? error.message}${detalhe.complemento ? ` — ${detalhe.complemento}` : ''}`
        : (error?.message ?? 'Falha desconhecida ao autorizar a NFS-e de teste.');
      throw new ApiError('NFSE_AUTORIZACAO_FAILED', mensagem, 502);
    }
  }
}
