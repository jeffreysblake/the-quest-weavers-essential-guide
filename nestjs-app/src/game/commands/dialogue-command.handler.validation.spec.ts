import { Test, TestingModule } from '@nestjs/testing';
import { DialogueCommandHandler } from './dialogue-command.handler';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('DialogueCommandHandler - Input Validation & NPC Targeting', () => {
  let handler: DialogueCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let validator: jest.Mocked<CommandValidatorService>;
  let roomNavHelper: jest.Mocked<RoomNavigationHelperService>;
  let gameStateService: jest.Mocked<GameStateService>;
  let dialogueManager: jest.Mocked<DialogueManagerService>;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Rex Doorman',
    flags: {},
    variables: {},
    questStates: {},
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Hotel Lobby',
    players: ['npc-manager'],
  };

  const mockNpc = {
    id: 'npc-manager',
    name: 'Manager Paradox',
    health: 100,
    dialogueTreeId: 'manager-dialogue',
  };

  beforeEach(async () => {
    const mockPlayerService = {
      getInventory: jest.fn().mockReturnValue([]),
    };

    const mockValidator = {
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
    };

    const mockRoomNavHelper = {};

    const mockGameStateService = {
      getGameState: jest.fn().mockResolvedValue({
        npcs: {
          'npc-manager': mockNpc,
        },
      }),
    };

    const mockDialogueManager = {
      getDialogueTree: jest.fn(),
      registerDialogueTree: jest.fn(),
      getPlayerConversations: jest.fn().mockReturnValue([]),
      startConversation: jest.fn(),
      getCurrentDialogue: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogueCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: CommandValidatorService, useValue: mockValidator },
        {
          provide: RoomNavigationHelperService,
          useValue: mockRoomNavHelper,
        },
        { provide: GameStateService, useValue: mockGameStateService },
        { provide: DialogueManagerService, useValue: mockDialogueManager },
        { provide: EventEmitterService, useValue: mockEventEmitter },
      ],
    }).compile();

    handler = module.get<DialogueCommandHandler>(DialogueCommandHandler);
    playerService = module.get(PlayerService);
    validator = module.get(CommandValidatorService);
    roomNavHelper = module.get(RoomNavigationHelperService);
    gameStateService = module.get(GameStateService);
    dialogueManager = module.get(DialogueManagerService);
    eventEmitter = module.get(EventEmitterService);
  });

  describe('input validation', () => {
    it('should return error when no target specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Talk to whom?');
    });

    it('should return error for invalid NPC name', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Name contains invalid characters',
      });

      const result = await handler.handle(mockPlayer, mockRoom, '!!!invalid');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Name contains invalid characters');
      expect(validator.validateItemName).toHaveBeenCalledWith('!!!invalid');
    });

    it('should return generic error when validator has no error message', async () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'test');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid NPC name');
    });

    it('should clean "to" preposition from target', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'to manager');

      expect(validator.validateItemName).toHaveBeenCalledWith('manager');
    });

    it('should clean "with" preposition from target', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'with manager');

      expect(validator.validateItemName).toHaveBeenCalledWith('manager');
    });

    it('should trim whitespace from target', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, '  manager  ');

      expect(validator.validateItemName).toHaveBeenCalledWith('manager');
    });
  });

  describe('NPC targeting and validation', () => {
    it('should return error when no NPCs in game state', async () => {
      gameStateService.getGameState.mockResolvedValue({
        npcs: null as any,
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('There is nobody to talk to here.');
    });

    it('should return error when NPCs object is undefined', async () => {
      gameStateService.getGameState.mockResolvedValue({} as any);

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('There is nobody to talk to here.');
    });

    it('should return error when NPC not in current room', async () => {
      const emptyRoom = {
        id: 'empty-room',
        name: 'Empty Room',
        players: [],
      };

      const result = await handler.handle(mockPlayer, emptyRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe("You don't see manager here.");
    });

    it('should only find NPCs in room.players array', async () => {
      const otherRoom = {
        id: 'other-room',
        name: 'Other Room',
        players: ['some-other-npc'],
      };

      const result = await handler.handle(mockPlayer, otherRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe("You don't see manager here.");
    });

    it('should find NPC by partial name match (case-insensitive)', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'para');

      expect(result.success).toBe(true);
      expect(result.dialogue?.npcName).toBe('Manager Paradox');
    });

    it('should find NPC case-insensitively', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'MANAGER');

      expect(result.success).toBe(true);
    });

    it('should return error when NPC is dead', async () => {
      const deadNpc = {
        ...mockNpc,
        health: 0,
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': deadNpc,
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe('Manager Paradox is dead and cannot speak.');
    });

    it('should return error when NPC has negative health', async () => {
      const deadNpc = {
        ...mockNpc,
        health: -10,
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': deadNpc,
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.message).toContain('dead and cannot speak');
    });

    it('should allow talking to NPC without health property', async () => {
      const npcNoHealth = {
        id: 'npc-manager',
        name: 'Manager Paradox',
        dialogueTreeId: 'manager-dialogue',
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': npcNoHealth,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
    });

    it('should return error when NPC has no dialogue tree', async () => {
      const npcNoDialogue = {
        id: 'npc-guard',
        name: 'Silent Guard',
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-guard': npcNoDialogue,
        },
      });

      const guardRoom = {
        ...mockRoom,
        players: ['npc-guard'],
      };

      const result = await handler.handle(mockPlayer, guardRoom, 'guard');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe(
        "Silent Guard doesn't seem interested in talking.",
      );
    });
  });

  describe('dialogue tree handling', () => {
    it('should return error when dialogue tree ID is missing', async () => {
      const npcEmptyData = {
        id: 'npc-manager',
        name: 'Manager Paradox',
        dialogueTreeData: {},
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': npcEmptyData,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe('Manager Paradox has nothing to say right now.');
    });

    it('should use existing dialogue tree if already registered', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Welcome!' },
        availableChoices: [{ id: 'c1', text: 'Hello' }],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
      expect(dialogueManager.registerDialogueTree).not.toHaveBeenCalled();
    });

    it('should register dialogue tree from dialogueTreeData if not found', async () => {
      const npcWithData = {
        id: 'npc-manager',
        name: 'Manager Paradox',
        dialogueTreeData: {
          id: 'manager-dialogue',
          initial_greeting: {
            text: 'Hello there!',
            choices: [
              { text: 'Hi', leads_to: 'response_hi' },
              { text: 'Bye', leads_to: null },
            ],
          },
        },
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': npcWithData,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValueOnce(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello there!' },
        availableChoices: [{ id: 'c1', text: 'Hi' }],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'manager-dialogue',
          npcId: 'npc-manager',
          name: 'Manager Paradox Dialogue',
          description: 'Dialogue tree for Manager Paradox',
          startNodeId: 'initial_greeting',
          nodes: expect.any(Array),
        }),
      );
    });

    it('should return error when dialogue tree conversion fails', async () => {
      const npcWithBadData = {
        id: 'npc-manager',
        name: 'Manager Paradox',
        dialogueTreeData: {
          id: 'manager-dialogue',
        },
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': npcWithBadData,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      // Mock console.error to suppress error output in tests
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      dialogueManager.registerDialogueTree.mockImplementation(() => {
        throw new Error('Invalid dialogue format');
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Failed to load dialogue for Manager Paradox.');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should return error when no dialogue tree data available', async () => {
      const npcNoData = {
        id: 'npc-manager',
        name: 'Manager Paradox',
        dialogueTreeId: 'missing-dialogue',
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': npcNoData,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Manager Paradox has no dialogue configured.');
    });
  });
});
