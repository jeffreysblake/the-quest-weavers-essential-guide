import { Module, Global, Logger } from '@nestjs/common';
import { TTSService } from './tts.service';
import { TTSController } from './tts.controller';
import { KokoroTTSProvider } from './providers/kokoro-tts.provider';
import { PythonTTSProvider } from './providers/python-tts.provider';
import { HttpTTSProvider } from './providers/http-tts.provider';

@Global()
@Module({
  controllers: [TTSController],
  providers: [
    TTSService,
    KokoroTTSProvider,
    PythonTTSProvider,
    HttpTTSProvider,
    {
      provide: 'TTS_INITIALIZER',
      useFactory: async (
        ttsService: TTSService,
        kokoroProvider: KokoroTTSProvider,
        pythonProvider: PythonTTSProvider,
        httpProvider: HttpTTSProvider,
      ) => {
        const logger = new Logger('TTSModule');

        // Register available providers with priority
        const providers: Array<{ provider: any; priority: number; name: string }> = [];

        // Check which providers should be enabled
        const enableKokoro = process.env.TTS_KOKORO_ENABLED !== 'false'; // Enabled by default
        const enablePython = process.env.TTS_PYTHON_ENABLED === 'true';
        const enableHttp = process.env.TTS_HTTP_ENABLED === 'true';

        // Priority 1: Kokoro (native, fastest, GPU support)
        if (enableKokoro) {
          const available = await kokoroProvider.isAvailable();
          if (available) {
            providers.push({ provider: kokoroProvider, priority: 1, name: 'Kokoro' });
            logger.log('Kokoro TTS provider is available (native Node.js, GPU-capable)');
          } else {
            logger.warn('Kokoro TTS provider is not available');
            logger.warn('To enable: npm install kokoro-js --legacy-peer-deps');
          }
        }

        // Priority 2: Python TTS
        if (enablePython) {
          const available = await pythonProvider.isAvailable();
          if (available) {
            providers.push({ provider: pythonProvider, priority: 2, name: 'Python' });
            logger.log('Python TTS provider is available');
          } else {
            logger.warn('Python TTS provider is not available');
          }
        }

        // Priority 3: HTTP TTS
        if (enableHttp) {
          const available = await httpProvider.isAvailable();
          if (available) {
            providers.push({ provider: httpProvider, priority: 3, name: 'HTTP' });
            logger.log('HTTP TTS provider is available');
          } else {
            logger.warn('HTTP TTS provider is not available');
          }
        }

        if (providers.length === 0) {
          logger.warn('No TTS providers available. TTS features will be disabled.');
          logger.warn('To enable TTS:');
          logger.warn('  1. Native (recommended): npm install kokoro-js --legacy-peer-deps');
          logger.warn('  2. Python: Set up Python with TTS library (Coqui, Piper, etc.)');
          logger.warn('  3. HTTP: Configure TTS_API_URL for HTTP-based TTS service');
          return ttsService;
        }

        // Sort by priority and register
        providers.sort((a, b) => a.priority - b.priority);
        providers.forEach((item, index) => {
          ttsService.registerProvider(item.provider, index === 0);
        });

        logger.log(`TTS Module initialized with ${providers.length} provider(s)`);
        logger.log(`Primary provider: ${providers[0].name}`);

        return ttsService;
      },
      inject: [TTSService, KokoroTTSProvider, PythonTTSProvider, HttpTTSProvider],
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
    const vramUsage = this.ttsService.getTotalVRAMUsage();

    this.logger.log(`TTS Module Status:
      - Initialized: ${stats.initialized}
      - Primary Provider: ${stats.primaryProvider || 'none'}
      - Available Providers: ${stats.availableProviders}
      - Total Voices: ${stats.totalVoices}
      - VRAM Usage: ${vramUsage}MB
    `);
  }
}
