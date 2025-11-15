import { Injectable, Logger } from '@nestjs/common';
import { IBaseEntity, IEntity } from './entity.interface';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);
  private entities: Map<string, IEntity> = new Map();

  constructor(private readonly databaseService?: DatabaseService) {}

  async createEntity(
    entityData: Omit<IEntity, 'id'> | IEntity,
  ): Promise<IEntity> {
    const entity: IEntity = {
      ...entityData,
      id: (entityData as any).id || this.generateId(),
    };

    this.entities.set(entity.id, entity);

    // Save to database if available
    if (this.databaseService) {
      try {
        await this.saveEntityToDatabase(entity);
      } catch (error) {
        // Remove from memory since database save failed
        this.entities.delete(entity.id);
        this.logger.error(
          `Failed to save entity ${entity.id} to database:`,
          error,
        );
        throw new Error(
          `Failed to save entity ${entity.id} to database: ${error.message}`,
        );
      }
    }

    return entity;
  }

  getEntity(id: string): IEntity | undefined {
    return this.entities.get(id);
  }

  async getEntityWithFallback(
    id: string,
    gameId?: string,
  ): Promise<IEntity | undefined> {
    // First check in-memory cache
    let entity = this.entities.get(id);
    if (entity) {
      return entity;
    }

    // If not found and database is available, try to load from database
    if (this.databaseService && gameId) {
      entity = await this.loadEntityFromDatabase(id, gameId);
      if (entity) {
        this.entities.set(entity.id, entity);
        return entity;
      }
    }

    return undefined;
  }

  getAllEntities(): IEntity[] {
    return Array.from(this.entities.values());
  }

  async getAllEntitiesForGame(gameId: string): Promise<IEntity[]> {
    // Get all in-memory entities for this game
    const inMemoryEntities = Array.from(this.entities.values()).filter(
      (entity) => entity.gameId === gameId,
    );

    // If database is available, also load from database
    if (this.databaseService) {
      try {
        const dbEntities = await this.loadGameEntitiesFromDatabase(gameId);

        // Merge with in-memory entities, preferring in-memory versions
        const entityMap = new Map<string, IEntity>();

        // Add database entities first
        dbEntities.forEach((entity) => entityMap.set(entity.id, entity));

        // Override with in-memory entities
        inMemoryEntities.forEach((entity) => entityMap.set(entity.id, entity));

        return Array.from(entityMap.values());
      } catch (error) {
        this.logger.error(
          `Failed to load entities for game ${gameId} from database:`,
          error,
        );
      }
    }

    return inMemoryEntities;
  }

  async updateEntity(id: string, updates: Partial<IEntity>): Promise<boolean> {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Store original entity in case we need to rollback
    const originalEntity = { ...entity };

    Object.assign(entity, updates);

    // Save updated entity to database if available
    if (this.databaseService) {
      try {
        await this.saveEntityToDatabase(entity);
      } catch (error) {
        // Rollback in-memory changes since database update failed
        Object.assign(entity, originalEntity);
        this.logger.error(
          `Failed to update entity ${entity.id} in database:`,
          error,
        );
        throw new Error(
          `Failed to update entity ${entity.id} in database: ${error.message}`,
        );
      }
    }

    return true;
  }

  async deleteEntity(id: string): Promise<boolean> {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove from memory first
    const deleted = this.entities.delete(id);

    // Remove from database if available
    if (deleted && this.databaseService) {
      try {
        await this.deleteEntityFromDatabase(id);
      } catch (error) {
        // Restore in-memory entity since database deletion failed
        this.entities.set(id, entity);
        this.logger.error(
          `Failed to delete entity ${id} from database:`,
          error,
        );
        throw new Error(
          `Failed to delete entity ${id} from database: ${error.message}`,
        );
      }
    }

    return deleted;
  }

  // Enhanced persistence methods with database integration
  async persistEntities(): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      const entities = Array.from(this.entities.values());
      this.logger.log(`Persisting ${entities.length} entities to database`);

      for (const entity of entities) {
        await this.saveEntityToDatabase(entity);
      }

      this.logger.log('Successfully persisted all entities');
    } catch (error) {
      this.logger.error('Failed to persist entities:', error);
      throw error;
    }
  }

  async loadEntities(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const entities = gameId
        ? await this.loadGameEntitiesFromDatabase(gameId)
        : await this.loadAllEntitiesFromDatabase();

      this.logger.log(`Loading ${entities.length} entities from database`);

      // Clear current entities and load from database
      this.entities.clear();
      entities.forEach((entity) => this.entities.set(entity.id, entity));

      this.logger.log('Successfully loaded entities');
    } catch (error) {
      this.logger.error('Failed to load entities:', error);
      throw error;
    }
  }

  // Version management methods
  async saveEntityVersion(entityId: string, reason?: string): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const entity = this.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found in memory`);
    }

    return this.databaseService.saveVersion(
      'room',
      entityId,
      entity,
      'system',
      reason,
    );
  }

  async getEntityVersion(
    entityId: string,
    version?: number,
  ): Promise<IEntity | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('room', entityId, version);
  }

  async rollbackEntity(entityId: string, version: number): Promise<boolean> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const success = await this.databaseService.rollbackToVersion(
      'room',
      entityId,
      version,
    );

    if (success) {
      // Reload entity from database
      const entity = await this.loadEntityFromDatabase(entityId);
      if (entity) {
        this.entities.set(entityId, entity);
      }
    }

    return success;
  }

  // Clear in-memory cache
  clearCache(): void {
    this.entities.clear();
    this.logger.log('Entity cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; entities: string[] } {
    return {
      size: this.entities.size,
      entities: Array.from(this.entities.keys()),
    };
  }

  private async saveEntityToDatabase(entity: IEntity): Promise<void> {
    if (!this.databaseService) return;

    // This is a generic save - specific services will handle their own table schemas
    // For now, we'll save to version history for tracking
    await this.databaseService.saveVersion(
      this.getEntityType(entity),
      entity.id,
      entity,
      'entity_service',
      'Entity updated',
    );
  }

  private async loadEntityFromDatabase(
    id: string,
    gameId?: string,
  ): Promise<IEntity | undefined> {
    if (!this.databaseService) return undefined;

    try {
      // Try to load latest version from version history
      const entity = await this.databaseService.getVersion('room', id);
      return (entity as IEntity) || undefined;
    } catch (error) {
      this.logger.error(`Failed to load entity ${id} from database:`, error);
      return undefined;
    }
  }

  private async loadGameEntitiesFromDatabase(
    gameId: string,
  ): Promise<IEntity[]> {
    if (!this.databaseService) return [];

    // This would need to be implemented based on the specific table structure
    // For now, return empty array
    return [];
  }

  private async loadAllEntitiesFromDatabase(): Promise<IEntity[]> {
    if (!this.databaseService) return [];

    // This would need to be implemented based on the specific table structure
    // For now, return empty array
    return [];
  }

  private async deleteEntityFromDatabase(id: string): Promise<void> {
    if (!this.databaseService) return;

    // Database deletion would be handled by the specific services
    // since each entity type has its own table
  }

  private getEntityType(entity: IEntity): string {
    // Determine entity type from the entity data
    if (entity.type) {
      return entity.type;
    }

    // Default fallback
    return 'entity';
  }

  private generateId(): string {
    return uuidv4();
  }
}
