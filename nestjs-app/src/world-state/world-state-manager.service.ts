import { Injectable, Logger } from '@nestjs/common';
import {
  IWorldState,
  IDoorState,
  IObjectState,
  INpcState,
  IEnvironmentState,
  IStateChange,
  IStateUpdateRequest,
  IStateUpdateResult,
  IStateQuery,
  IWorldStateStats,
  StateChangeType,
} from './world-state.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';

/**
 * Manages persistent world state changes
 *
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in world state updates
 * - Per-game locks prevent concurrent modifications to world state
 * - Prevents lost updates when multiple operations modify state simultaneously
 * - All locks have 5-second timeout to prevent permanent deadlocks
 */
@Injectable()
export class WorldStateManagerService {
  private readonly logger = new Logger(WorldStateManagerService.name);
  private worldStates: Map<string, IWorldState> = new Map(); // gameId -> world state
  private changeHistory: Map<string, IStateChange[]> = new Map(); // gameId -> changes
  private readonly MAX_HISTORY = 1000; // Max changes to keep per game

  // Concurrency protection
  private readonly worldStateLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 5000;

  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Get or create a lock for a specific game's world state
   */
  private getWorldStateLock(gameId: string): Mutex {
    if (!this.worldStateLocks.has(gameId)) {
      this.worldStateLocks.set(gameId, new Mutex());
    }
    return this.worldStateLocks.get(gameId)!;
  }

  /**
   * Initialize world state for a game
   */
  async initializeWorldState(gameId: string): Promise<IWorldState> {
    // Try to load from database first
    const loadedState = await this.loadWorldStateFromDatabase(gameId);

    if (loadedState) {
      this.worldStates.set(gameId, loadedState);
      this.changeHistory.set(gameId, []);
      this.logger.log(`Loaded world state for game ${gameId} from database`);
      return loadedState;
    }

    // Create new world state if none exists
    const worldState: IWorldState = {
      gameId,
      doors: new Map(),
      objects: new Map(),
      npcs: new Map(),
      environments: new Map(),
      globalFlags: {},
      globalVariables: {},
      lastUpdated: new Date().toISOString(),
    };

    this.worldStates.set(gameId, worldState);
    this.changeHistory.set(gameId, []);

    this.logger.log(`Initialized new world state for game ${gameId}`);
    return worldState;
  }

