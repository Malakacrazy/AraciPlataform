import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import NFSe from '@nfewizard/nfse';
import { ApiError } from '../../common/api-error';

// Homologação, nunca Produção, por padrão — trocar pra 1 (Produção) é uma
// mudança de código deliberada, não uma variável de ambiente, porque uma
// var mal configurada em produção não pode silenciosamente emitir uma
// NFS-e real. Ver docs/fase-0/decisoes-pos-descoberta.md #4: a lib
// marca a própria assinatura da DPS como "não usar em produção até
// confirmação do algoritmo correto exigido pela SEFIN" — motivo a mais
// para nunca mirar Produção sem decisão explícita nesta mesma revisão.
export const AMBIENTE_HOMOLOGACAO = 2;
// Só exportado pra permitir uma emissão real pontual e deliberada (ex.:
// script one-off fora do fluxo normal do app) -- createNfseClient() nunca
// usa isso por padrão, só se o chamador passar explicitamente.
export const AMBIENTE_PRODUCAO = 1;

export interface NfseCertificateFile {
  path: string;
  password: string;
}

export interface NfseCertificateConfig extends NfseCertificateFile {
  uf: string;
  cpfCnpj: string;
}

// Path/senha bastam pra ABRIR o certificado (inspectCertificate) --
// exigir UF/CPFCNPJ nesse passo seria um paradoxo, já que o CNPJ real só
// é conhecido depois de abrir o certificado (ver nfse-certificate-info.ts
// e NfseService.inspectCertificate). Erro aqui é intencionalmente
// explícito (não um retorno undefined silencioso): quem tentar sem
// configurar o certificado precisa saber exatamente o que falta, não
// receber um erro genérico da lib mais adiante.
export function loadCertificateFileFromEnv(): NfseCertificateFile {
  const path = process.env.NFSE_CERTIFICATE_PATH;
  const password = process.env.NFSE_CERTIFICATE_PASSWORD;

  const missing = [
    !path && 'NFSE_CERTIFICATE_PATH',
    !password && 'NFSE_CERTIFICATE_PASSWORD',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new ApiError(
      'NFSE_CERTIFICATE_NOT_CONFIGURED',
      `Certificado NFS-e não configurado — faltam as variáveis de ambiente: ${missing.join(', ')}.`,
      422,
    );
  }

  return { path: path!, password: password! };
}

// UF/CPFCNPJ só são necessários pra de fato CRIAR o client e emitir (o
// payload dfe da lib exige os dois) -- usado só por emitirTeste, nunca
// por inspectCertificate.
export function loadCertificateConfigFromEnv(): NfseCertificateConfig {
  const file = loadCertificateFileFromEnv();
  const uf = process.env.NFSE_CERTIFICATE_UF;
  const cpfCnpj = process.env.NFSE_CERTIFICATE_CPFCNPJ;

  const missing = [
    !uf && 'NFSE_CERTIFICATE_UF',
    !cpfCnpj && 'NFSE_CERTIFICATE_CPFCNPJ',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new ApiError(
      'NFSE_CERTIFICATE_NOT_CONFIGURED',
      `Certificado NFS-e não configurado — faltam as variáveis de ambiente: ${missing.join(', ')}. Rode POST /v1/fiscal/nfse/inspecionar-certificado pra descobrir o CNPJ real do certificado.`,
      422,
    );
  }

  return { ...file, uf: uf!, cpfCnpj: cpfCnpj! };
}

// pathLogs/pathXML* ficam fora do repo de propósito (os.tmpdir(), não
// apps/api/alguma-pasta) -- esses arquivos guardam XML assinado da DPS e
// o retorno completo da SEFIN, que carregam dado fiscal real mesmo em
// homologação; não faz sentido criar mais um lugar dentro do repo que
// precisaria de gitignore próprio quando o SO já oferece um.
function nfseWorkDir(sub: string): string {
  return join(tmpdir(), 'araci-nfse', sub);
}

export function createNfseClient(
  cert: NfseCertificateConfig,
  ambiente: number = AMBIENTE_HOMOLOGACAO,
): NFSe {
  return new NFSe({
    dfe: {
      pathCertificado: readFileSync(cert.path),
      senhaCertificado: cert.password,
      UF: cert.uf,
      CPFCNPJ: cert.cpfCnpj,
      armazenarXMLAutorizacao: true,
      pathXMLAutorizacao: nfseWorkDir('autorizacao'),
      armazenarXMLConsulta: true,
      pathXMLConsulta: nfseWorkDir('consulta'),
      armazenarXMLRetorno: true,
      pathXMLRetorno: nfseWorkDir('retorno'),
    },
    // Nome da chave é "nfe", não "nfse" -- o próprio exemplo do README de
    // @nfewizard/nfse usa "nfse: { ambiente, versao }", mas o construtor
    // real (node_modules/@nfewizard/nfse/src/adapters/NFSe.ts) valida
    // `config.nfe?.ambiente` e o tipo (NFeWizardProps) só declara "nfe".
    // Confirmado lendo o código-fonte instalado, não o README.
    nfe: {
      ambiente,
      versaoDF: '1.00',
    },
    lib: {
      log: {
        exibirLogNoConsole: false, // nunca no console -- pode conter XML com dado fiscal
        armazenarLogs: true,
        pathLogs: nfseWorkDir('logs'),
      },
      // Evita a dependência de JDK no ambiente de hospedagem (ver
      // decisoes-pos-descoberta.md #4 -- Vercel não tem JDK).
      useForSchemaValidation: 'validateSchemaJsBased',
    },
  });
}
