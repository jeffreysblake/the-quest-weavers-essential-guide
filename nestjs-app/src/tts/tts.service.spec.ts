import { Test, TestingModule } from '@nestjs/testing';
import { TTSService } from './tts.service';
import { KokoroTTSProvider } from './providers/kokoro-tts.provider';
import { PythonTTSProvider } from './providers/python-tts.provider';
import { HttpTTSProvider } from './providers/http-tts.provider';

describe('TTSService', () => {
  let service: TTSService;
  let kokoroProvider: jest.Mocked<KokoroTTSProvider>;
  let pythonProvider: jest.Mocked<PythonTTSProvider>;
  let httpProvider: jest.Mocked<HttpTTSProvider>;

  beforeEach(async () => {
    // Create mock providers
    kokoroProvider = {
      name: 'kokoro',
      supportedVoices: ['af_bella', 'am_adam'],
      supportedFormats: ['wav', 'mp3'],
      generateSpeech: jest.fn(),
      isAvailable: jest.fn(),
      getVRAMUsage: jest.fn(() => 512),
    } as any;

    pythonProvider = {
      name: 'python-tts',
      supportedVoices: ['default'],
      supportedFormats: ['wav'],
      generateSpeech: jest.fn(),
      isAvailable: jest.fn(),
      getVRAMUsage: jest.fn(() => 2048),
    } as any;

    httpProvider = {
      name: 'http-tts',
      supportedVoices: [],
      supportedFormats: ['mp3'],
      generateSpeech: jest.fn(),
      isAvailable: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TTSService],
    }).compile();

    service = module.get<TTSService>(TTSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerProvider', () => {
    it('should register a provider as primary', () => {
      service.registerProvider(kokoroProvider, true);
      expect(service.getProviders()).toContain('kokoro');
    });

    it('should register multiple providers', () => {
      service.registerProvider(kokoroProvider, true);
      service.registerProvider(pythonProvider, false);
      expect(service.getProviders()).toHaveLength(2);
    });
  });

  describe('generateSpeech', () => {
    beforeEach(() => {
      kokoroProvider.generateSpeech.mockResolvedValue({
        audioBuffer: Buffer.from('fake-audio'),
        format: 'wav',
        voice: 'af_bella',
      });
      service.registerProvider(kokoroProvider, true);
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'kokoro';
    });

    it('should generate speech using primary provider', async () => {
      const result = await service.generateSpeech('Hello world', {
        voice: 'af_bella',
      });

      expect(kokoroProvider.generateSpeech).toHaveBeenCalledWith(
        'Hello world',
        { voice: 'af_bella' },
      );
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.format).toBe('wav');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = new TTSService();
      await expect(uninitializedService.generateSpeech('test')).rejects.toThrow(
        'TTS service is not initialized',
      );
    });

    it('should fallback to another provider on failure', async () => {
      pythonProvider.generateSpeech.mockResolvedValue({
        audioBuffer: Buffer.from('fallback-audio'),
        format: 'wav',
        voice: 'default',
      });

      service.registerProvider(pythonProvider, false);
      kokoroProvider.generateSpeech.mockRejectedValueOnce(
        new Error('Provider failed'),
      );

      const result = await service.generateSpeech('Hello');

      expect(pythonProvider.generateSpeech).toHaveBeenCalled();
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
    });
  });

  describe('getAvailableVoices', () => {
    it('should return all voices from all providers', () => {
      service.registerProvider(kokoroProvider, true);
      service.registerProvider(pythonProvider, false);

      const voices = service.getAvailableVoices();

      expect(voices).toEqual(
        expect.arrayContaining([
          { voice: 'af_bella', provider: 'kokoro' },
          { voice: 'am_adam', provider: 'kokoro' },
          { voice: 'default', provider: 'python-tts' },
        ]),
      );
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      service.registerProvider(kokoroProvider, true);
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'kokoro';

      const stats = service.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.primaryProvider).toBe('kokoro');
      expect(stats.availableProviders).toBe(1);
      expect(stats.totalVoices).toBe(2);
    });
  });

  describe('getTotalVRAMUsage', () => {
    it('should calculate total VRAM usage across providers', () => {
      service.registerProvider(kokoroProvider, true);
      service.registerProvider(pythonProvider, false);

      const totalVRAM = service.getTotalVRAMUsage();

      expect(totalVRAM).toBe(2560); // 512 + 2048
    });
  });

  describe('isAvailable', () => {
    it('should return false when not initialized', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when initialized with primary provider', () => {
      (service as any).isInitialized = true;
      (service as any).primaryProvider = 'kokoro';

      expect(service.isAvailable()).toBe(true);
    });
  });
});
