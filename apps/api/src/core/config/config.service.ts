import { Injectable } from '@nestjs/common';
import { parseEnv, type Env } from './config.schema';

@Injectable()
export class AppConfigService {
  private readonly env: Env;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.env = parseEnv(source);
  }

  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }

  get all(): Readonly<Env> {
    return this.env;
  }

  get isProduction(): boolean {
    return this.env.APP_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
}
