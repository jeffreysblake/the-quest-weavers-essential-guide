import { Test, TestingModule } from '@nestjs/testing';
import { DialogueCommandHandler } from './dialogue-command.handler';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('DialogueCommandHandler - Execution & Results', () => {
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

  describe('event emission', () => {
    it('should emit CUSTOM_EVENT when player talks to NPC', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'player_talked_to_npc',
          playerId: mockPlayer.id,
          npcId: mockNpc.id,
          npcName: mockNpc.name,
          roomId: mockRoom.id,
        },
        mockPlayer.gameId,
      );
    });

    it('should emit event with correct NPC data', async () => {
      const uniqueNpc = {
        id: 'npc-unique',
        name: 'Unique Character',
        dialogueTreeId: 'unique-dialogue',
      };

      const uniqueRoom = {
        ...mockRoom,
        id: 'unique-room',
        players: ['npc-unique'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-unique': uniqueNpc,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'unique-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Greetings' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, uniqueRoom, 'unique');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          npcId: 'npc-unique',
          npcName: 'Unique Character',
          roomId: 'unique-room',
        }),
        mockPlayer.gameId,
      );
    });
  });

  describe('dialogue result formatting', () => {
    it('should format choices with numbers', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'What do you need?' },
        availableChoices: [
          { id: 'c1', text: 'Information' },
          { id: 'c2', text: 'Help' },
          { id: 'c3', text: 'Nothing' },
        ],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.dialogue?.choices).toEqual([
        '1. Information',
        '2. Help',
        '3. Nothing',
      ]);
    });

    it('should return dialogue type on success', async () => {
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
      expect(result.type).toBe('dialogue');
    });

    it('should include NPC name in dialogue result', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Greetings!' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.dialogue?.npcName).toBe('Manager Paradox');
      expect(result.message).toContain('Manager Paradox');
    });

    it('should include dialogue text in result', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Welcome to the Grand Paradox Hotel!' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.dialogue?.text).toBe('Welcome to the Grand Paradox Hotel!');
    });

    it('should handle empty dialogue text', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: {},
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.dialogue?.text).toBe('');
    });

    it('should handle empty choices array', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'The end.' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.dialogue?.choices).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle dialogue manager errors gracefully', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to talk with Manager Paradox');
      expect(result.message).toContain('Database connection failed');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle getCurrentDialogue errors', async () => {
      const activeConversation = {
        conversationId: 'conv-1',
        npcId: 'npc-manager',
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);

      dialogueManager.getCurrentDialogue.mockRejectedValue(
        new Error('Node not found'),
      );

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to talk with Manager Paradox');

      consoleErrorSpy.mockRestore();
    });

    it('should fail when event emission throws error', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      eventEmitter.emit.mockRejectedValue(new Error('Event system offline'));

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Event emission is inside try-catch, so it will fail the whole operation
      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Event system offline');

      consoleErrorSpy.mockRestore();
    });

    it('should log error messages to console', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockRejectedValue(
        new Error('Test error'),
      );

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling dialogue'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle NPC with empty name', async () => {
      const npcNoName = {
        id: 'npc-unnamed',
        name: '',
        dialogueTreeId: 'unnamed-dialogue',
      };

      const unnamedRoom = {
        ...mockRoom,
        players: ['npc-unnamed'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-unnamed': npcNoName,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'unnamed-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: '...' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, unnamedRoom, '');

      // Should fail on empty target, not on empty NPC name
      expect(result.success).toBe(false);
      expect(result.message).toBe('Talk to whom?');
    });

    it('should handle room without players array', async () => {
      const roomNoPlayers = {
        id: 'room-empty',
        name: 'Empty Room',
      };

      const result = await handler.handle(
        mockPlayer,
        roomNoPlayers as any,
        'manager',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("You don't see manager here.");
    });

    it('should handle null room.players', async () => {
      const roomNullPlayers = {
        ...mockRoom,
        players: null as any,
      };

      const result = await handler.handle(
        mockPlayer,
        roomNullPlayers,
        'manager',
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe("You don't see manager here.");
    });

    it('should handle very long NPC names', async () => {
      const longNameNpc = {
        id: 'npc-long',
        name: 'The Most Incredibly Long Named NPC in the Entire Universe',
        dialogueTreeId: 'long-dialogue',
      };

      const longRoom = {
        ...mockRoom,
        players: ['npc-long'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-long': longNameNpc,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'long-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, longRoom, 'incredibly');

      expect(result.success).toBe(true);
      expect(result.dialogue?.npcName).toBe(
        'The Most Incredibly Long Named NPC in the Entire Universe',
      );
    });

    it('should handle special characters in NPC names', async () => {
      const specialNpc = {
        id: 'npc-special',
        name: "Dr. O'Malley-Smith III",
        dialogueTreeId: 'special-dialogue',
      };

      const specialRoom = {
        ...mockRoom,
        players: ['npc-special'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-special': specialNpc,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'special-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Good day' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, specialRoom, "o'malley");

      expect(result.success).toBe(true);
    });

    it('should handle malformed dialogue tree data', async () => {
      const npcMalformed = {
        id: 'npc-malformed',
        name: 'Malformed NPC',
        dialogueTreeData: 'not an object' as any,
      };

      const malformedRoom = {
        ...mockRoom,
        players: ['npc-malformed'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-malformed': npcMalformed,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      const result = await handler.handle(
        mockPlayer,
        malformedRoom,
        'malformed',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('has nothing to say right now');
    });

    it('should handle NPC health exactly at 0', async () => {
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
      expect(result.message).toContain('dead and cannot speak');
    });

    it('should allow dialogue with NPC at positive health', async () => {
      const healthyNpc = {
        ...mockNpc,
        health: 1,
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': healthyNpc,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'I am barely alive!' },
        availableChoices: [],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
    });
  });
});
