import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Reaproveita os schemas Zod já existentes/testados em vez de reescrever
// para class-validator — menos risco na migração (Rule 3, mudanças
// cirúrgicas). ZodError, se lançado, é tratado pelo HttpExceptionFilter.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    return this.schema.parse(value);
  }
}
