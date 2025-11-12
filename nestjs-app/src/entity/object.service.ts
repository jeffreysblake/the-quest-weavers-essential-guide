import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IObject, ISpatialRelationship } from './object.interface';
import { DatabaseService } from '../database/database.service';
import { ObjectData } from '../database/database.interfaces';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ObjectService {
  private readonly logger = new Logger(ObjectService.name);
  private objects: Map<string, IObject> = new Map();

  constructor(
    private readonly entityService: EntityService,
    private readonly databaseService?: DatabaseService,
  ) {}

  createObject(objectData: Omit<IObject, 'id' | 'type'>): IObject {
    // Create object with generated ID
    const object: IObject = {
      ...objectData,
      id: uuidv4(),
      type: 'object' as const,
      properties: objectData.properties || {},
      containedObjects: objectData.containedObjects || [],
      canContain: objectData.canContain || false,
      isContainer: objectData.isContainer || false,
      isPortable: objectData.isPortable ?? true,
    };

    // Store in local cache
    this.objects.set(object.id, object);

    // Also register in EntityService for compatibility (preserve existing ID)
    this.entityService['entities'].set(object.id, object);

    // Save to database if available
    if (this.databaseService) {
      this.saveObjectToDatabase(object).catch((error) => {
        this.logger.error(
          `Failed to save object ${object.id} to database:`,
          error,
        );
      });
    }

    return object;
  }

  getObject(id: string): IObject | undefined {
    // Check local cache first
    const object = this.objects.get(id);
    if (object) {
      return object;
    }

    // Fallback to EntityService
    const entity = this.entityService.getEntity(id);
    if (entity && entity.type === 'object') {
      return entity as IObject;
    }
    return undefined;
  }

  async getObjectWithFallback(
    id: string,
    gameId?: string,
  ): Promise<IObject | undefined> {
    // First check local cache
    let object = this.objects.get(id);
    if (object) {
      return object;
    }

    // Then check EntityService
    const entity = this.entityService.getEntity(id);
    if (entity && entity.type === 'object') {
      object = entity as IObject;
      this.objects.set(object.id, object);
      return object;
    }

    // If not found and database is available, try to load from database
    if (this.databaseService && gameId) {
      object = await this.loadObjectFromDatabase(id, gameId);
      if (object) {
        this.objects.set(object.id, object);
        this.entityService['entities'].set(object.id, object); // Sync with EntityService
        return object;
      }
    }

    return undefined;
  }

  async getAllObjectsForGame(gameId: string): Promise<IObject[]> {
    // Get all in-memory objects for this game
    const inMemoryObjects = Array.from(this.objects.values()).filter(
      (object) => object.gameId === gameId,
    );

    // If database is available, also load from database
    if (this.databaseService) {
      try {
        const dbObjects = await this.loadGameObjectsFromDatabase(gameId);

        // Merge with in-memory objects, preferring in-memory versions
        const objectMap = new Map<string, IObject>();

        // Add database objects first
        dbObjects.forEach((object) => objectMap.set(object.id, object));

        // Override with in-memory objects
        inMemoryObjects.forEach((object) => objectMap.set(object.id, object));

        return Array.from(objectMap.values());
      } catch (error) {
        this.logger.error(
          `Failed to load objects for game ${gameId} from database:`,
          error,
        );
      }
    }

    return inMemoryObjects;
  }

  getAllObjects(): IObject[] {
    return Array.from(this.objects.values());
  }

  // Alias for compatibility
  findAll(): IObject[] {
    return Array.from(this.objects.values());
  }

  // Alias for compatibility
  findById(id: string): IObject | undefined {
    return this.getObject(id);
  }

  // Alias for compatibility
  create(objectData: Omit<IObject, 'id' | 'type'>): IObject {
    return this.createObject(objectData);
  }

  // Place an object in a room
  placeInRoom(objectId: string, roomId: string): boolean {
    const object = this.getObject(objectId);
    if (!object) {
      return false;
    }

    // Update object's position/location
    object.roomId = roomId;

    // Update in local cache
    this.objects.set(objectId, object);

    // Update in EntityService
    this.entityService.updateEntity(objectId, object);

    return true;
  }

  update(id: string, updates: Partial<IObject>): boolean {
    return this.updateObject(id, updates);
  }

  updateObject(
    id: string,
    updates: Partial<Omit<IObject, 'id' | 'type'>>,
  ): boolean {
    const object = this.getObject(id);
    if (!object) return false;

    // Update the entity
    return this.entityService.updateEntity(id, {
      ...updates,
      type: 'object',
    });
  }

  placeObject(objectId: string, relationship: ISpatialRelationship): boolean {
    const object = this.getObject(objectId);
    const target = this.entityService.getEntity(relationship.targetId);

    if (!object || !target) return false;

    // Validate placement constraints
    if (!this.canPlaceObject(object, target, relationship.relationshipType)) {
      return false;
    }

    // Handle container relationships
    if (relationship.relationshipType === 'inside') {
      const targetObject = target as IObject;
      if (targetObject.type === 'object' && targetObject.isContainer) {
        if (!targetObject.containedObjects) targetObject.containedObjects = [];
        if (!targetObject.containedObjects.includes(objectId)) {
          targetObject.containedObjects.push(objectId);
        }
      }
    }

    // Update object's spatial relationship
    object.spatialRelationship = relationship;
    return this.entityService.updateEntity(objectId, object);
  }

  removeObjectFromContainer(objectId: string, containerId: string): boolean {
    const container = this.getObject(containerId);
    if (!container || !container.containedObjects) return false;

    const index = container.containedObjects.indexOf(objectId);
    if (index > -1) {
      container.containedObjects.splice(index, 1);

      // Clear spatial relationship
      const object = this.getObject(objectId);
      if (object) {
        object.spatialRelationship = undefined;
        this.entityService.updateEntity(objectId, object);
      }

      return this.entityService.updateEntity(containerId, container);
    }
    return false;
  }

  getObjectsInContainer(containerId: string): IObject[] {
    const container = this.getObject(containerId);
    if (!container || !container.containedObjects) return [];

    return container.containedObjects
      .map((id) => this.getObject(id))
      .filter((obj) => obj !== undefined);
  }

  getObjectLocation(objectId: string): string {
    const object = this.getObject(objectId);
    if (!object || !object.spatialRelationship) {
      return `${object?.name || 'Unknown object'} is not placed anywhere`;
    }

    const target = this.entityService.getEntity(
      object.spatialRelationship.targetId,
    );
    const relationship = object.spatialRelationship.relationshipType.replace(
      '_',
      ' ',
    );

    return (
      object.spatialRelationship.description ||
      `${object.name} is ${relationship} ${target?.name || 'unknown target'}`
    );
  }

  private canPlaceObject(
    object: IObject,
    target: any,
    relationshipType: string,
  ): boolean {
    // Basic validation
    if (object.id === target.id) return false;

    switch (relationshipType) {
      case 'inside':
        if (target.type !== 'object') return false;
        const targetObj = target as IObject;
        if (!targetObj.isContainer || !targetObj.canContain) return false;
        if (targetObj.state?.isLocked) return false;

        // Container must be open to place items inside (unless it starts open)
        if (
          targetObj.state &&
          targetObj.state.isOpen !== undefined &&
          !targetObj.state.isOpen
        ) {
          return false;
        }

        // Check capacity
        const currentCount = targetObj.containedObjects?.length || 0;
        const capacity = targetObj.containerCapacity || 10;
        return currentCount < capacity;

      case 'on_top_of':
        // Can't place on top of very small objects
        return (
          target.type === 'object' &&
          (target as IObject).objectType === 'furniture'
        );

      case 'next_to':
      case 'underneath':
      case 'attached_to':
        return true;

      default:
        return false;
    }
  }

  // Enhanced persistence methods with database integration
  async persistObjects(): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      const objects = Array.from(this.objects.values());
      this.logger.log(`Persisting ${objects.length} objects to database`);

      for (const object of objects) {
        await this.saveObjectToDatabase(object);
      }

      this.logger.log('Successfully persisted all objects');
    } catch (error) {
      this.logger.error('Failed to persist objects:', error);
      throw error;
    }
  }

  async loadObjects(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const objects = gameId
        ? await this.loadGameObjectsFromDatabase(gameId)
        : await this.loadAllObjectsFromDatabase();

      this.logger.log(`Loading ${objects.length} objects from database`);

      // Clear current objects and load from database
      this.objects.clear();
      objects.forEach((object) => {
        this.objects.set(object.id, object);
        this.entityService['entities'].set(object.id, object); // Sync with EntityService
      });

      this.logger.log('Successfully loaded objects');
    } catch (error) {
      this.logger.error('Failed to load objects:', error);
      throw error;
    }
  }

  // Version management methods
  async saveObjectVersion(objectId: string, reason?: string): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const object = this.objects.get(objectId);
    if (!object) {
      throw new Error(`Object ${objectId} not found in memory`);
    }

    return this.databaseService.saveVersion(
      'object',
      objectId,
      object,
      'object_service',
      reason,
    );
  }

  async getObjectVersion(
    objectId: string,
    version?: number,
  ): Promise<IObject | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('object', objectId, version);
  }

  async rollbackObject(objectId: string, version: number): Promise<boolean> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const success = await this.databaseService.rollbackToVersion(
      'object',
      objectId,
      version,
    );

    if (success) {
      // Reload object from database
      const object = await this.loadObjectFromDatabase(objectId);
      if (object) {
        this.objects.set(objectId, object);
        this.entityService.updateEntity(objectId, object); // Sync with EntityService
      }
    }

    return success;
  }

  // Dynamic loading for gameplay
  async loadObjectOnDemand(
    gameId: string,
    objectId: string,
  ): Promise<IObject | undefined> {
    // Check if already loaded
    const existingObject = this.objects.get(objectId);
    if (existingObject) {
      return existingObject;
    }

    // Load from database
    const object = await this.getObjectWithFallback(objectId, gameId);
    return object;
  }

  async refreshObject(
    gameId: string,
    objectId: string,
  ): Promise<IObject | undefined> {
    // Force reload from database
    if (this.databaseService) {
      const object = await this.loadObjectFromDatabase(objectId, gameId);
      if (object) {
        this.objects.set(objectId, object);
        this.entityService.updateEntity(objectId, object); // Sync with EntityService
        return object;
      }
    }
    return this.objects.get(objectId);
  }

  // Clear in-memory cache
  clearCache(): void {
    this.objects.clear();
    this.logger.log('Object cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; objects: string[] } {
    return {
      size: this.objects.size,
      objects: Array.from(this.objects.keys()),
    };
  }

  // Database integration methods
  private async saveObjectToDatabase(object: IObject): Promise<void> {
    if (!this.databaseService) return;

    try {
      this.databaseService.transaction((db) => {
        // Convert IObject to ObjectData format for database
        const objectData: ObjectData = {
          id: object.id,
          gameId: object.gameId || 'default',
          name: object.name,
          description: object.description,
          objectType: object.objectType,
          position: object.position || { x: 0, y: 0, z: 0 },
          material: object.material,
          materialProperties: object.materialProperties
            ? {
                material: String(object.materialProperties.material),
                density: object.materialProperties.density || 1,
                conductivity: object.materialProperties.conductivity || 0,
                flammability: object.materialProperties.flammability || 0,
                brittleness: object.materialProperties.brittleness || 0,
                resistances: object.materialProperties.resistances,
              }
            : undefined,
          weight: object.weight || 0,
          health: object.health,
          maxHealth: object.maxHealth,
          isPortable: object.isPortable ?? true,
          isContainer: object.isContainer || false,
          canContain: object.canContain || false,
          containerCapacity: object.containerCapacity || 0,
          stateData: object.state,
          properties: object.properties,
          version: 1,
          createdAt: new Date().toISOString(),
        };

        // Save to objects table
        const insertObject = db.prepare(`
          INSERT OR REPLACE INTO objects (
            id, game_id, name, description, object_type, position_x, position_y, position_z,
            material, material_properties, weight, health, max_health, is_portable, is_container,
            can_contain, container_capacity, state_data, properties, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertObject.run(
          objectData.id,
          objectData.gameId,
          objectData.name,
          objectData.description,
          objectData.objectType,
          objectData.position.x,
          objectData.position.y,
          objectData.position.z,
          objectData.material,
          JSON.stringify(objectData.materialProperties),
          objectData.weight,
          objectData.health,
          objectData.maxHealth,
          objectData.isPortable ? 1 : 0,
          objectData.isContainer ? 1 : 0,
          objectData.canContain ? 1 : 0,
          objectData.containerCapacity,
          JSON.stringify(objectData.stateData),
          JSON.stringify(objectData.properties),
          objectData.version,
          objectData.createdAt,
        );

        // Save spatial relationships if they exist
        if (object.spatialRelationship) {
          // Clear existing relationships for this object
          db.prepare(
            'DELETE FROM spatial_relationships WHERE object_id = ?',
          ).run(object.id);

          const insertRelationship = db.prepare(`
            INSERT INTO spatial_relationships (object_id, target_id, relationship_type, description, created_at)
            VALUES (?, ?, ?, ?, ?)
          `);

          insertRelationship.run(
            object.id,
            object.spatialRelationship.targetId,
            object.spatialRelationship.relationshipType,
            object.spatialRelationship.description,
            new Date().toISOString(),
          );
        }
      });

      // Save version history
      this.databaseService.saveVersion(
        'object',
        object.id,
        object,
        'object_service',
        'Object updated',
      );
    } catch (error) {
      this.logger.error(
        `Failed to save object ${object.id} to database:`,
        error,
      );
      throw error;
    }
  }

  private async loadObjectFromDatabase(
    objectId: string,
    gameId?: string,
  ): Promise<IObject | undefined> {
    if (!this.databaseService) return undefined;

    try {
      // Load object from database
      const objectQuery = this.databaseService.prepare(`
        SELECT * FROM objects 
        WHERE id = ? ${gameId ? 'AND game_id = ?' : ''}
      `);

      const objectRow = gameId
        ? (objectQuery.get(objectId, gameId) as any)
        : (objectQuery.get(objectId) as any);

      if (!objectRow) return undefined;

      // Load spatial relationships
      const relationshipQuery = this.databaseService.prepare(`
        SELECT * FROM spatial_relationships WHERE object_id = ?
      `);
      const relationshipRow = relationshipQuery.get(objectId) as any;

      // Convert database format to IObject
      const object: IObject = {
        id: objectRow.id,
        name: objectRow.name,
        description: objectRow.description,
        type: 'object',
        objectType: objectRow.object_type,
        position: {
          x: objectRow.position_x || 0,
          y: objectRow.position_y || 0,
          z: objectRow.position_z || 0,
        },
        material: objectRow.material,
        materialProperties: objectRow.material_properties
          ? JSON.parse(objectRow.material_properties)
          : undefined,
        weight: objectRow.weight || 0,
        health: objectRow.health,
        maxHealth: objectRow.max_health,
        isPortable: objectRow.is_portable ?? true,
        isContainer: objectRow.is_container || false,
        canContain: objectRow.can_contain || false,
        containerCapacity: objectRow.container_capacity || 0,
        containedObjects: [], // Would need to be loaded separately
        state: objectRow.state_data
          ? JSON.parse(objectRow.state_data)
          : undefined,
        properties: objectRow.properties
          ? JSON.parse(objectRow.properties)
          : {},
        gameId: objectRow.game_id,
      };

      // Add spatial relationship if exists
      if (relationshipRow) {
        object.spatialRelationship = {
          targetId: relationshipRow.target_id,
          relationshipType: relationshipRow.relationship_type,
          description: relationshipRow.description,
        };
      }

      return object;
    } catch (error) {
      this.logger.error(
        `Failed to load object ${objectId} from database:`,
        error,
      );
      return undefined;
    }
  }

  private async loadGameObjectsFromDatabase(
    gameId: string,
  ): Promise<IObject[]> {
    if (!this.databaseService) return [];

    try {
      const query = this.databaseService.prepare(
        'SELECT * FROM objects WHERE game_id = ?',
      );
      const rows = query.all(gameId) as any[];

      const objects: IObject[] = [];

      for (const row of rows) {
        const object = await this.loadObjectFromDatabase(row.id, gameId);
        if (object) {
          objects.push(object);
        }
      }

      return objects;
    } catch (error) {
      this.logger.error(
        `Failed to load objects for game ${gameId} from database:`,
        error,
      );
      return [];
    }
  }

  private async loadAllObjectsFromDatabase(): Promise<IObject[]> {
    if (!this.databaseService) return [];

    try {
      const query = this.databaseService.prepare('SELECT * FROM objects');
      const rows = query.all() as any[];

      const objects: IObject[] = [];

      for (const row of rows) {
        const object = await this.loadObjectFromDatabase(row.id);
        if (object) {
          objects.push(object);
        }
      }

      return objects;
    } catch (error) {
      this.logger.error('Failed to load all objects from database:', error);
      return [];
    }
  }

  // Missing methods for game service compatibility
  updateObjectPosition(
    objectId: string,
    newPosition: { x: number; y: number; z: number },
  ): boolean {
    return this.updateObject(objectId, { position: newPosition });
  }

  getSpatialRelationships(objectId: string): ISpatialRelationship[] {
    const object = this.getObject(objectId);
    if (!object || !object.spatialRelationship) return [];

    return [object.spatialRelationship];
  }
}
