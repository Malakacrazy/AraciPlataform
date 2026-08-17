import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  PublicPresentationService,
  publicSpecUpdateSchema,
  type PublicSpecUpdateInput,
} from './public-presentation.service';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

// A segunda (e última) rota @Public() do sistema, além de /health — ver
// o comentário atualizado em auth.guard.ts/public.decorator.ts sobre por
// que isto é deliberado e não um esquecimento: o cliente que abre este
// link não tem sessão Google/NextAuth, nunca vai ter. @Public() só pula
// a checagem de token interno; a autorização de verdade acontece dentro
// do PublicPresentationService (posse do token = acesso a exatamente um
// projeto, nada além disso).
@Controller('v1/present/:token')
export class PublicPresentationController {
  constructor(
    private readonly publicPresentationService: PublicPresentationService,
  ) {}

  @Public()
  @Get()
  async get(@Param('token') token: string) {
    const data = await this.publicPresentationService.getPresentation(token);
    return { data };
  }

  @Public()
  @Patch('specifications/:specId')
  async updateSpecification(
    @Param('token') token: string,
    @Param('specId') specId: string,
    @Body(new ZodValidationPipe(publicSpecUpdateSchema))
    input: PublicSpecUpdateInput,
  ) {
    const data = await this.publicPresentationService.updateSpecification(
      token,
      specId,
      input,
    );
    return { data };
  }
}
