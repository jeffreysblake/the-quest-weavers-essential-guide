import { Test, TestingModule } from '@nestjs/testing';
import { CommandProcessorService } from './command-processor.service';
import { CommandValidatorService } from './command-validator.service';
import { RoomNavigationHelperService } from './room-navigation-helper.service';
import { PlayerService } from '../entity/player.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { EntityService } from '../entity/entity.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { DialogueManagerService } from '../dialogue/dialogue-manager.service';
import { GameStateService } from './game-state.service';
import { CommandResult } from './game.service';

// Import all command handlers
import { LookCommandHandler } from './commands/look-command.handler';
import { MovementCommandHandler } from './commands/movement-command.handler';
import { TakeCommandHandler } from './commands/take-command.handler';
import { DropCommandHandler } from './commands/drop-command.handler';
import { ExamineCommandHandler } from './commands/examine-command.handler';
import { UseCommandHandler } from './commands/use-command.handler';
import { OpenCommandHandler, CloseCommandHandler } from './commands/container-command.handler';
import { DialogueCommandHandler } from './commands/dialogue-command.handler';
import { AttackCommandHandler } from './commands/attack-command.handler';
import { CastCommandHandler } from './commands/cast-command.handler';

describe('CommandProcessorService', () => {
  let service: CommandProcessorService;
  let playerService: jest.Mocked<PlayerService>;
  let roomService: jest.Mocked<RoomService>;
  let objectService: jest.Mocked<ObjectService>;
  let entityService: jest.Mocked<EntityService>;
  let eventEmitter: jest.Mocked<EventEmitterService>;
  let dialogueManager: jest.Mocked<DialogueManagerService>;
  let gameStateService: jest.Mocked<GameStateService>;

  const mockPlayer = {
    id: 'player123',
    name: 'TestPlayer',
    gameId: 'game1',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    inventory: [],
    flags: {},
    variables: {},
    questStates: {},
  };

  const mockRoom = {
    id: 'room1',
    name: 'Entry Hall',
    description: 'A dimly lit entry hall',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
  };

  const mockNorthRoom = {
    id: 'room2',
    name: 'Garden',
    description: 'A peaceful garden',
    position: { x: 0, y: 15, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
  };

  const mockEastRoom = {
    id: 'room3',
    name: 'Library',
    description: 'A vast library',
    position: { x: 15, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
  };

  const mockObject = {
    id: 'obj1',
    name: 'Brass Key',
    description: 'An old brass key',
    objectType: 'item',
    position: { x: 5, y: 5, z: 0 },
    canTake: true,
  };

  const mockFixedObject = {
    id: 'obj2',
    name: 'Stone Statue',
    description: 'A heavy stone statue',
    objectType: 'furniture',
    position: { x: 3, y: 3, z: 0 },
    canTake: false,
  };

  beforeEach(async () => {
    const mockPlayerServiceValue = {
      getPlayer: jest.fn(),
      movePlayer: jest.fn(),
      addToInventory: jest.fn(),
      removeFromInventory: jest.fn(),
      getInventory: jest.fn(),
      updatePlayer: jest.fn(),
    };

    const mockRoomServiceValue = {
      getAllRooms: jest.fn(),
      getObjectsInRoom: jest.fn(),
      addObjectToRoom: jest.fn(),
      removeObjectFromRoom: jest.fn(),
    };

    const mockObjectServiceValue = {
      updateObjectPosition: jest.fn(),
      updateObject: jest.fn(),
      getObject: jest.fn(),
    };

    const mockEntityServiceValue = {
      updateEntity: jest.fn(),
    };

    const mockEventEmitterValue = {
      emit: jest.fn(),
    };

    const mockDialogueManagerValue = {
      registerDialogueTree: jest.fn(),
      startConversation: jest.fn(),
      getCurrentDialogue: jest.fn(),
      makeChoice: jest.fn(),
      endConversation: jest.fn(),
      getConversationState: jest.fn(),
      getPlayerConversations: jest.fn(),
      getDialogueTree: jest.fn(),
      getNpcDialogueTrees: jest.fn(),
    };

    const mockGameStateServiceValue = {
      getGameState: jest.fn(),
      updateGameState: jest.fn(),
      saveGameState: jest.fn(),
      loadGameState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandProcessorService,
        CommandValidatorService,
        RoomNavigationHelperService,
        // Command handlers
        LookCommandHandler,
        MovementCommandHandler,
        TakeCommandHandler,
        DropCommandHandler,
        ExamineCommandHandler,
        UseCommandHandler,
        OpenCommandHandler,
        CloseCommandHandler,
        DialogueCommandHandler,
        AttackCommandHandler,
        CastCommandHandler,
        // Mocked services
        {
          provide: PlayerService,
          useValue: mockPlayerServiceValue,
        },
        {
          provide: RoomService,
          useValue: mockRoomServiceValue,
        },
        {
          provide: ObjectService,
          useValue: mockObjectServiceValue,
        },
        {
          provide: EntityService,
          useValue: mockEntityServiceValue,
        },
        {
          provide: EventEmitterService,
          useValue: mockEventEmitterValue,
        },
        {
          provide: DialogueManagerService,
          useValue: mockDialogueManagerValue,
        },
        {
          provide: GameStateService,
          useValue: mockGameStateServiceValue,
        },
      ],
    }).compile();

    service = module.get<CommandProcessorService>(CommandProcessorService);
    playerService = module.get(PlayerService);
    roomService = module.get(RoomService);
    objectService = module.get(ObjectService);
    entityService = module.get(EntityService);
    eventEmitter = module.get(EventEmitterService);
    dialogueManager = module.get(DialogueManagerService);
    gameStateService = module.get(GameStateService);

    // Default mock implementations
    playerService.getPlayer.mockReturnValue(mockPlayer);
    playerService.addToInventory.mockReturnValue(true);
    playerService.removeFromInventory.mockReturnValue(true);
    playerService.updatePlayer.mockReturnValue(undefined);
    roomService.getAllRooms.mockReturnValue([
      mockRoom,
      mockNorthRoom,
      mockEastRoom,
    ]);
    roomService.getObjectsInRoom.mockReturnValue([]);
    roomService.addObjectToRoom.mockReturnValue(true);
    roomService.removeObjectFromRoom.mockReturnValue(true);
    playerService.getInventory.mockReturnValue([]);
    objectService.updateObjectPosition.mockReturnValue(true);
    objectService.updateObject.mockReturnValue(undefined);
    entityService.updateEntity.mockResolvedValue(undefined);
    gameStateService.getGameState.mockResolvedValue({
      gameId: 'game1',
      npcs: {},
      rooms: {},
      items: {},
    });
    eventEmitter.emit.mockResolvedValue(undefined);
    dialogueManager.getPlayerConversations.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processCommand() - Player Validation', () => {
    it('should return error if player not found', async () => {
      playerService.getPlayer.mockReturnValue(null);

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Player not found');
    });

    it('should return error if current room not found', async () => {
      roomService.getAllRooms.mockReturnValue([]);

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Current location not found');
    });

    it('should trim and lowercase the command', async () => {
      const result = await service.processCommand(
        '  LOOK  ',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
    });
  });

  describe('processCommand() - Look Command', () => {
    it('should handle "look" command', async () => {
      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
      expect(result.roomDescription).toBe(mockRoom.description);
      expect(result.playerStatus.location).toBe(mockRoom.name);
    });

    it('should handle "l" command as alias for look', async () => {
      const result = await service.processCommand('l', 'player123', 'game1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
    });

    it('should include objects in room description', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.items).toContain('Brass Key');
    });

    it('should include exits in room description', async () => {
      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.exits).toBeDefined();
      expect(Array.isArray(result.exits)).toBe(true);
    });

    it('should handle "look around"', async () => {
      const result = await service.processCommand(
        'look around',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
    });

    it('should handle "look room"', async () => {
      const result = await service.processCommand(
        'look room',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
    });

    it('should handle looking at specific object', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'look key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('examination');
    });
  });

  describe('processCommand() - Movement Commands', () => {
    it('should handle "go north" command', async () => {
      const result = await service.processCommand(
        'go north',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
      expect(result.message).toContain('north');
      expect(playerService.movePlayer).toHaveBeenCalled();
    });

    it('should handle "north" as standalone command', async () => {
      const result = await service.processCommand(
        'north',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
    });

    it('should handle "go south" command', async () => {
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 0, y: 20, z: 0 },
      });

      const result = await service.processCommand(
        'go south',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(playerService.movePlayer).toHaveBeenCalledWith('player123', {
        x: 0,
        y: 5,
        z: 0,
      });
    });

    it('should handle "go east" command', async () => {
      const result = await service.processCommand(
        'go east',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
    });

    it('should handle "go west" command', async () => {
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 20, y: 5, z: 0 },
      });

      const result = await service.processCommand(
        'go west',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should handle "go up" command', async () => {
      const result = await service.processCommand(
        'go up',
        'player123',
        'game1',
      );

      expect(playerService.movePlayer).toHaveBeenCalledWith(
        'player123',
        expect.objectContaining({ z: 1 }),
      );
    });

    it('should handle "go down" command', async () => {
      // Create a room at lower z level
      roomService.getAllRooms.mockReturnValue([
        mockRoom,
        {
          ...mockRoom,
          id: 'room_down',
          position: { x: 0, y: 0, z: -3 },
        },
        mockNorthRoom,
        mockEastRoom,
      ]);

      const result = await service.processCommand(
        'go down',
        'player123',
        'game1',
      );

      expect(playerService.movePlayer).toHaveBeenCalledWith(
        'player123',
        expect.objectContaining({ z: -1 }),
      );
    });

    it('should block movement to non-existent room', async () => {
      roomService.getAllRooms.mockReturnValue([mockRoom]);

      const result = await service.processCommand(
        'go north',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('movement_blocked');
      expect(result.message).toContain('cannot go');
    });

    it('should handle invalid direction', async () => {
      const result = await service.processCommand(
        'go nowhere',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain("don't understand the direction");
    });

    it('should handle "move" command', async () => {
      const result = await service.processCommand(
        'move east',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
    });

    it('should update player position after movement', async () => {
      await service.processCommand('go north', 'player123', 'game1');

      expect(playerService.movePlayer).toHaveBeenCalledWith('player123', {
        x: 5,
        y: 20,
        z: 0,
      });
    });
  });

  describe('processCommand() - Take Command', () => {
    it('should handle "take" command', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'take key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toContain('take');
      expect(result.message).toContain('Brass Key');
    });

    it('should add object to player inventory', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      await service.processCommand('take key', 'player123', 'game1');

      expect(playerService.addToInventory).toHaveBeenCalledWith(
        'player123',
        'obj1',
      );
    });

    it('should remove object from room', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      await service.processCommand('take key', 'player123', 'game1');

      expect(roomService.removeObjectFromRoom).toHaveBeenCalledWith(
        'room1',
        'obj1',
      );
    });

    it('should handle "get" as alias for take', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'get key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
    });

    it('should handle "pick" as alias for take', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'pick key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should fail if object not in room', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await service.processCommand(
        'take key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't see");
    });

    it('should fail if object cannot be taken', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockFixedObject]);

      const result = await service.processCommand(
        'take statue',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('cannot take');
    });

    it('should fail if no target specified', async () => {
      const result = await service.processCommand('take', 'player123', 'game1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Take what?');
    });

    it('should match partial object names', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'take brass',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('processCommand() - Drop Command', () => {
    it('should handle "drop" command', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'drop key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toContain('drop');
    });

    it('should remove object from inventory', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);

      await service.processCommand('drop key', 'player123', 'game1');

      expect(playerService.removeFromInventory).toHaveBeenCalledWith(
        'player123',
        'obj1',
      );
    });

    it('should add object to room', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);

      await service.processCommand('drop key', 'player123', 'game1');

      expect(roomService.addObjectToRoom).toHaveBeenCalledWith('room1', 'obj1');
      expect(objectService.updateObjectPosition).toHaveBeenCalled();
    });

    it('should handle "put" as alias for drop', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'put key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should fail if object not in inventory', async () => {
      playerService.getInventory.mockReturnValue([]);

      const result = await service.processCommand(
        'drop key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't have");
    });

    it('should fail if no target specified', async () => {
      const result = await service.processCommand('drop', 'player123', 'game1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Drop what?');
    });
  });

  describe('processCommand() - Examine Command', () => {
    it('should examine object in inventory', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'examine key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('examination');
      expect(result.message).toBe('An old brass key');
    });

    it('should examine object in room', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'examine key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('examination');
    });

    it('should handle "inspect" as alias', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      const result = await service.processCommand(
        'inspect key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should fail if object not found', async () => {
      const result = await service.processCommand(
        'examine unicorn',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't see");
    });

    it('should fail if no target specified', async () => {
      const result = await service.processCommand(
        'examine',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Examine what?');
    });

    it('should provide default description if none exists', async () => {
      const objectWithoutDesc = { ...mockObject, description: '' };
      roomService.getObjectsInRoom.mockReturnValue([objectWithoutDesc]);

      const result = await service.processCommand(
        'examine key',
        'player123',
        'game1',
      );

      expect(result.message).toContain("It's a");
    });

    it('should check inventory before room', async () => {
      playerService.getInventory.mockReturnValue([mockObject]);
      roomService.getObjectsInRoom.mockReturnValue([
        { ...mockObject, description: 'Different key' },
      ]);

      const result = await service.processCommand(
        'examine key',
        'player123',
        'game1',
      );

      expect(result.message).toBe('An old brass key');
    });
  });

  describe('processCommand() - Use Command', () => {
    it('should handle "use" command', async () => {
      const result = await service.processCommand(
        'use key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_result');
      expect(result.message).toContain('use');
      expect(result.message).toContain('key');
    });

    it('should handle complex use command', async () => {
      const result = await service.processCommand(
        'use brass key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('processCommand() - Open/Close Commands', () => {
    it('should handle "open" command', async () => {
      const result = await service.processCommand(
        'open door',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_result');
      expect(result.message).toContain('open');
    });

    it('should handle "close" command', async () => {
      const result = await service.processCommand(
        'close door',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_result');
      expect(result.message).toContain('close');
    });
  });

  describe('processCommand() - Talk Command', () => {
    beforeEach(() => {
      // Setup NPCs with dialogue trees
      const mockGuardNpc = {
        id: 'npc-guard',
        name: 'guard',
        position: { x: 5, y: 5, z: 0 },
        health: 100,
        dialogueTreeId: 'guard-dialogue-tree',
      };

      const mockMerchantNpc = {
        id: 'npc-merchant',
        name: 'merchant',
        position: { x: 5, y: 5, z: 0 },
        health: 100,
        dialogueTreeId: 'merchant-dialogue-tree',
      };

      // Add NPCs to room
      mockRoom.players = ['npc-guard', 'npc-merchant'];

      // Mock game state with NPCs
      gameStateService.getGameState.mockResolvedValue({
        gameId: 'game1',
        npcs: {
          'npc-guard': mockGuardNpc,
          'npc-merchant': mockMerchantNpc,
        },
        rooms: {},
        items: {},
      });

      // Mock dialogue manager responses
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'guard-dialogue-tree',
        npcId: 'npc-guard',
        name: 'Guard Dialogue',
        startNodeId: 'start',
        nodes: new Map(),
      });

      dialogueManager.startConversation.mockResolvedValue({
        success: true,
        currentNode: {
          id: 'start',
          type: 'text',
          text: "Hello, traveler. I don't have much to say right now.",
        },
        availableChoices: [
          {
            id: 'goodbye',
            text: 'Goodbye',
          },
        ],
        conversationEnded: false,
      });
    });

    it('should handle "talk" command', async () => {
      const result = await service.processCommand(
        'talk guard',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('dialogue');
      expect(result.message).toContain('speak');
      expect(result.dialogue).toBeDefined();
      expect(result.dialogue.npcName).toBe('guard');
    });

    it('should handle "speak" as alias', async () => {
      const result = await service.processCommand(
        'speak merchant',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('dialogue');
    });

    it('should include dialogue choices', async () => {
      const result = await service.processCommand(
        'talk guard',
        'player123',
        'game1',
      );

      expect(result.dialogue.choices).toBeDefined();
      expect(Array.isArray(result.dialogue.choices)).toBe(true);
    });
  });

  describe('processCommand() - Attack Command', () => {
    it('should handle "attack" command', async () => {
      const result = await service.processCommand(
        'attack orc',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('combat');
      expect(result.message).toContain('attack');
    });

    it('should handle "fight" as alias', async () => {
      const result = await service.processCommand(
        'fight dragon',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('combat');
    });
  });

  describe('processCommand() - Cast Command', () => {
    it('should handle "cast" command', async () => {
      const result = await service.processCommand(
        'cast fireball',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('magic');
      expect(result.message).toContain('cast');
    });
  });

  describe('processCommand() - Unknown Commands', () => {
    it('should handle unknown command', async () => {
      const result = await service.processCommand(
        'dance',
        'player123',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain("don't understand");
      expect(result.message).toContain('dance');
    });

    it('should suggest help for unknown commands', async () => {
      const result = await service.processCommand('xyz', 'player123', 'game1');

      expect(result.message).toContain('help');
    });
  });

  describe('processCommand() - Error Handling', () => {
    it('should handle errors during command processing', async () => {
      // Mock a successful player fetch but error in room service
      roomService.getObjectsInRoom.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Command processing failed');
    });

    it('should include error message in result', async () => {
      // Mock error in object service
      roomService.getObjectsInRoom.mockImplementation(() => {
        throw new Error('Room service error');
      });

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.message).toContain('Room service error');
    });
  });

  describe('Helper Methods - getCurrentRoom()', () => {
    it('should find current room based on player position', async () => {
      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.playerStatus.location).toBe('Entry Hall');
    });

    it('should handle player in north room', async () => {
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 5, y: 20, z: 0 },
      });

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.playerStatus.location).toBe('Garden');
    });

    it('should handle player in east room', async () => {
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 20, y: 5, z: 0 },
      });

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.playerStatus.location).toBe('Library');
    });
  });

  describe('Helper Methods - getAvailableExits()', () => {
    it('should detect north exit', async () => {
      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.exits).toContain('north');
    });

    it('should detect east exit', async () => {
      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.exits).toContain('east');
    });

    it('should provide default exits if none detected', async () => {
      roomService.getAllRooms.mockReturnValue([mockRoom]);

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.exits).toBeDefined();
      expect(result.exits.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete pickup and drop workflow', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      // Take the object
      const takeResult = await service.processCommand(
        'take key',
        'player123',
        'game1',
      );
      expect(takeResult.success).toBe(true);

      // Mock inventory update
      playerService.getInventory.mockReturnValue([mockObject]);

      // Drop the object
      const dropResult = await service.processCommand(
        'drop key',
        'player123',
        'game1',
      );
      expect(dropResult.success).toBe(true);
    });

    it('should handle movement and look workflow', async () => {
      // Look at current room
      const look1 = await service.processCommand('look', 'player123', 'game1');
      expect(look1.playerStatus.location).toBe('Entry Hall');

      // Move north
      const move = await service.processCommand(
        'go north',
        'player123',
        'game1',
      );
      expect(move.success).toBe(true);

      // Update player position mock
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 5, y: 20, z: 0 },
      });

      // Look at new room
      const look2 = await service.processCommand('look', 'player123', 'game1');
      expect(look2.playerStatus.location).toBe('Garden');
    });

    it('should handle examine then take workflow', async () => {
      roomService.getObjectsInRoom.mockReturnValue([mockObject]);

      // Examine object
      const examineResult = await service.processCommand(
        'examine key',
        'player123',
        'game1',
      );
      expect(examineResult.success).toBe(true);
      expect(examineResult.type).toBe('examination');

      // Take object
      const takeResult = await service.processCommand(
        'take key',
        'player123',
        'game1',
      );
      expect(takeResult.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty command', async () => {
      const result = await service.processCommand('', 'player123', 'game1');

      expect(result.success).toBe(false);
    });

    it('should handle whitespace-only command', async () => {
      const result = await service.processCommand('   ', 'player123', 'game1');

      expect(result.success).toBe(false);
    });

    it('should handle very long command', async () => {
      const longCommand = 'take ' + 'very '.repeat(100) + 'long item';
      roomService.getObjectsInRoom.mockReturnValue([
        { ...mockObject, name: 'very long item' },
      ]);

      const result = await service.processCommand(
        longCommand,
        'player123',
        'game1',
      );

      expect(result).toBeDefined();
    });

    it('should handle command with special characters', async () => {
      const result = await service.processCommand(
        'look!!!',
        'player123',
        'game1',
      );

      expect(result).toBeDefined();
    });

    it('should handle player at room boundary', async () => {
      playerService.getPlayer.mockReturnValue({
        ...mockPlayer,
        position: { x: 9, y: 9, z: 0 },
      });

      const result = await service.processCommand('look', 'player123', 'game1');

      expect(result.success).toBe(true);
    });

    it('should handle multiple objects with similar names', async () => {
      const redKey = { ...mockObject, id: 'key1', name: 'Red Key' };
      const blueKey = { ...mockObject, id: 'key2', name: 'Blue Key' };
      roomService.getObjectsInRoom.mockReturnValue([redKey, blueKey]);

      const result = await service.processCommand(
        'take key',
        'player123',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(playerService.addToInventory).toHaveBeenCalled();
    });
  });
});
