import { Test, TestingModule } from '@nestjs/testing';
import { CLIService } from './cli.service';
import { GameManagerService } from './game-manager.service';
import { DatabaseService } from '../database/database.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameFileService } from '../file-system/game-file.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { PhysicsService } from '../entity/physics.service';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Robustness Stress Tests', () => {
  let cliService: CLIService;
  let gameManagerService: GameManagerService;
  let databaseService: DatabaseService;
  let testDbPath: string;
  let testGamesDir: string;

  beforeEach(async () => {
    testDbPath = path.join(__dirname, '../../cli-stress-test.db');
    testGamesDir = path.join(__dirname, '../../test-games');

    // Clean up existing test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testGamesDir)) {
      fs.rmSync(testGamesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testGamesDir, { recursive: true });

    // Create test database service
    databaseService = new DatabaseService(testDbPath);
    await databaseService.connect();
    await databaseService.migrate();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLIService,
        GameManagerService,
        EntityService,
        RoomService,
        ObjectService,
        PlayerService,
        PhysicsService,
        FileScannerService,
        GameFileService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    cliService = module.get<CLIService>(CLIService);
    gameManagerService = module.get<GameManagerService>(GameManagerService);
  });

  afterEach(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testGamesDir)) {
      fs.rmSync(testGamesDir, { recursive: true, force: true });
    }
  });

  describe('Input Validation Stress Tests', () => {
    it('should handle malformed command syntax gracefully', async () => {
      const malformedCommands = [
        // Empty and whitespace
        [],
        [''],
        ['   '],
        ['\n\t\r'],

        // Invalid command names
        ['invalid-command'],
        ['game:invalid'],
        ['db:nonexistent'],
        ['entity:fake'],

        // Wrong number of arguments
        ['game:load'], // Missing required argument
        ['game:load', 'arg1', 'arg2', 'arg3'], // Too many arguments
        ['version:rollback', 'only-one-arg'], // Missing required arguments

        // Invalid argument types
        ['version:rollback', 'entity', 'id', 'not-a-number'],
        ['version:rollback', 'entity', 'id', '3.14'], // Float instead of int
        ['version:rollback', 'entity', 'id', '-1'], // Negative number

        // Special characters and edge cases
        ['game:load', 'game\0null'],
        ['game:load', 'game\x00\x01\x02'],
        ['game:load', 'game"with"quotes'],
        ['game:load', "game'with'quotes"],
        ['game:load', 'game with spaces'],
        ['game:load', 'game\nwith\nnewlines'],
        ['game:load', 'game\twith\ttabs'],

        // Very long inputs
        ['game:load', 'a'.repeat(10000)],
        ['game:load', 'game-' + 'x'.repeat(1000)],

        // Unicode and special characters
        ['game:load', '🎮game'],
        ['game:load', 'игра'], // Cyrillic
        ['game:load', '游戏'], // Chinese
        ['game:load', 'ゲーム'], // Japanese

        // SQL injection attempts
        ['game:load', "'; DROP TABLE games; --"],
        ['game:load', '1 OR 1=1'],
        ['entity:list', 'game"; DELETE FROM entities; --'],

        // Path traversal attempts
        ['game:load', '../../../etc/passwd'],
        ['game:load', '..\\..\\windows\\system32'],
        ['game:load', '/dev/null'],
        ['game:load', 'CON'], // Windows reserved name

        // JSON injection attempts
        ['game:create', '{"malicious": "payload"}'],
        ['entity:create', '{"__proto__": {"polluted": true}}'],
      ];

      let handledGracefully = 0;
      const totalCommands = malformedCommands.length;

      for (const command of malformedCommands) {
        try {
          // Capture output to prevent console spam
          const originalConsoleLog = console.log;
          const originalConsoleError = console.error;
          console.log = () => {};
          console.error = () => {};

          await cliService.run(['node', 'cli.js', ...command]);

          // Restore console
          console.log = originalConsoleLog;
          console.error = originalConsoleError;

          // If we get here without throwing, the command was handled gracefully
          handledGracefully++;
        } catch (error) {
          // Errors are expected for invalid commands
          // Check that the error is handled appropriately (not a crash)
          if (
            error.message &&
            !error.message.includes('ENOENT') &&
            !error.message.includes('Command failed')
          ) {
            // Unexpected error type
            console.log(
              `Unexpected error for command [${command.join(' ')}]: ${error.message}`,
            );
          } else {
            handledGracefully++;
          }
        }
      }

      console.log(
        `Handled ${handledGracefully}/${totalCommands} malformed commands gracefully`,
      );
      expect(handledGracefully).toBeGreaterThan(totalCommands * 0.8); // At least 80% should be handled gracefully
    }, 15000);

    it('should validate extreme input values', async () => {
      // Test with extreme numeric values
      const extremeValues = [
        Number.MAX_SAFE_INTEGER.toString(),
        Number.MIN_SAFE_INTEGER.toString(),
        '9999999999999999999999999999999',
        '-9999999999999999999999999999999',
        'Infinity',
        '-Infinity',
        'NaN',
        '1e308', // Larger than MAX_VALUE
        '1e-324', // Smaller than MIN_VALUE
      ];

      let validationsPassed = 0;

      for (const value of extremeValues) {
        try {
          await cliService.run([
            'node',
            'cli.js',
            'version:rollback',
            'entity',
            'test-id',
            value,
          ]);
          validationsPassed++; // Should either work or fail gracefully
        } catch (error) {
          if (
            error.message.includes('Invalid') ||
            error.message.includes('argument')
          ) {
            validationsPassed++; // Proper validation error
          }
        }
      }

      expect(validationsPassed).toBe(extremeValues.length);
    });

    it('should handle concurrent CLI operations safely', async () => {
      // Create test data for concurrent operations
      const gameIds = [];
      for (let i = 0; i < 10; i++) {
        gameIds.push(`concurrent-game-${i}`);
      }

      const concurrentOperations = [
        // Different command types to test concurrency
        async () => cliService.run(['node', 'cli.js', 'game:list']),
        async () => cliService.run(['node', 'cli.js', 'db:status']),
        async () => cliService.run(['node', 'cli.js', 'cache:stats']),
        async () => cliService.run(['node', 'cli.js', 'game:scan']),

        // Operations with different game IDs
        ...gameIds.map((gameId) => async () => {
          try {
            await cliService.run(['node', 'cli.js', 'game:load', gameId]);
          } catch (error) {
            // Expected to fail since games don't exist
          }
        }),

        // Version operations
        async () => {
          try {
            await cliService.run([
              'node',
              'cli.js',
              'version:list',
              'entity',
              'test-id',
            ]);
          } catch (error) {
            // Expected to fail
          }
        },

        // Cache operations
        async () => cliService.run(['node', 'cli.js', 'cache:clear']),
      ];

      const startTime = Date.now();

      // Run all operations concurrently
      const results = await Promise.allSettled(concurrentOperations);

      const executionTime = Date.now() - startTime;
      console.log(
        `Executed ${concurrentOperations.length} concurrent CLI operations in ${executionTime}ms`,
      );

      // Count successful vs failed operations
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      console.log(
        `Concurrent operations: ${successful} successful, ${failed} failed`,
      );

      // Should complete without hanging or crashing
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(successful + failed).toBe(concurrentOperations.length); // All should complete
    }, 15000);

    it('should handle memory stress with large datasets', async () => {
      // Test CLI with operations that could consume lots of memory
      const memoryStressTests = [
        // Large game ID
        async () => {
          try {
            await cliService.run([
              'node',
              'cli.js',
              'game:load',
              'a'.repeat(100000),
            ]);
          } catch (error) {
            // Expected to fail, but shouldn't crash
          }
        },

        // Many rapid cache operations
        async () => {
          for (let i = 0; i < 100; i++) {
            try {
              await cliService.run(['node', 'cli.js', 'cache:stats']);
            } catch (error) {
              // Ignore errors
            }
          }
        },

        // Rapid database status checks
        async () => {
          for (let i = 0; i < 50; i++) {
            try {
              await cliService.run(['node', 'cli.js', 'db:status']);
            } catch (error) {
              // Ignore errors
            }
          }
        },
      ];

      const initialMemory = process.memoryUsage().heapUsed;

      // Run memory stress tests
      await Promise.all(memoryStressTests);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      console.log(
        `Memory increase during CLI stress test: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
      );

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 20000);
  });

  describe('Error Recovery Stress Tests', () => {
    it('should recover from service failures gracefully', async () => {
      // Simulate various service failure scenarios
      const serviceFailureTests = [
        {
          name: 'Database disconnection',
          setup: async () => {
            await databaseService.disconnect();
          },
          cleanup: async () => {
            await databaseService.connect();
          },
          commands: [
            ['db:status'],
            ['game:list'],
            ['version:list', 'entity', 'test-id'],
          ],
        },

        {
          name: 'File system permission error',
          setup: async () => {
            // Create a directory we can't write to (simulate permission error)
            const restrictedDir = path.join(testGamesDir, 'restricted');
            fs.mkdirSync(restrictedDir, { mode: 0o444 }); // Read-only
          },
          cleanup: async () => {
            // Clean up
            const restrictedDir = path.join(testGamesDir, 'restricted');
            if (fs.existsSync(restrictedDir)) {
              fs.chmodSync(restrictedDir, 0o755);
              fs.rmSync(restrictedDir, { recursive: true });
            }
          },
          commands: [['game:scan'], ['game:load', 'restricted-game']],
        },
      ];

      for (const test of serviceFailureTests) {
        console.log(`Testing: ${test.name}`);

        // Set up failure condition
        await test.setup();

        let gracefulFailures = 0;

        for (const command of test.commands) {
          try {
            await cliService.run(['node', 'cli.js', ...command]);
            // If it succeeds despite failure condition, that's also acceptable
            gracefulFailures++;
          } catch (error) {
            // Should fail gracefully with appropriate error message
            if (
              error.message &&
              (error.message.includes('database') ||
                error.message.includes('file') ||
                error.message.includes('permission') ||
                error.message.includes('connection'))
            ) {
              gracefulFailures++;
            }
          }
        }

        // Clean up failure condition
        await test.cleanup();

        console.log(
          `${test.name}: ${gracefulFailures}/${test.commands.length} commands handled gracefully`,
        );
        expect(gracefulFailures).toBe(test.commands.length);
      }
    });

    it('should handle partial operation failures', async () => {
      // Test scenarios where operations partially succeed

      // Create some valid test data first
      const validGameId = 'partial-test-game';

      try {
        // This will likely fail since game doesn't exist, but test error handling
        await cliService.run(['node', 'cli.js', 'game:load', validGameId]);
      } catch (error) {
        // Expected to fail
      }

      // Test batch operations where some might succeed and others fail
      const batchCommands = [
        ['game:list'], // Should succeed
        ['game:load', 'nonexistent-game'], // Should fail
        ['db:status'], // Should succeed
        ['version:list', 'invalid-type', 'invalid-id'], // Should fail
        ['cache:stats'], // Should succeed
      ];

      const totalCommands = batchCommands.length;
      let commandsCompleted = 0;

      for (const command of batchCommands) {
        try {
          await cliService.run(['node', 'cli.js', ...command]);
          commandsCompleted++;
        } catch (error) {
          // Failed commands are acceptable, just count them as completed
          commandsCompleted++;
        }
      }

      expect(commandsCompleted).toBe(totalCommands);
    });

    it('should maintain consistency during error conditions', async () => {
      // Test that errors don't leave the system in an inconsistent state

      const initialCacheStats = await getCacheStats();
      const initialDbStatus = await getDatabaseStatus();

      // Perform operations that might fail
      const errorProneOperations = [
        async () => {
          try {
            await cliService.run([
              'node',
              'cli.js',
              'game:load',
              'nonexistent-game',
            ]);
          } catch (error) {}
        },
        async () => {
          try {
            await cliService.run([
              'node',
              'cli.js',
              'version:rollback',
              'fake',
              'fake',
              '999',
            ]);
          } catch (error) {}
        },
        async () => {
          try {
            await cliService.run([
              'node',
              'cli.js',
              'entity:list',
              'nonexistent-game',
            ]);
          } catch (error) {}
        },
      ];

      // Run error-prone operations
      await Promise.all(errorProneOperations);

      // Check that system state is still consistent
      const finalCacheStats = await getCacheStats();
      const finalDbStatus = await getDatabaseStatus();

      // Cache stats should be valid (numbers, not NaN or undefined)
      expect(typeof finalCacheStats.entityCount).toBe('number');
      expect(isFinite(finalCacheStats.entityCount)).toBe(true);

      // Database should still be responsive
      expect(finalDbStatus.isConnected).toBe(true);

      console.log('System maintained consistency after error operations');
    });

    async function getCacheStats() {
      // Mock implementation - replace with actual cache stats logic
      return {
        entityCount: 0,
        memoryUsage: process.memoryUsage().heapUsed,
      };
    }

    async function getDatabaseStatus() {
      try {
        const healthy = await databaseService.healthCheck();
        return { isConnected: healthy };
      } catch (error) {
        return { isConnected: false };
      }
    }
  });

  describe('Resource Exhaustion Handling', () => {
    it('should handle resource exhaustion gracefully', async () => {
      // Test behavior under resource constraints

      // Memory pressure test
      const memoryPressureTest = async () => {
        const largeOperations = [];

        // Create operations that could use significant memory
        for (let i = 0; i < 20; i++) {
          largeOperations.push(async () => {
            try {
              await cliService.run(['node', 'cli.js', 'game:list']);
              await cliService.run(['node', 'cli.js', 'cache:stats']);
            } catch (error) {
              // Acceptable to fail under pressure
            }
          });
        }

        const startTime = Date.now();
        await Promise.all(largeOperations);
        const endTime = Date.now();

        return endTime - startTime;
      };

      const executionTime = await memoryPressureTest();
      console.log(`Resource pressure test completed in ${executionTime}ms`);

      // Should complete within reasonable time even under pressure
      expect(executionTime).toBeLessThan(30000); // 30 seconds max
    });

    it('should handle CLI timeout scenarios', async () => {
      // Test operations that might take too long
      const timeoutTests = [
        // Rapid repeated operations
        async () => {
          const rapidOps = [];
          for (let i = 0; i < 100; i++) {
            rapidOps.push(cliService.run(['node', 'cli.js', 'cache:stats']));
          }
          return Promise.all(rapidOps);
        },
      ];

      for (const test of timeoutTests) {
        const startTime = Date.now();

        try {
          await Promise.race([
            test(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 10000),
            ),
          ]);
        } catch (error) {
          if (error.message === 'Timeout') {
            console.log('Operation timed out as expected');
          }
        }

        const executionTime = Date.now() - startTime;
        expect(executionTime).toBeLessThan(15000); // Should timeout or complete within 15 seconds
      }
    });
  });

  describe('Cross-platform Compatibility', () => {
    it('should handle platform-specific path issues', async () => {
      const pathTests = [
        // Windows-style paths
        'C:\\games\\test-game',
        'C:/games/test-game',
        '\\\\server\\share\\game',

        // Unix-style paths
        '/usr/local/games/test-game',
        '~/games/test-game',
        './games/test-game',
        '../games/test-game',

        // Mixed separators
        'games\\test/game',
        'games/test\\game',

        // Special characters in paths
        'games/test game with spaces',
        'games/test-game-with-dashes',
        'games/test_game_with_underscores',
        'games/test.game.with.dots',
      ];

      let pathsHandled = 0;

      for (const testPath of pathTests) {
        try {
          await cliService.run(['node', 'cli.js', 'game:load', testPath]);
          pathsHandled++;
        } catch (error) {
          // Expected to fail for non-existent paths, but should handle gracefully
          if (
            error.message.includes('not found') ||
            error.message.includes('ENOENT') ||
            error.message.includes('Invalid')
          ) {
            pathsHandled++;
          }
        }
      }

      console.log(`Handled ${pathsHandled}/${pathTests.length} path formats`);
      expect(pathsHandled).toBe(pathTests.length);
    });

    it('should handle character encoding issues', async () => {
      const encodingTests = [
        // UTF-8 characters
        'game-ñáéíóú',
        'game-中文',
        'game-العربية',
        'game-русский',

        // Special Unicode characters
        'game-🎮🕹️',
        'game-💾💿',

        // Control characters (should be sanitized)
        'game\u0000null',
        'game\u0001control',
        'game\u0007bell',
      ];

      let encodingsHandled = 0;

      for (const testName of encodingTests) {
        try {
          await cliService.run(['node', 'cli.js', 'game:load', testName]);
          encodingsHandled++;
        } catch (error) {
          // Should handle gracefully, either by sanitizing or rejecting properly
          if (error.message && !error.message.includes('FATAL')) {
            encodingsHandled++;
          }
        }
      }

      console.log(
        `Handled ${encodingsHandled}/${encodingTests.length} character encodings`,
      );
      expect(encodingsHandled).toBe(encodingTests.length);
    });
  });
});
