#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CLIService } from './cli/cli.service';

async function bootstrap() {
  // Create NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    // Get CLI service
    const cliService = app.get(CLIService);

    // Run CLI with command line arguments
    await cliService.run(process.argv);
  } catch (error) {
    console.error('CLI Error:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
