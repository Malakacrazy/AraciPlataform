// Lê o CNPJ do certificado A1 diretamente do arquivo .pfx, em vez de
// pedir pra alguém digitar -- a SEFIN autentica pelo certificado, então
// o CNPJ declarado na DPS PRECISA ser o mesmo do certificado (não um
// valor arbitrário do cadastro da Account). Certificados e-CNPJ ICP-
// Brasil trazem o CNPJ embutido no Subject (CN), formato típico
// "NOME DA EMPRESA:12345678000199" -- extrai os 14 dígitos finais.
//
// node-forge (já usado transitivamente por @nfewizard/shared para lidar
// com PKCS12) faz esse parsing em JS puro, sem depender de OpenSSL/JDK
// no ambiente -- mesma motivação de useForSchemaValidation:
// 'validateSchemaJsBased' em nfse-client.ts.
import forge from 'node-forge';
import { ApiError } from '../../common/api-error';

export interface CertificateInfo {
  cnpj: string;
  subjectCn: string;
  validFrom: Date;
  validTo: Date;
}

export function readCertificateInfo(
  pfxBuffer: Buffer,
  password: string,
): CertificateInfo {
  // node-forge lança seu próprio erro (ex.: "Invalid password" / MAC
  // mismatch) pra senha errada ou arquivo corrompido -- convertido aqui
  // pra ApiError, senão vira um 500 genérico ("Erro interno") em vez de
  // dizer qual das duas coisas provavelmente está errada.
  let p12;
  try {
    const p12Asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(pfxBuffer.toString('binary')),
    );
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (error: any) {
    throw new ApiError(
      'CERTIFICATE_READ_FAILED',
      `Não foi possível abrir o certificado — senha errada ou arquivo .pfx corrompido (${error?.message ?? error}).`,
      422,
    );
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new ApiError(
      'CERTIFICATE_READ_FAILED',
      'Não foi possível encontrar um certificado dentro do .pfx.',
      422,
    );
  }

  const cert = certBag.cert;
  const cn = cert.subject.getField('CN')?.value ?? '';
  // "NOME DA EMPRESA:12345678000199" -- pega só os dígitos depois dos ":"
  const cnpjMatch = cn.match(/:(\d{14})$/);
  if (!cnpjMatch) {
    throw new ApiError(
      'CERTIFICATE_CNPJ_NOT_FOUND',
      `Não encontrei um CNPJ de 14 dígitos no campo CN do certificado ("${cn}"). Certificado e-CNPJ ICP-Brasil esperado.`,
      422,
    );
  }

  return {
    cnpj: cnpjMatch[1],
    subjectCn: cn,
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  };
}
