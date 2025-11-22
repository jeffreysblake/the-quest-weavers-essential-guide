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

describe('AttackCommandHandler - Validation', () => {
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
});
