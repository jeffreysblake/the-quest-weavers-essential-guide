import { Test, TestingModule } from '@nestjs/testing';
import { STTService } from './stt.service';
import { PythonWhisperProvider } from './providers/python-whisper.provider';
import { HttpWhisperProvider } from './providers/http-whisper.provider';

describe('STTService', () => {
  let service: STTService;
  let pythonProvider: jest.Mocked<PythonWhisperProvider>;
  let httpProvider: jest.Mocked<HttpWhisperProvider>;

  beforeEach(async () => {
    pythonProvider = {
      name: 'python-whisper',
      supportedLanguages: ['en', 'es', 'fr'],
      supportedModels: ['tiny', 'base', 'small', 'medium'],
      transcribe: jest.fn(),
      transcribeFile: jest.fn(),
      isAvailable: jest.fn(),
      getVRAMUsage: jest.fn(() => 2048),
    } as any;

    httpProvider = {
      name: 'http-whisper',
      supportedLanguages: ['auto', 'en'],
      supportedModels: ['base', 'small'],
      transcribe: jest.fn(),
      transcribeFile: jest.fn(),
      isAvailable: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [STTService],
    }).compile();

    service = module.get<STTService>(STTService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerProvider', () => {
    it('should register a provider as primary', () => {
      service.registerProvider(pythonProvider, true);
      expect(service.getProviders()).toContain('python-whisper');
    });

    it('should register multiple providers', () => {
      service.registerProvider(pythonProvider, true);
      service.registerProvider(httpProvider, false);
      expect(service.getProviders()).toHaveLength(2);
    });
  });

  describe('transcribe', () => {
    const mockAudioBuffer = Buffer.from('fake-audio-data');
    const mockResult = {
      text: 'Hello, this is a test.',
      language: 'en',
      languageProbability: 0.98,
      duration: 3.5,
    };

    beforeEach(() => {
      pythonProvider.transcribe.mockResolvedValue(mockResult);
      service.registerProvider(pythonProvider, true);
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'python-whisper';
      (service as any).totalTranscriptions = 0;
    });

    it('should transcribe audio using primary provider', async () => {
      const result = await service.transcribe(mockAudioBuffer, {
        language: 'en',
        model: 'small',
      });

      expect(pythonProvider.transcribe).toHaveBeenCalledWith(mockAudioBuffer, {
        language: 'en',
        model: 'small',
      });
      expect(result.text).toBe('Hello, this is a test.');
      expect(result.language).toBe('en');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = new STTService();
      await expect(
        uninitializedService.transcribe(mockAudioBuffer),
      ).rejects.toThrow('STT service is not initialized');
    });

    it('should track transcription statistics', async () => {
      await service.transcribe(mockAudioBuffer);

      const stats = service.getStats();
      expect(stats.totalTranscriptions).toBe(1);
    });

    it('should fallback to another provider on failure', async () => {
      httpProvider.transcribe.mockResolvedValue(mockResult);
      service.registerProvider(httpProvider, false);
      pythonProvider.transcribe.mockRejectedValueOnce(
        new Error('Provider failed'),
      );

      const result = await service.transcribe(mockAudioBuffer);

      expect(httpProvider.transcribe).toHaveBeenCalled();
      expect(result.text).toBe('Hello, this is a test.');
    });
  });

  describe('transcribeFile', () => {
    const mockFilePath = '/tmp/test-audio.wav';
    const mockResult = {
      text: 'File transcription test.',
      language: 'en',
    };

    beforeEach(() => {
      pythonProvider.transcribeFile.mockResolvedValue(mockResult);
      service.registerProvider(pythonProvider, true);
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'python-whisper';
    });

    it('should transcribe file using primary provider', async () => {
      const result = await service.transcribeFile(mockFilePath, {
        language: 'en',
      });

      expect(pythonProvider.transcribeFile).toHaveBeenCalledWith(mockFilePath, {
        language: 'en',
      });
      expect(result.text).toBe('File transcription test.');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages from all providers', () => {
      service.registerProvider(pythonProvider, true);
      service.registerProvider(httpProvider, false);

      const languages = service.getSupportedLanguages();

      expect(languages).toEqual(
        expect.arrayContaining([
          { language: 'en', provider: 'python-whisper' },
          { language: 'es', provider: 'python-whisper' },
          { language: 'auto', provider: 'http-whisper' },
        ]),
      );
    });
  });

  describe('getSupportedModels', () => {
    it('should return all supported models with VRAM usage', () => {
      service.registerProvider(pythonProvider, true);

      const models = service.getSupportedModels();

      expect(models).toEqual(
        expect.arrayContaining([
          { model: 'tiny', provider: 'python-whisper', vramUsage: 2048 },
          { model: 'small', provider: 'python-whisper', vramUsage: 2048 },
        ]),
      );
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      service.registerProvider(pythonProvider, true);
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'python-whisper';
      (service as any).totalTranscriptions = 5;
      (service as any).totalAudioDuration = 45.5;

      const stats = service.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.primaryProvider).toBe('python-whisper');
      expect(stats.availableProviders).toBe(1);
      expect(stats.totalTranscriptions).toBe(5);
      expect(stats.totalAudioDuration).toBe(45.5);
    });
  });

  describe('isAvailable', () => {
    it('should return false when not initialized', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when initialized with primary provider', () => {
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'python-whisper';

      expect(service.isAvailable()).toBe(true);
    });
  });
});
