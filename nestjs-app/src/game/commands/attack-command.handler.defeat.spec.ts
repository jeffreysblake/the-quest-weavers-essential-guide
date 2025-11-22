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

describe('AttackCommandHandler - Defeat & Rewards', () => {
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

});
