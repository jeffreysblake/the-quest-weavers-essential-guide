import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private nestConfig: NestConfigService) {}

  // Get configuration values with defaults
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.nestConfig.get(key, defaultValue);
  }

  // Specific configuration getters
  getDatabaseUrl(): string {
    return this.nestConfig.get<string>('DATABASE_URL') || 'sqlite://db.sqlite';
  }

  getPort(): number {
    return this.nestConfig.get<number>('PORT') || 3000;
  }

  isDevelopment(): boolean {
    return this.nestConfig.get<string>('NODE_ENV') === 'development';
  }

  // Get all configuration as an object
  getAll(): Record<string, any> {
    return {
      port: this.getPort(),
      databaseUrl: this.getDatabaseUrl(),
      environment: this.isDevelopment() ? 'development' : 'production',
    };
  }
}
