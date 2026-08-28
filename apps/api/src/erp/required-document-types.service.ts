import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProjectStageName } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';

export const requiredDocumentTypeInputSchema = z.object({
  stage: z.enum(ProjectStageName),
  documentType: z.string().min(1, 'Tipo de documento é obrigatório.').max(60),
});

export type RequiredDocumentTypeInput = z.infer<typeof requiredDocumentTypeInputSchema>;

// Lacuna da matriz ("checklist de documentos obrigatórios por fase,
// amarrado ao gate do PEP") -- ver comentário completo em schema.prisma
// (model RequiredDocumentType) pro raciocínio de configurar por STAGE, não
// por ProjectPhase individual.
@Injectable()
export class RequiredDocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  listForAccount(accountId: string) {
    return this.prisma.db.requiredDocumentType.findMany({
      where: { accountId },
      orderBy: [{ stage: 'asc' }, { documentType: 'asc' }],
    });
  }

  async create(accountId: string, input: RequiredDocumentTypeInput) {
    const existing = await this.prisma.db.requiredDocumentType.findUnique({
      where: { accountId_stage_documentType: { accountId, stage: input.stage, documentType: input.documentType } },
    });
    if (existing) {
      throw new ApiError(
        'REQUIRED_DOCUMENT_TYPE_ALREADY_EXISTS',
        'Este tipo de documento já é obrigatório para este estágio.',
        409,
      );
    }
    return this.prisma.db.requiredDocumentType.create({
      data: { accountId, stage: input.stage, documentType: input.documentType },
    });
  }

  async delete(accountId: string, id: string) {
    const requirement = await this.prisma.db.requiredDocumentType.findFirst({ where: { id, accountId } });
    if (!requirement) {
      throw new NotFoundError('Tipo de documento obrigatório');
    }
    await this.prisma.db.requiredDocumentType.delete({ where: { id } });
  }
}
