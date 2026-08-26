import { Controller, Post } from '@nestjs/common';
import { NfseService } from './nfse.service';
import { AdminOnly } from '../../auth/admin-only.decorator';

// Endpoints de TESTE da integração NFS-e (nfewizard-io) -- não fazem
// parte do fluxo real de faturamento ainda. Não são escopados por
// Account (o certificado configurado é único, via ambiente, não por
// conta) -- ainda exigem autenticação porque o AuthGuard global cobre
// toda rota por padrão, só não precisam extrair accountId pra nada.
@AdminOnly()
@Controller('v1/fiscal/nfse')
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  @Post('inspecionar-certificado')
  async inspecionarCertificado() {
    const data = this.nfseService.inspectCertificate();
    return { data };
  }

  @Post('emitir-teste')
  async emitirTeste() {
    const data = await this.nfseService.emitirTeste();
    return { data };
  }
}
