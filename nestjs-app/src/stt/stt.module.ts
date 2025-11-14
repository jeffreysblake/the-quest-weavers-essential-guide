import { Module, Global, Logger } from '@nestjs/common';
import { STTService } from './stt.service';
import { STTController } from './stt.controller';
import { PythonWhisperProvider } from './providers/python-whisper.provider';
import { HttpWhisperProvider } from './providers/http-whisper.provider';

@Global()
@Module({
  controllers: [STTController],
  providers: [
    STTService,
    PythonWhisperProvider,
    HttpWhisperProvider,
    {
      provide: 'STT_INITIALIZER',
      useFactory: async (
        sttService: STTService,
        pythonProvider: PythonWhisperProvider,
        httpProvider: HttpWhisperProvider,
      ) => {
        const logger = new Logger('STTModule');

        // Register available providers
        const providers: Array<{ provider: any; priority: number }> = [];

        // Check which providers should be enabled
        const enablePython = process.env.STT_PYTHON_ENABLED !== 'false';
        const enableHttp = process.env.STT_HTTP_ENABLED === 'true';

        if (enablePython) {
          const available = await pythonProvider.isAvailable();
          if (available) {
            providers.push({ provider: pythonProvider, priority: 1 });
            logger.log('Python Whisper provider is available');
          } else {
            logger.warn('Python Whisper provider is not available');
            logger.warn(
              'To enable: Install Python 3.8+ and openai-whisper or faster-whisper',
            );
          }
        }

        if (enableHttp) {
          const available = await httpProvider.isAvailable();
          if (available) {
            providers.push({ provider: httpProvider, priority: 2 });
            logger.log('HTTP Whisper provider is available');
          } else {
            logger.warn('HTTP Whisper provider is not available');
            logger.warn(
              'To enable: Set STT_API_URL to your Whisper server endpoint',
            );
          }
        }

        if (providers.length === 0) {
          logger.warn(
            'No STT providers available. Speech-to-text features will be disabled.',
          );
          logger.warn('Setup options:');
          logger.warn(
            '  1. Python Whisper: Install openai-whisper or faster-whisper',
          );
          logger.warn(
            '  2. HTTP API: Configure STT_API_URL and set STT_HTTP_ENABLED=true',
          );
          return sttService;
        }

        // Sort by priority and register
        providers.sort((a, b) => a.priority - b.priority);
        providers.forEach((item, index) => {
          sttService.registerProvider(item.provider, index === 0);
        });

        logger.log(
          `STT Module initialized with ${providers.length} provider(s)`,
        );

        return sttService;
      },
      inject: [STTService, PythonWhisperProvider, HttpWhisperProvider],
    },
  ],
  exports: [STTService],
})
export class STTModule {
  private readonly logger = new Logger(STTModule.name);

  constructor(private readonly sttService: STTService) {
    // Log module status after initialization
    setTimeout(() => {
      this.logStatus();
    }, 1000);
  }

  private logStatus(): void {
    const stats = this.sttService.getStats();
    this.logger.log(`STT Module Status:
      - Initialized: ${stats.initialized}
      - Primary Provider: ${stats.primaryProvider || 'none'}
      - Available Providers: ${stats.availableProviders}
      - Total Transcriptions: ${stats.totalTranscriptions}
    `);
  }
}
