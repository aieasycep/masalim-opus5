import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AIJobDto,
  AddressDto,
  BookDto,
  EntitlementsResponse,
  IllustrationSetDto,
  OrderDto,
  OrderSummaryDto,
  Paginated,
  PaymentInitiationDto,
  PriceQuoteDto,
  PrintProductDto,
  SubscriptionDto,
} from '@masalim/types';
import { MockPaymentProvider, MockPrintProvider } from '@masalim/payments';
import { PAYMENT_PROVIDER, PRINT_PROVIDER } from '../src/core/commerce/commerce.module';
import { ORDER_NUMBER_PATTERN } from '../src/modules/orders/order-number';
import {
  authHeader,
  createTestApp,
  resetRedis,
  resetUserData,
  signUp,
  type SignedUpUser,
  type TestContext,
} from './helpers/test-app';
import { startWorkers, waitForJob } from './helpers/jobs';

/**
 * The second half of journey 3: configure → address → price → order → payment →
 * printer → order history.
 *
 * The bank and the print house are mocks; everything that decides what a family
 * is charged, and what is actually printed, is real.
 */
describe('commerce', () => {
  let context: TestContext;
  let parent: SignedUpUser;
  let systemVoiceId: string;
  let payments: MockPaymentProvider;
  let printer: MockPrintProvider;

  beforeAll(async () => {
    context = await createTestApp();
    startWorkers(context);

    payments = context.app.get<MockPaymentProvider>(PAYMENT_PROVIDER);
    printer = context.app.get<MockPrintProvider>(PRINT_PROVIDER);

    const voice = await context.prisma.client.systemVoice.findFirst({
      where: { premiumOnly: false },
    });
    if (!voice) throw new Error('seed did not provide a free system voice');
    systemVoiceId = voice.id;
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetUserData(context.prisma);
    await resetRedis(context.redis);
    parent = await signUp(context, { name: 'Ayşe Yılmaz' });
  });

  async function saveAddress(overrides: Record<string, unknown> = {}): Promise<AddressDto> {
    const response = await context
      .http()
      .post('/addresses')
      .set(...authHeader(parent))
      .send({
        fullName: 'Ayşe Yılmaz',
        phone: '05321234567',
        line1: 'Bağdat Caddesi No 128 Daire 5',
        district: 'Kadıköy',
        city: 'İstanbul',
        postalCode: '34710',
        ...overrides,
      })
      .expect(201);
    return response.body as AddressDto;
  }

  /** Walks story → illustrations → book → print render, the state an order needs. */
  async function printableBook(): Promise<BookDto> {
    const storyResponse = await context
      .http()
      .post('/stories')
      .set(...authHeader(parent))
      .send({
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['adventure'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advancedSettings: {},
        systemVoiceId,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const story = storyResponse.body as { story: { id: string }; job: AIJobDto };
    await waitForJob(context, parent, story.job.id);

    const illustrationResponse = await context
      .http()
      .post(`/stories/${story.story.id}/illustrations`)
      .set(...authHeader(parent))
      .send({ style: 'watercolor', idempotencyKey: randomUUID() })
      .expect(201);
    const set = illustrationResponse.body as { set: IllustrationSetDto; job: AIJobDto };
    await waitForJob(context, parent, set.job.id, { timeoutMs: 120_000 });

    const bookResponse = await context
      .http()
      .post('/books')
      .set(...authHeader(parent))
      .send({
        storyId: story.story.id,
        illustrationSetId: set.set.id,
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const book = bookResponse.body as BookDto;

    const renderResponse = await context
      .http()
      .post(`/books/${book.id}/renders`)
      .set(...authHeader(parent))
      .send({ kind: 'PRINT_PDF', idempotencyKey: randomUUID() })
      .expect(201);
    const render = renderResponse.body as { job: AIJobDto };
    const settled = await waitForJob(context, parent, render.job.id, { timeoutMs: 180_000 });
    expect(settled.status).toBe('COMPLETED');

    return book;
  }

  async function placeOrder(
    book: BookDto,
    address: AddressDto,
    overrides: Record<string, unknown> = {},
  ): Promise<OrderDto> {
    const response = await context
      .http()
      .post('/orders')
      .set(...authHeader(parent))
      .send({
        bookId: book.id,
        bookSize: 'SQUARE',
        coverType: 'HARDCOVER',
        quantity: 1,
        addressId: address.id,
        idempotencyKey: randomUUID(),
        ...overrides,
      })
      .expect(201);
    return response.body as OrderDto;
  }

  describe('addresses', () => {
    it('makes the first saved address the default', async () => {
      const first = await saveAddress();
      expect(first.isDefault).toBe(true);

      const second = await saveAddress({ fullName: 'Mehmet Yılmaz', isDefault: true });
      expect(second.isDefault).toBe(true);

      const list = await context
        .http()
        .get('/addresses')
        .set(...authHeader(parent))
        .expect(200);
      const addresses = list.body as AddressDto[];
      expect(addresses.filter((address) => address.isDefault)).toHaveLength(1);
    });

    it('normalises a Turkish phone number', async () => {
      const address = await saveAddress({ phone: '0532 123 45 67' });
      expect(address.phone).toBe('+905321234567');
    });

    it('refuses another parent’s address', async () => {
      const address = await saveAddress();
      const stranger = await signUp(context, { name: 'Mehmet' });

      await context
        .http()
        .patch(`/addresses/${address.id}`)
        .set(...authHeader(stranger))
        .send({ city: 'Ankara' })
        .expect(404);
    });
  });

  describe('pricing', () => {
    it('computes the price from the catalogue, never from the request', async () => {
      const book = await printableBook();
      const address = await saveAddress();

      const response = await context
        .http()
        .post('/orders/quote')
        .set(...authHeader(parent))
        .send({
          bookId: book.id,
          bookSize: 'SQUARE',
          coverType: 'HARDCOVER',
          quantity: 2,
          addressId: address.id,
          // A tampered client sending its own idea of the total.
          total: '1.00',
          unitPrice: '0.50',
        })
        .expect(201);

      const quote = response.body as PriceQuoteDto;
      const products = (
        await context.http().get('/print-products').set(...authHeader(parent)).expect(200)
      ).body as PrintProductDto[];
      const product = products.find(
        (item) => item.bookSize === 'SQUARE' && item.coverType === 'HARDCOVER',
      );

      expect(quote.total.amount).not.toBe('1.00');
      expect(Number(quote.unitPrice.amount)).toBeGreaterThanOrEqual(
        Number(product?.basePrice.amount ?? 0),
      );
      expect(quote.quantity).toBe(2);
      expect(quote.pageCount).toBe(book.pages.length);
      expect(quote.estimatedDeliveryDays.min).toBeGreaterThan(0);
    });

    it('charges a premium account less for the same configuration', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const payload = {
        bookId: book.id,
        bookSize: 'SQUARE',
        coverType: 'HARDCOVER',
        quantity: 1,
        addressId: address.id,
      };

      const free = (
        await context
          .http()
          .post('/orders/quote')
          .set(...authHeader(parent))
          .send(payload)
          .expect(201)
      ).body as PriceQuoteDto;
      expect(free.discount.amount).toBe('0.00');

      await context.prisma.client.user.update({
        where: { id: parent.userId },
        data: { subscriptionTier: 'PREMIUM', subscriptionStatus: 'ACTIVE' },
      });

      const premium = (
        await context
          .http()
          .post('/orders/quote')
          .set(...authHeader(parent))
          .send(payload)
          .expect(201)
      ).body as PriceQuoteDto;

      expect(Number(premium.discount.amount)).toBeGreaterThan(0);
      expect(Number(premium.total.amount)).toBeLessThan(Number(free.total.amount));
    });
  });

  describe('orders', () => {
    it('writes the server price onto the order, ignoring what the client sent', async () => {
      const book = await printableBook();
      const address = await saveAddress();

      const quote = (
        await context
          .http()
          .post('/orders/quote')
          .set(...authHeader(parent))
          .send({
            bookId: book.id,
            bookSize: 'SQUARE',
            coverType: 'HARDCOVER',
            quantity: 1,
            addressId: address.id,
          })
          .expect(201)
      ).body as PriceQuoteDto;

      const order = await placeOrder(book, address, { total: '1.00', subtotal: '1.00' });

      expect(order.total.amount).toBe(quote.total.amount);
      expect(order.subtotal.amount).toBe(quote.subtotal.amount);
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    });

    it('freezes the book so later edits cannot change what was ordered', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      const originalTitle = order.bookTitle;
      const firstPage = book.pages[0];
      if (!firstPage) throw new Error('book had no pages');

      await context
        .http()
        .patch(`/books/${book.id}`)
        .set(...authHeader(parent))
        .send({ title: 'Tamamen farklı bir başlık' })
        .expect(200);
      await context
        .http()
        .patch(`/book-pages/${firstPage.id}`)
        .set(...authHeader(parent))
        .send({ text: 'Sipariş verildikten sonra değiştirilmiş metin.' })
        .expect(200);

      const reread = await context
        .http()
        .get(`/orders/${order.id}`)
        .set(...authHeader(parent))
        .expect(200);
      const after = reread.body as OrderDto;

      expect(after.bookTitle).toBe(originalTitle);

      const row = await context.prisma.client.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      const snapshot = row.bookSnapshot as { pages: Array<{ text: string }> };
      expect(snapshot.pages[0]?.text).toBe(firstPage.text);
      expect(snapshot.pages[0]?.text).not.toContain('değiştirilmiş');
    });

    it('keeps shipping to the address as it was, even after it is deleted', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      await context
        .http()
        .delete(`/addresses/${address.id}`)
        .set(...authHeader(parent))
        .expect(204);

      const reread = await context
        .http()
        .get(`/orders/${order.id}`)
        .set(...authHeader(parent))
        .expect(200);
      const after = reread.body as OrderDto;

      expect(after.shippingAddress.line1).toBe('Bağdat Caddesi No 128 Daire 5');
      expect(after.shippingAddress.city).toBe('İstanbul');
    });

    it('returns the same order for a replayed submit', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const payload = {
        bookId: book.id,
        bookSize: 'SQUARE' as const,
        coverType: 'HARDCOVER' as const,
        quantity: 1,
        addressId: address.id,
        idempotencyKey: randomUUID(),
      };

      const first = await context
        .http()
        .post('/orders')
        .set(...authHeader(parent))
        .send(payload)
        .expect(201);
      const second = await context
        .http()
        .post('/orders')
        .set(...authHeader(parent))
        .send(payload)
        .expect(201);

      expect((second.body as OrderDto).id).toBe((first.body as OrderDto).id);
      expect(await context.prisma.client.order.count({ where: { userId: parent.userId } })).toBe(
        1,
      );
    });

    it('refuses to order a book that is not print-ready', async () => {
      const book = await printableBook();
      const address = await saveAddress();

      const firstPage = book.pages[0];
      if (!firstPage) throw new Error('book had no pages');
      await context.prisma.client.bookPage.update({
        where: { id: firstPage.id },
        data: { illustrationId: null },
      });

      const response = await context
        .http()
        .post('/orders')
        .set(...authHeader(parent))
        .send({
          bookId: book.id,
          bookSize: 'SQUARE',
          coverType: 'HARDCOVER',
          quantity: 1,
          addressId: address.id,
          idempotencyKey: randomUUID(),
        })
        .expect(400);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'BOOK_NOT_READY_FOR_PRINT',
      );
    });

    it('refuses another parent’s order', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      const stranger = await signUp(context, { name: 'Mehmet' });
      await context
        .http()
        .get(`/orders/${order.id}`)
        .set(...authHeader(stranger))
        .expect(404);
      await context
        .http()
        .post(`/orders/${order.id}/cancel`)
        .set(...authHeader(stranger))
        .expect(404);
    });
  });

  describe('payment', () => {
    /**
     * The mock declines roughly one order in eight, deterministically by order
     * number, so a developer sees the failure path. Tests that want a success
     * ask for orders until they get one that will go through.
     */
    async function payableOrder(): Promise<{ order: OrderDto; book: BookDto }> {
      const book = await printableBook();
      const address = await saveAddress();

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const order = await placeOrder(book, address, { idempotencyKey: randomUUID() });
        const initiation = await initiate(order);
        const verified = await context
          .http()
          .post('/payments/verify')
          .set(...authHeader(parent))
          .send({ orderId: order.id, providerPaymentId: initiation.providerPaymentId });

        if (verified.status === 201) {
          const fresh = await context
            .http()
            .get(`/orders/${order.id}`)
            .set(...authHeader(parent))
            .expect(200);
          return { order: fresh.body as OrderDto, book };
        }
      }
      throw new Error('no order was accepted by the mock acquirer');
    }

    async function initiate(order: OrderDto): Promise<PaymentInitiationDto> {
      const response = await context
        .http()
        .post('/payments/initiate')
        .set(...authHeader(parent))
        .send({
          orderId: order.id,
          returnUrl: 'https://masalim.app/payment/callback',
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      return response.body as PaymentInitiationDto;
    }

    it('returns a 3D Secure hand-off rather than a bare redirect', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      const initiation = await initiate(order);

      expect(initiation.checkout.kind).toBe('html_form');
      expect(initiation.providerPaymentId).toMatch(/^mock_pay_/);

      const events = await context.prisma.client.orderEvent.findMany({
        where: { orderId: order.id },
      });
      expect(events.map((event) => event.type)).toContain('PAYMENT_INITIATED');
    });

    it('replays the same hand-off for a repeated initiate', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);
      const key = randomUUID();

      const send = () =>
        context
          .http()
          .post('/payments/initiate')
          .set(...authHeader(parent))
          .send({
            orderId: order.id,
            returnUrl: 'https://masalim.app/payment/callback',
            idempotencyKey: key,
          })
          .expect(201);

      const first = (await send()).body as PaymentInitiationDto;
      const second = (await send()).body as PaymentInitiationDto;

      expect(second.providerPaymentId).toBe(first.providerPaymentId);
      // One authorisation against the card, not two.
      expect(await context.prisma.client.payment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('marks the order paid and sends it to the printer', async () => {
      const { order } = await payableOrder();

      expect(order.paymentStatus).toBe('PAID');
      expect(order.status).toBe('IN_PRODUCTION');
      expect(order.events.map((event) => event.type)).toEqual(
        expect.arrayContaining(['ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'SENT_TO_PRINTER']),
      );

      const row = await context.prisma.client.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(row.printProviderOrderId).toMatch(/^mock_print_/);

      const printStatus = await printer.getStatus(row.printProviderOrderId ?? '');
      expect(printStatus.status).toBe('received');
    });

    it('never stores raw provider payloads that could carry card data', async () => {
      const { order } = await payableOrder();

      const payment = await context.prisma.client.payment.findFirstOrThrow({
        where: { orderId: order.id, status: 'PAID' },
      });
      const payload = JSON.stringify(payment.redactedPayload);

      for (const forbidden of ['cardNumber', 'cvc', 'cvv', 'expiry', 'pan']) {
        expect(payload.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });

    it('does not let a client mark its own order paid', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      // A payment id that was never initiated here.
      await context
        .http()
        .post('/payments/verify')
        .set(...authHeader(parent))
        .send({ orderId: order.id, providerPaymentId: 'mock_pay_fabricated' })
        .expect(404);

      const row = await context.prisma.client.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(row.paymentStatus).toBe('PENDING');
      expect(payments.name).toBe('mock');
    });

    it('refuses to cancel once the book is on a press', async () => {
      const { order } = await payableOrder();

      const response = await context
        .http()
        .post(`/orders/${order.id}/cancel`)
        .set(...authHeader(parent))
        .expect(409);

      expect((response.body as { error: { code: string } }).error.code).toBe(
        'ORDER_NOT_CANCELLABLE',
      );
    });

    it('cancels an unpaid order', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      const order = await placeOrder(book, address);

      const cancelled = await context
        .http()
        .post(`/orders/${order.id}/cancel`)
        .set(...authHeader(parent))
        .expect(201);

      expect((cancelled.body as OrderDto).status).toBe('CANCELLED');
    });

    it('lists orders newest first', async () => {
      const book = await printableBook();
      const address = await saveAddress();
      await placeOrder(book, address);
      await placeOrder(book, address);

      const response = await context
        .http()
        .get('/orders')
        .set(...authHeader(parent))
        .expect(200);
      const page = response.body as Paginated<OrderSummaryDto>;

      expect(page.items).toHaveLength(2);
      const [first, second] = page.items;
      if (!first || !second) throw new Error('expected two orders');
      expect(new Date(first.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(second.createdAt).getTime(),
      );
    });
  });

  describe('subscriptions', () => {
    it('reports free entitlements and real usage', async () => {
      const response = await context
        .http()
        .get('/subscription/entitlements')
        .set(...authHeader(parent))
        .expect(200);
      const entitlements = response.body as EntitlementsResponse;

      expect(entitlements.tier).toBe('FREE');
      expect(entitlements.entitlements.parent_voice_clone).toBe(false);
      expect(entitlements.usage.story_monthly_limit.limit).toBe(4);
      expect(entitlements.usage.story_monthly_limit.used).toBe(0);
    });

    it('grants premium only through the provider, never from the client', async () => {
      const before = await context
        .http()
        .get('/subscription')
        .set(...authHeader(parent))
        .expect(200);
      expect((before.body as SubscriptionDto).tier).toBe('FREE');

      // Refreshing without a purchase changes nothing.
      const unchanged = await context
        .http()
        .post('/subscription/refresh')
        .set(...authHeader(parent))
        .expect(201);
      expect((unchanged.body as SubscriptionDto).tier).toBe('FREE');

      // A verified webhook is the only path that grants it.
      await context
        .http()
        .post('/subscription/webhook')
        .send({ eventId: randomUUID(), type: 'INITIAL_PURCHASE', userId: parent.userId, active: true })
        .expect(202);

      const after = await context
        .http()
        .get('/subscription')
        .set(...authHeader(parent))
        .expect(200);
      const subscription = after.body as SubscriptionDto;
      expect(subscription.tier).toBe('PREMIUM');
      expect(subscription.status).toBe('ACTIVE');

      const entitlements = (
        await context
          .http()
          .get('/subscription/entitlements')
          .set(...authHeader(parent))
          .expect(200)
      ).body as EntitlementsResponse;
      expect(entitlements.entitlements.parent_voice_clone).toBe(true);
    });

    it('ignores a replayed webhook', async () => {
      const eventId = randomUUID();
      const body = {
        eventId,
        type: 'INITIAL_PURCHASE',
        userId: parent.userId,
        active: true,
      };

      await context.http().post('/subscription/webhook').send(body).expect(202);
      await context.http().post('/subscription/webhook').send(body).expect(202);

      const subscription = await context.prisma.client.subscription.findUniqueOrThrow({
        where: { userId: parent.userId },
      });
      const events = await context.prisma.client.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id },
      });
      expect(events.filter((event) => event.providerEventId === eventId)).toHaveLength(1);
    });

    it('drops a webhook for a user who does not exist', async () => {
      await context
        .http()
        .post('/subscription/webhook')
        .send({ eventId: randomUUID(), type: 'INITIAL_PURCHASE', userId: 'nope', active: true })
        .expect(202);

      expect(await context.prisma.client.subscription.count()).toBe(0);
    });
  });
});
