import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  GameFileInfo,
  ChangeSet,
  EntityChange,
  EntityType,
} from '../database/database.interfaces';

@Injectable()
export class FileScannerService {
  private readonly logger = new Logger(FileScannerService.name);
  private readonly gamesDirectory: string;

  constructor() {
    this.gamesDirectory = path.join(process.cwd(), 'games');
  }

  async scanGameDirectory(gameDirectory: string): Promise<GameFileInfo> {
    const fullPath = path.join(this.gamesDirectory, gameDirectory);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Game directory does not exist: ${gameDirectory}`);
    }

    const gameId = gameDirectory;
    const configPath = path.join(fullPath, 'game-config.json');
    const hasConfig = fs.existsSync(configPath);

    // Count files in each subdirectory
    const roomsDir = path.join(fullPath, 'rooms');
    const objectsDir = path.join(fullPath, 'objects');
    const npcsDir = path.join(fullPath, 'npcs');

    const roomCount = fs.existsSync(roomsDir)
      ? fs.readdirSync(roomsDir).filter((f) => f.endsWith('.json')).length
      : 0;

    const objectCount = fs.existsSync(objectsDir)
      ? fs.readdirSync(objectsDir).filter((f) => f.endsWith('.json')).length
      : 0;

    const npcCount = fs.existsSync(npcsDir)
      ? fs.readdirSync(npcsDir).filter((f) => f.endsWith('.json')).length
      : 0;

    // Get the most recent modification time
    const lastModified = await this.getLastModifiedTime(fullPath);

    return {
      gameId,
      directory: gameDirectory,
      hasConfig,
      roomCount,
      objectCount,
      npcCount,
      lastModified,
    };
  }

  async scanAllGames(): Promise<GameFileInfo[]> {
    if (!fs.existsSync(this.gamesDirectory)) {
      this.logger.warn(
        `Games directory does not exist: ${this.gamesDirectory}`,
      );
      return [];
    }

    const gameDirectories = fs
      .readdirSync(this.gamesDirectory, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const gameInfos: GameFileInfo[] = [];

    for (const gameDir of gameDirectories) {
      try {
        const gameInfo = await this.scanGameDirectory(gameDir);
        gameInfos.push(gameInfo);
      } catch (error) {
        this.logger.error(`Error scanning game directory ${gameDir}:`, error);
      }
    }

    return gameInfos;
  }

  async detectChanges(gameId: string, lastSyncTime?: Date): Promise<ChangeSet> {
    const gameDirectory = path.join(this.gamesDirectory, gameId);
    const changes: EntityChange[] = [];

    if (!fs.existsSync(gameDirectory)) {
      this.logger.warn(`Game directory does not exist: ${gameId}`);
      return { gameId, changes };
    }

    // Check game config
    const configPath = path.join(gameDirectory, 'game-config.json');
    if (fs.existsSync(configPath)) {
      const configStat = fs.statSync(configPath);
      if (!lastSyncTime || configStat.mtime > lastSyncTime) {
        changes.push({
          type: 'update',
          entityType: 'game',
          entityId: gameId,
          filePath: configPath,
          lastModified: configStat.mtime,
          reason: 'Game configuration updated',
        });
      }
    }

    // Check rooms
    const roomsDir = path.join(gameDirectory, 'rooms');
    if (fs.existsSync(roomsDir)) {
      const roomChanges = await this.detectEntityChanges(
        roomsDir,
        'room',
        lastSyncTime,
        (filename) => path.basename(filename, '.json'),
      );
      changes.push(...roomChanges);
    }

    // Check objects
    const objectsDir = path.join(gameDirectory, 'objects');
    if (fs.existsSync(objectsDir)) {
      const objectChanges = await this.detectEntityChanges(
        objectsDir,
        'object',
        lastSyncTime,
        (filename) => path.basename(filename, '.json'),
      );
      changes.push(...objectChanges);
    }

    // Check NPCs
    const npcsDir = path.join(gameDirectory, 'npcs');
    if (fs.existsSync(npcsDir)) {
      const npcChanges = await this.detectEntityChanges(
        npcsDir,
        'npc',
        lastSyncTime,
        (filename) => path.basename(filename, '.json'),
      );
      changes.push(...npcChanges);
    }

    // Check connections
    const connectionsPath = path.join(gameDirectory, 'connections.json');
    if (fs.existsSync(connectionsPath)) {
      const connectionsStat = fs.statSync(connectionsPath);
      if (!lastSyncTime || connectionsStat.mtime > lastSyncTime) {
        changes.push({
          type: 'update',
          entityType: 'game',
          entityId: `${gameId}-connections`,
          filePath: connectionsPath,
          lastModified: connectionsStat.mtime,
          reason: 'Room connections updated',
        });
      }
    }

    this.logger.log(`Detected ${changes.length} changes for game ${gameId}`);
    return { gameId, changes };
  }

  private async detectEntityChanges(
    directory: string,
    entityType: EntityType,
    lastSyncTime?: Date,
    getEntityId: (filename: string) => string = (f) => f,
  ): Promise<EntityChange[]> {
    const changes: EntityChange[] = [];

    if (!fs.existsSync(directory)) {
      return changes;
    }

    const files = fs.readdirSync(directory).filter((f) => f.endsWith('.json'));

    for (const filename of files) {
      const filePath = path.join(directory, filename);
      const fileStat = fs.statSync(filePath);
      const entityId = getEntityId(filename);

      if (!lastSyncTime || fileStat.mtime > lastSyncTime) {
        changes.push({
          type: 'update',
          entityType,
          entityId,
          filePath,
          lastModified: fileStat.mtime,
          reason: `${entityType} file updated`,
        });
      }
    }

    return changes;
  }

  private async getLastModifiedTime(directory: string): Promise<Date> {
    let lastModified = new Date(0);

    const scanDirectory = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isFile()) {
          const stat = fs.statSync(fullPath);
          if (stat.mtime > lastModified) {
            lastModified = stat.mtime;
          }
        } else if (item.isDirectory()) {
          scanDirectory(fullPath);
        }
      }
    };

    scanDirectory(directory);
    return lastModified;
  }

  async getFileContent(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  async writeFileContent(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  async deleteFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async ensureGameDirectory(gameId: string): Promise<string> {
    const gameDir = path.join(this.gamesDirectory, gameId);

    // Create main game directory
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    // Create subdirectories
    const subdirs = ['rooms', 'objects', 'npcs'];
    for (const subdir of subdirs) {
      const subdirPath = path.join(gameDir, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath);
      }
    }

    // Create assets directory structure
    const assetsDir = path.join(gameDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir);
    }

    const assetSubdirs = [
      'images/rooms',
      'images/npcs',
      'images/objects',
      'audio/dialogue',
      'audio/ambient',
      'audio/sfx',
    ];

    for (const assetSubdir of assetSubdirs) {
      const assetPath = path.join(assetsDir, assetSubdir);
      if (!fs.existsSync(assetPath)) {
        fs.mkdirSync(assetPath, { recursive: true });
      }
    }

    // Create asset metadata file if it doesn't exist
    const metadataPath = path.join(assetsDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      const defaultMetadata = {
        gameId,
        assets: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      fs.writeFileSync(metadataPath, JSON.stringify(defaultMetadata, null, 2));
    }

    return gameDir;
  }

  async validateGameDirectory(gameDirectory: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fullPath = path.join(this.gamesDirectory, gameDirectory);

    // Check if directory exists
    if (!fs.existsSync(fullPath)) {
      errors.push(`Game directory does not exist: ${gameDirectory}`);
      return { isValid: false, errors, warnings };
    }

    // Check for game-config.json
    const configPath = path.join(fullPath, 'game-config.json');
    if (!fs.existsSync(configPath)) {
      errors.push('Missing game-config.json');
    } else {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (!config.id) errors.push('Game config missing required field: id');
        if (!config.name)
          errors.push('Game config missing required field: name');
      } catch (error) {
        errors.push(`Invalid JSON in game-config.json: ${error.message}`);
      }
    }

    // Check subdirectories
    const requiredDirs = ['rooms', 'objects', 'npcs'];
    for (const dir of requiredDirs) {
      const dirPath = path.join(fullPath, dir);
      if (!fs.existsSync(dirPath)) {
        warnings.push(`Missing ${dir} directory`);
      } else {
        const files = fs
          .readdirSync(dirPath)
          .filter((f) => f.endsWith('.json'));
        if (files.length === 0) {
          warnings.push(`${dir} directory is empty`);
        }
      }
    }

    // Check for connections.json
    const connectionsPath = path.join(fullPath, 'connections.json');
    if (!fs.existsSync(connectionsPath)) {
      warnings.push('Missing connections.json - rooms will not be connected');
    } else {
      try {
        const connectionsContent = fs.readFileSync(connectionsPath, 'utf-8');
        const connections = JSON.parse(connectionsContent);

        if (
          !connections.connections ||
          !Array.isArray(connections.connections)
        ) {
          errors.push(
            'Invalid connections.json structure - missing connections array',
          );
        }
      } catch (error) {
        errors.push(`Invalid JSON in connections.json: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  getGamesDirectory(): string {
    return this.gamesDirectory;
  }

  async listGameDirectories(): Promise<string[]> {
    if (!fs.existsSync(this.gamesDirectory)) {
      return [];
    }

    return fs
      .readdirSync(this.gamesDirectory, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  }

  // Priority 2: File System Features

  /**
   * Scan directory for game folders
   * @param directory - Directory path to scan (relative or absolute)
   * @returns Object with game list, total count, and any errors
   */
  scanGamesDirectory(directory: string): {
    games: Array<{ gameId: string; name: string; path: string }>;
    totalGames: number;
    errors: string[];
  } {
    const scanPath = path.isAbsolute(directory)
      ? directory
      : path.join(process.cwd(), directory);

    const games: Array<{ gameId: string; name: string; path: string }> = [];
    const errors: string[] = [];

    if (!fs.existsSync(scanPath)) {
      const errorMsg = `Directory does not exist: ${scanPath}`;
      this.logger.warn(errorMsg);
      errors.push(errorMsg);
      return { games: [], totalGames: 0, errors };
    }

    try {
      const entries = fs.readdirSync(scanPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const gamePath = path.join(scanPath, entry.name);
          const configPath = path.join(gamePath, 'game-config.json');

          // Check if this folder has a game-config.json
          if (fs.existsSync(configPath)) {
            try {
              const configContent = fs.readFileSync(configPath, 'utf-8');
              const config = JSON.parse(configContent);

              games.push({
                gameId: config.id || entry.name,
                name: config.name || entry.name,
                path: gamePath,
              });
            } catch (error) {
              const errorMsg = `Failed to parse game-config.json in ${entry.name}: ${error.message}`;
              this.logger.warn(errorMsg);
              errors.push(errorMsg);
              // Still add it with default values
              games.push({
                gameId: entry.name,
                name: entry.name,
                path: gamePath,
              });
            }
          }
        }
      }

      this.logger.log(`Found ${games.length} games in ${scanPath}`);
      return { games, totalGames: games.length, errors };
    } catch (error) {
      const errorMsg = `Error scanning directory ${scanPath}: ${error.message}`;
      this.logger.error(errorMsg, error);
      errors.push(errorMsg);
      return { games: [], totalGames: 0, errors };
    }
  }

  /**
   * Validate individual file JSON syntax and structure
   * @param filePath - Path to the file to validate
   * @returns Validation result with errors if any
   */
  validateGameFile(filePath: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      errors.push(`File does not exist: ${filePath}`);
      return { isValid: false, errors };
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      errors.push(`Path is not a file: ${filePath}`);
      return { isValid: false, errors };
    }

    // Validate JSON syntax
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Determine file type based on filename and path
      const fileName = path.basename(filePath);
      const dirName = path.basename(path.dirname(filePath));

      // Validate structure based on file type
      if (fileName === 'game-config.json') {
        this.validateGameConfig(data, errors);
      } else if (fileName === 'connections.json') {
        this.validateConnections(data, errors);
      } else if (dirName === 'rooms') {
        this.validateRoom(data, errors);
      } else if (dirName === 'objects') {
        this.validateObject(data, errors);
      } else if (dirName === 'npcs') {
        this.validateNPC(data, errors);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        errors.push(`Invalid JSON syntax: ${error.message}`);
      } else {
        errors.push(`Error reading file: ${error.message}`);
      }
      return { isValid: false, errors };
    }

