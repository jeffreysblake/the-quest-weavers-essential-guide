import { Test, TestingModule } from '@nestjs/testing';
import { DialogueCommandHandler } from './dialogue-command.handler';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('DialogueCommandHandler - Context & Conversation Flow', () => {
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

  describe('conversation flow', () => {
    it('should start new conversation when no active conversation exists', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.getPlayerConversations.mockReturnValue([]);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Welcome!' },
        availableChoices: [
          { id: 'c1', text: 'Hello' },
          { id: 'c2', text: 'Goodbye' },
        ],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        mockPlayer.gameId,
        mockPlayer.id,
        mockNpc.id,
        'manager-dialogue',
        expect.any(Object),
      );
      expect(dialogueManager.getCurrentDialogue).not.toHaveBeenCalled();
    });

    it('should continue existing conversation with same NPC', async () => {
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

      dialogueManager.getCurrentDialogue.mockResolvedValue({
        currentNode: { text: 'We were talking...' },
        availableChoices: [{ id: 'c1', text: 'Continue' }],
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(result.success).toBe(true);
      expect(dialogueManager.getCurrentDialogue).toHaveBeenCalledWith(
        'conv-1',
        expect.any(Object),
      );
      expect(dialogueManager.startConversation).not.toHaveBeenCalled();
    });

    it('should start new conversation with different NPC', async () => {
      const otherNpc = {
        id: 'npc-guard',
        name: 'Guard',
        dialogueTreeId: 'guard-dialogue',
      };

      const roomWithBothNpcs = {
        ...mockRoom,
        players: ['npc-manager', 'npc-guard'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-manager': mockNpc,
          'npc-guard': otherNpc,
        },
      });

      // Active conversation with manager
      dialogueManager.getPlayerConversations.mockReturnValue([
        { conversationId: 'conv-manager', npcId: 'npc-manager' },
      ]);

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'guard-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Halt!' },
        availableChoices: [],
      });

      const result = await handler.handle(
        mockPlayer,
        roomWithBothNpcs,
        'guard',
      );

      expect(result.success).toBe(true);
      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        mockPlayer.gameId,
        mockPlayer.id,
        'npc-guard',
        'guard-dialogue',
        expect.any(Object),
      );
    });
  });

  describe('context building', () => {
    it('should build context with player flags', async () => {
      const playerWithFlags = {
        ...mockPlayer,
        flags: { metManager: true, hasQuest: false },
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerWithFlags, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          playerFlags: { metManager: true, hasQuest: false },
        }),
      );
    });

    it('should build context with player variables', async () => {
      const playerWithVars = {
        ...mockPlayer,
        variables: { reputation: 50, questProgress: 3 },
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerWithVars, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          playerVariables: { reputation: 50, questProgress: 3 },
        }),
      );
    });

    it('should build context with player inventory IDs', async () => {
      const inventory = [
        { id: 'item-1', name: 'Sword' },
        { id: 'item-2', name: 'Shield' },
        { id: 'item-3', name: 'Potion' },
      ];

      playerService.getInventory.mockReturnValue(inventory);

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          playerInventory: ['item-1', 'item-2', 'item-3'],
        }),
      );
    });

    it('should build context with quest states', async () => {
      const playerWithQuests = {
        ...mockPlayer,
        questStates: {
          mainQuest: 'in_progress',
          sideQuest1: 'completed',
          sideQuest2: 'not_started',
        },
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerWithQuests, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          questStates: {
            mainQuest: 'in_progress',
            sideQuest1: 'completed',
            sideQuest2: 'not_started',
          },
        }),
      );
    });

    it('should handle missing player flags gracefully', async () => {
      const playerNoFlags = {
        id: 'player-1',
        gameId: 'game-1',
        name: 'Rex Doorman',
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerNoFlags, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          playerFlags: {},
        }),
      );
    });

    it('should handle missing player variables gracefully', async () => {
      const playerNoVars = {
        id: 'player-1',
        gameId: 'game-1',
        name: 'Rex Doorman',
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerNoVars, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          playerVariables: {},
        }),
      );
    });

    it('should handle missing quest states gracefully', async () => {
      const playerNoQuests = {
        id: 'player-1',
        gameId: 'game-1',
        name: 'Rex Doorman',
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(playerNoQuests, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          questStates: {},
        }),
      );
    });

    it('should include all context fields', async () => {
      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(dialogueManager.startConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          gameId: mockPlayer.gameId,
          playerId: mockPlayer.id,
          npcId: mockNpc.id,
          conversationState: expect.any(Object),
          playerFlags: expect.any(Object),
          playerVariables: expect.any(Object),
          playerInventory: expect.any(Array),
          questStates: expect.any(Object),
        }),
      );
    });

    it('should pass conversation state when continuing dialogue', async () => {
      const activeConversation = {
        conversationId: 'conv-1',
        gameId: 'game-1',
        playerId: 'player-1',
        npcId: 'npc-manager',
        treeId: 'manager-dialogue',
        currentNodeId: 'node-2',
        history: ['node-1', 'node-2'],
        variables: { dialogueVar: 'value' },
        startedAt: '2024-01-01T00:00:00.000Z',
        lastUpdated: '2024-01-01T00:05:00.000Z',
      };

      dialogueManager.getDialogueTree.mockReturnValue({
        id: 'manager-dialogue',
        nodes: [],
      });

      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);

      dialogueManager.getCurrentDialogue.mockResolvedValue({
        currentNode: { text: 'Continuing...' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mockRoom, 'manager');

      expect(dialogueManager.getCurrentDialogue).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          conversationState: activeConversation,
        }),
      );
    });
  });
});
