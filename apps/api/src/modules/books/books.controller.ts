import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createBookSchema,
  renderBookSchema,
  updateBookPageSchema,
  updateBookSchema,
  type CreateBookInput,
  type RenderBookInput,
  type UpdateBookInput,
  type UpdateBookPageInput,
} from '@masalim/validation';
import type { AIJobDto, BookDto, BookRenderDto } from '@masalim/types';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { Idempotent } from '../../core/idempotency/idempotency.interceptor';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { BooksService } from './books.service';

@ApiTags('books')
@Controller()
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Post('books')
  @Idempotent()
  @ApiOperation({ summary: 'Build a book from a story and an illustration set' })
  async create(
    @CurrentUserId() userId: string,
    @Body(zodBody(createBookSchema)) body: CreateBookInput,
  ): Promise<BookDto> {
    return this.books.create(userId, body);
  }

  @Get('books')
  @ApiOperation({ summary: 'The parent’s books' })
  async list(@CurrentUserId() userId: string): Promise<BookDto[]> {
    return this.books.list(userId);
  }

  @Get('books/:id')
  @ApiOperation({ summary: 'A book with its pages and images' })
  async findOne(
    @CurrentUserId() userId: string,
    @Param('id') bookId: string,
  ): Promise<BookDto> {
    return this.books.findOne(userId, bookId);
  }

  @Patch('books/:id')
  @ApiOperation({ summary: 'Book Builder autosave: title, dedication, cover' })
  async update(
    @CurrentUserId() userId: string,
    @Param('id') bookId: string,
    @Body(zodBody(updateBookSchema)) body: UpdateBookInput,
  ): Promise<BookDto> {
    return this.books.update(userId, bookId, body);
  }

  @Patch('book-pages/:id')
  @ApiOperation({ summary: 'Edit one page of a book' })
  async updatePage(
    @CurrentUserId() userId: string,
    @Param('id') bookPageId: string,
    @Body(zodBody(updateBookPageSchema)) body: UpdateBookPageInput,
  ): Promise<BookDto> {
    return this.books.updatePage(userId, bookPageId, body);
  }

  @Delete('books/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a book' })
  async remove(@CurrentUserId() userId: string, @Param('id') bookId: string): Promise<void> {
    await this.books.remove(userId, bookId);
  }

  @Post('books/:id/renders')
  @Idempotent()
  @ApiOperation({ summary: 'Render the digital preview or the print-ready PDF' })
  async render(
    @CurrentUserId() userId: string,
    @Param('id') bookId: string,
    @Body(zodBody(renderBookSchema)) body: RenderBookInput,
  ): Promise<{ render: BookRenderDto; job: AIJobDto }> {
    return this.books.render(userId, bookId, body);
  }

  @Get('books/:id/renders')
  @ApiOperation({ summary: 'Renders produced for a book' })
  async listRenders(
    @CurrentUserId() userId: string,
    @Param('id') bookId: string,
  ): Promise<BookRenderDto[]> {
    return this.books.listRenders(userId, bookId);
  }
}
