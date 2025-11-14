import { Injectable, Logger } from '@nestjs/common';
import {
  IComponent,
  ComponentType,
  IEntityComponents,
  IComponentQuery,
} from './component.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

@Injectable()
export class ComponentManagerService {
  private readonly logger = new Logger(ComponentManagerService.name);
  private entityComponents: Map<string, Map<ComponentType, IComponent>> =
    new Map();

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Add a component to an entity
   */
  async addComponent(
    entityId: string,
    component: IComponent,
    gameId?: string,
  ): Promise<void> {
    if (!this.entityComponents.has(entityId)) {
      this.entityComponents.set(entityId, new Map());
    }

    const components = this.entityComponents.get(entityId)!;
    components.set(component.type as ComponentType, component);

    this.logger.debug(
      `Added component ${component.type} to entity ${entityId}`,
    );

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'component_added',
        entityId,
        componentType: component.type,
      },
      gameId,
    );
  }

  /**
   * Remove a component from an entity
   */
  async removeComponent(
    entityId: string,
    componentType: ComponentType,
    gameId?: string,
  ): Promise<void> {
    const components = this.entityComponents.get(entityId);

    if (components) {
      components.delete(componentType);
      this.logger.debug(
        `Removed component ${componentType} from entity ${entityId}`,
      );

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'component_removed',
          entityId,
          componentType,
        },
        gameId,
      );
    }
  }

  /**
   * Get a specific component from an entity
   */
  getComponent<T extends IComponent>(
    entityId: string,
    componentType: ComponentType,
  ): T | undefined {
    const components = this.entityComponents.get(entityId);
    return components?.get(componentType) as T | undefined;
  }

  /**
   * Get all components for an entity
   */
  getComponents(entityId: string): Map<ComponentType, IComponent> | undefined {
    return this.entityComponents.get(entityId);
  }

  /**
   * Check if entity has a component
   */
  hasComponent(entityId: string, componentType: ComponentType): boolean {
    const components = this.entityComponents.get(entityId);
    return components?.has(componentType) || false;
  }

  /**
   * Check if entity has all specified components
   */
  hasAllComponents(
    entityId: string,
    componentTypes: ComponentType[],
  ): boolean {
    return componentTypes.every((type) => this.hasComponent(entityId, type));
  }

  /**
   * Check if entity has any of the specified components
   */
  hasAnyComponent(
    entityId: string,
    componentTypes: ComponentType[],
  ): boolean {
    return componentTypes.some((type) => this.hasComponent(entityId, type));
  }

  /**
   * Update a component for an entity
   */
  async updateComponent<T extends IComponent>(
    entityId: string,
    componentType: ComponentType,
    updates: Partial<T>,
    gameId?: string,
  ): Promise<void> {
    const component = this.getComponent<T>(entityId, componentType);

    if (component) {
      Object.assign(component, updates);

      this.logger.debug(
        `Updated component ${componentType} for entity ${entityId}`,
      );

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'component_updated',
          entityId,
          componentType,
          updates,
        },
        gameId,
      );
    }
  }

  /**
   * Query entities by components (ECS query)
   */
  queryEntities(query: IComponentQuery): string[] {
    const entities: string[] = [];

    for (const [entityId, components] of this.entityComponents.entries()) {
      let matches = true;

      // Check "all" constraint
      if (query.all && query.all.length > 0) {
        matches =
          matches && query.all.every((type) => components.has(type));
      }

      // Check "any" constraint
      if (query.any && query.any.length > 0) {
        matches = matches && query.any.some((type) => components.has(type));
      }

      // Check "none" constraint
      if (query.none && query.none.length > 0) {
        matches =
          matches && !query.none.some((type) => components.has(type));
      }

      if (matches) {
        entities.push(entityId);
      }
    }

    return entities;
  }

  /**
   * Get all entity IDs that have components
   */
  getAllEntityIds(): string[] {
    return Array.from(this.entityComponents.keys());
  }

  /**
   * Remove all components for an entity
   */
  async removeAllComponents(
    entityId: string,
    gameId?: string,
  ): Promise<void> {
    this.entityComponents.delete(entityId);

    this.logger.debug(`Removed all components for entity ${entityId}`);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'all_components_removed',
        entityId,
      },
      gameId,
    );
  }

  /**
   * Get component count for an entity
   */
  getComponentCount(entityId: string): number {
    return this.entityComponents.get(entityId)?.size || 0;
  }

  /**
   * Get entity components data
   */
  getEntityComponentsData(
    entityId: string,
    gameId?: string,
  ): IEntityComponents | undefined {
    const components = this.entityComponents.get(entityId);

    if (!components) {
      return undefined;
    }

    return {
      entityId,
      gameId: gameId || 'unknown',
      components,
    };
  }

  /**
   * Export all components for serialization
   */
  exportComponentsForEntity(
    entityId: string,
  ): Record<string, IComponent> | undefined {
    const components = this.entityComponents.get(entityId);

    if (!components) {
      return undefined;
    }

    const exported: Record<string, IComponent> = {};

    for (const [type, component] of components.entries()) {
      exported[type] = component;
    }

    return exported;
  }

  /**
   * Import components from serialized data
   */
  async importComponentsForEntity(
    entityId: string,
    componentsData: Record<string, IComponent>,
    gameId?: string,
  ): Promise<void> {
    for (const [type, component] of Object.entries(componentsData)) {
      await this.addComponent(entityId, component, gameId);
    }
  }

  /**
   * Clear all component data
   */
  clear(): void {
    this.entityComponents.clear();
    this.logger.log('Cleared all component data');
  }

  /**
   * Get statistics
   */
  getStats(): {
    entityCount: number;
    totalComponents: number;
    componentsByType: Record<string, number>;
  } {
    const stats = {
      entityCount: this.entityComponents.size,
      totalComponents: 0,
      componentsByType: {} as Record<string, number>,
    };

    for (const components of this.entityComponents.values()) {
      stats.totalComponents += components.size;

      for (const [type] of components) {
        stats.componentsByType[type] =
          (stats.componentsByType[type] || 0) + 1;
      }
    }

    return stats;
  }
}
