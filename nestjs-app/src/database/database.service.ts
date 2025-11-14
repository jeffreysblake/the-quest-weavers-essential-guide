import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface VersionInfo {
  id: number;
  entityType: string;
  entityId: string;
  version: number;
  versionNumber: number;
  created_by?: string;
  changedBy?: string;
  reason?: string;
  changeReason?: string;
  created_at: string;
  createdAt: string;
}

export interface DatabaseTransaction {
  commit(): void;
  rollback(): void;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private database: Database.Database;
  private dbPath: string;

  private customDbPath?: string;

  constructor() {
    // Initialize with default path, can be overridden for testing
    this.updateDbPath();
  }

  private updateDbPath(): void {
    if (this.customDbPath) {
      this.dbPath = this.customDbPath;
    } else {
      // Create data directory if it doesn't exist
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.dbPath = path.join(dataDir, 'quest_weaver.db');
    }
    this.logger.log(`Database path: ${this.dbPath}`);
  }

  // Method for tests to set custom database path
  setDatabasePath(path: string): void {
    this.customDbPath = path;
    this.updateDbPath();
  }

  async onModuleInit() {
    await this.connect();
    await this.migrate();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    try {
      this.database = new Database(this.dbPath);

      // Enable foreign keys
      this.database.pragma('foreign_keys = ON');

      // Enable WAL mode for better concurrency
      this.database.pragma('journal_mode = WAL');

      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.database) {
      try {
        this.database.close();
        this.logger.log('Database connection closed');
      } catch (error) {
        this.logger.error('Error closing database connection', error);
        throw error;
      }
    }
  }

  async migrate(): Promise<void> {
    this.logger.log('Running database migrations...');

    try {
      // Create schema version table first
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Get current schema version
      const currentVersion = this.getCurrentSchemaVersion();
      const targetVersion = 1;

      if (currentVersion < targetVersion) {
        this.logger.log(
          `Migrating from version ${currentVersion} to ${targetVersion}`,
        );
        await this.runMigrations(currentVersion, targetVersion);
      } else {
        this.logger.log(`Schema is up to date (version ${currentVersion})`);
      }
    } catch (error) {
      this.logger.error('Migration failed', error);
      throw error;
    }
  }

  private getCurrentSchemaVersion(): number {
    try {
      const result = this.database
        .prepare('SELECT MAX(version) as version FROM schema_version')
        .get() as { version: number | null };
      return result?.version ?? 0;
    } catch (error) {
      // If table doesn't exist, we're at version 0
      return 0;
    }
  }

  private async runMigrations(
    fromVersion: number,
    toVersion: number,
  ): Promise<void> {
    const transaction = this.database.transaction(() => {
      for (let version = fromVersion + 1; version <= toVersion; version++) {
        this.logger.log(`Applying migration ${version}`);
        this.applyMigration(version);

        // Record migration
        this.database
          .prepare('INSERT INTO schema_version (version) VALUES (?)')
          .run(version);
      }
    });

    transaction();
  }

  private applyMigration(version: number): void {
    switch (version) {
      case 1:
        this.applyMigration1();
        break;
      default:
        throw new Error(`Unknown migration version: ${version}`);
    }
  }

