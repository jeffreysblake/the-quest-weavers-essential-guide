import { Test, TestingModule } from '@nestjs/testing';
import { UseCommandHandler } from './use-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('UseCommandHandler', () => {
  let handler: UseCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let roomService: jest.Mocked<RoomService>;
  let objectService: jest.Mocked<ObjectService>;
  let validator: jest.Mocked<CommandValidatorService>;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Rex Doorman',
    health: 80,
    maxHealth: 100,
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Room',
  };

  beforeEach(async () => {
    const mockPlayerService = {
      getInventory: jest.fn(),
      removeFromInventory: jest.fn(),
      updatePlayer: jest.fn(),
    };

    const mockRoomService = {
      getObjectsInRoom: jest.fn(),
    };

    const mockObjectService = {
      updateObject: jest.fn(),
    };

    const mockValidator = {
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
    };

    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UseCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: CommandValidatorService, useValue: mockValidator },
        { provide: EventEmitterService, useValue: mockEventEmitter },
      ],
    }).compile();

    handler = module.get<UseCommandHandler>(UseCommandHandler);
    playerService = module.get(PlayerService);
    roomService = module.get(RoomService);
    objectService = module.get(ObjectService);
    validator = module.get(CommandValidatorService);
    eventEmitter = module.get(EventEmitterService);
  });

  describe('handle - basic flow', () => {
    it('should validate target before processing', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Invalid item',
      });

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
    });

    it('should return error if object not found', async () => {
      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'nonexistent item',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't see");
    });

    it('should emit generic event for unhandled item types', async () => {
      const genericItem = {
        id: 'item-1',
        name: 'Strange Device',
        objectType: 'item',
      };

      playerService.getInventory.mockReturnValue([genericItem]);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'strange device',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Nothing obvious happens');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.OBJECT_USED,
        expect.objectContaining({
          playerId: mockPlayer.id,
          objectId: genericItem.id,
        }),
        mockPlayer.gameId,
      );
    });
  });

  describe('handleRealityAnchorVictory - Hotel game victory', () => {
    const realityAnchor = {
      id: 'reality-anchor',
      name: 'Reality Anchor',
      objectType: 'item',
    };

    const vaultRoom = {
      id: 'vault-room',
      name: 'Reality Vault',
    };

    const normalRoom = {
      id: 'normal-room',
      name: 'Hotel Lobby',
    };

    it('should reject if not in Reality Vault', async () => {
      playerService.getInventory.mockReturnValue([realityAnchor]);

      const result = await handler.handle(
        mockPlayer,
        normalRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_result');
      expect(result.message).toContain('need to be in the Reality Vault');
    });

    it('should accept room name with "vault" in it', async () => {
      const simpleVault = { id: 'vault', name: 'The Vault' };

      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'frag-3', name: 'Reality Fragment 3' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        { id: 'key-4', name: 'Master Key Fragment 4' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        simpleVault,
        'reality anchor',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('victory');
    });

    it('should require 3 Reality Fragments', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        // Missing 3rd fragment
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        { id: 'key-4', name: 'Master Key Fragment 4' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('you have 2/3');
    });

    it('should require 4 Master Key Fragments', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'frag-3', name: 'Reality Fragment 3' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        // Missing 4th key fragment
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('you have 3/4');
    });

    it('should NOT count Reality Anchor Fragment as Reality Fragment', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'anchor-frag', name: 'Reality Anchor Fragment' }, // Should be excluded
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        { id: 'key-4', name: 'Master Key Fragment 4' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('2/3'); // Only 2 reality fragments (anchor fragment not counted)
    });

    it('should grant victory when all requirements met', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'frag-3', name: 'Reality Fragment 3' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        { id: 'key-4', name: 'Master Key Fragment 4' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('victory');
      expect(result.message).toContain('VICTORY');
      expect(result.message).toContain('Grand Paradox Hotel');
      expect(result.message).toContain('Rex Doorman');
    });

    it('should emit hotel_game_completed event on victory', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'frag-3', name: 'Reality Fragment 3' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
        { id: 'key-3', name: 'Master Key Fragment 3' },
        { id: 'key-4', name: 'Master Key Fragment 4' },
      ]);

      await handler.handle(mockPlayer, vaultRoom, 'reality anchor');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'hotel_game_completed',
          playerId: mockPlayer.id,
        }),
        mockPlayer.gameId,
      );
    });

    it('should show progress for both requirements when missing', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('1/3'); // Reality fragments
      expect(result.message).toContain('2/4'); // Master key fragments
    });

    it('should show checkmark when requirement met', async () => {
      playerService.getInventory.mockReturnValue([
        realityAnchor,
        { id: 'frag-1', name: 'Reality Fragment 1' },
        { id: 'frag-2', name: 'Reality Fragment 2' },
        { id: 'frag-3', name: 'Reality Fragment 3' },
        { id: 'key-1', name: 'Master Key Fragment 1' },
        { id: 'key-2', name: 'Master Key Fragment 2' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        vaultRoom,
        'reality anchor',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('✓'); // Has all reality fragments
      expect(result.message).toContain('2/4'); // Missing key fragments
    });
  });

  describe('handleConsumableUse', () => {
    it('should require item to be in inventory', async () => {
      const potion = {
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
        properties: { healAmount: 20 },
      };

      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([potion]);

      const result = await handler.handle(mockPlayer, mockRoom, 'health potion');

      expect(result.success).toBe(false);
      expect(result.message).toContain('pick up');
    });

    it('should restore health and remove item', async () => {
      const potion = {
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
        properties: { healAmount: 20 },
      };

      playerService.getInventory.mockReturnValue([potion]);
      playerService.removeFromInventory.mockReturnValue(true);

      const result = await handler.handle(mockPlayer, mockRoom, 'health potion');

      expect(result.success).toBe(true);
      expect(result.message).toContain('consume');
      expect(result.message).toContain('restores 20 health');
      expect(playerService.updatePlayer).toHaveBeenCalledWith(
        mockPlayer.id,
        expect.objectContaining({ health: 100 }),
      );
      expect(playerService.removeFromInventory).toHaveBeenCalledWith(
        mockPlayer.id,
        potion.id,
      );
    });

    it('should not overheal beyond maxHealth', async () => {
      const fullHealthPlayer = { ...mockPlayer, health: 100, maxHealth: 100 };
      const potion = {
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
        properties: { healAmount: 50 },
      };

      playerService.getInventory.mockReturnValue([potion]);
      playerService.removeFromInventory.mockReturnValue(true);

      const result = await handler.handle(
        fullHealthPlayer,
        mockRoom,
        'health potion',
      );

      expect(result.message).toContain('health is already full');
    });

    it('should emit OBJECT_USED event with consumption details', async () => {
      const potion = {
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
        properties: { healAmount: 20 },
      };

      playerService.getInventory.mockReturnValue([potion]);
      playerService.removeFromInventory.mockReturnValue(true);

      await handler.handle(mockPlayer, mockRoom, 'health potion');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.OBJECT_USED,
        expect.objectContaining({
          consumed: true,
          healthRestored: 20,
        }),
        mockPlayer.gameId,
      );
    });
  });

  describe('handleWeaponUse', () => {
    it('should require weapon to be in inventory', async () => {
      const sword = {
        id: 'sword-1',
        name: 'Iron Sword',
        objectType: 'weapon',
        properties: { damage: 15 },
      };

      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([sword]);

      const result = await handler.handle(mockPlayer, mockRoom, 'iron sword');

      expect(result.success).toBe(false);
      expect(result.message).toContain('pick up');
    });

    it('should ready weapon and show damage', async () => {
      const sword = {
        id: 'sword-1',
        name: 'Iron Sword',
        objectType: 'weapon',
        properties: { damage: 15 },
      };

      playerService.getInventory.mockReturnValue([sword]);

      const result = await handler.handle(mockPlayer, mockRoom, 'iron sword');

      expect(result.success).toBe(true);
      expect(result.message).toContain('ready');
      expect(result.message).toContain('15 damage');
    });

    it('should emit equipped event', async () => {
      const sword = {
        id: 'sword-1',
        name: 'Iron Sword',
        objectType: 'weapon',
        properties: { damage: 15 },
      };

      playerService.getInventory.mockReturnValue([sword]);

      await handler.handle(mockPlayer, mockRoom, 'iron sword');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.OBJECT_USED,
        expect.objectContaining({
          equipped: true,
        }),
        mockPlayer.gameId,
      );
    });
  });

  describe('handleKeyUse', () => {
    it('should return error if no locked containers in room', async () => {
      const key = {
        id: 'key-1',
        name: 'Brass Key',
        objectType: 'item',
        properties: { isKey: true },
      };

      playerService.getInventory.mockReturnValue([key]);
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, 'brass key');

      expect(result.success).toBe(false);
      expect(result.message).toContain('nothing here to unlock');
    });

    it('should unlock matching container', async () => {
      const key = {
        id: 'key-1',
        name: 'Brass Key',
        objectType: 'item',
        properties: { isKey: true, unlocks: 'chest-1' },
      };

      const lockedChest = {
        id: 'chest-1',
        name: 'Wooden Chest',
        isContainer: true,
        state: { isLocked: true },
      };

      playerService.getInventory.mockReturnValue([key]);
      roomService.getObjectsInRoom.mockReturnValue([lockedChest]);

      const result = await handler.handle(mockPlayer, mockRoom, 'brass key');

      expect(result.success).toBe(true);
      expect(result.message).toContain('unlock');
      expect(result.message).toContain('satisfying click');
      expect(objectService.updateObject).toHaveBeenCalledWith(
        lockedChest.id,
        expect.objectContaining({
          state: expect.objectContaining({ isLocked: false }),
        }),
      );
    });

    it('should consume key if consumeOnUse property set', async () => {
      const key = {
        id: 'key-1',
        name: 'Fragile Key',
        objectType: 'item',
        properties: { isKey: true, consumeOnUse: true },
      };

      const lockedChest = {
        id: 'chest-1',
        name: 'Wooden Chest',
        isContainer: true,
        state: { isLocked: true },
      };

      playerService.getInventory.mockReturnValue([key]);
      roomService.getObjectsInRoom.mockReturnValue([lockedChest]);

      const result = await handler.handle(mockPlayer, mockRoom, 'fragile key');

      expect(result.success).toBe(true);
      expect(result.message).toContain('key breaks');
      expect(playerService.removeFromInventory).toHaveBeenCalledWith(
        mockPlayer.id,
        key.id,
      );
    });
  });

  describe('handleToolUse', () => {
    it('should require tool to be in inventory', async () => {
      const torch = {
        id: 'torch-1',
        name: 'Torch',
        objectType: 'item',
        properties: { toolType: 'torch' },
      };

      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([torch]);

      const result = await handler.handle(mockPlayer, mockRoom, 'torch');

      expect(result.success).toBe(false);
      expect(result.message).toContain('pick up');
    });

    it('should light torch and update state', async () => {
      const torch = {
        id: 'torch-1',
        name: 'Torch',
        objectType: 'item',
        properties: { toolType: 'torch' },
        state: { isActive: false },
      };

      playerService.getInventory.mockReturnValue([torch]);

      const result = await handler.handle(mockPlayer, mockRoom, 'torch');

      expect(result.success).toBe(true);
      expect(result.message).toContain('light');
      expect(result.message).toContain('illuminates');
      expect(objectService.updateObject).toHaveBeenCalled();
    });

    it('should not relight already lit torch', async () => {
      const torch = {
        id: 'torch-1',
        name: 'Torch',
        objectType: 'item',
        properties: { toolType: 'torch' },
        state: { isActive: true },
      };

      playerService.getInventory.mockReturnValue([torch]);

      const result = await handler.handle(mockPlayer, mockRoom, 'torch');

      expect(result.success).toBe(true);
      expect(result.message).toContain('already lit');
    });
  });

  describe('handleCosmicRepairStation - Janitor game victory', () => {
    const repairStation = {
      id: 'repair-station',
      name: 'Cosmic Repair Station',
      objectType: 'furniture',
    };

    beforeEach(() => {
      // Mock roomService to return the repair station
      roomService.getObjectsInRoom.mockReturnValue([repairStation]);
    });

    it('should require 5 shards and 5 artifacts for victory', async () => {
      playerService.getInventory.mockReturnValue([
        { id: 's1', name: 'Vacuum Shard' },
        { id: 's2', name: 'Nozzle Fragment' },
        // Missing 3 more shards
        { id: 'a1', name: 'Celestial Spray Bottle' },
        // Missing 4 more artifacts
      ]);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'cosmic repair station',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('2/5'); // Shards
      expect(result.message).toContain('1/5'); // Artifacts
    });

    it('should grant victory when all items collected', async () => {
      playerService.getInventory.mockReturnValue([
        { id: 's1', name: 'Vacuum Shard' },
        { id: 's2', name: 'Nozzle Fragment' },
        { id: 's3', name: 'Canister Fragment' },
        { id: 's4', name: 'Filter Fragment' },
        { id: 's5', name: 'Handle Fragment' },
        { id: 'a1', name: 'Celestial Spray Bottle' },
        { id: 'a2', name: 'Divine Duster' },
        { id: 'a3', name: 'Quantum Mop' },
        { id: 'a4', name: 'Holy Scrub Brush' },
        { id: 'a5', name: 'Eternal Sponge' },
      ]);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'cosmic repair station',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('victory');
      expect(result.message).toContain('VICTORY');
      expect(result.message).toContain('VACUUM OF ETERNITY');
    });

    it('should emit game_completed event on victory', async () => {
      playerService.getInventory.mockReturnValue([
        { id: 's1', name: 'Vacuum Shard' },
        { id: 's2', name: 'Nozzle Fragment' },
        { id: 's3', name: 'Canister Fragment' },
        { id: 's4', name: 'Filter Fragment' },
        { id: 's5', name: 'Handle Fragment' },
        { id: 'a1', name: 'Celestial Spray Bottle' },
        { id: 'a2', name: 'Divine Duster' },
        { id: 'a3', name: 'Quantum Mop' },
        { id: 'a4', name: 'Holy Scrub Brush' },
        { id: 'a5', name: 'Eternal Sponge' },
      ]);

      await handler.handle(mockPlayer, mockRoom, 'cosmic repair station');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'game_completed',
          playerId: mockPlayer.id,
        }),
        mockPlayer.gameId,
      );
    });
  });

  describe('container handling', () => {
    it('should suggest opening containers instead of using them', async () => {
      const chest = {
        id: 'chest-1',
        name: 'Wooden Chest',
        objectType: 'container',
        isContainer: true,
      };

      playerService.getInventory.mockReturnValue([chest]);

      const result = await handler.handle(mockPlayer, mockRoom, 'wooden chest');

      expect(result.success).toBe(false);
      expect(result.message).toContain('open');
    });
  });
});
