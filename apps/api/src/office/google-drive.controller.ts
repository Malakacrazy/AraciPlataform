import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';

// Lacuna da matriz (gestão documental por projeto) -- ver
// GoogleDriveService para a lógica real (credencial de qual admin usar,
// idempotência da árvore de pastas, o que conta como vínculo quebrado).
@Controller('v1/projects/:projectId/drive-folders')
export class ProjectDriveFoldersController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Post()
  @HttpCode(200)
  async ensure(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('projectId') projectId: string,
  ) {
    const data = await this.googleDriveService.ensureProjectFolderTree(accountId, projectId);
    return { data };
  }
}

// Escopo é a CONTA (uma credencial serve pra todos os vínculos dela), não
// um projeto só -- ver comentário em GoogleDriveService.
// checkBrokenLinksForAccount. Fica fora de /projects/:id de propósito,
// pra não sugerir um escopo mais estreito do que o que de fato acontece.
@Controller('v1/office-links')
export class OfficeLinksBrokenCheckController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Post('check-broken-links')
  @HttpCode(200)
  async check(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.googleDriveService.checkBrokenLinksForAccount(accountId);
    return { data };
  }
}
