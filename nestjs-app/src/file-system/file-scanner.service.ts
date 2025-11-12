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
}
