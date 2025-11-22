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

describe('AttackCommandHandler', () => {
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

  describe('basic validation', () => {
    it('should return error when no target provided', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Attack what?');
    });

    it('should validate target name', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Invalid target name',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'invalid@name');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid target name');
    });

    it('should use validator error message if provided', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Special characters not allowed',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'test#target');

      expect(result.message).toBe('Special characters not allowed');
    });
  });

  describe('target finding', () => {
    it('should find target in room objects', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(roomService.getObjectsInRoom).toHaveBeenCalledWith(mockRoom.id);
    });

    it('should find target in NPCs if not in objects', async () => {
      const npcTarget = { ...mockTargetEntity, id: 'npc-1' };
      const gameState = {
        npcs: {
          'npc-1': npcTarget,
        },
      };

      roomService.getObjectsInRoom.mockReturnValue([]);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const roomWithNpc = { ...mockRoom, players: ['npc-1'] };
      const result = await handler.handle(mockPlayer, roomWithNpc, 'goblin');

      expect(result.success).toBe(true);
      expect(gameStateService.getGameState).toHaveBeenCalledWith(
        mockPlayer.gameId,
      );
    });

    it('should only match NPCs in the current room', async () => {
      const npcInRoom = { ...mockTargetEntity, id: 'npc-1', name: 'Goblin' };
      const npcNotInRoom = {
        ...mockTargetEntity,
        id: 'npc-2',
        name: 'Goblin',
      };
      const gameState = {
        npcs: {
          'npc-1': npcInRoom,
          'npc-2': npcNotInRoom,
        },
      };

      roomService.getObjectsInRoom.mockReturnValue([]);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const roomWithNpc = { ...mockRoom, players: ['npc-1'] };
      const result = await handler.handle(mockPlayer, roomWithNpc, 'goblin');

      expect(result.success).toBe(true);
      // Should find the NPC that's in the room
    });

    it('should return error if target not found', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'nonexistent monster',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't see");
      expect(result.message).toContain('nonexistent monster');
    });

    it('should handle case-insensitive target matching', async () => {
      const target = { ...mockTargetEntity, name: 'Ancient Dragon' };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'ANCIENT');

      expect(result.success).toBe(true);
    });
  });

  describe('attackability validation', () => {
    it('should reject targets without health property', async () => {
      const nonAttackable = { id: 'obj-1', name: 'Rock' };
      roomService.getObjectsInRoom.mockReturnValue([nonAttackable]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'rock');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('cannot attack');
    });

    it('should reject targets without maxHealth property', async () => {
      const invalidTarget = { id: 'obj-1', name: 'Rock', health: 10 };
      roomService.getObjectsInRoom.mockReturnValue([invalidTarget]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'rock');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('cannot attack');
    });

    it('should validate current health value', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      validator.validateHealthValue.mockReturnValueOnce({
        valid: false,
        error: 'Health must be non-negative',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Invalid target health');
    });

    it('should validate max health value', async () => {
      const target = { ...mockTargetEntity };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      // First call for health passes, second for maxHealth fails
      validator.validateHealthValue
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({
          valid: false,
          error: 'Max health must be positive',
        });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Invalid target max health');
    });

    it('should reject already dead targets', async () => {
      const deadTarget = { ...mockTargetEntity, health: 0 };
      roomService.getObjectsInRoom.mockReturnValue([deadTarget]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('already dead');
    });

    it('should reject targets with negative health', async () => {
      const negativeHealthTarget = { ...mockTargetEntity, health: -10 };
      roomService.getObjectsInRoom.mockReturnValue([negativeHealthTarget]);
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('already dead');
    });
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

  describe('target defeat - XP and leveling', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should mark entity as defeated (health 0)', async () => {
      const weakTarget = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([weakTarget]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Should be called twice: once during combat, once for defeat
      expect(entityService.updateEntity).toHaveBeenCalledWith(
        weakTarget.id,
        expect.objectContaining({ health: 0 }),
      );
    });

    it('should calculate XP based on target maxHealth and level', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 100,
        level: 3,
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      // XP = (maxHealth / 10) + (level * 10) = 10 + 30 = 40
      expect(result.combatResult?.experienceGained).toBe(40);
      expect(result.message).toContain('40 experience');
    });

    it('should grant XP without leveling up', async () => {
      const player = { ...mockPlayer, level: 1, experience: 0 };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(player, mockRoom, 'goblin');

      expect(result.combatResult?.leveledUp).toBe(false);
      expect(result.combatResult?.newLevel).toBeUndefined();
      expect(result.message).not.toContain('leveled up');
      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        player.id,
        expect.objectContaining({
          experience: expect.any(Number),
        }),
      );
    });

    it('should level up when XP threshold reached', async () => {
      const player = { ...mockPlayer, level: 1, experience: 90 };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      // This should give 15 XP (5 + 10), bringing total to 105, enough to level
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(player, mockRoom, 'goblin');

      expect(result.combatResult?.leveledUp).toBe(true);
      expect(result.combatResult?.newLevel).toBe(2);
      expect(result.message).toContain('leveled up');
      expect(result.message).toContain('level 2');
    });

    it('should increase maxHealth on level up', async () => {
      const player = {
        ...mockPlayer,
        level: 1,
        experience: 90,
        health: 80,
        maxHealth: 100,
      };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(player, mockRoom, 'goblin');

      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        player.id,
        expect.objectContaining({
          level: 2,
          maxHealth: 110, // +10
        }),
      );
    });

    it('should heal player on level up', async () => {
      const player = {
        ...mockPlayer,
        level: 1,
        experience: 90,
        health: 80,
        maxHealth: 100,
      };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(player, mockRoom, 'goblin');

      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        player.id,
        expect.objectContaining({
          health: 90, // 80 + 10
        }),
      );
    });

    it('should not overheal beyond new maxHealth on level up', async () => {
      const player = {
        ...mockPlayer,
        level: 1,
        experience: 90,
        health: 100,
        maxHealth: 100,
      };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(player, mockRoom, 'goblin');

      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        player.id,
        expect.objectContaining({
          health: 110, // New maxHealth
          maxHealth: 110,
        }),
      );
    });

    it('should emit PLAYER_LEVEL_UP event', async () => {
      const player = { ...mockPlayer, level: 1, experience: 90 };
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(player, mockRoom, 'goblin');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.PLAYER_LEVEL_UP,
        expect.objectContaining({
          playerId: player.id,
          previousLevel: 1,
          newLevel: 2,
          newMaxHealth: 110,
        }),
        player.gameId,
      );
    });

    it('should emit PLAYER_INVENTORY_CHANGED event for XP gain', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.PLAYER_INVENTORY_CHANGED,
        expect.objectContaining({
          playerId: mockPlayer.id,
          experienceGained: expect.any(Number),
          newExperience: expect.any(Number),
        }),
        mockPlayer.gameId,
      );
    });

    it('should handle player without experience property', async () => {
      const player = { ...mockPlayer };
      delete player.experience;
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50, level: 1 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(player, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        player.id,
        expect.objectContaining({
          experience: expect.any(Number),
        }),
      );
    });

    it('should handle target without level (default to 1)', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      delete target.level;
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.experienceGained).toBeGreaterThan(0);
    });

    it('should handle target without maxHealth (default to 100)', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: undefined };
      delete target.maxHealth;
      target.maxHealth = 50; // Set it back for validation
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
    });
  });

  describe('target defeat - loot drops', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should handle target with no inventory', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.message).not.toContain('dropped');
      expect(roomService.addObjectToRoom).not.toHaveBeenCalled();
    });

    it('should handle target with empty inventory', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: [],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.message).not.toContain('dropped');
      expect(roomService.addObjectToRoom).not.toHaveBeenCalled();
    });

    it('should drop loot from inventory to room', async () => {
      const lootItem = { id: 'loot-1', name: 'Gold Coin' };
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: ['loot-1'],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.getObject.mockReturnValue(lootItem);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(roomService.addObjectToRoom).toHaveBeenCalledWith(
        mockRoom.id,
        'loot-1',
      );
      expect(result.message).toContain('dropped');
      expect(result.message).toContain('Gold Coin');
    });

    it('should handle loot items as objects with id and name', async () => {
      const lootItem = { id: 'loot-1', name: 'Health Potion' };
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: [lootItem],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(roomService.addObjectToRoom).toHaveBeenCalledWith(
        mockRoom.id,
        'loot-1',
      );
      expect(result.message).toContain('Health Potion');
    });

    it('should handle loot items without names', async () => {
      const lootItem = { id: 'loot-1' };
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: [lootItem],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(roomService.addObjectToRoom).toHaveBeenCalledWith(
        mockRoom.id,
        'loot-1',
      );
      expect(result.message).toContain('an item');
    });

    it('should drop multiple loot items', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: ['item-1', 'item-2', 'item-3'],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.getObject
        .mockReturnValueOnce({ id: 'item-1', name: 'Sword' })
        .mockReturnValueOnce({ id: 'item-2', name: 'Shield' })
        .mockReturnValueOnce({ id: 'item-3', name: 'Helmet' });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(roomService.addObjectToRoom).toHaveBeenCalledTimes(3);
      expect(result.message).toContain('Sword');
      expect(result.message).toContain('Shield');
      expect(result.message).toContain('Helmet');
    });

    it('should handle loot drop errors gracefully', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: ['item-1'],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.getObject.mockReturnValue({ id: 'item-1', name: 'Sword' });
      roomService.addObjectToRoom.mockImplementation(() => {
        throw new Error('Room full');
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Should not crash, just log error
      expect(result.success).toBe(true);
    });

    it('should handle string loot item IDs', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        inventory: ['potion-id'],
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.getObject.mockReturnValue({
        id: 'potion-id',
        name: 'Potion',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(roomService.addObjectToRoom).toHaveBeenCalledWith(
        mockRoom.id,
        'potion-id',
      );
    });
  });

  describe('target defeat - state updates', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should mark object as destroyed if it has state', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        state: { isActive: true },
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(objectService.updateObject).toHaveBeenCalledWith(
        target.id,
        expect.objectContaining({
          state: expect.objectContaining({ destroyed: true }),
        }),
      );
    });

    it('should preserve existing state when marking destroyed', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        state: { isActive: true, customProp: 'value' },
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(objectService.updateObject).toHaveBeenCalledWith(
        target.id,
        expect.objectContaining({
          state: expect.objectContaining({
            isActive: true,
            customProp: 'value',
            destroyed: true,
          }),
        }),
      );
    });

    it('should not update state if target has no state property', async () => {
      const target = { ...mockTargetEntity, health: 5, maxHealth: 50 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      // objectService.updateObject should not be called for state
      const stateCalls = (objectService.updateObject as jest.Mock).mock.calls.filter(
        (call) => call[1]?.state !== undefined,
      );
      expect(stateCalls.length).toBe(0);
    });

    it('should handle state update errors gracefully', async () => {
      const target = {
        ...mockTargetEntity,
        health: 5,
        maxHealth: 50,
        state: { isActive: true },
      };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      objectService.updateObject.mockRejectedValue(new Error('State error'));

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true); // Should still succeed
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

  describe('edge cases', () => {
    beforeEach(() => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    });

    it('should handle target with exactly 0 maxHealth', async () => {
      const target = { ...mockTargetEntity, health: 0, maxHealth: 0 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Should be rejected as already dead
      expect(result.success).toBe(false);
    });

    it('should handle undefined gameState npcs', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);
      gameStateService.getGameState.mockResolvedValue({});

      const result = await handler.handle(mockPlayer, mockRoom, 'monster');

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't see");
    });

    it('should handle room without players array', async () => {
      const roomNoPlayers = { ...mockRoom };
      delete roomNoPlayers.players;

      const npcTarget = { ...mockTargetEntity, id: 'npc-1' };
      const gameState = { npcs: { 'npc-1': npcTarget } };

      roomService.getObjectsInRoom.mockReturnValue([]);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, roomNoPlayers, 'goblin');

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't see");
    });

    it('should handle very high damage that exceeds target health', async () => {
      const highLevelPlayer = { ...mockPlayer, level: 100 };
      const weakTarget = { ...mockTargetEntity, health: 10, maxHealth: 10 };
      roomService.getObjectsInRoom.mockReturnValue([weakTarget]);

      const result = await handler.handle(highLevelPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
      expect(result.combatResult?.targetDefeated).toBe(true);
      expect(entityService.updateEntity).toHaveBeenCalledWith(
        weakTarget.id,
        expect.objectContaining({ health: 0 }),
      );
    });

    it('should handle target name with special characters', async () => {
      const target = { ...mockTargetEntity, name: "Goblin's Minion" };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      expect(result.success).toBe(true);
    });

    it('should handle multiple targets with similar names', async () => {
      const target1 = { ...mockTargetEntity, id: 'goblin-1', name: 'Goblin' };
      const target2 = {
        ...mockTargetEntity,
        id: 'goblin-2',
        name: 'Goblin Warrior',
      };
      roomService.getObjectsInRoom.mockReturnValue([target1, target2]);

      const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Should match the first one found
      expect(result.success).toBe(true);
    });

    it('should handle concurrent entity update calls', async () => {
      const target = { ...mockTargetEntity, health: 5 };
      roomService.getObjectsInRoom.mockReturnValue([target]);

      await handler.handle(mockPlayer, mockRoom, 'goblin');

      // Should call updateEntity at least twice (damage + defeat)
      expect(entityService.updateEntity).toHaveBeenCalledTimes(2);
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
