import { Test, TestingModule } from '@nestjs/testing';
import { CastCommandHandler } from './cast-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

describe('CastCommandHandler', () => {
  let handler: CastCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let roomService: jest.Mocked<RoomService>;
  let validator: jest.Mocked<CommandValidatorService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Wizard',
    level: 5,
    health: 100,
    maxHealth: 100,
    mana: 50,
    maxMana: 50,
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Chamber',
    players: [],
  };

  const mockTargetObject = {
    id: 'goblin-1',
    name: 'Goblin',
    health: 30,
    maxHealth: 30,
  };

  beforeEach(async () => {
    const mockPlayerService = {
      castSpell: jest.fn(),
      castAreaSpell: jest.fn(),
      updatePlayer: jest.fn().mockResolvedValue(undefined),
    };

    const mockRoomService = {
      getObjectsInRoom: jest.fn(),
    };

    const mockValidator = {
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CastCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: CommandValidatorService, useValue: mockValidator },
      ],
    }).compile();

    handler = module.get<CastCommandHandler>(CastCommandHandler);
    playerService = module.get(PlayerService);
    roomService = module.get(RoomService);
    validator = module.get(CommandValidatorService);
  });

  describe('basic validation', () => {
    it('should return error when no spell name provided', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cast what?');
    });

    it('should return error when target is null', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, null as any);

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cast what?');
    });

    it('should return error when target is undefined', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, undefined as any);

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cast what?');
    });

    it('should validate spell command format', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Invalid spell format',
      });

      const result = await handler.handle(mockPlayer, mockRoom, '!!!invalid!!!');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid spell format');
      expect(validator.validateItemName).toHaveBeenCalledWith('!!!invalid!!!');
    });

    it('should use default error message if validator does not provide one', async () => {
      validator.validateItemName.mockReturnValue({ valid: false });

      const result = await handler.handle(mockPlayer, mockRoom, '***');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid spell command');
    });
  });

  describe('unknown spells', () => {
    it('should return error for unknown spell', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'unknown spell at goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Unknown spell "unknown spell"');
    });

    it('should return error for random text', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'abracadabra at goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Unknown spell "abracadabra"');
    });

    it('should suggest valid spells in error message', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'notaspell');

      expect(result.success).toBe(false);
      expect(result.message).toContain('fireball');
      expect(result.message).toContain('lightning');
      expect(result.message).toContain('ice');
    });
  });

  describe('fire spells', () => {
    it('should cast fireball at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'You hurl a blazing fireball at the Goblin!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(true);
      expect(result.type).toBe('magic');
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'goblin-1',
        8,
      );
    });

    it('should cast fire spell with intensity 6', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Fire burns the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fire at goblin');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'goblin-1',
        6,
      );
    });

    it('should cast flame spell with intensity 5', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Flames engulf the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'flame at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'goblin-1',
        5,
      );
    });

    it('should cast inferno as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'An inferno engulfs the entire room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'inferno');

      expect(result.success).toBe(true);
      expect(result.type).toBe('magic');
      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'room-1',
        10,
      );
    });

    it('should cast firewave as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'A wave of fire spreads across the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'firewave');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'room-1',
        7,
      );
    });
  });

  describe('lightning spells', () => {
    it('should cast lightning bolt at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Lightning strikes the Goblin!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'lightning bolt at goblin');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'goblin-1',
        8,
      );
    });

    it('should cast lightning spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Lightning crackles!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'lightning at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'goblin-1',
        8,
      );
    });

    it('should cast bolt spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'A bolt of energy strikes!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'bolt at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'goblin-1',
        6,
      );
    });

    it('should cast shock spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'An electric shock hits the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'shock at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'goblin-1',
        5,
      );
    });

    it('should cast chain lightning as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'Chain lightning arcs through the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'chain lightning');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'room-1',
        9,
      );
    });

    it('should cast thunderstorm as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'A thunderstorm rages in the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'thunderstorm');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'lightning',
        'room-1',
        10,
      );
    });
  });

  describe('ice spells', () => {
    it('should cast ice shard at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'An ice shard pierces the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice shard at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'goblin-1',
        7,
      );
    });

    it('should cast frost spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Frost chills the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'frost at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'goblin-1',
        5,
      );
    });

    it('should cast freeze spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'The target freezes solid!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'freeze at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'goblin-1',
        8,
      );
    });

    it('should cast blizzard as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'A blizzard engulfs the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'blizzard');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'room-1',
        9,
      );
    });

    it('should cast ice storm as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'An ice storm rages!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice storm');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'room-1',
        10,
      );
    });
  });

  describe('force spells', () => {
    it('should cast force push at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'You push the target with magical force!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'force push at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'force',
        'goblin-1',
        7,
      );
    });

    it('should cast push spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'The target is pushed back!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'push at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'force',
        'goblin-1',
        5,
      );
    });

    it('should cast shockwave as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'A shockwave ripples through the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'shockwave');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'force',
        'room-1',
        9,
      );
    });
  });

  describe('poison spells', () => {
    it('should cast poison at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Poison seeps into the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'poison at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'poison',
        'goblin-1',
        6,
      );
    });

    it('should cast toxic spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Toxic energy corrupts the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'toxic at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'poison',
        'goblin-1',
        8,
      );
    });

    it('should cast poison cloud as area spell', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'A poison cloud fills the room!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'poison cloud');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'poison',
        'room-1',
        7,
      );
    });
  });

  describe('acid spells', () => {
    it('should cast acid at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Acid burns the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'acid at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'acid',
        'goblin-1',
        7,
      );
    });

    it('should cast acid splash at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Acid splashes on the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'acid splash at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'acid',
        'goblin-1',
        6,
      );
    });

    it('should cast corrosion spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Corrosive energy eats away at the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'corrosion at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'acid',
        'goblin-1',
        8,
      );
    });
  });

  describe('magic spells', () => {
    it('should cast magic missile at target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'A glowing missile strikes the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'magic missile at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'magic',
        'goblin-1',
        5,
      );
    });

    it('should cast missile spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'A missile of pure magic hits the target!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'missile at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'magic',
        'goblin-1',
        5,
      );
    });

    it('should cast magic spell', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Pure magical energy strikes!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'magic at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'magic',
        'goblin-1',
        6,
      );
    });
  });

  describe('target validation', () => {
    it('should require target for single-target spells', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'fireball');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('need to specify a target');
      expect(result.message).toContain('fireball');
    });

    it('should handle "on" keyword for target', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice on goblin');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'goblin-1',
        6,
      );
    });

    it('should find target by partial name match', async () => {
      const orc = { id: 'orc-1', name: 'Mighty Orc Warrior', health: 50 };
      roomService.getObjectsInRoom.mockReturnValue([orc]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at orc');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'orc-1',
        8,
      );
    });

    it('should handle case-insensitive target matching', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'FIREBALL AT GOBLIN');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'goblin-1',
        8,
      );
    });

    it('should return error if target not found in room', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at dragon');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('don\'t see "dragon"');
    });

    it('should return error if target not in objects list', async () => {
      roomService.getObjectsInRoom.mockReturnValue([
        { id: 'table-1', name: 'Wooden Table' },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, 'ice at goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('don\'t see "goblin"');
    });

    it('should handle empty objects array', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, 'lightning at anything');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
    });

    it('should handle objects with undefined name', async () => {
      roomService.getObjectsInRoom.mockReturnValue([
        { id: 'obj-1', name: undefined },
        mockTargetObject,
      ]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fire at goblin');

      expect(result.success).toBe(true);
    });

    it('should handle objects with null name', async () => {
      roomService.getObjectsInRoom.mockReturnValue([
        { id: 'obj-1', name: null },
        mockTargetObject,
      ]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice at goblin');

      expect(result.success).toBe(true);
    });
  });

  describe('area spell handling', () => {
    it('should cast area spell without target', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'Area spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'inferno');

      expect(result.success).toBe(true);
      expect(result.type).toBe('magic');
      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'room-1',
        10,
      );
    });

    it('should ignore target for area spells if provided', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'Area spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'blizzard at goblin');

      expect(result.success).toBe(true);
      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'ice',
        'room-1',
        9,
      );
    });

    it('should handle area spell failure', async () => {
      (playerService as any).castAreaSpell.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockRoom, 'inferno');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Spell casting failed.');
    });

    it('should handle area spell returning undefined', async () => {
      (playerService as any).castAreaSpell.mockReturnValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'thunderstorm');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Spell casting failed.');
    });

    it('should use custom message from area spell result', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'The room erupts in flames!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'firewave');

      expect(result.message).toBe('The room erupts in flames!');
    });

    it('should use default message if area spell result has no message', async () => {
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'inferno');

      expect(result.message).toBe('You cast an area spell!');
    });
  });

  describe('single-target spell handling', () => {
    it('should cast single-target spell successfully', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'You blast the goblin with magic!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(true);
      expect(result.type).toBe('magic');
      expect(result.message).toBe('You blast the goblin with magic!');
    });

    it('should handle spell casting failure', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Spell casting failed.');
    });

    it('should handle spell casting returning undefined', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'ice at goblin');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Spell casting failed.');
    });

    it('should handle spell casting returning failure', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: false,
        message: 'Not enough mana!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'lightning at goblin');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not enough mana!');
    });

    it('should use default message if spell result has no message', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.message).toBe('You cast a spell!');
    });
  });

  describe('spell parsing', () => {
    it('should parse spell with "at" separator', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(true);
    });

    it('should parse spell with "on" separator', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice on goblin');

      expect(result.success).toBe(true);
    });

    it('should handle multi-word spell names', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Magic missiles strike!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'magic missile at goblin');

      expect(result.success).toBe(true);
    });

    it('should handle extra whitespace', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        '   fireball    at    goblin   ',
      );

      expect(result.success).toBe(true);
    });

    it('should handle target names with spaces', async () => {
      const dragon = { id: 'dragon-1', name: 'Ancient Red Dragon', health: 200 };
      roomService.getObjectsInRoom.mockReturnValue([dragon]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'ice at ancient red');

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very long spell input', async () => {
      const longInput = 'a'.repeat(1000) + ' at goblin';

      const result = await handler.handle(mockPlayer, mockRoom, longInput);

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
    });

    it('should handle spell input with special characters', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'fire@ball at goblin');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
    });

    it('should handle target with special characters in name', async () => {
      const target = { id: 'npc-1', name: "Goblin's Friend", health: 30 };
      roomService.getObjectsInRoom.mockReturnValue([target]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fire at goblin');

      expect(result.success).toBe(true);
    });

    it('should handle multiple objects with similar names', async () => {
      const objects = [
        { id: 'goblin-1', name: 'Goblin Scout', health: 20 },
        { id: 'goblin-2', name: 'Goblin Warrior', health: 30 },
      ];
      roomService.getObjectsInRoom.mockReturnValue(objects);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(true);
      expect(playerService.castSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        'goblin-1',
        8,
      );
    });

    it('should handle room service returning null', async () => {
      roomService.getObjectsInRoom.mockReturnValue(null as any);

      const result = await handler.handle(mockPlayer, mockRoom, 'fireball at goblin');

      expect(result.success).toBe(false);
    });

    it('should handle room service returning undefined', async () => {
      roomService.getObjectsInRoom.mockReturnValue(undefined as any);

      const result = await handler.handle(mockPlayer, mockRoom, 'ice at goblin');

      expect(result.success).toBe(false);
    });

    it('should handle missing player id', async () => {
      const playerWithoutId = { ...mockPlayer, id: undefined };
      roomService.getObjectsInRoom.mockReturnValue([mockTargetObject]);
      (playerService as any).castSpell.mockReturnValue({
        success: true,
        message: 'Spell cast!',
      });

      const result = await handler.handle(playerWithoutId, mockRoom, 'fireball at goblin');

      expect(playerService.castSpell).toHaveBeenCalledWith(
        undefined,
        'fire',
        'goblin-1',
        8,
      );
    });

    it('should handle missing room id', async () => {
      const roomWithoutId = { ...mockRoom, id: undefined };
      (playerService as any).castAreaSpell.mockReturnValue({
        success: true,
        message: 'Area spell cast!',
      });

      const result = await handler.handle(mockPlayer, roomWithoutId, 'inferno');

      expect(playerService.castAreaSpell).toHaveBeenCalledWith(
        'player-1',
        'fire',
        undefined,
        10,
      );
    });
  });
});
