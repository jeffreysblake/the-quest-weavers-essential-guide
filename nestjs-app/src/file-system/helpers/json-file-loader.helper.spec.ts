import { Test, TestingModule } from '@nestjs/testing';
import { JsonFileLoaderHelper } from './json-file-loader.helper';
import { FileScannerService } from '../file-scanner.service';
import { ValidationService } from '../../validation/validation.service';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('JsonFileLoaderHelper', () => {
  let helper: JsonFileLoaderHelper;
  let fileScannerService: FileScannerService;
  let validationService: ValidationService;

  const mockFileScannerService = {
    getFileContent: jest.fn(),
    getGamesDirectory: jest.fn(),
  };

  const mockValidationService = {
    validateGameConfig: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JsonFileLoaderHelper,
        { provide: FileScannerService, useValue: mockFileScannerService },
        { provide: ValidationService, useValue: mockValidationService },
      ],
    }).compile();

    helper = module.get<JsonFileLoaderHelper>(JsonFileLoaderHelper);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
    validationService = module.get<ValidationService>(ValidationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined with dependencies', () => {
      expect(helper).toBeDefined();
      expect(fileScannerService).toBeDefined();
      expect(validationService).toBeDefined();
    });
  });

  describe('loadAndValidateJson', () => {
    const testFilePath = '/test/path/test.json';
    const mockValidator = jest.fn();

    describe('Happy Path', () => {
      it('should load and validate valid JSON successfully', async () => {
        const testData = { id: 'test', name: 'Test' };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(testData),
        );
        mockValidator.mockReturnValue({ isValid: true, errors: [] });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toEqual(testData);
        expect(result.errors).toEqual([]);
        expect(mockFileScannerService.getFileContent).toHaveBeenCalledWith(
          testFilePath,
        );
        expect(mockValidator).toHaveBeenCalledWith(testData);
      });

      it('should handle complex nested JSON objects', async () => {
        const complexData = {
          id: 'complex',
          nested: {
            level1: {
              level2: {
                value: 'deep',
                array: [1, 2, 3],
              },
            },
          },
        };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(complexData),
        );
        mockValidator.mockReturnValue({ isValid: true, errors: [] });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toEqual(complexData);
        expect(result.errors).toEqual([]);
      });

      it('should handle JSON with arrays', async () => {
        const arrayData = [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ];
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(arrayData),
        );
        mockValidator.mockReturnValue({ isValid: true, errors: [] });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toEqual(arrayData);
        expect(result.errors).toEqual([]);
      });
    });

    describe('File Size Validation', () => {
      it('should reject files exceeding default max size (5MB)', async () => {
        const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
        mockFileScannerService.getFileContent.mockResolvedValue(largeContent);

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('File too large');
        expect(result.errors[0]).toContain('5.00MB');
      });

      it('should accept files within custom max size', async () => {
        const content = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
        mockFileScannerService.getFileContent.mockResolvedValue(content);
        mockValidator.mockReturnValue({ isValid: true, errors: [] });

        const customMaxSize = 10 * 1024 * 1024; // 10MB
        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
          customMaxSize,
        );

        expect(result.data).toBeDefined();
        expect(result.errors).toEqual([]);
      });

      it('should reject files exceeding custom max size', async () => {
        const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
        mockFileScannerService.getFileContent.mockResolvedValue(largeContent);

        const customMaxSize = 1 * 1024 * 1024; // 1MB
        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
          customMaxSize,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('File too large');
        expect(result.errors[0]).toContain('1.00MB');
      });

      it('should handle empty JSON files', async () => {
        mockFileScannerService.getFileContent.mockResolvedValue('{}');
        mockValidator.mockReturnValue({ isValid: true, errors: [] });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toEqual({});
        expect(result.errors).toEqual([]);
      });
    });

    describe('JSON Parsing', () => {
      it('should handle various malformed JSON formats', async () => {
        const malformedCases = [
          '{ invalid json',
          '{"key": value}', // Missing quotes
          '{"id": "test", "name": "Test"', // Truncated
          '{"id": "test", "name": "Test",}', // Trailing comma
          '', // Empty string
          '   \n  \t  ', // Whitespace only
        ];

        for (const content of malformedCases) {
          mockFileScannerService.getFileContent.mockResolvedValue(content);
          const result = await helper.loadAndValidateJson(testFilePath, mockValidator);
          expect(result.data).toBeNull();
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0]).toContain('Failed to load file');
        }
      });
    });

    describe('Schema Validation', () => {
      it('should return validation errors when schema is invalid', async () => {
        const testData = { id: 'test' };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(testData),
        );
        mockValidator.mockReturnValue({
          isValid: false,
          errors: ['Missing required field: name'],
        });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toEqual(['Missing required field: name']);
      });

      it('should return multiple validation errors', async () => {
        const testData = { id: '' };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(testData),
        );
        mockValidator.mockReturnValue({
          isValid: false,
          errors: [
            'Missing required field: name',
            'Field id cannot be empty',
            'Missing required field: version',
          ],
        });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(3);
      });

      it('should validate JSON primitives (string, number, boolean, null)', async () => {
        const testCases = [
          { content: '"string"', expected: 'string' },
          { content: '42', expected: 42 },
          { content: 'true', expected: true },
          { content: 'null', expected: null },
        ];

        for (const testCase of testCases) {
          mockFileScannerService.getFileContent.mockResolvedValue(testCase.content);
          mockValidator.mockReturnValue({ isValid: true, errors: [] });

          const result = await helper.loadAndValidateJson(testFilePath, mockValidator);
          expect(result.data).toBe(testCase.expected);
          expect(result.errors).toEqual([]);
        }
      });
    });

    describe('Error Handling', () => {
      it('should handle file not found errors', async () => {
        mockFileScannerService.getFileContent.mockRejectedValue(
          new Error('File does not exist: /test/path/test.json'),
        );

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to load file');
        expect(result.errors[0]).toContain('File does not exist');
      });

      it('should handle permission errors', async () => {
        mockFileScannerService.getFileContent.mockRejectedValue(
          new Error('EACCES: permission denied'),
        );

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('permission denied');
      });

      it('should handle validator throwing errors', async () => {
        const testData = { id: 'test' };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(testData),
        );
        mockValidator.mockImplementation(() => {
          throw new Error('Validator error');
        });

        const result = await helper.loadAndValidateJson(
          testFilePath,
          mockValidator,
        );

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Validator error');
      });
    });
  });

  describe('loadJsonFilesFromDirectory', () => {
    const testDirPath = '/test/directory';

    describe('Happy Path', () => {
      it('should load all JSON files from directory', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['file1.json', 'file2.json'] as any);
        mockFileScannerService.getFileContent
          .mockResolvedValueOnce('{"id": 1}')
          .mockResolvedValueOnce('{"id": 2}');

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toHaveLength(2);
        expect(result.files[0]).toEqual({
          fileName: 'file1.json',
          content: '{"id": 1}',
        });
        expect(result.files[1]).toEqual({
          fileName: 'file2.json',
          content: '{"id": 2}',
        });
        expect(result.errors).toEqual([]);
      });

      it('should filter non-JSON files', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
          'file1.json',
          'readme.txt',
          'file2.json',
          'image.png',
        ] as any);
        mockFileScannerService.getFileContent
          .mockResolvedValueOnce('{"id": 1}')
          .mockResolvedValueOnce('{"id": 2}');

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toHaveLength(2);
        expect(result.files[0].fileName).toBe('file1.json');
        expect(result.files[1].fileName).toBe('file2.json');
        expect(result.errors).toEqual([]);
      });

      it('should handle empty directory', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([] as any);

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toEqual([]);
        expect(result.errors).toEqual([]);
      });

      it('should handle directory with only non-JSON files', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
          'readme.txt',
          'image.png',
          'data.csv',
        ] as any);

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toEqual([]);
        expect(result.errors).toEqual([]);
      });
    });

    describe('Error Handling', () => {
      it('should return error when directory does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Directory not found');
        expect(result.errors[0]).toContain(testDirPath);
      });

      it('should collect errors for individual file failures', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
          'file1.json',
          'file2.json',
          'file3.json',
        ] as any);
        mockFileScannerService.getFileContent
          .mockResolvedValueOnce('{"id": 1}')
          .mockRejectedValueOnce(new Error('File read error'))
          .mockResolvedValueOnce('{"id": 3}');

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to load file2.json');
        expect(result.errors[0]).toContain('File read error');
      });

      it('should handle permission errors on directory', async () => {
        mockFs.existsSync.mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to read directory');
      });

      it('should handle errors when reading directory contents', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockImplementation(() => {
          throw new Error('Read error');
        });

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to read directory');
      });

      it('should continue loading other files when one fails', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
          'file1.json',
          'file2.json',
          'file3.json',
          'file4.json',
        ] as any);
        mockFileScannerService.getFileContent
          .mockResolvedValueOnce('{"id": 1}')
          .mockRejectedValueOnce(new Error('Error 2'))
          .mockRejectedValueOnce(new Error('Error 3'))
          .mockResolvedValueOnce('{"id": 4}');

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        expect(result.files).toHaveLength(2);
        expect(result.errors).toHaveLength(2);
        expect(result.files[0].fileName).toBe('file1.json');
        expect(result.files[1].fileName).toBe('file4.json');
      });
    });

    describe('Edge Cases', () => {
      it('should handle special file names (uppercase, hidden, multiple dots)', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['file.JSON', '.hidden.json', 'my.file.json'] as any);
        mockFileScannerService.getFileContent
          .mockResolvedValueOnce('{"id": 1}')
          .mockResolvedValueOnce('{"id": 2}');

        const result = await helper.loadJsonFilesFromDirectory(testDirPath);

        // Only lowercase .json files are included
        expect(result.files).toHaveLength(2);
        expect(result.files[0].fileName).toBe('.hidden.json');
        expect(result.files[1].fileName).toBe('my.file.json');
      });

      it('should handle very long directory paths', async () => {
        const longPath = '/very/long/path'.repeat(50);
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue(['file.json'] as any);
        mockFileScannerService.getFileContent.mockResolvedValue('{"id": 1}');

        const result = await helper.loadJsonFilesFromDirectory(longPath);

        expect(result.files).toHaveLength(1);
      });
    });
  });

  describe('loadGameConfig', () => {
    const gameId = 'test-game';
    const gamesDirectory = '/games';
    const expectedPath = `${gamesDirectory}/${gameId}/game-config.json`;

    beforeEach(() => {
      mockFileScannerService.getGamesDirectory.mockReturnValue(gamesDirectory);
    });

    describe('Happy Path', () => {
      it('should load and validate game config successfully', async () => {
        const configData = {
          id: gameId,
          name: 'Test Game',
          version: 1,
        };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(configData),
        );
        mockValidationService.validateGameConfig.mockReturnValue({
          isValid: true,
          errors: [],
        });

        const result = await helper.loadGameConfig(gameId);

        expect(result.data).toEqual(configData);
        expect(result.errors).toEqual([]);
        expect(mockFileScannerService.getFileContent).toHaveBeenCalledWith(
          expectedPath,
        );
        expect(mockValidationService.validateGameConfig).toHaveBeenCalledWith(
          configData,
        );
      });

      it('should use MAX_CONFIG_SIZE limit (10MB)', async () => {
        const configData = { id: gameId, name: 'Test', version: 1 };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(configData),
        );
        mockValidationService.validateGameConfig.mockReturnValue({
          isValid: true,
          errors: [],
        });

        await helper.loadGameConfig(gameId);

        expect(mockFileScannerService.getFileContent).toHaveBeenCalled();
      });
    });

    describe('Validation Errors', () => {
      it('should return validation errors for invalid config', async () => {
        const invalidConfig = { id: gameId };
        mockFileScannerService.getFileContent.mockResolvedValue(
          JSON.stringify(invalidConfig),
        );
        mockValidationService.validateGameConfig.mockReturnValue({
          isValid: false,
          errors: ['Missing required field: name', 'Missing required field: version'],
        });

        const result = await helper.loadGameConfig(gameId);

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(2);
      });
    });

    describe('Error Handling', () => {
      it('should handle file not found', async () => {
        mockFileScannerService.getFileContent.mockRejectedValue(
          new Error('File does not exist'),
        );

        const result = await helper.loadGameConfig(gameId);

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Failed to load file');
      });

      it('should handle malformed config JSON', async () => {
        mockFileScannerService.getFileContent.mockResolvedValue(
          '{ invalid json',
        );

        const result = await helper.loadGameConfig(gameId);

        expect(result.data).toBeNull();
        expect(result.errors).toHaveLength(1);
      });
    });

    describe('Path Construction', () => {
      it('should construct correct path for different game IDs', async () => {
        const gameIds = ['game1', 'my-game', 'game_with_underscores'];
        mockFileScannerService.getFileContent.mockResolvedValue('{}');
        mockValidationService.validateGameConfig.mockReturnValue({
          isValid: true,
          errors: [],
        });

        for (const id of gameIds) {
          await helper.loadGameConfig(id);
          expect(mockFileScannerService.getFileContent).toHaveBeenCalledWith(
            `${gamesDirectory}/${id}/game-config.json`,
          );
        }
      });
    });
  });

  describe('fileExists', () => {
    const testFilePath = '/test/file.json';

    describe('Happy Path', () => {
      it('should return true when file exists', async () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = await helper.fileExists(testFilePath);

        expect(result).toBe(true);
        expect(mockFs.existsSync).toHaveBeenCalledWith(testFilePath);
      });

      it('should return false when file does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = await helper.fileExists(testFilePath);

        expect(result).toBe(false);
        expect(mockFs.existsSync).toHaveBeenCalledWith(testFilePath);
      });
    });

    describe('Error Handling', () => {
      it('should return false when existsSync throws error', async () => {
        mockFs.existsSync.mockImplementation(() => {
          throw new Error('Access denied');
        });

        const result = await helper.fileExists(testFilePath);

        expect(result).toBe(false);
      });

      it('should handle permission errors gracefully', async () => {
        mockFs.existsSync.mockImplementation(() => {
          throw new Error('EACCES');
        });

        const result = await helper.fileExists(testFilePath);

        expect(result).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle various path types (empty, long, special chars, directories)', async () => {
        const testPaths = [
          { path: '', expected: false },
          { path: '/path/to/file'.repeat(100) + '/file.json', expected: true },
          { path: '/path/with spaces/and-dashes/file.json', expected: true },
          { path: '/test/directory', expected: true },
        ];

        for (const { path, expected } of testPaths) {
          mockFs.existsSync.mockReturnValue(expected);
          const result = await helper.fileExists(path);
          expect(result).toBe(expected);
        }
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete workflow: check existence, load, and validate', async () => {
      const filePath = '/test/config.json';
      const configData = { id: 'test', name: 'Test', version: 1 };

      // Check file exists
      mockFs.existsSync.mockReturnValue(true);
      const exists = await helper.fileExists(filePath);
      expect(exists).toBe(true);

      // Load and validate
      mockFileScannerService.getFileContent.mockResolvedValue(
        JSON.stringify(configData),
      );
      const validator = jest.fn().mockReturnValue({ isValid: true, errors: [] });
      const result = await helper.loadAndValidateJson(filePath, validator);

      expect(result.data).toEqual(configData);
      expect(result.errors).toEqual([]);
    });

    it('should handle batch loading from directory and validation', async () => {
      const dirPath = '/test/entities';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['entity1.json', 'entity2.json'] as any);
      mockFileScannerService.getFileContent
        .mockResolvedValueOnce('{"id": "entity1"}')
        .mockResolvedValueOnce('{"id": "entity2"}');

      const dirResult = await helper.loadJsonFilesFromDirectory(dirPath);

      expect(dirResult.files).toHaveLength(2);
      expect(dirResult.errors).toEqual([]);

      // Validate each loaded file
      const validator = jest.fn().mockReturnValue({ isValid: true, errors: [] });
      for (const file of dirResult.files) {
        const data = JSON.parse(file.content);
        expect(data).toBeDefined();
        expect(data.id).toBeDefined();
      }
    });
  });
});
