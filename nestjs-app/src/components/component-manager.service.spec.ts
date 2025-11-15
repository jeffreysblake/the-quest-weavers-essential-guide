import { Test, TestingModule } from '@nestjs/testing';
import { ComponentManagerService } from './component-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  ComponentType,
  IComponent,
  ITransformComponent,
  IHealthComponent,
  IInventoryComponent,
  IRenderableComponent,
  IComponentQuery,
} from './component.interfaces';
import { GameEventType } from '../events/event.interfaces';

describe('ComponentManagerService', () => {
  let service: ComponentManagerService;
  let mockEventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    // Create mock event emitter
    mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComponentManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ComponentManagerService>(ComponentManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should start with no entities', () => {
      const entityIds = service.getAllEntityIds();
      expect(entityIds).toEqual([]);
    });

    it('should return empty stats initially', () => {
      const stats = service.getStats();
      expect(stats.entityCount).toBe(0);
      expect(stats.totalComponents).toBe(0);
      expect(stats.componentsByType).toEqual({});
    });
  });

  describe('Component Addition', () => {
    it('should add a component to an entity', async () => {
      const entityId = 'entity-1';
      const component: ITransformComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
        position: { x: 0, y: 0, z: 0 },
      };

      await service.addComponent(entityId, component);

      const retrieved = service.getComponent<ITransformComponent>(
        entityId,
        ComponentType.TRANSFORM,
      );
      expect(retrieved).toEqual(component);
    });

    it('should emit event when component is added', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const component: IComponent = {
        type: ComponentType.IDENTITY,
        enabled: true,
      };

      await service.addComponent(entityId, component, gameId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'component_added',
          entityId,
          componentType: component.type,
        },
        gameId,
      );
    });

    it('should add multiple components to the same entity', async () => {
      const entityId = 'entity-1';
      const transform: ITransformComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
        position: { x: 1, y: 2, z: 3 },
      };
      const health: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 100,
        maximum: 100,
        isAlive: true,
      };

      await service.addComponent(entityId, transform);
      await service.addComponent(entityId, health);

      expect(service.hasComponent(entityId, ComponentType.TRANSFORM)).toBe(true);
      expect(service.hasComponent(entityId, ComponentType.HEALTH)).toBe(true);
      expect(service.getComponentCount(entityId)).toBe(2);
    });

    it('should replace existing component of the same type', async () => {
      const entityId = 'entity-1';
      const component1: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 50,
        maximum: 100,
        isAlive: true,
      };
      const component2: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 75,
        maximum: 100,
        isAlive: true,
      };

      await service.addComponent(entityId, component1);
      await service.addComponent(entityId, component2);

      const retrieved = service.getComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
      );
      expect(retrieved?.current).toBe(75);
      expect(service.getComponentCount(entityId)).toBe(1);
    });

    it('should add components to multiple entities', async () => {
      const entity1 = 'entity-1';
      const entity2 = 'entity-2';
      const component: IComponent = {
        type: ComponentType.IDENTITY,
        enabled: true,
      };

      await service.addComponent(entity1, component);
      await service.addComponent(entity2, component);

      const entityIds = service.getAllEntityIds();
      expect(entityIds).toHaveLength(2);
      expect(entityIds).toContain(entity1);
      expect(entityIds).toContain(entity2);
    });
  });

  describe('Component Removal', () => {
    it('should remove a component from an entity', async () => {
      const entityId = 'entity-1';
      const component: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };

      await service.addComponent(entityId, component);
      await service.removeComponent(entityId, ComponentType.TRANSFORM);

      expect(service.hasComponent(entityId, ComponentType.TRANSFORM)).toBe(false);
    });

    it('should emit event when component is removed', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const component: IComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
      };

      await service.addComponent(entityId, component);
      mockEventEmitter.emit.mockClear();
      await service.removeComponent(entityId, ComponentType.HEALTH, gameId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'component_removed',
          entityId,
          componentType: ComponentType.HEALTH,
        },
        gameId,
      );
    });

    it('should not emit event when removing non-existent component', async () => {
      const entityId = 'entity-1';
      mockEventEmitter.emit.mockClear();

      await service.removeComponent(entityId, ComponentType.TRANSFORM);

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should remove specific component while keeping others', async () => {
      const entityId = 'entity-1';
      const transform: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };
      const health: IComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
      };

      await service.addComponent(entityId, transform);
      await service.addComponent(entityId, health);
      await service.removeComponent(entityId, ComponentType.TRANSFORM);

      expect(service.hasComponent(entityId, ComponentType.TRANSFORM)).toBe(false);
      expect(service.hasComponent(entityId, ComponentType.HEALTH)).toBe(true);
    });

    it('should remove all components from an entity', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const components = [
        { type: ComponentType.TRANSFORM, enabled: true },
        { type: ComponentType.HEALTH, enabled: true },
        { type: ComponentType.INVENTORY, enabled: true },
      ];

      for (const component of components) {
        await service.addComponent(entityId, component);
      }

      await service.removeAllComponents(entityId, gameId);

      expect(service.getComponentCount(entityId)).toBe(0);
      expect(service.getAllEntityIds()).not.toContain(entityId);
    });

    it('should emit event when all components are removed', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const component: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };

      await service.addComponent(entityId, component);
      mockEventEmitter.emit.mockClear();
      await service.removeAllComponents(entityId, gameId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'all_components_removed',
          entityId,
        },
        gameId,
      );
    });
  });

  describe('Component Retrieval', () => {
    it('should get a specific component from an entity', () => {
      const entityId = 'entity-1';
      const component: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 80,
        maximum: 100,
        isAlive: true,
      };

      service.addComponent(entityId, component);

      const retrieved = service.getComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
      );
      expect(retrieved).toEqual(component);
    });

    it('should return undefined for non-existent component', () => {
      const entityId = 'entity-1';

      const retrieved = service.getComponent(entityId, ComponentType.TRANSFORM);
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for non-existent entity', () => {
      const retrieved = service.getComponent(
        'non-existent',
        ComponentType.TRANSFORM,
      );
      expect(retrieved).toBeUndefined();
    });

    it('should get all components for an entity', async () => {
      const entityId = 'entity-1';
      const transform: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };
      const health: IComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
      };

      await service.addComponent(entityId, transform);
      await service.addComponent(entityId, health);

      const components = service.getComponents(entityId);
      expect(components).toBeDefined();
      expect(components?.size).toBe(2);
      expect(components?.has(ComponentType.TRANSFORM)).toBe(true);
      expect(components?.has(ComponentType.HEALTH)).toBe(true);
    });

    it('should return undefined when getting components for non-existent entity', () => {
      const components = service.getComponents('non-existent');
      expect(components).toBeUndefined();
    });
  });

  describe('Component Existence Checks', () => {
    it('should check if entity has a component', async () => {
      const entityId = 'entity-1';
      const component: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };

      await service.addComponent(entityId, component);

      expect(service.hasComponent(entityId, ComponentType.TRANSFORM)).toBe(true);
      expect(service.hasComponent(entityId, ComponentType.HEALTH)).toBe(false);
    });

    it('should return false for non-existent entity', () => {
      expect(service.hasComponent('non-existent', ComponentType.TRANSFORM)).toBe(
        false,
      );
    });

    it('should check if entity has all specified components', async () => {
      const entityId = 'entity-1';
      const components = [
        { type: ComponentType.TRANSFORM, enabled: true },
        { type: ComponentType.HEALTH, enabled: true },
        { type: ComponentType.INVENTORY, enabled: true },
      ];

      for (const component of components) {
        await service.addComponent(entityId, component);
      }

      expect(
        service.hasAllComponents(entityId, [
          ComponentType.TRANSFORM,
          ComponentType.HEALTH,
        ]),
      ).toBe(true);

      expect(
        service.hasAllComponents(entityId, [
          ComponentType.TRANSFORM,
          ComponentType.RENDERABLE,
        ]),
      ).toBe(false);
    });

    it('should return true for empty component list in hasAllComponents', () => {
      const entityId = 'entity-1';
      expect(service.hasAllComponents(entityId, [])).toBe(true);
    });

    it('should check if entity has any of specified components', async () => {
      const entityId = 'entity-1';
      const component: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };

      await service.addComponent(entityId, component);

      expect(
        service.hasAnyComponent(entityId, [
          ComponentType.TRANSFORM,
          ComponentType.HEALTH,
        ]),
      ).toBe(true);

      expect(
        service.hasAnyComponent(entityId, [
          ComponentType.HEALTH,
          ComponentType.INVENTORY,
        ]),
      ).toBe(false);
    });

    it('should return false for empty component list in hasAnyComponent', () => {
      const entityId = 'entity-1';
      expect(service.hasAnyComponent(entityId, [])).toBe(false);
    });
  });

  describe('Component Updates', () => {
    it('should update a component', async () => {
      const entityId = 'entity-1';
      const component: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 100,
        maximum: 100,
        isAlive: true,
      };

      await service.addComponent(entityId, component);
      await service.updateComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
        { current: 50 },
      );

      const updated = service.getComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
      );
      expect(updated?.current).toBe(50);
      expect(updated?.maximum).toBe(100);
    });

    it('should emit event when component is updated', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const component: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 100,
        maximum: 100,
        isAlive: true,
      };

      await service.addComponent(entityId, component);
      mockEventEmitter.emit.mockClear();

      const updates = { current: 75 };
      await service.updateComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
        updates,
        gameId,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'component_updated',
          entityId,
          componentType: ComponentType.HEALTH,
          updates,
        },
        gameId,
      );
    });

    it('should not emit event when updating non-existent component', async () => {
      const entityId = 'entity-1';
      mockEventEmitter.emit.mockClear();

      await service.updateComponent(
        entityId,
        ComponentType.HEALTH,
        { current: 50 },
      );

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update multiple properties of a component', async () => {
      const entityId = 'entity-1';
      const component: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 100,
        maximum: 100,
        isAlive: true,
        regenerationRate: 1,
      };

      await service.addComponent(entityId, component);
      await service.updateComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
        {
          current: 50,
          regenerationRate: 2,
          isAlive: false,
        },
      );

      const updated = service.getComponent<IHealthComponent>(
        entityId,
        ComponentType.HEALTH,
      );
      expect(updated?.current).toBe(50);
      expect(updated?.regenerationRate).toBe(2);
      expect(updated?.isAlive).toBe(false);
      expect(updated?.maximum).toBe(100);
    });
  });

  describe('ECS Queries', () => {
    beforeEach(async () => {
      // Set up test entities with different component combinations
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-1', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      await service.addComponent('entity-2', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-2', {
        type: ComponentType.RENDERABLE,
        enabled: true,
      });

      await service.addComponent('entity-3', {
        type: ComponentType.HEALTH,
        enabled: true,
      });
      await service.addComponent('entity-3', {
        type: ComponentType.INVENTORY,
        enabled: true,
      });

      await service.addComponent('entity-4', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-4', {
        type: ComponentType.HEALTH,
        enabled: true,
      });
      await service.addComponent('entity-4', {
        type: ComponentType.INVENTORY,
        enabled: true,
      });
    });

    it('should query entities with all specified components', () => {
      const query: IComponentQuery = {
        all: [ComponentType.TRANSFORM, ComponentType.HEALTH],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(2);
      expect(results).toContain('entity-1');
      expect(results).toContain('entity-4');
    });

    it('should query entities with any of specified components', () => {
      const query: IComponentQuery = {
        any: [ComponentType.RENDERABLE, ComponentType.INVENTORY],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(3);
      expect(results).toContain('entity-2');
      expect(results).toContain('entity-3');
      expect(results).toContain('entity-4');
    });

    it('should query entities with none of specified components', () => {
      const query: IComponentQuery = {
        none: [ComponentType.RENDERABLE, ComponentType.INVENTORY],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(1);
      expect(results).toContain('entity-1');
    });

    it('should query with combined all and any constraints', () => {
      const query: IComponentQuery = {
        all: [ComponentType.TRANSFORM],
        any: [ComponentType.HEALTH, ComponentType.RENDERABLE],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(3);
      expect(results).toContain('entity-1');
      expect(results).toContain('entity-2');
      expect(results).toContain('entity-4');
    });

    it('should query with combined all and none constraints', () => {
      const query: IComponentQuery = {
        all: [ComponentType.TRANSFORM],
        none: [ComponentType.INVENTORY],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(2);
      expect(results).toContain('entity-1');
      expect(results).toContain('entity-2');
    });

    it('should query with all, any, and none constraints', () => {
      const query: IComponentQuery = {
        all: [ComponentType.HEALTH],
        any: [ComponentType.TRANSFORM, ComponentType.INVENTORY],
        none: [ComponentType.RENDERABLE],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(3);
      expect(results).toContain('entity-1');
      expect(results).toContain('entity-3');
      expect(results).toContain('entity-4');
    });

    it('should return all entities for empty query', () => {
      const query: IComponentQuery = {};
      const results = service.queryEntities(query);
      expect(results).toHaveLength(4);
    });

    it('should return empty array when no entities match query', () => {
      const query: IComponentQuery = {
        all: [ComponentType.TRANSFORM, ComponentType.AUDIO_SOURCE],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(0);
    });
  });

  describe('Entity Management', () => {
    it('should get all entity IDs', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-2', {
        type: ComponentType.HEALTH,
        enabled: true,
      });
      await service.addComponent('entity-3', {
        type: ComponentType.INVENTORY,
        enabled: true,
      });

      const entityIds = service.getAllEntityIds();
      expect(entityIds).toHaveLength(3);
      expect(entityIds).toContain('entity-1');
      expect(entityIds).toContain('entity-2');
      expect(entityIds).toContain('entity-3');
    });

    it('should get component count for entity', async () => {
      const entityId = 'entity-1';

      expect(service.getComponentCount(entityId)).toBe(0);

      await service.addComponent(entityId, {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      expect(service.getComponentCount(entityId)).toBe(1);

      await service.addComponent(entityId, {
        type: ComponentType.HEALTH,
        enabled: true,
      });
      expect(service.getComponentCount(entityId)).toBe(2);

      await service.removeComponent(entityId, ComponentType.TRANSFORM);
      expect(service.getComponentCount(entityId)).toBe(1);
    });

    it('should get entity components data', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const component: IComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
      };

      await service.addComponent(entityId, component);

      const data = service.getEntityComponentsData(entityId, gameId);
      expect(data).toBeDefined();
      expect(data?.entityId).toBe(entityId);
      expect(data?.gameId).toBe(gameId);
      expect(data?.components.size).toBe(1);
    });

    it('should return undefined for non-existent entity components data', () => {
      const data = service.getEntityComponentsData('non-existent');
      expect(data).toBeUndefined();
    });

    it('should use "unknown" as default gameId', async () => {
      const entityId = 'entity-1';
      await service.addComponent(entityId, {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });

      const data = service.getEntityComponentsData(entityId);
      expect(data?.gameId).toBe('unknown');
    });
  });

  describe('Component Serialization', () => {
    it('should export components for entity', async () => {
      const entityId = 'entity-1';
      const transform: ITransformComponent = {
        type: ComponentType.TRANSFORM,
        enabled: true,
        position: { x: 1, y: 2, z: 3 },
      };
      const health: IHealthComponent = {
        type: ComponentType.HEALTH,
        enabled: true,
        current: 80,
        maximum: 100,
        isAlive: true,
      };

      await service.addComponent(entityId, transform);
      await service.addComponent(entityId, health);

      const exported = service.exportComponentsForEntity(entityId);
      expect(exported).toBeDefined();
      expect(exported?.[ComponentType.TRANSFORM]).toEqual(transform);
      expect(exported?.[ComponentType.HEALTH]).toEqual(health);
    });

    it('should return undefined when exporting non-existent entity', () => {
      const exported = service.exportComponentsForEntity('non-existent');
      expect(exported).toBeUndefined();
    });

    it('should import components for entity', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const componentsData = {
        [ComponentType.TRANSFORM]: {
          type: ComponentType.TRANSFORM,
          enabled: true,
          position: { x: 5, y: 10, z: 15 },
        } as ITransformComponent,
        [ComponentType.HEALTH]: {
          type: ComponentType.HEALTH,
          enabled: true,
          current: 50,
          maximum: 100,
          isAlive: true,
        } as IHealthComponent,
      };

      await service.importComponentsForEntity(entityId, componentsData, gameId);

      expect(service.getComponentCount(entityId)).toBe(2);
      const transform = service.getComponent<ITransformComponent>(
        entityId,
        ComponentType.TRANSFORM,
      );
      expect(transform?.position).toEqual({ x: 5, y: 10, z: 15 });
    });

    it('should emit events when importing components', async () => {
      const entityId = 'entity-1';
      const gameId = 'game-1';
      const componentsData = {
        [ComponentType.TRANSFORM]: {
          type: ComponentType.TRANSFORM,
          enabled: true,
        } as IComponent,
      };

      mockEventEmitter.emit.mockClear();
      await service.importComponentsForEntity(entityId, componentsData, gameId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'component_added',
          entityId,
        }),
        gameId,
      );
    });

    it('should export and import components correctly', async () => {
      const entityId = 'entity-1';
      const components = [
        {
          type: ComponentType.TRANSFORM,
          enabled: true,
          position: { x: 1, y: 2, z: 3 },
        } as ITransformComponent,
        {
          type: ComponentType.HEALTH,
          enabled: true,
          current: 80,
          maximum: 100,
          isAlive: true,
        } as IHealthComponent,
      ];

      for (const component of components) {
        await service.addComponent(entityId, component);
      }

      const exported = service.exportComponentsForEntity(entityId);
      await service.removeAllComponents(entityId);
      expect(service.getComponentCount(entityId)).toBe(0);

      await service.importComponentsForEntity(entityId, exported!);
      expect(service.getComponentCount(entityId)).toBe(2);

      const transform = service.getComponent<ITransformComponent>(
        entityId,
        ComponentType.TRANSFORM,
      );
      expect(transform?.position).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe('Statistics', () => {
    it('should get accurate statistics', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-1', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      await service.addComponent('entity-2', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-2', {
        type: ComponentType.INVENTORY,
        enabled: true,
      });

      await service.addComponent('entity-3', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      const stats = service.getStats();
      expect(stats.entityCount).toBe(3);
      expect(stats.totalComponents).toBe(5);
      expect(stats.componentsByType[ComponentType.TRANSFORM]).toBe(2);
      expect(stats.componentsByType[ComponentType.HEALTH]).toBe(2);
      expect(stats.componentsByType[ComponentType.INVENTORY]).toBe(1);
    });

    it('should update statistics when components are removed', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-1', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      await service.removeComponent('entity-1', ComponentType.TRANSFORM);

      const stats = service.getStats();
      expect(stats.entityCount).toBe(1);
      expect(stats.totalComponents).toBe(1);
      expect(stats.componentsByType[ComponentType.TRANSFORM]).toBeUndefined();
      expect(stats.componentsByType[ComponentType.HEALTH]).toBe(1);
    });

    it('should update statistics when all components are removed', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });

      await service.removeAllComponents('entity-1');

      const stats = service.getStats();
      expect(stats.entityCount).toBe(0);
      expect(stats.totalComponents).toBe(0);
    });
  });

  describe('Clear and Reset', () => {
    it('should clear all component data', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-2', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      service.clear();

      expect(service.getAllEntityIds()).toHaveLength(0);
      expect(service.getStats().entityCount).toBe(0);
      expect(service.getStats().totalComponents).toBe(0);
    });

    it('should allow adding components after clear', async () => {
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });

      service.clear();

      await service.addComponent('entity-2', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      expect(service.getAllEntityIds()).toHaveLength(1);
      expect(service.hasComponent('entity-2', ComponentType.HEALTH)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle entity with no components gracefully', () => {
      const entityId = 'empty-entity';

      expect(service.getComponents(entityId)).toBeUndefined();
      expect(service.getComponentCount(entityId)).toBe(0);
      expect(service.hasComponent(entityId, ComponentType.TRANSFORM)).toBe(false);
    });

    it('should handle multiple rapid component additions', async () => {
      const entityId = 'entity-1';
      const components = [
        ComponentType.TRANSFORM,
        ComponentType.HEALTH,
        ComponentType.INVENTORY,
        ComponentType.RENDERABLE,
        ComponentType.INTERACTABLE,
      ];

      const promises = components.map((type) =>
        service.addComponent(entityId, { type, enabled: true }),
      );

      await Promise.all(promises);

      expect(service.getComponentCount(entityId)).toBe(5);
    });

    it('should handle complex nested component updates', async () => {
      const entityId = 'entity-1';
      const component: IInventoryComponent = {
        type: ComponentType.INVENTORY,
        enabled: true,
        items: ['item-1', 'item-2'],
        maxItems: 10,
        maxWeight: 100,
        currentWeight: 50,
      };

      await service.addComponent(entityId, component);
      await service.updateComponent<IInventoryComponent>(
        entityId,
        ComponentType.INVENTORY,
        {
          items: ['item-1', 'item-2', 'item-3'],
          currentWeight: 75,
        },
      );

      const updated = service.getComponent<IInventoryComponent>(
        entityId,
        ComponentType.INVENTORY,
      );
      expect(updated?.items).toHaveLength(3);
      expect(updated?.currentWeight).toBe(75);
      expect(updated?.maxItems).toBe(10);
    });

    it('should handle queries with very specific constraints', async () => {
      // Create entity matching specific criteria
      await service.addComponent('specific-entity', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('specific-entity', {
        type: ComponentType.HEALTH,
        enabled: true,
      });
      await service.addComponent('specific-entity', {
        type: ComponentType.AI_BEHAVIOR,
        enabled: true,
      });

      // Create entities that don't match
      await service.addComponent('entity-1', {
        type: ComponentType.TRANSFORM,
        enabled: true,
      });
      await service.addComponent('entity-2', {
        type: ComponentType.HEALTH,
        enabled: true,
      });

      const query: IComponentQuery = {
        all: [ComponentType.TRANSFORM, ComponentType.HEALTH],
        any: [ComponentType.AI_BEHAVIOR, ComponentType.DIALOGUE],
        none: [ComponentType.INVENTORY],
      };

      const results = service.queryEntities(query);
      expect(results).toHaveLength(1);
      expect(results).toContain('specific-entity');
    });
  });
});
