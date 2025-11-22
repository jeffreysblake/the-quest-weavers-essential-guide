import { Test, TestingModule } from '@nestjs/testing';
import { AttackCommandHandler } from './attack-command.handler';
import { RoomService } from '../../entity/room.service';
import { EntityService } from '../../entity/entity.service';
import { ObjectService } from '../../entity/object.service';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('AttackCommandHandler - Combat', () => {
  let handler: AttackCommandHandler;
  let roomService: jest.Mocked<RoomService>;
  let entityService: jest.Mocked<EntityService>;
  let objectService: jest.Mocked<ObjectService>;
  let playerService: jest.Mocked<PlayerService>;
  let validator: jest.Mocked<CommandValidatorService>;
  let roomNavHelper: jest.Mocked<RoomNavigationHelperService>;
  let gameStateService: jest.Mocked<GameStateService>;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Hero',
    level: 1,
    experience: 0,
    health: 100,
    maxHealth: 100,
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Room',
    players: [],
  };

  const mockTargetEntity = {
    id: 'enemy-1',
    name: 'Goblin',
    health: 50,
    maxHealth: 50,
    level: 1,
  };

  beforeEach(async () => {
    const mockRoomService = {
      getObjectsInRoom: jest.fn(),
      addObjectToRoom: jest.fn(),
    };

    const mockEntityService = {
      updateEntity: jest.fn().mockResolvedValue(undefined),
    };

    const mockObjectService = {
      updateObject: jest.fn().mockResolvedValue(undefined),
      getObject: jest.fn(),
    };

    const mockPlayerService = {
      updatePlayer: jest.fn().mockResolvedValue(undefined),
    };

    const mockValidator = {
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
      validateHealthValue: jest.fn().mockReturnValue({ valid: true }),
    };

    const mockRoomNavHelper = {};

    const mockGameStateService = {
      getGameState: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttackCommandHandler,
        { provide: RoomService, useValue: mockRoomService },
        { provide: EntityService, useValue: mockEntityService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: CommandValidatorService, useValue: mockValidator },
        { provide: RoomNavigationHelperService, useValue: mockRoomNavHelper },
        { provide: GameStateService, useValue: mockGameStateService },
        { provide: EventEmitterService, useValue: mockEventEmitter },
      ],
    }).compile();

    handler = module.get<AttackCommandHandler>(AttackCommandHandler);
    roomService = module.get(RoomService);
    entityService = module.get(EntityService);
    objectService = module.get(ObjectService);
    playerService = module.get(PlayerService);
    validator = module.get(CommandValidatorService);
    roomNavHelper = module.get(RoomNavigationHelperService);
    gameStateService = module.get(GameStateService);
    eventEmitter = module.get(EventEmitterService);
  });

  describe('damage calculation', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should calculate damage with base random component', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.damage).toBeGreaterThanOrEqual(5 + 1 * 2); // Min: 5 + (level 1 * 2)
      expect(result.combatResult?.damage).toBeLessThanOrEqual(15 + 1 * 2); // Max: 15 + (level 1 * 2)
    });

    it('should add level bonus to damage', async () => {
      const highLevelPlayer = { ...mockPlayer, level: 5 };
      const target = { ...mockTargetEntity, health: 100, maxHealth: 100 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(highLevelPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      // Damage should be at least base (5) + level bonus (5 * 2 = 10) = 15
      expect(result.combatResult?.damage).toBeGreaterThanOrEqual(15);
    });

    it('should handle player without level (default to 1)', async () => {
      const noLevelPlayer = { ...mockPlayer };
      delete noLevelPlayer.level;
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(noLevelPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.damage).toBeGreaterThanOrEqual(7); // 5 + (1 * 2)
    });

    it('should not reduce target health below 0', async () => {
      const weakTarget = { ...mockTargetEntity, health: 3, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([weakTarget]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(entityService.updateEntity).toHaveBeenCalledWith(
        weakTarget.id,
        expect.objectContaining({ health: 0 }),
      );
    });
  });

  describe('entity updates and events', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should update entity health after attack', async () => {
      const target = { ...mockTargetEntity, health: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(entityService.updateEntity).toHaveBeenCalledWith(
        target.id,
        expect.objectContaining({ health: expect.any(Number) }),
      );
    });

    it('should emit ENTITY_UPDATED event with previous and new state', async () => {
      const target = { ...mockTargetEntity, health: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.ENTITY_UPDATED,
        expect.objectContaining({
          entityType: 'object',
          entityId: target.id,
          entityName: target.name,
          previousState: { health: 50 },
          newState: { health: expect.any(Number) },
        }),
        mockPlayer.gameId,
      );
    });

    it('should handle entity update errors gracefully', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      entityService.updateEntity.mockRejectedValue(
        new Error('Database error'),
      );

      // Should not throw, just log error
      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true); // Combat still succeeds
    });
  });

  describe('target survives attack', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should return combat result when target survives', async () => {
      const target = { ...mockTargetEntity, health: 100, maxHealth: 100 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.type).toBe('combat');
      expect(result.combatResult?.targetDefeated).toBe(false);
      expect(result.combatResult?.targetHealthRemaining).toBeDefined();
      expect(result.combatResult?.targetMaxHealth).toBe(100);
    });

    it('should show remaining health in message', async () => {
      const target = { ...mockTargetEntity, health: 50, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.message).toContain('health remaining');
    });

    it('should update object state to active/fighting', async () => {
      const target = {
        ...mockTargetEntity,
        health: 50,
        state: { isActive: false },
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(objectService.updateObject).toHaveBeenCalledWith(
        target.id,
        expect.objectContaining({
          state: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('should handle targets without state property', async () => {
      const target = { ...mockTargetEntity };
      delete target.state;
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(objectService.updateObject).not.toHaveBeenCalled();
    });

    it('should handle object update errors gracefully', async () => {
      const target = {
        ...mockTargetEntity,
        health: 50,
        state: { isActive: false },
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.updateObject.mockRejectedValue(new Error('Update failed'));

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true); // Should still succeed
    });
  });

  describe('NPC counter-attack', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should trigger counter-attack when NPC has level', async () => {
      const npcTarget = {
        ...mockTargetEntity,
        health: 100,
        maxHealth: 100,
        level: 2,
      };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.playerDamageTaken).toBeGreaterThan(0);
      expect(result.combatResult?.playerHealthRemaining).toBeDefined();
      expect(result.message).toContain('counter-attacks');
    });

    it('should calculate NPC damage based on level', async () => {
      const highLevelNpc = {
        ...mockTargetEntity,
        health: 100,
        maxHealth: 100,
        level: 5,
      };
      roomService.getObjectsInRoom.mockReturnValue([highLevelNpc]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.combatResult?.playerDamageTaken).toBeGreaterThanOrEqual(
        3 + Math.floor(5 * 1.5),
      );
    });

    it('should not reduce player health below 0', async () => {
      const npcTarget = { ...mockTargetEntity, health: 100, level: 1 };
      const weakPlayer = { ...mockPlayer, health: 2, maxHealth: 100 };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      const result = await handler.handle(weakPlayer, mockRoom, 'goblin');

      expect(result.combatResult?.playerHealthRemaining).toBe(0);
      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        weakPlayer.id,
        expect.objectContaining({ health: 0 }),
      );
    });

    it('should indicate player defeat when health reaches 0', async () => {
      const npcTarget = { ...mockTargetEntity, health: 100, level: 10 };
      const weakPlayer = { ...mockPlayer, health: 5, maxHealth: 100 };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      const result = await handler.handle(weakPlayer, mockRoom, 'goblin');

      expect(result.combatResult?.playerDefeated).toBe(true);
      expect(result.message).toContain('You have been defeated');
    });

    it('should update player health', async () => {
      const npcTarget = { ...mockTargetEntity, health: 100, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        mockPlayer.id,
        expect.objectContaining({ health: expect.any(Number) }),
      );
    });

    it('should emit player health changed event', async () => {
      const npcTarget = { ...mockTargetEntity, health: 100, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.ENTITY_UPDATED,
        expect.objectContaining({
          entityType: 'player',
          entityId: mockPlayer.id,
          previousState: expect.any(Object),
          newState: expect.any(Object),
        }),
        mockPlayer.gameId,
      );
    });

    it('should handle player update errors gracefully', async () => {
      const npcTarget = { ...mockTargetEntity, health: 100, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);
      playerService.updatePlayer.mockRejectedValue(new Error('Update failed'));

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true); // Should still complete
    });

    it('should not counter-attack if target has no level', async () => {
      const simpleTarget = { ...mockTargetEntity, health: 100 };
      delete simpleTarget.level;
      roomService.getObjectsInRoom.mockReturnValue([simpleTarget]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.combatResult?.playerDamageTaken).toBeUndefined();
      expect(result.message).not.toContain('counter-attacks');
    });

    it('should handle NPC with level 0', async () => {
      const lowLevelNpc = {
        ...mockTargetEntity,
        health: 100,
        maxHealth: 100,
        level: 0,
      };
      roomService.getObjectsInRoom.mockReturnValue([lowLevelNpc]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Level 0 should still calculate damage
      expect(result.combatResult?.playerDamageTaken).toBeDefined();
    });
  });

  describe('combat result structure', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should return combat type result on success', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.type).toBe('combat');
    });

    it('should include all required fields for target survival', async () => {
      const target = { ...mockTargetEntity, health: 50, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.combatResult).toMatchObject({
        damage: expect.any(Number),
        targetDefeated: false,
        targetHealthRemaining: expect.any(Number),
        targetMaxHealth: 50,
      });
    });

    it('should include all required fields for target defeat', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.combatResult).toMatchObject({
        damage: expect.any(Number),
        targetDefeated: true,
        experienceGained: expect.any(Number),
        leveledUp: expect.any(Boolean),
      });
    });
  });

  describe('complete combat scenarios', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should handle full combat with survival and counter-attack', async () => {
      const npcTarget = {
        ...mockTargetEntity,
        health: 100,
        maxHealth: 100,
        level: 2,
        state: { isActive: false },
      };
      roomService.getObjectsInRoom.mockReturnValue([npcTarget]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.type).toBe('combat');
      expect(result.combatResult?.targetDefeated).toBe(false);
      expect(result.combatResult?.playerDamageTaken).toBeGreaterThan(0);
      expect(entityService.updateEntity).toHaveBeenCalled();
      expect(objectService.updateObject).toHaveBeenCalledWith(
        npcTarget.id,
        expect.objectContaining({ state: { isActive: true } }),
      );
      expect(playerService.updatePlayer).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2); // Entity update + player update
    });

    it('should handle full combat with defeat, loot, and level up', async () => {
      const player = {
        ...mockPlayer,
        level: 1,
        experience: 90,
        health: 100,
        maxHealth: 100,
      };
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 100,
        level: 2,
        state: { isActive: true },
        inventory: ['loot-1', 'loot-2'],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.getObject
        .mockReturnValueOnce({ id: 'loot-1', name: 'Gold' })
        .mockReturnValueOnce({ id: 'loot-2', name: 'Gem' });

      const result = await handler.handle(player, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.targetDefeated).toBe(true);
      expect(result.combatResult?.leveledUp).toBe(true);
      expect(result.combatResult?.experienceGained).toBe(30); // 10 + 20
      expect(result.message).toContain('defeated');
      expect(result.message).toContain('leveled up');
      expect(result.message).toContain('dropped');
      expect(roomService.addObjectToRoom).toHaveBeenCalledTimes(2);
      expect(entityService.updateEntity).toHaveBeenCalledTimes(2);
      expect(objectService.updateObject).toHaveBeenCalled();
      expect(playerService.updatePlayer).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.PLAYER_LEVEL_UP,
        expect.any(Object),
        player.gameId,
      );
    });

    it('should handle defeat with no special features', async () => {
      const simpleTarget = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([simpleTarget]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.targetDefeated).toBe(true);
      expect(result.combatResult?.leveledUp).toBe(false);
      expect(result.message).toContain('defeated');
      expect(result.message).not.toContain('leveled up');
      expect(result.message).not.toContain('dropped');
    });
  });
});
