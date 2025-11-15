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

  describe('CASCADE DELETE Constraints', () => {
    beforeEach(() => {
      // All tables are created by migration, so we can test CASCADE behavior
    });

    it('should CASCADE DELETE rooms when game is deleted', () => {
      // Insert a game
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-1', 'Test Game');

      // Insert rooms
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-1', 'game-1', 'Room 1', 'Test Room 1');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-2', 'game-1', 'Room 2', 'Test Room 2');

      // Verify rooms exist
      const roomsBefore = service
        .prepare('SELECT COUNT(*) as count FROM rooms WHERE game_id = ?')
        .get('game-1') as any;
      expect(roomsBefore.count).toBe(2);

      // Delete game
      service.prepare('DELETE FROM games WHERE id = ?').run('game-1');

      // Verify rooms are CASCADE deleted
      const roomsAfter = service
        .prepare('SELECT COUNT(*) as count FROM rooms WHERE game_id = ?')
        .get('game-1') as any;
      expect(roomsAfter.count).toBe(0);
    });

    it('should CASCADE DELETE objects when game is deleted', () => {
      // Insert a game
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-2', 'Test Game 2');

      // Insert objects
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-1', 'game-2', 'Sword', 'weapon');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-2', 'game-2', 'Shield', 'armor');

      // Verify objects exist
      const objectsBefore = service
        .prepare('SELECT COUNT(*) as count FROM objects WHERE game_id = ?')
        .get('game-2') as any;
      expect(objectsBefore.count).toBe(2);

      // Delete game
      service.prepare('DELETE FROM games WHERE id = ?').run('game-2');

      // Verify objects are CASCADE deleted
      const objectsAfter = service
        .prepare('SELECT COUNT(*) as count FROM objects WHERE game_id = ?')
        .get('game-2') as any;
      expect(objectsAfter.count).toBe(0);
    });

    it('should CASCADE DELETE spatial_relationships when object is deleted', () => {
      // Insert game and objects
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-3', 'Test Game 3');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-3', 'game-3', 'Table', 'furniture');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-4', 'game-3', 'Book', 'item');

      // Insert spatial relationship (book on table)
      service
        .prepare(
          'INSERT INTO spatial_relationships (object_id, target_id, relationship_type) VALUES (?, ?, ?)',
        )
        .run('obj-4', 'obj-3', 'on_top_of');

      // Verify relationship exists
      const relBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM spatial_relationships WHERE object_id = ? OR target_id = ?',
        )
        .get('obj-4', 'obj-4') as any;
      expect(relBefore.count).toBe(1);

      // Delete the book (object_id)
      service.prepare('DELETE FROM objects WHERE id = ?').run('obj-4');

      // Verify relationship is CASCADE deleted (because object_id references the book)
      const relAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM spatial_relationships WHERE object_id = ?',
        )
        .get('obj-4') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE spatial_relationships when target object is deleted', () => {
      // Insert game and objects
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-4', 'Test Game 4');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-5', 'game-4', 'Chest', 'container');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-6', 'game-4', 'Coin', 'item');

      // Insert spatial relationship (coin inside chest)
      service
        .prepare(
          'INSERT INTO spatial_relationships (object_id, target_id, relationship_type) VALUES (?, ?, ?)',
        )
        .run('obj-6', 'obj-5', 'inside');

      // Verify relationship exists
      const relBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM spatial_relationships WHERE target_id = ?',
        )
        .get('obj-5') as any;
      expect(relBefore.count).toBe(1);

      // Delete the chest (target_id)
      service.prepare('DELETE FROM objects WHERE id = ?').run('obj-5');

      // Verify relationship is CASCADE deleted (because target_id references the chest)
      const relAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM spatial_relationships WHERE target_id = ?',
        )
        .get('obj-5') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE room_objects when room is deleted', () => {
      // Insert game, room, and object
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-5', 'Test Game 5');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-3', 'game-5', 'Room 3', 'Test Room 3');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-7', 'game-5', 'Key', 'item');

      // Insert room_object relationship
      service
        .prepare('INSERT INTO room_objects (room_id, object_id) VALUES (?, ?)')
        .run('room-3', 'obj-7');

      // Verify relationship exists
      const relBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_objects WHERE room_id = ?',
        )
        .get('room-3') as any;
      expect(relBefore.count).toBe(1);

      // Delete room
      service.prepare('DELETE FROM rooms WHERE id = ?').run('room-3');

      // Verify room_objects is CASCADE deleted
      const relAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_objects WHERE room_id = ?',
        )
        .get('room-3') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE room_objects when object is deleted', () => {
      // Insert game, room, and object
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-6', 'Test Game 6');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-4', 'game-6', 'Room 4', 'Test Room 4');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('obj-8', 'game-6', 'Potion', 'item');

      // Insert room_object relationship
      service
        .prepare('INSERT INTO room_objects (room_id, object_id) VALUES (?, ?)')
        .run('room-4', 'obj-8');

      // Verify relationship exists
      const relBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_objects WHERE object_id = ?',
        )
        .get('obj-8') as any;
      expect(relBefore.count).toBe(1);

      // Delete object
      service.prepare('DELETE FROM objects WHERE id = ?').run('obj-8');

      // Verify room_objects is CASCADE deleted
      const relAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_objects WHERE object_id = ?',
        )
        .get('obj-8') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE room_npcs when room is deleted', () => {
      // Insert game, room, and NPC
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-7', 'Test Game 7');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-5', 'game-7', 'Room 5', 'Test Room 5');
      service
        .prepare(
          'INSERT INTO npcs (id, game_id, name, npc_type) VALUES (?, ?, ?, ?)',
        )
        .run('npc-1', 'game-7', 'Guard', 'npc');

      // Insert room_npc relationship
      service
        .prepare('INSERT INTO room_npcs (room_id, npc_id) VALUES (?, ?)')
        .run('room-5', 'npc-1');

      // Verify relationship exists
      const relBefore = service
        .prepare('SELECT COUNT(*) as count FROM room_npcs WHERE room_id = ?')
        .get('room-5') as any;
      expect(relBefore.count).toBe(1);

      // Delete room
      service.prepare('DELETE FROM rooms WHERE id = ?').run('room-5');

      // Verify room_npcs is CASCADE deleted
      const relAfter = service
        .prepare('SELECT COUNT(*) as count FROM room_npcs WHERE room_id = ?')
        .get('room-5') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE room_npcs when NPC is deleted', () => {
      // Insert game, room, and NPC
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-8', 'Test Game 8');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-6', 'game-8', 'Room 6', 'Test Room 6');
      service
        .prepare(
          'INSERT INTO npcs (id, game_id, name, npc_type) VALUES (?, ?, ?, ?)',
        )
        .run('npc-2', 'game-8', 'Merchant', 'npc');

      // Insert room_npc relationship
      service
        .prepare('INSERT INTO room_npcs (room_id, npc_id) VALUES (?, ?)')
        .run('room-6', 'npc-2');

      // Verify relationship exists
      const relBefore = service
        .prepare('SELECT COUNT(*) as count FROM room_npcs WHERE npc_id = ?')
        .get('npc-2') as any;
      expect(relBefore.count).toBe(1);

      // Delete NPC
      service.prepare('DELETE FROM npcs WHERE id = ?').run('npc-2');

      // Verify room_npcs is CASCADE deleted
      const relAfter = service
        .prepare('SELECT COUNT(*) as count FROM room_npcs WHERE npc_id = ?')
        .get('npc-2') as any;
      expect(relAfter.count).toBe(0);
    });

    it('should CASCADE DELETE player_saves when player is deleted', () => {
      // Insert game and player (stored as NPC with npc_type='player')
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-9', 'Test Game 9');
      service
        .prepare(
          'INSERT INTO npcs (id, game_id, name, npc_type) VALUES (?, ?, ?, ?)',
        )
        .run('player-1', 'game-9', 'Hero', 'player');

      // Insert player save
      service
        .prepare(
          'INSERT INTO player_saves (save_id, game_id, player_id, slot_number) VALUES (?, ?, ?, ?)',
        )
        .run('save-1', 'game-9', 'player-1', 1);

      // Verify save exists
      const saveBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM player_saves WHERE player_id = ?',
        )
        .get('player-1') as any;
      expect(saveBefore.count).toBe(1);

      // Delete player
      service.prepare('DELETE FROM npcs WHERE id = ?').run('player-1');

      // Verify player_saves is CASCADE deleted
      const saveAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM player_saves WHERE player_id = ?',
        )
        .get('player-1') as any;
      expect(saveAfter.count).toBe(0);
    });

    it('should CASCADE DELETE room_connections when room is deleted', () => {
      // Insert game and rooms
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-10', 'Test Game 10');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-7', 'game-10', 'Room 7', 'Test Room 7');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-8', 'game-10', 'Room 8', 'Test Room 8');

      // Insert room connection
      service
        .prepare(
          'INSERT INTO room_connections (room_id, connected_room_id, direction) VALUES (?, ?, ?)',
        )
        .run('room-7', 'room-8', 'north');

      // Verify connection exists
      const connBefore = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_connections WHERE room_id = ? OR connected_room_id = ?',
        )
        .get('room-7', 'room-7') as any;
      expect(connBefore.count).toBe(1);

      // Delete room
      service.prepare('DELETE FROM rooms WHERE id = ?').run('room-7');

      // Verify room_connections is CASCADE deleted
      const connAfter = service
        .prepare(
          'SELECT COUNT(*) as count FROM room_connections WHERE room_id = ? OR connected_room_id = ?',
        )
        .get('room-7', 'room-7') as any;
      expect(connAfter.count).toBe(0);
    });

    it('should SET NULL on room_connections.required_key_id when key is deleted', () => {
      // Insert game, rooms, and key
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-11', 'Test Game 11');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-9', 'game-11', 'Room 9', 'Test Room 9');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-10', 'game-11', 'Room 10', 'Test Room 10');
      service
        .prepare(
          'INSERT INTO objects (id, game_id, name, object_type) VALUES (?, ?, ?, ?)',
        )
        .run('key-1', 'game-11', 'Golden Key', 'key');

      // Insert locked room connection
      service
        .prepare(
          'INSERT INTO room_connections (room_id, connected_room_id, direction, is_locked, required_key_id) VALUES (?, ?, ?, ?, ?)',
        )
        .run('room-9', 'room-10', 'north', 1, 'key-1');

      // Verify connection has required_key_id
      const connBefore = service
        .prepare(
          'SELECT required_key_id FROM room_connections WHERE room_id = ? AND connected_room_id = ?',
        )
        .get('room-9', 'room-10') as any;
      expect(connBefore.required_key_id).toBe('key-1');

      // Delete key
      service.prepare('DELETE FROM objects WHERE id = ?').run('key-1');

      // Verify required_key_id is SET NULL
      const connAfter = service
        .prepare(
          'SELECT required_key_id FROM room_connections WHERE room_id = ? AND connected_room_id = ?',
        )
        .get('room-9', 'room-10') as any;
      expect(connAfter.required_key_id).toBeNull();
    });
  });

  describe('Migration 3 - Indexes', () => {
    it('should have index on spatial_relationships.target_id', () => {
      const indexes = service
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='spatial_relationships' AND name='idx_spatial_relationships_target_id'",
        )
        .all() as any[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should have index on room_objects.object_id', () => {
      const indexes = service
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='room_objects' AND name='idx_room_objects_object_id'",
        )
        .all() as any[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should have index on room_npcs.npc_id', () => {
      const indexes = service
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='room_npcs' AND name='idx_room_npcs_npc_id'",
        )
        .all() as any[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should have index on room_connections.connected_room_id', () => {
      const indexes = service
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='room_connections' AND name='idx_room_connections_connected_room_id'",
        )
        .all() as any[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should have unique index on room_connections', () => {
      const indexes = service
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='room_connections' AND name='idx_room_connections_unique'",
        )
        .all() as any[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should prevent duplicate room connections with unique constraint', () => {
      // Insert game and rooms
      service
        .prepare('INSERT INTO games (id, name) VALUES (?, ?)')
        .run('game-12', 'Test Game 12');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-11', 'game-12', 'Room 11', 'Test Room 11');
      service
        .prepare(
          'INSERT INTO rooms (id, game_id, name, description) VALUES (?, ?, ?, ?)',
        )
        .run('room-12', 'game-12', 'Room 12', 'Test Room 12');

      // Insert first connection
      service
        .prepare(
          'INSERT INTO room_connections (room_id, connected_room_id, direction) VALUES (?, ?, ?)',
        )
        .run('room-11', 'room-12', 'north');

      // Try to insert duplicate connection - should fail
      expect(() => {
        service
          .prepare(
            'INSERT INTO room_connections (room_id, connected_room_id, direction) VALUES (?, ?, ?)',
          )
          .run('room-11', 'room-12', 'north');
      }).toThrow();
    });
  });
});
