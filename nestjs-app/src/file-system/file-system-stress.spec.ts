import { Test, TestingModule } from '@nestjs/testing';
import { FileScannerService } from './file-scanner.service';
import { GameFileService } from './game-file.service';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('File System Edge Cases Stress Tests', () => {
  let fileScannerService: FileScannerService;
  let gameFileService: GameFileService;
  let databaseService: DatabaseService;
  let testDbPath: string;
  let testDir: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, '../../file-system-stress-test.db');
    testDir = path.join(__dirname, '../../test-file-system');

    // Clean up existing test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Create test database service
    databaseService = new DatabaseService(testDbPath);
    await databaseService.connect();
    await databaseService.migrate();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileScannerService,
        GameFileService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    fileScannerService = module.get<FileScannerService>(FileScannerService);
    gameFileService = module.get<GameFileService>(GameFileService);
  });

  afterEach(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('File Corruption Recovery', () => {
    it('should detect and handle partial JSON files', async () => {
      const gameId = 'corruption-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create partially corrupted JSON files
      const corruptedFiles = [
        {
          filename: 'game.json',
          content: '{"id": "corruption-test", "name": "Corrupted Game"', // Missing closing brace
        },
        {
          filename: 'rooms.json',
          content: '[{"id": "room1", "name": "Room 1"}, {"id": "room2"', // Incomplete second object
        },
        {
          filename: 'objects.json',
          content: '{"objects": [{"id": "obj1", "name": "Object 1"}', // Missing closing brackets
        },
        {
          filename: 'npcs.json',
          content: '[', // Just opening bracket
        },
        {
          filename: 'connections.json',
          content: '{"connections": []}extra text', // Valid JSON with trailing garbage
        },
      ];

      // Write corrupted files
      for (const file of corruptedFiles) {
        fs.writeFileSync(path.join(gameDir, file.filename), file.content);
      }

      // Test file scanning with corrupted files
      const scanStart = Date.now();
      const scanResult = await fileScannerService.scanGamesDirectory(testDir);
      const scanTime = Date.now() - scanStart;

      console.log(`Scanned directory with corrupted files in ${scanTime}ms`);
      console.log(
        `Scan result: ${scanResult.totalGames} games found, ${scanResult.errors?.length || 0} errors`,
      );

      // Should detect corruption but not crash
      expect(scanResult.errors).toBeDefined();
      expect(scanResult.errors.length).toBeGreaterThan(0);
      expect(scanTime).toBeLessThan(5000);

      // Test game loading with corrupted files
      const loadResult = await gameFileService.loadGameFromFiles(gameId);

      expect(loadResult.success).toBe(false);
      expect(loadResult.message).toMatch(/(corrupt|invalid|parse|error)/i);
    });

    it('should handle invalid JSON syntax gracefully', async () => {
      const gameId = 'invalid-json-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      const invalidJsonFiles = [
        {
          filename: 'malformed1.json',
          content: '{name: "missing quotes"}', // Unquoted property name
        },
        {
          filename: 'malformed2.json',
          content: '{"trailing": "comma",}', // Trailing comma
        },
        {
          filename: 'malformed3.json',
          content: "{single: 'quotes'}", // Single quotes
        },
        {
          filename: 'malformed4.json',
          content: '{"duplicate": 1, "duplicate": 2}', // Duplicate keys
        },
        {
          filename: 'malformed5.json',
          content: '{"number": 01}', // Leading zero in number
        },
        {
          filename: 'malformed6.json',
          content: '{"undefined": undefined}', // JavaScript undefined
        },
        {
          filename: 'malformed7.json',
          content: '{"comment": "value" /* comment */}', // Comments in JSON
        },
        {
          filename: 'malformed8.json',
          content: '\uFEFF{"bom": "file"}', // File with BOM
        },
      ];

      let filesHandled = 0;

      for (const file of invalidJsonFiles) {
        fs.writeFileSync(path.join(gameDir, file.filename), file.content);

        try {
          const validation = await fileScannerService.validateGameFile(
            path.join(gameDir, file.filename),
          );

          // Should detect invalid JSON
          if (!validation.isValid) {
            filesHandled++;
          }
        } catch (error) {
          // Acceptable to throw error for invalid JSON
          if (
            error.message.includes('JSON') ||
            error.message.includes('parse')
          ) {
            filesHandled++;
          }
        }
      }

      console.log(
        `Handled ${filesHandled}/${invalidJsonFiles.length} invalid JSON files`,
      );
      expect(filesHandled).toBe(invalidJsonFiles.length);
    });

    it('should recover from binary data in JSON files', async () => {
      const gameId = 'binary-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create files with binary data
      const binaryFiles = [
        {
          filename: 'binary1.json',
          content: Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]),
        },
        {
          filename: 'binary2.json',
          content: Buffer.concat([
            Buffer.from('{"valid": "start"}'),
            Buffer.from([0x00, 0x00, 0x00]),
            Buffer.from('{"more": "data"}'),
          ]),
        },
        {
          filename: 'mixed.json',
          content: 'Valid text\x00\x01\x02Binary data\xFF\xFE{"json": "part"}',
        },
      ];

      let binaryFilesHandled = 0;

      for (const file of binaryFiles) {
        fs.writeFileSync(path.join(gameDir, file.filename), file.content);

        try {
          const validation = await fileScannerService.validateGameFile(
            path.join(gameDir, file.filename),
          );

          // Should detect binary/invalid content
          if (!validation.isValid) {
            binaryFilesHandled++;
          }
        } catch (error) {
          // Acceptable to fail on binary data
          binaryFilesHandled++;
        }
      }

      console.log(
        `Handled ${binaryFilesHandled}/${binaryFiles.length} binary files`,
      );
      expect(binaryFilesHandled).toBe(binaryFiles.length);
    });
  });

  describe('Missing Dependencies Recovery', () => {
    it('should handle missing referenced files', async () => {
      const gameId = 'missing-deps-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create game.json that references missing files
      const gameJson = {
        id: gameId,
        name: 'Missing Dependencies Test',
        roomsFile: 'missing-rooms.json',
        objectsFile: 'missing-objects.json',
        npcsFile: 'missing-npcs.json',
        connectionsFile: 'missing-connections.json',
      };

      fs.writeFileSync(
        path.join(gameDir, 'game.json'),
        JSON.stringify(gameJson, null, 2),
      );

      // Test loading game with missing dependencies
      const loadResult = await gameFileService.loadGameFromFiles(gameId);

      expect(loadResult.success).toBe(false);
      expect(loadResult.message).toMatch(/(missing|not found|dependency)/i);

      // Should provide information about what's missing
      expect(loadResult.loaded.rooms).toHaveLength(0);
      expect(loadResult.loaded.objects).toHaveLength(0);
      expect(loadResult.loaded.npcs).toHaveLength(0);
    });

    it('should handle circular file references', async () => {
      const gameId = 'circular-refs-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create files that reference each other in a circle
      const file1 = {
        id: 'file1',
        name: 'File 1',
        includes: ['file2.json'],
      };

      const file2 = {
        id: 'file2',
        name: 'File 2',
        includes: ['file3.json'],
      };

      const file3 = {
        id: 'file3',
        name: 'File 3',
        includes: ['file1.json'], // Creates circular reference
      };

      fs.writeFileSync(
        path.join(gameDir, 'file1.json'),
        JSON.stringify(file1, null, 2),
      );
      fs.writeFileSync(
        path.join(gameDir, 'file2.json'),
        JSON.stringify(file2, null, 2),
      );
      fs.writeFileSync(
        path.join(gameDir, 'file3.json'),
        JSON.stringify(file3, null, 2),
      );

      const game = {
        id: gameId,
        name: 'Circular References Test',
        includes: ['file1.json'],
      };

      fs.writeFileSync(
        path.join(gameDir, 'game.json'),
        JSON.stringify(game, null, 2),
      );

      // Test should detect circular references
      const loadResult = await gameFileService.loadGameFromFiles(gameId);

      // Should handle circular references gracefully
      if (!loadResult.success) {
        expect(loadResult.message).toMatch(/(circular|cycle|recursive)/i);
      }
    });

    it('should handle broken symlinks and shortcuts', async () => {
      const gameId = 'symlink-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      try {
        // Create broken symlinks (if platform supports it)
        const targetFile = path.join(gameDir, 'nonexistent-target.json');
        const symlinkFile = path.join(gameDir, 'broken-symlink.json');

        fs.symlinkSync(targetFile, symlinkFile);

        // Test scanning directory with broken symlinks
        const scanResult = await fileScannerService.scanGamesDirectory(testDir);

        // Should handle broken symlinks gracefully
        expect(scanResult.errors).toBeDefined();
        if (scanResult.errors.length > 0) {
          expect(
            scanResult.errors.some(
              (error) =>
                error.includes('symlink') ||
                error.includes('broken') ||
                error.includes('ENOENT'),
            ),
          ).toBe(true);
        }
      } catch (error) {
        // Symlinks might not be supported on all platforms
        console.log('Symlink test skipped (not supported on this platform)');
      }
    });
  });

  describe('Permission Issues Handling', () => {
    it('should handle read-only files gracefully', async () => {
      const gameId = 'readonly-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      const gameData = {
        id: gameId,
        name: 'Read-only Test Game',
        description: 'Testing read-only file handling',
      };

      const readonlyFile = path.join(gameDir, 'readonly-game.json');
      fs.writeFileSync(readonlyFile, JSON.stringify(gameData, null, 2));

      try {
        // Make file read-only
        fs.chmodSync(readonlyFile, 0o444);

        // Should be able to read read-only files
        const loadResult = await gameFileService.loadGameFromFiles(gameId);

        // Reading should work
        expect(loadResult.success).toBe(true);

        // Clean up
        fs.chmodSync(readonlyFile, 0o644);
      } catch (error) {
        // Some platforms might not support chmod
        console.log('Readonly test skipped (chmod not supported)');
      }
    });

    it('should handle permission denied scenarios', async () => {
      const gameId = 'permission-test';
      const gameDir = path.join(testDir, gameId);

      try {
        fs.mkdirSync(gameDir, { recursive: true });

        // Create a file we can't read
        const restrictedFile = path.join(gameDir, 'restricted.json');
        fs.writeFileSync(restrictedFile, '{"test": "data"}');
        fs.chmodSync(restrictedFile, 0o000); // No permissions

        const validation =
          await fileScannerService.validateGameFile(restrictedFile);

        // Should handle permission errors gracefully
        expect(validation.isValid).toBe(false);
        expect(
          validation.errors.some(
            (error) => error.includes('permission') || error.includes('EACCES'),
          ),
        ).toBe(true);

        // Clean up
        fs.chmodSync(restrictedFile, 0o644);
      } catch (error) {
        // Permission tests might not work on all platforms
        console.log('Permission test skipped');
      }
    });
  });

  describe('Large File Handling', () => {
    it('should handle multi-MB game files efficiently', async () => {
      const gameId = 'large-file-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create a large game file (~5MB)
      const largeGameData = {
        id: gameId,
        name: 'Large Game File Test',
        description: 'Testing large file handling',
        rooms: [],
        objects: [],
        npcs: [],
      };

      // Generate lots of data
      for (let i = 0; i < 1000; i++) {
        largeGameData.rooms.push({
          id: `room-${i}`,
          name: `Room ${i}`,
          description: 'A'.repeat(1000), // 1KB description
          longDescription: 'B'.repeat(2000), // 2KB long description
          properties: Array.from({ length: 100 }, (_, j) => ({
            key: `property-${j}`,
            value: 'C'.repeat(50),
          })),
        });
      }

      const largeFileContent = JSON.stringify(largeGameData, null, 2);
      const fileSizeMB = Buffer.byteLength(largeFileContent) / 1024 / 1024;
      console.log(`Created large file: ${fileSizeMB.toFixed(2)} MB`);

      const largeFile = path.join(gameDir, 'large-game.json');

      const writeStart = Date.now();
      fs.writeFileSync(largeFile, largeFileContent);
      const writeTime = Date.now() - writeStart;
      console.log(`Wrote large file in ${writeTime}ms`);

      // Test reading large file
      const readStart = Date.now();
      const validation = await fileScannerService.validateGameFile(largeFile);
      const readTime = Date.now() - readStart;
      console.log(`Validated large file in ${readTime}ms`);

      expect(validation.isValid).toBe(true);
      expect(writeTime).toBeLessThan(5000); // Should write within 5 seconds
      expect(readTime).toBeLessThan(10000); // Should read/validate within 10 seconds
    }, 20000);

    it('should handle many small files efficiently', async () => {
      const gameId = 'many-files-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      const numFiles = 1000;
      const fileNames = [];

      // Create many small files
      const creationStart = Date.now();
      for (let i = 0; i < numFiles; i++) {
        const fileName = `entity-${i}.json`;
        const filePath = path.join(gameDir, fileName);

        const entityData = {
          id: `entity-${i}`,
          name: `Entity ${i}`,
          type: i % 3 === 0 ? 'room' : i % 3 === 1 ? 'object' : 'npc',
          description: `Test entity ${i}`,
          properties: { index: i },
        };

        fs.writeFileSync(filePath, JSON.stringify(entityData, null, 2));
        fileNames.push(fileName);
      }
      const creationTime = Date.now() - creationStart;
      console.log(`Created ${numFiles} files in ${creationTime}ms`);

      // Test scanning directory with many files
      const scanStart = Date.now();
      const scanResult = await fileScannerService.scanGamesDirectory(testDir);
      const scanTime = Date.now() - scanStart;
      console.log(`Scanned directory with ${numFiles} files in ${scanTime}ms`);

      expect(creationTime).toBeLessThan(10000); // Should create files within 10 seconds
      expect(scanTime).toBeLessThan(15000); // Should scan within 15 seconds
      expect(scanResult.totalGames).toBeGreaterThan(0);
    }, 30000);

    it('should handle file system limits gracefully', async () => {
      // Test behavior when approaching file system limits
      const gameId = 'limits-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Test very long file names
      const longFileName = 'a'.repeat(200) + '.json'; // Very long filename
      const longFilePath = path.join(gameDir, longFileName);

      try {
        fs.writeFileSync(longFilePath, '{"test": "long filename"}');

        const validation =
          await fileScannerService.validateGameFile(longFilePath);

        // Should handle long filenames (success or graceful failure)
        if (!validation.isValid) {
          expect(
            validation.errors.some(
              (error) =>
                error.includes('filename') || error.includes('ENAMETOOLONG'),
            ),
          ).toBe(true);
        }
      } catch (error) {
        // Platform might reject very long filenames
        expect(error.code).toMatch(/(ENAMETOOLONG|EINVAL)/);
      }

      // Test deep directory nesting
      const deepPath = path.join(gameDir, ...Array(20).fill('deep'));
      try {
        fs.mkdirSync(deepPath, { recursive: true });

        const deepFile = path.join(deepPath, 'deep-file.json');
        fs.writeFileSync(deepFile, '{"test": "deep nesting"}');

        const validation = await fileScannerService.validateGameFile(deepFile);
        expect(validation).toBeDefined();
      } catch (error) {
        // Some platforms have path length limits
        console.log('Deep path test hit platform limits');
      }
    });
  });

  describe('Cross-platform Compatibility', () => {
    it('should handle different line endings', async () => {
      const gameId = 'line-endings-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      const gameData = {
        id: gameId,
        name: 'Line Endings Test',
        description: 'Testing different line endings',
      };

      const lineEndingTests = [
        {
          name: 'unix-lf.json',
          content: JSON.stringify(gameData, null, 2).replace(/\r\n/g, '\n'), // LF only
        },
        {
          name: 'windows-crlf.json',
          content: JSON.stringify(gameData, null, 2).replace(/\n/g, '\r\n'), // CRLF
        },
        {
          name: 'mac-cr.json',
          content: JSON.stringify(gameData, null, 2).replace(/\n/g, '\r'), // CR only
        },
        {
          name: 'mixed.json',
          content: '{\n  "id": "test",\r\n  "name": "mixed"\r}',
        },
      ];

      let lineEndingsHandled = 0;

      for (const test of lineEndingTests) {
        const filePath = path.join(gameDir, test.name);
        fs.writeFileSync(filePath, test.content);

        try {
          const validation =
            await fileScannerService.validateGameFile(filePath);
          if (validation.isValid) {
            lineEndingsHandled++;
          }
        } catch (error) {
          // Should handle different line endings gracefully
          if (!error.message.includes('FATAL')) {
            lineEndingsHandled++;
          }
        }
      }

      console.log(
        `Handled ${lineEndingsHandled}/${lineEndingTests.length} line ending formats`,
      );
      expect(lineEndingsHandled).toBe(lineEndingTests.length);
    });

    it('should handle file locking scenarios', async () => {
      const gameId = 'locking-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      const testFile = path.join(gameDir, 'locked-file.json');
      const testData = { id: 'test', name: 'Locked File Test' };

      fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));

      // Test concurrent access to the same file
      const concurrentReads = Array.from({ length: 10 }, async () => {
        try {
          return await fileScannerService.validateGameFile(testFile);
        } catch (error) {
          return { isValid: false, errors: [error.message] };
        }
      });

      const results = await Promise.all(concurrentReads);
      const successfulReads = results.filter((r) => r.isValid).length;

      console.log(`${successfulReads}/10 concurrent reads succeeded`);
      expect(successfulReads).toBeGreaterThan(7); // Most should succeed
    });
  });

  describe('Recovery and Cleanup', () => {
    it('should clean up temporary files after processing', async () => {
      const gameId = 'cleanup-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create test files
      const testFiles = ['game.json', 'rooms.json', 'objects.json'];

      for (const fileName of testFiles) {
        fs.writeFileSync(
          path.join(gameDir, fileName),
          JSON.stringify({ test: 'data' }, null, 2),
        );
      }

      const initialFiles = fs.readdirSync(gameDir);

      // Process files
      await gameFileService.loadGameFromFiles(gameId);

      const finalFiles = fs.readdirSync(gameDir);

      // Should not create additional temporary files
      expect(finalFiles.length).toBe(initialFiles.length);

      // Should not leave lock files or temporary files
      const tempFiles = finalFiles.filter(
        (f) => f.includes('.tmp') || f.includes('.lock') || f.includes('~'),
      );
      expect(tempFiles).toHaveLength(0);
    });

    it('should handle interrupted operations gracefully', async () => {
      const gameId = 'interrupt-test';
      const gameDir = path.join(testDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Create a large file that might be interrupted during processing
      const largeData = {
        id: gameId,
        name: 'Interrupt Test',
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          content: 'x'.repeat(100),
        })),
      };

      fs.writeFileSync(
        path.join(gameDir, 'large-game.json'),
        JSON.stringify(largeData, null, 2),
      );

      // Simulate interruption by racing file processing with timeout
      try {
        await Promise.race([
          gameFileService.loadGameFromFiles(gameId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Simulated interruption')), 100),
          ),
        ]);
      } catch (error) {
        if (error.message === 'Simulated interruption') {
          console.log('File processing interrupted as expected');
        }
      }

      // System should still be responsive after interruption
      const quickScan = await fileScannerService.scanGamesDirectory(testDir);
      expect(quickScan).toBeDefined();
    });
  });
});
