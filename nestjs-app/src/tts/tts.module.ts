import { Module, Global, Logger } from '@nestjs/common';
import { TTSService } from './tts.service';
import { TTSController } from './tts.controller';
import { PythonTTSProvider } from './providers/python-tts.provider';
import { HttpTTSProvider } from './providers/http-tts.provider';

@Global()
@Module({
  controllers: [TTSController],
  providers: [
    TTSService,
    PythonTTSProvider,
    HttpTTSProvider,
    {
      provide: 'TTS_INITIALIZER',
      useFactory: async (
        ttsService: TTSService,
        pythonProvider: PythonTTSProvider,
        httpProvider: HttpTTSProvider,
      ) => {
        const logger = new Logger('TTSModule');

        // Register available providers
        const providers: Array<{ provider: any; priority: number }> = [];

        // Check which providers should be enabled
        const enablePython = process.env.TTS_PYTHON_ENABLED !== 'false';
        const enableHttp = process.env.TTS_HTTP_ENABLED === 'true';

        if (enablePython) {
          const available = await pythonProvider.isAvailable();
          if (available) {
            providers.push({ provider: pythonProvider, priority: 1 });
            logger.log('Python TTS provider is available');
          } else {
            logger.warn('Python TTS provider is not available');
          }
        }

        if (enableHttp) {
          const available = await httpProvider.isAvailable();
          if (available) {
            providers.push({ provider: httpProvider, priority: 2 });
            logger.log('HTTP TTS provider is available');
          } else {
            logger.warn('HTTP TTS provider is not available');
          }
        }

        if (providers.length === 0) {
          logger.warn('No TTS providers available. TTS features will be disabled.');
          logger.warn('To enable TTS:');
          logger.warn('  - Set up Python with TTS library (Coqui, Piper, etc.)');
          logger.warn('  - Or configure TTS_API_URL for HTTP-based TTS service');
          return ttsService;
        }

        // Sort by priority and register
        providers.sort((a, b) => a.priority - b.priority);
        providers.forEach((item, index) => {
          ttsService.registerProvider(item.provider, index === 0);
        });

        logger.log(`TTS Module initialized with ${providers.length} provider(s)`);

        return ttsService;
      },
      inject: [TTSService, PythonTTSProvider, HttpTTSProvider],
    },
  ],
  exports: [TTSService],
})
export class TTSModule {
  private readonly logger = new Logger(TTSModule.name);

  constructor(private readonly ttsService: TTSService) {
    // Log module status after initialization
    setTimeout(() => {
      this.logStatus();
    }, 1000);
  }

  private logStatus(): void {
    const stats = this.ttsService.getStats();
    this.logger.log(`TTS Module Status:
      - Initialized: ${stats.initialized}
      - Primary Provider: ${stats.primaryProvider || 'none'}
      - Available Providers: ${stats.availableProviders}
      - Total Voices: ${stats.totalVoices}
    `);
  }
}