  /**
   * Update world state
   * THREAD-SAFE: Acquires world state lock to prevent concurrent state modifications
   */
  async updateState(request: IStateUpdateRequest): Promise<IStateUpdateResult> {
    const lock = this.getWorldStateLock(request.gameId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          let worldState = this.worldStates.get(request.gameId);

          if (!worldState) {
            worldState = await this.initializeWorldState(request.gameId);
          }

          let previousState: any;
          let newState: any;

          // Handle different entity types
          switch (request.entityType) {
            case 'door':
              const result = this.updateDoorState(
                worldState,
                request.entityId,
                request.newState,
                request.changedBy,
              );
              previousState = result.previousState;
              newState = result.newState;
              break;

            case 'object':
              const objResult = this.updateObjectState(
                worldState,
                request.entityId,
                request.newState,
                request.changedBy,
              );
              previousState = objResult.previousState;
              newState = objResult.newState;
              break;

            case 'npc':
              const npcResult = this.updateNpcState(
                worldState,
                request.entityId,
                request.newState,
                request.changedBy,
              );
              previousState = npcResult.previousState;
              newState = npcResult.newState;
              break;

            case 'environment':
              const envResult = this.updateEnvironmentState(
                worldState,
                request.entityId,
                request.newState,
              );
              previousState = envResult.previousState;
              newState = envResult.newState;
              break;

            case 'global':
              // Handle global flags/variables
              if (request.changeType === StateChangeType.CUSTOM) {
                previousState = {
                  ...worldState.globalFlags,
                  ...worldState.globalVariables,
                };
                Object.assign(
                  worldState.globalFlags,
                  request.newState.flags || {},
                );
                Object.assign(
                  worldState.globalVariables,
                  request.newState.variables || {},
                );
                newState = {
                  ...worldState.globalFlags,
                  ...worldState.globalVariables,
                };
              }
              break;

            default:
              return {
                success: false,
                message: `Unknown entity type: ${request.entityType}`,
              };
          }

          // Record state change
          const stateChange: IStateChange = {
            id: uuidv4(),
            gameId: request.gameId,
            changeType: request.changeType,
            entityId: request.entityId,
            entityType: request.entityType,
            previousState,
            newState,
            changedBy: request.changedBy,
            timestamp: new Date().toISOString(),
            reason: request.reason,
          };

          // Add to history
          const history = this.changeHistory.get(request.gameId) || [];
          history.push(stateChange);

          // Trim history if needed
          if (history.length > this.MAX_HISTORY) {
            history.shift();
          }

          this.changeHistory.set(request.gameId, history);

          // Update world state timestamp
          worldState.lastUpdated = new Date().toISOString();

          // Save to database
          await this.saveWorldStateToDatabase(request.gameId, worldState);

          // Emit event
          await this.eventEmitter.emit(
            GameEventType.CUSTOM_EVENT,
            {
              action: 'world_state_changed',
              changeType: request.changeType,
              entityId: request.entityId,
              entityType: request.entityType,
            },
            request.gameId,
          );

          this.logger.log(
            `Updated ${request.entityType} state: ${request.entityId} (${request.changeType})`,
          );

          return {
            success: true,
            message: 'State updated successfully',
            stateChange,
            previousState,
            newState,
          };
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout updating world state for game ${request.gameId}`,
        );
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
  }

  /**
   * Update door state
   */
  private updateDoorState(
    worldState: IWorldState,
    doorId: string,
    newState: Partial<IDoorState>,
    changedBy?: string,
  ): { previousState?: IDoorState; newState: IDoorState } {
    const previousState = worldState.doors.get(doorId);

    const updatedState: IDoorState = {
      doorId,
      isOpen: newState.isOpen ?? previousState?.isOpen ?? false,
      isLocked: newState.isLocked ?? previousState?.isLocked ?? false,
      requiredKeyId: newState.requiredKeyId ?? previousState?.requiredKeyId,
      openedBy: newState.isOpen ? changedBy : previousState?.openedBy,
      openedAt: newState.isOpen
        ? new Date().toISOString()
        : previousState?.openedAt,
    };

    worldState.doors.set(doorId, updatedState);

    return { previousState, newState: updatedState };
  }

  /**
   * Update object state
   */
  private updateObjectState(
    worldState: IWorldState,
    objectId: string,
    newState: Partial<IObjectState>,
    changedBy?: string,
  ): { previousState?: IObjectState; newState: IObjectState } {
    const previousState = worldState.objects.get(objectId);

    const updatedState: IObjectState = {
      objectId,
      exists: newState.exists ?? previousState?.exists ?? true,
      position: newState.position ?? previousState?.position,
      roomId: newState.roomId ?? previousState?.roomId,
      customState: { ...previousState?.customState, ...newState.customState },
      lastModified: new Date().toISOString(),
      modifiedBy: changedBy,
    };

    worldState.objects.set(objectId, updatedState);

    return { previousState, newState: updatedState };
  }

  /**
   * Update NPC state
   */
  private updateNpcState(
    worldState: IWorldState,
    npcId: string,
    newState: Partial<INpcState>,
    changedBy?: string,
  ): { previousState?: INpcState; newState: INpcState } {
    const previousState = worldState.npcs.get(npcId);

    const updatedState: INpcState = {
      npcId,
      alive: newState.alive ?? previousState?.alive ?? true,
      position: newState.position ?? previousState?.position,
      roomId: newState.roomId ?? previousState?.roomId,
      health: newState.health ?? previousState?.health,
      attitude: newState.attitude ?? previousState?.attitude,
      currentActivity:
        newState.currentActivity ?? previousState?.currentActivity,
      customState: { ...previousState?.customState, ...newState.customState },
      lastModified: new Date().toISOString(),
      modifiedBy: changedBy,
    };

    worldState.npcs.set(npcId, updatedState);

    return { previousState, newState: updatedState };
  }

  /**
   * Update environment state
   */
  private updateEnvironmentState(
    worldState: IWorldState,
    roomId: string,
    newState: Partial<IEnvironmentState>,
  ): { previousState?: IEnvironmentState; newState: IEnvironmentState } {
    const previousState = worldState.environments.get(roomId);

    const updatedState: IEnvironmentState = {
      roomId,
      lighting: newState.lighting ?? previousState?.lighting,
      temperature: newState.temperature ?? previousState?.temperature,
      weather: newState.weather ?? previousState?.weather,
      timeOfDay: newState.timeOfDay ?? previousState?.timeOfDay,
      customState: { ...previousState?.customState, ...newState.customState },
      lastModified: new Date().toISOString(),
    };

    worldState.environments.set(roomId, updatedState);

    return { previousState, newState: updatedState };
  }

  /**
   * Get door state
   */
  getDoorState(gameId: string, doorId: string): IDoorState | undefined {
    const worldState = this.worldStates.get(gameId);
    return worldState?.doors.get(doorId);
  }

  /**
   * Get object state
   */
  getObjectState(gameId: string, objectId: string): IObjectState | undefined {
    const worldState = this.worldStates.get(gameId);
    return worldState?.objects.get(objectId);
  }

  /**
   * Get NPC state
   */
  getNpcState(gameId: string, npcId: string): INpcState | undefined {
    const worldState = this.worldStates.get(gameId);
    return worldState?.npcs.get(npcId);
  }

  /**
   * Get environment state
   */
  getEnvironmentState(
    gameId: string,
    roomId: string,
  ): IEnvironmentState | undefined {
    const worldState = this.worldStates.get(gameId);
    return worldState?.environments.get(roomId);
  }

  /**
   * Get world state
   */
  getWorldState(gameId: string): IWorldState | undefined {
    return this.worldStates.get(gameId);
  }

  /**
   * Restore world state from saved data
   * Used when loading a saved game
   */
  restoreWorldState(gameId: string, worldStateData: any): void {
    try {
      // Convert arrays back to Maps for world state
      const worldState: IWorldState = {
        gameId,
        doors: new Map(worldStateData.doors || []),
        objects: new Map(worldStateData.objects || []),
        npcs: new Map(worldStateData.npcs || []),
        environments: new Map(worldStateData.environments || []),
        globalFlags: worldStateData.globalFlags || {},
        globalVariables: worldStateData.globalVariables || {},
        flags: worldStateData.flags || worldStateData.globalFlags || {},
        variables: worldStateData.variables || worldStateData.globalVariables || {},
        lastUpdated: worldStateData.lastUpdated || new Date().toISOString(),
      };

      this.worldStates.set(gameId, worldState);
      this.logger.log(`Restored world state for game ${gameId}`);
    } catch (error) {
      this.logger.error(
        `Failed to restore world state for game ${gameId}: ${error}`,
      );
    }
  }

  /**
   * Query state changes
   */
  queryStateChanges(gameId: string, query?: IStateQuery): IStateChange[] {
    const history = this.changeHistory.get(gameId) || [];

    if (!query) {
      return history;
    }

    return history.filter((change) => {
      if (query.entityType && change.entityType !== query.entityType)
        return false;
      if (query.entityId && change.entityId !== query.entityId) return false;
      if (query.changedBy && change.changedBy !== query.changedBy) return false;
      if (query.changeType && change.changeType !== query.changeType)
        return false;

      if (query.fromTimestamp) {
        const changeTime = new Date(change.timestamp).getTime();
        const fromTime = new Date(query.fromTimestamp).getTime();
        if (changeTime < fromTime) return false;
      }

      if (query.toTimestamp) {
        const changeTime = new Date(change.timestamp).getTime();
        const toTime = new Date(query.toTimestamp).getTime();
        if (changeTime > toTime) return false;
      }

      return true;
    });
  }

  /**
   * Revert state change
   */
  async revertStateChange(
    gameId: string,
    changeId: string,
  ): Promise<IStateUpdateResult> {
    const history = this.changeHistory.get(gameId) || [];
    const change = history.find((c) => c.id === changeId);

    if (!change) {
      return {
        success: false,
        message: `State change '${changeId}' not found`,
      };
    }

    if (!change.previousState) {
      return {
        success: false,
        message: 'Cannot revert: no previous state recorded',
      };
    }

    // Revert to previous state
    const revertRequest: IStateUpdateRequest = {
      gameId,
      entityId: change.entityId,
      entityType: change.entityType,
      changeType: StateChangeType.CUSTOM,
      newState: change.previousState,
      reason: `Reverted change ${changeId}`,
    };

    return await this.updateState(revertRequest);
  }

  /**
   * Get world state statistics
   */
  getWorldStateStats(gameId: string): IWorldStateStats | undefined {
    const worldState = this.worldStates.get(gameId);
    const history = this.changeHistory.get(gameId) || [];

    if (!worldState) {
      return undefined;
    }

    let openDoors = 0;
    let lockedDoors = 0;
    for (const door of worldState.doors.values()) {
      if (door.isOpen) openDoors++;
      if (door.isLocked) lockedDoors++;
    }

    let activeObjects = 0;
    let destroyedObjects = 0;
    for (const obj of worldState.objects.values()) {
      if (obj.exists) activeObjects++;
      else destroyedObjects++;
    }

    let aliveNpcs = 0;
    let defeatedNpcs = 0;
    for (const npc of worldState.npcs.values()) {
      if (npc.alive) aliveNpcs++;
      else defeatedNpcs++;
    }

    return {
      totalDoors: worldState.doors.size,
      openDoors,
      lockedDoors,
      totalObjects: worldState.objects.size,
      activeObjects,
      destroyedObjects,
      totalNpcs: worldState.npcs.size,
      aliveNpcs,
      defeatedNpcs,
      totalEnvironments: worldState.environments.size,
      totalChanges: history.length,
    };
  }

  /**
   * Export world state to JSON
   */
  exportWorldState(gameId: string): string | undefined {
    const worldState = this.worldStates.get(gameId);

    if (!worldState) {
      return undefined;
    }

    // Convert Maps to objects for JSON serialization
    const exportData = {
      gameId: worldState.gameId,
      doors: Array.from(worldState.doors.values()),
      objects: Array.from(worldState.objects.values()),
      npcs: Array.from(worldState.npcs.values()),
      environments: Array.from(worldState.environments.values()),
      globalFlags: worldState.globalFlags,
      globalVariables: worldState.globalVariables,
      lastUpdated: worldState.lastUpdated,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import world state from JSON
   */
  importWorldState(gameId: string, jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);

      const worldState: IWorldState = {
        gameId,
        doors: new Map(data.doors.map((d: IDoorState) => [d.doorId, d])),
        objects: new Map(
          data.objects.map((o: IObjectState) => [o.objectId, o]),
        ),
        npcs: new Map(data.npcs.map((n: INpcState) => [n.npcId, n])),
        environments: new Map(
          data.environments.map((e: IEnvironmentState) => [e.roomId, e]),
        ),
        globalFlags: data.globalFlags || {},
        globalVariables: data.globalVariables || {},
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      };

      this.worldStates.set(gameId, worldState);
      this.logger.log(`Imported world state for game ${gameId}`);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to import world state: ${error.message}`,
        error,
      );
      return false;
    }
  }

  /**
   * Save world state to database
   */
  private async saveWorldStateToDatabase(
    gameId: string,
    worldState: IWorldState,
  ): Promise<void> {
    try {
      // Convert Maps to arrays for JSON serialization
      const doorsArray = Array.from(worldState.doors.values());
      const objectsArray = Array.from(worldState.objects.values());
      const npcsArray = Array.from(worldState.npcs.values());
      const environmentsArray = Array.from(worldState.environments.values());

      const db = this.databaseService.getDatabase();

      // Upsert world state
      const stmt = db.prepare(`
        INSERT INTO world_states (
          game_id,
          doors_state,
          objects_state,
          npcs_state,
          environments_state,
          global_flags,
          global_variables,
          last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET
          doors_state = excluded.doors_state,
          objects_state = excluded.objects_state,
          npcs_state = excluded.npcs_state,
          environments_state = excluded.environments_state,
          global_flags = excluded.global_flags,
          global_variables = excluded.global_variables,
          last_updated = excluded.last_updated
      `);

      stmt.run(
        gameId,
        JSON.stringify(doorsArray),
        JSON.stringify(objectsArray),
        JSON.stringify(npcsArray),
        JSON.stringify(environmentsArray),
        JSON.stringify(worldState.globalFlags),
        JSON.stringify(worldState.globalVariables),
        worldState.lastUpdated,
      );

      this.logger.debug(`Saved world state to database for game ${gameId}`);
    } catch (error) {
      this.logger.error(
        `Failed to save world state to database for game ${gameId}: ${error.message}`,
        error.stack,
      );
      // Don't throw - log error but continue execution
    }
  }

  /**
   * Load world state from database
   */
  private async loadWorldStateFromDatabase(
    gameId: string,
  ): Promise<IWorldState | null> {
    try {
      const db = this.databaseService.getDatabase();

      const stmt = db.prepare(`
        SELECT
          doors_state,
          objects_state,
          npcs_state,
          environments_state,
          global_flags,
          global_variables,
          last_updated
        FROM world_states
        WHERE game_id = ?
      `);

      const row = stmt.get(gameId) as
        | {
            doors_state: string;
            objects_state: string;
            npcs_state: string;
            environments_state: string;
            global_flags: string;
            global_variables: string;
            last_updated: string;
          }
        | undefined;

      if (!row) {
        return null;
      }

      // Parse JSON and convert arrays back to Maps
      const doorsArray: IDoorState[] = JSON.parse(row.doors_state || '[]');
      const objectsArray: IObjectState[] = JSON.parse(
        row.objects_state || '[]',
      );
      const npcsArray: INpcState[] = JSON.parse(row.npcs_state || '[]');
      const environmentsArray: IEnvironmentState[] = JSON.parse(
        row.environments_state || '[]',
      );

      const worldState: IWorldState = {
        gameId,
        doors: new Map(doorsArray.map((d) => [d.doorId, d])),
        objects: new Map(objectsArray.map((o) => [o.objectId, o])),
        npcs: new Map(npcsArray.map((n) => [n.npcId, n])),
        environments: new Map(environmentsArray.map((e) => [e.roomId, e])),
        globalFlags: JSON.parse(row.global_flags || '{}'),
        globalVariables: JSON.parse(row.global_variables || '{}'),
        lastUpdated: row.last_updated,
      };

      this.logger.debug(`Loaded world state from database for game ${gameId}`);
      return worldState;
    } catch (error) {
      this.logger.error(
        `Failed to load world state from database for game ${gameId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Clear world state
   */
  clearWorldState(gameId: string): void {
    this.worldStates.delete(gameId);
    this.changeHistory.delete(gameId);
    this.logger.log(`Cleared world state for game ${gameId}`);
  }

  /**
   * Clear all world states
   */
  clearAllWorldStates(): void {
    this.worldStates.clear();
    this.changeHistory.clear();
    this.logger.log('Cleared all world states');
  }
}