  private applyMigration1(): void {
    // Create all core tables
    this.database.exec(`
      -- Games and global configuration
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      );

      -- Rooms with spatial data
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        long_description TEXT,
        position_x REAL DEFAULT 0,
        position_y REAL DEFAULT 0, 
        position_z REAL DEFAULT 0,
        width REAL DEFAULT 10,
        height REAL DEFAULT 10,
        depth REAL DEFAULT 3,
        environment_data TEXT, -- JSON blob for lighting, sound, etc.
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      -- Game objects with material properties
      CREATE TABLE IF NOT EXISTS objects (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        object_type TEXT NOT NULL, -- weapon, item, container, furniture, etc.
        position_x REAL DEFAULT 0,
        position_y REAL DEFAULT 0,
        position_z REAL DEFAULT 0,
        material TEXT, -- wood, metal, glass, etc.
        material_properties TEXT, -- JSON blob for physics properties
        weight REAL DEFAULT 0,
        health REAL,
        max_health REAL,
        is_portable BOOLEAN DEFAULT true,
        is_container BOOLEAN DEFAULT false,
        can_contain BOOLEAN DEFAULT false,
        container_capacity INTEGER DEFAULT 0,
        state_data TEXT, -- JSON blob for isOpen, isLocked, etc.
        properties TEXT, -- JSON blob for custom properties
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      -- NPCs and players
      CREATE TABLE IF NOT EXISTS npcs (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        npc_type TEXT DEFAULT 'npc', -- npc, player, monster
        position_x REAL DEFAULT 0,
        position_y REAL DEFAULT 0,
        position_z REAL DEFAULT 0,
        health REAL DEFAULT 100,
        max_health REAL DEFAULT 100,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        inventory_data TEXT, -- JSON array of object IDs
        dialogue_tree_data TEXT, -- JSON blob for dialogue system
        behavior_config TEXT, -- JSON blob for AI behaviors
        attributes TEXT, -- JSON blob for stats, abilities, etc.
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      -- Player save states
      CREATE TABLE IF NOT EXISTS player_saves (
        save_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        slot_number INTEGER NOT NULL,
        save_name TEXT,
        current_room_id TEXT,
        inventory TEXT, -- JSON array of object IDs
        stats TEXT, -- JSON object for health, mana, level, etc.
        flags TEXT, -- JSON object for quest flags, achievements
        variables TEXT, -- JSON object for custom game variables
        quest_states TEXT, -- JSON object mapping quest ID to state
        world_state TEXT, -- JSON object for door states, NPC states, etc.
        play_time INTEGER DEFAULT 0, -- Playtime in seconds
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES npcs(id) ON DELETE CASCADE
      );

      -- Spatial relationships between objects
      CREATE TABLE IF NOT EXISTS spatial_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        object_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL, -- on_top_of, inside, next_to, underneath, attached_to
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES objects(id) ON DELETE CASCADE
      );

      -- Room connections and exits
      CREATE TABLE IF NOT EXISTS room_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        connected_room_id TEXT NOT NULL,
        direction TEXT NOT NULL, -- north, south, east, west, up, down, northeast, etc.
        description TEXT, -- "heavy wooden door", "narrow passage", etc.
        is_locked BOOLEAN DEFAULT false,
        required_key_id TEXT, -- optional key requirement
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (connected_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (required_key_id) REFERENCES objects(id) ON DELETE SET NULL
      );

      -- Object placement in rooms
      CREATE TABLE IF NOT EXISTS room_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        object_id TEXT NOT NULL,
        placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
      );

      -- NPC placement in rooms  
      CREATE TABLE IF NOT EXISTS room_npcs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        npc_id TEXT NOT NULL,
        placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE
      );

      -- Version history for rollback functionality
      CREATE TABLE IF NOT EXISTS version_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- room, object, npc, game
        entity_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        data_snapshot TEXT NOT NULL, -- Full JSON snapshot of entity at this version
        changed_by TEXT, -- CLI user or system
        change_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for performance
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_rooms_game_id ON rooms(game_id);
      CREATE INDEX IF NOT EXISTS idx_objects_game_id ON objects(game_id);
      CREATE INDEX IF NOT EXISTS idx_npcs_game_id ON npcs(game_id);
      CREATE INDEX IF NOT EXISTS idx_player_saves_game_id ON player_saves(game_id);
      CREATE INDEX IF NOT EXISTS idx_player_saves_player_id ON player_saves(player_id);
      CREATE INDEX IF NOT EXISTS idx_player_saves_slot ON player_saves(game_id, player_id, slot_number);
      CREATE INDEX IF NOT EXISTS idx_room_connections_room_id ON room_connections(room_id);
      CREATE INDEX IF NOT EXISTS idx_spatial_relationships_object_id ON spatial_relationships(object_id);
      CREATE INDEX IF NOT EXISTS idx_room_objects_room_id ON room_objects(room_id);
      CREATE INDEX IF NOT EXISTS idx_room_npcs_room_id ON room_npcs(room_id);
      CREATE INDEX IF NOT EXISTS idx_version_history_entity ON version_history(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_version_history_version ON version_history(entity_type, entity_id, version_number);
    `);
  }

