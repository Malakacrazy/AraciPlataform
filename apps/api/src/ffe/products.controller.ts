import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ProductsService, productInputSchema, type ProductInput } from './products.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.productsService.listProducts(accountId);
    return { data };
  }

  @Get(':id')
  async get(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    const data = await this.productsService.getProduct(accountId, id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @SessionAccount() { accountId }: SessionAccountType,
    @Body(new ZodValidationPipe(productInputSchema)) input: ProductInput,
  ) {
    const data = await this.productsService.createProduct(accountId, input);
    return { data };
  }

  @Patch(':id')
  async update(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productInputSchema.partial())) input: Partial<ProductInput>,
  ) {
    const data = await this.productsService.updateProduct(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@SessionAccount() { accountId }: SessionAccountType, @Param('id') id: string) {
    await this.productsService.deleteProduct(accountId, id);
  }
}
