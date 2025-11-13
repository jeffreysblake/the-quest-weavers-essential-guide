import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a temporary test database
    testDbPath = path.join(__dirname, '../../test.db');

    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create service directly for testing
    service = new DatabaseService();
    // Set custom database path for testing
    service.setDatabasePath(testDbPath);
    // Initialize the database connection
    await service.onModuleInit();
  });

  afterEach(async () => {
    // Clean up test database
    await service.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Connection', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should create database file', () => {
      expect(fs.existsSync(testDbPath)).toBeTruthy();
    });

    it('should prepare and execute statements', () => {
      const stmt = service.prepare('SELECT 1 as test');
      const result = stmt.get() as any;
      expect(result.test).toBe(1);
    });
  });

  describe('Transaction Management', () => {
    it('should execute transactions successfully', () => {
      let executed = false;

      service.transaction((db) => {
        executed = true;
        const stmt = db.prepare('SELECT 1 as test');
        const result = stmt.get() as any;
        expect(result.test).toBe(1);
      });

      expect(executed).toBeTruthy();
    });

    it('should rollback failed transactions', async () => {
      // First create a test table
      service
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS test_table (
          id INTEGER PRIMARY KEY,
          value TEXT
        )
      `,
        )
        .run();

      // Insert initial data
      service
        .prepare('INSERT INTO test_table (value) VALUES (?)')
        .run('initial');

      // Verify initial state
      const initial = service
        .prepare('SELECT COUNT(*) as count FROM test_table')
        .get() as any;
      expect(initial.count).toBe(1);

      // Attempt transaction that should fail
      try {
        service.transaction((db) => {
          db.prepare('INSERT INTO test_table (value) VALUES (?)').run('test');
          throw new Error('Test error');
        });
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      // Verify rollback occurred
      const final = service
        .prepare('SELECT COUNT(*) as count FROM test_table')
        .get() as any;
      expect(final.count).toBe(1);
    });
  });

  describe('Version Management', () => {
    beforeEach(() => {
      // Version history table is already created by migrations
      // No need to create it again
    });

    it('should save entity versions', () => {
      const testEntity = { id: 'test-1', name: 'Test Entity', type: 'test' };

      const version = service.saveVersion(
        'test',
        'test-1',
        testEntity,
        'test-author',
        'Test save',
      );

      expect(version).toBe(1);

      // Verify version was saved
      const saved = service
        .prepare(
          `
        SELECT * FROM version_history
        WHERE entity_type = ? AND entity_id = ? AND version_number = ?
      `,
        )
        .get('test', 'test-1', 1) as any;

      expect(saved).toBeDefined();
      expect(saved.entity_type).toBe('test');
      expect(saved.entity_id).toBe('test-1');
      expect(saved.changed_by).toBe('test-author');
      expect(saved.change_reason).toBe('Test save');
      expect(JSON.parse(saved.data_snapshot)).toEqual(testEntity);
    });

    it('should increment version numbers', async () => {
      const entity1 = { id: 'test-1', name: 'Version 1' };
      const entity2 = { id: 'test-1', name: 'Version 2' };

      const v1 = service.saveVersion(
        'test',
        'test-1',
        entity1,
        'author',
        'First',
      );
      const v2 = service.saveVersion(
        'test',
        'test-1',
        entity2,
        'author',
        'Second',
      );

      expect(v1).toBe(1);
      expect(v2).toBe(2);
    });

    it('should retrieve specific versions', async () => {
      const entity = { id: 'test-1', name: 'Test Entity', value: 42 };

      service.saveVersion('test', 'test-1', entity, 'author');

      const retrieved = await service.getVersion('test', 'test-1', 1);
      expect(retrieved).toEqual(entity);
    });

    it('should retrieve latest version when no version specified', async () => {
      const entity1 = { id: 'test-1', name: 'Version 1' };
      const entity2 = { id: 'test-1', name: 'Version 2' };

      service.saveVersion('test', 'test-1', entity1, 'author');
      service.saveVersion('test', 'test-1', entity2, 'author');

      const latest = await service.getVersion('test', 'test-1');
      expect(latest).toEqual(entity2);
    });

    it('should list all versions for an entity', async () => {
      const entity1 = { id: 'test-1', name: 'Version 1' };
      const entity2 = { id: 'test-1', name: 'Version 2' };

      service.saveVersion('test', 'test-1', entity1, 'author', 'First');
      service.saveVersion('test', 'test-1', entity2, 'author', 'Second');

      const versions = await service.listVersions('test', 'test-1');

      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(2); // Latest first
      expect(versions[1].version).toBe(1);
      expect(versions[0].reason).toBe('Second');
      expect(versions[1].reason).toBe('First');
    });

    it('should rollback to specific version', async () => {
      // Create main table for testing rollback
      service
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS test_entities (
          id TEXT PRIMARY KEY,
          data TEXT
        )
      `,
        )
        .run();

      const entity1 = { id: 'test-1', name: 'Version 1' };
      const entity2 = { id: 'test-1', name: 'Version 2' };

      // Save versions
      service.saveVersion('test', 'test-1', entity1, 'author');
      service.saveVersion('test', 'test-1', entity2, 'author');

      // Insert current state (version 2)
      service
        .prepare(
          'INSERT OR REPLACE INTO test_entities (id, data) VALUES (?, ?)',
        )
        .run('test-1', JSON.stringify(entity2));

      // Rollback to version 1
      const success = await service.rollbackToVersion('test', 'test-1', 1);
      expect(success).toBeTruthy();

      // Verify rollback by checking latest version
      const latest = await service.getVersion('test', 'test-1');
      expect(latest).toEqual(entity1);
    });
  });

  describe('Database Queries', () => {
    beforeEach(() => {
      // Create test table
      service
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS test_items (
          id TEXT PRIMARY KEY,
          name TEXT,
          value INTEGER
        )
      `,
        )
        .run();
    });

    it('should handle prepared statements', () => {
      const insert = service.prepare(
        'INSERT INTO test_items (id, name, value) VALUES (?, ?, ?)',
      );

      insert.run('item1', 'Test Item 1', 100);
      insert.run('item2', 'Test Item 2', 200);

      const select = service.prepare(
        'SELECT * FROM test_items WHERE value > ?',
      );
      const results = select.all(150) as any[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Test Item 2');
    });

    it('should handle database errors gracefully', () => {
      expect(() => {
        service.prepare('INVALID SQL STATEMENT').run();
      }).toThrow();
    });
  });

  describe('Schema Management', () => {
    it('should detect existing tables', () => {
      // Create a test table
      service
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS schema_test (
          id INTEGER PRIMARY KEY
        )
      `,
        )
        .run();

      // Check if table exists
      const tables = service
        .prepare(
          `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='schema_test'
      `,
        )
        .all() as any[];

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('schema_test');
    });

    it('should handle table creation and modification', () => {
      // Create table
      service
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS migration_test (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `,
        )
        .run();

      // Add column (simulating migration)
      service
        .prepare(
          `
        ALTER TABLE migration_test 
        ADD COLUMN description TEXT
      `,
        )
        .run();

      // Verify structure
      const info = service
        .prepare('PRAGMA table_info(migration_test)')
        .all() as any[];

      const columns = info.map((col) => col.name);
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('description');
    });
  });
});