  // Transaction management
  transaction<T>(callback: (db: Database.Database) => T): T {
    const wrappedCallback = () => callback(this.database);
    const transaction = this.database.transaction(wrappedCallback);
    return transaction();
  }

  // Generic query methods
  prepare(query: string): Database.Statement {
    return this.database.prepare(query);
  }

  exec(query: string): void {
    this.database.exec(query);
  }

  // Version management methods
  saveVersion<T>(
    entityType: string,
    entityId: string,
    data: T,
    changedBy?: string,
    changeReason?: string,
  ): number {
    // Get current max version for this entity
    const maxVersionResult = this.database
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) as max_version FROM version_history WHERE entity_type = ? AND entity_id = ?',
      )
      .get(entityType, entityId) as { max_version: number };

    const newVersion = maxVersionResult.max_version + 1;

    // Save the version
    this.database
      .prepare(
        `
        INSERT INTO version_history (entity_type, entity_id, version_number, data_snapshot, changed_by, change_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        entityType,
        entityId,
        newVersion,
        JSON.stringify(data),
        changedBy,
        changeReason,
      );

    return newVersion;
  }

  async getVersion<T>(
    entityType: string,
    entityId: string,
    version?: number,
  ): Promise<T | null> {
    let query: string;
    let params: any[];

    if (version) {
      query = `
        SELECT data_snapshot 
        FROM version_history 
        WHERE entity_type = ? AND entity_id = ? AND version_number = ?
      `;
      params = [entityType, entityId, version];
    } else {
      query = `
        SELECT data_snapshot 
        FROM version_history 
        WHERE entity_type = ? AND entity_id = ? 
        ORDER BY version_number DESC 
        LIMIT 1
      `;
      params = [entityType, entityId];
    }

    const result = this.database.prepare(query).get(...params) as
      | { data_snapshot: string }
      | undefined;

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.data_snapshot) as T;
    } catch (error) {
      this.logger.error(
        `Failed to parse version data for ${entityType}:${entityId}`,
        error,
      );
      return null;
    }
  }

  async listVersions(
    entityType: string,
    entityId: string,
  ): Promise<VersionInfo[]> {
    const results = this.database
      .prepare(
        `
        SELECT id, entity_type, entity_id, version_number, changed_by, change_reason, created_at
        FROM version_history
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY version_number DESC
      `,
      )
      .all(entityType, entityId) as any[];

    return results.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      version: row.version_number,
      versionNumber: row.version_number,
      created_by: row.changed_by,
      changedBy: row.changed_by,
      reason: row.change_reason,
      changeReason: row.change_reason,
      created_at: row.created_at,
      createdAt: row.created_at,
    }));
  }

  async rollbackToVersion(
    entityType: string,
    entityId: string,
    version: number,
  ): Promise<boolean> {
    const versionData = await this.getVersion(entityType, entityId, version);
    if (!versionData) {
      return false;
    }

    // Create a new version entry for the rollback
    this.saveVersion(
      entityType,
      entityId,
      versionData,
      'system',
      `Rollback to version ${version}`,
    );

    return true;
  }

  // Version cleanup
  async cleanupVersions(
    entityType: string,
    entityId: string,
    keepVersions: number = 5,
  ): Promise<number> {
    const deleteResult = this.database
      .prepare(
        `
        DELETE FROM version_history 
        WHERE entity_type = ? AND entity_id = ? AND id NOT IN (
          SELECT id FROM version_history 
          WHERE entity_type = ? AND entity_id = ?
          ORDER BY version_number DESC 
          LIMIT ?
        )
      `,
      )
      .run(entityType, entityId, entityType, entityId, keepVersions);

    return deleteResult.changes;
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      this.database.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  // Backup utilities
  async backup(backupPath: string): Promise<void> {
    try {
      this.database.backup(backupPath);
      this.logger.log(`Database backed up to ${backupPath}`);
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`, error);
      throw error;
    }
  }

  // Get database instance for advanced operations
  getDatabase(): Database.Database {
    return this.database;
  }
}
