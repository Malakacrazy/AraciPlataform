import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ProductsService,
  productInputSchema,
  type ProductInput,
} from './products.service';
import { SessionAccount } from '../auth/session-account.decorator';
import type { SessionAccount as SessionAccountType } from '../auth/session-account.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const productImageInputSchema = z.object({ url: z.url() });
type ProductImageInput = z.infer<typeof productImageInputSchema>;

@Controller('v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list(@SessionAccount() { accountId }: SessionAccountType) {
    const data = await this.productsService.listProducts(accountId);
    return { data };
  }

  @Get(':id')
  async get(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
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
    @Body(new ZodValidationPipe(productInputSchema.partial()))
    input: Partial<ProductInput>,
  ) {
    const data = await this.productsService.updateProduct(accountId, id, input);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.productsService.deleteProduct(accountId, id);
  }

  @Post(':id/images')
  @HttpCode(201)
  async addImage(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productImageInputSchema)) input: ProductImageInput,
  ) {
    const data = await this.productsService.addImage(accountId, id, input.url);
    return { data };
  }
}

// Rota plana, mesmo padrão de MoodboardItemsController -- a posse é
// checada via product.accountId dentro do service, não pela URL.
@Controller('v1/product-images')
export class ProductImagesController {
  constructor(private readonly productsService: ProductsService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @SessionAccount() { accountId }: SessionAccountType,
    @Param('id') id: string,
  ) {
    await this.productsService.removeImage(accountId, id);
  }
}