    return { isValid: errors.length === 0, errors };
  }

  // Helper validation methods
  private validateGameConfig(data: any, errors: string[]): void {
    if (!data.id) errors.push('Missing required field: id');
    if (!data.name) errors.push('Missing required field: name');
    if (typeof data.id !== 'string') errors.push('Field "id" must be a string');
    if (typeof data.name !== 'string')
      errors.push('Field "name" must be a string');
  }

  private validateConnections(data: any, errors: string[]): void {
    if (!data.connections || !Array.isArray(data.connections)) {
      errors.push('Missing or invalid "connections" array');
      return;
    }

    data.connections.forEach((conn: any, index: number) => {
      if (!conn.from) errors.push(`Connection ${index}: missing "from" field`);
      if (!conn.to) errors.push(`Connection ${index}: missing "to" field`);
      if (!conn.direction)
        errors.push(`Connection ${index}: missing "direction" field`);
    });
  }

  private validateRoom(data: any, errors: string[]): void {
    if (!data.id) errors.push('Missing required field: id');
    if (!data.name) errors.push('Missing required field: name');
    if (!data.description) errors.push('Missing required field: description');

    if (data.position) {
      if (typeof data.position.x !== 'number')
        errors.push('position.x must be a number');
      if (typeof data.position.y !== 'number')
        errors.push('position.y must be a number');
      if (typeof data.position.z !== 'number')
        errors.push('position.z must be a number');
    }
  }

  private validateObject(data: any, errors: string[]): void {
    if (!data.id) errors.push('Missing required field: id');
    if (!data.name) errors.push('Missing required field: name');
    if (!data.objectType) errors.push('Missing required field: objectType');

    const validTypes = [
      'item',
      'furniture',
      'weapon',
      'consumable',
      'container',
    ];
    if (data.objectType && !validTypes.includes(data.objectType)) {
      errors.push(
        `Invalid objectType: ${data.objectType}. Must be one of: ${validTypes.join(', ')}`,
      );
    }
  }

  private validateNPC(data: any, errors: string[]): void {
    if (!data.id) errors.push('Missing required field: id');
    if (!data.name) errors.push('Missing required field: name');
    if (!data.description) errors.push('Missing required field: description');

    if (data.position) {
      if (typeof data.position.x !== 'number')
        errors.push('position.x must be a number');
      if (typeof data.position.y !== 'number')
        errors.push('position.y must be a number');
      if (typeof data.position.z !== 'number')
        errors.push('position.z must be a number');
    }
  }
}
