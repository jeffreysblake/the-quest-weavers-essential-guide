import { Test, TestingModule } from '@nestjs/testing';
import { DialogueChoiceCommandHandler } from './dialogue-choice-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';

describe('DialogueChoiceCommandHandler', () => {
  let handler: DialogueChoiceCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let roomNavHelper: jest.Mocked<RoomNavigationHelperService>;
  let gameStateService: jest.Mocked<GameStateService>;
  let dialogueManager: jest.Mocked<DialogueManagerService>;

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
  };

  beforeEach(async () => {
    const mockPlayerService = {
      getInventory: jest.fn().mockReturnValue([]),
    };

    const mockRoomNavHelper = {};

    const mockGameStateService = {
      getGameState: jest.fn(),
    };

    const mockDialogueManager = {
      getPlayerConversations: jest.fn(),
      getCurrentDialogue: jest.fn(),
      makeChoice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogueChoiceCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        {
          provide: RoomNavigationHelperService,
          useValue: mockRoomNavHelper,
        },
        { provide: GameStateService, useValue: mockGameStateService },
        { provide: DialogueManagerService, useValue: mockDialogueManager },
      ],
    }).compile();

    handler = module.get<DialogueChoiceCommandHandler>(
      DialogueChoiceCommandHandler,
    );
    playerService = module.get(PlayerService);
    roomNavHelper = module.get(RoomNavigationHelperService);
    gameStateService = module.get(GameStateService);
    dialogueManager = module.get(DialogueManagerService);
  });

  describe('input validation', () => {
    it('should return error when no target specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Reply with what?');
    });

    it('should return error for invalid choice number', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'abc');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Invalid choice number');
    });

    it('should return error for zero or negative numbers', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '0');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Invalid choice number');
    });

    it('should return error for negative numbers', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '-1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Invalid choice number');
    });
  });

  describe('conversation state validation', () => {
    it('should return error when no active conversation', async () => {
      dialogueManager.getPlayerConversations.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('not currently in a conversation');
    });

    it('should return error when conversation list is null', async () => {
      dialogueManager.getPlayerConversations.mockReturnValue(null as any);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain('not currently in a conversation');
    });
  });

  describe('choice validation', () => {
    const activeConversation = {
      conversationId: 'conv-1',
      npcId: 'npc-manager',
    };

    const currentDialogue = {
      text: 'What do you want?',
      availableChoices: [
        { id: 'choice-1', text: 'I need help' },
        { id: 'choice-2', text: 'Never mind' },
      ],
    };

    beforeEach(() => {
      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);
      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);
    });

    it('should return error when choice number exceeds available choices', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '3');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain("Choice 3 doesn't exist");
      expect(result.message).toContain('between 1 and 2');
    });

    it('should accept valid choice numbers', async () => {
      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'How can I help?' },
        availableChoices: [{ id: 'c1', text: 'Tell me more' }],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('dialogue');
    });
  });

  describe('dialogue continuation', () => {
    const activeConversation = {
      conversationId: 'conv-1',
      npcId: 'npc-manager',
    };

    const currentDialogue = {
      text: 'What do you want?',
      availableChoices: [
        { id: 'choice-1', text: 'I need help' },
        { id: 'choice-2', text: 'Never mind' },
      ],
    };

    beforeEach(() => {
      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);
      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);
    });

    it('should continue dialogue with next node', async () => {
      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Sure, what do you need?' },
        availableChoices: [
          { id: 'c1', text: 'Information about the hotel' },
          { id: 'c2', text: 'Directions' },
        ],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('dialogue');
      expect(result.message).toContain('You say: "I need help"');
      expect(result.dialogue?.text).toBe('Sure, what do you need?');
      expect(result.dialogue?.choices).toHaveLength(2);
      expect(result.dialogue?.choices?.[0]).toContain('1.');
      expect(result.dialogue?.choices?.[1]).toContain('2.');
    });

    it('should format choices with numbers', async () => {
      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Choose wisely' },
        availableChoices: [
          { id: 'c1', text: 'Option A' },
          { id: 'c2', text: 'Option B' },
          { id: 'c3', text: 'Option C' },
        ],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.dialogue?.choices).toEqual([
        '1. Option A',
        '2. Option B',
        '3. Option C',
      ]);
    });

    it('should call makeChoice with correct parameters', async () => {
      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Response' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      await handler.handle(mockPlayer, mockRoom, '2');

      expect(dialogueManager.makeChoice).toHaveBeenCalledWith(
        'conv-1',
        'choice-2',
        expect.objectContaining({
          gameId: mockPlayer.gameId,
          playerId: mockPlayer.id,
          npcId: 'npc-manager',
        }),
      );
    });
  });

  describe('conversation ending - combat hint feature', () => {
    const activeConversation = {
      conversationId: 'conv-1',
      npcId: 'thief-mr-null',
    };

    const currentDialogue = {
      text: 'Prepare to fight!',
      availableChoices: [{ id: 'choice-fight', text: "I'm ready!" }],
    };

    beforeEach(() => {
      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);
      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);
    });

    it('should add combat hint when hostile NPC dialogue ends', async () => {
      const gameState = {
        npcs: {
          'thief-mr-null': {
            id: 'thief-mr-null',
            name: 'Mr. Null',
            hostile: true,
          },
        },
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'This ends NOW!' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('dialogue');
      expect(result.message).toContain('This ends NOW!');
      expect(result.message).toContain('Combat is imminent');
      expect(result.message).toContain('attack mr. null');
      expect(result.dialogue?.choices).toHaveLength(0);
    });

    it('should NOT add combat hint for non-hostile NPCs', async () => {
      const gameState = {
        npcs: {
          'npc-manager': {
            id: 'npc-manager',
            name: 'Manager Paradox',
            hostile: false,
          },
        },
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const friendlyConversation = {
        conversationId: 'conv-2',
        npcId: 'npc-manager',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([
        friendlyConversation,
      ]);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'Good luck with your quest!' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Good luck with your quest!');
      expect(result.message).not.toContain('Combat');
      expect(result.message).not.toContain('attack');
    });

    it('should handle missing NPC gracefully', async () => {
      const gameState = {
        npcs: {},
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'Goodbye!' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Goodbye!');
      expect(result.dialogue?.npcName).toBe('NPC');
    });

    it('should handle null gameState.npcs', async () => {
      const gameState = {
        npcs: null as any,
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'Farewell' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Farewell');
    });

    it('should use NPC name in combat hint', async () => {
      const gameState = {
        npcs: {
          'boss-dragon': {
            id: 'boss-dragon',
            name: 'Ancient Dragon',
            hostile: true,
          },
        },
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const bossConversation = {
        conversationId: 'conv-boss',
        npcId: 'boss-dragon',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([bossConversation]);

      const bossDialogue = {
        text: 'Prepare yourself!',
        availableChoices: [{ id: 'c1', text: 'Bring it on!' }],
      };

      dialogueManager.getCurrentDialogue.mockResolvedValue(bossDialogue);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'ROAR!' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.message).toContain('attack ancient dragon');
    });

    it('should lowercase NPC name in attack command', async () => {
      const gameState = {
        npcs: {
          'npc-test': {
            id: 'npc-test',
            name: 'Mr. UPPERCASE',
            hostile: true,
          },
        },
      };

      gameStateService.getGameState.mockResolvedValue(gameState);

      const conv = {
        conversationId: 'conv-test',
        npcId: 'npc-test',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([conv]);

      const dialogue = {
        text: 'Fight!',
        availableChoices: [{ id: 'c1', text: 'OK' }],
      };

      dialogueManager.getCurrentDialogue.mockResolvedValue(dialogue);

      const dialogueResult = {
        conversationEnded: true,
        currentNode: { text: 'Battle time!' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.message).toContain('attack mr. uppercase');
      expect(result.message).not.toContain('UPPERCASE');
    });
  });

  describe('context building', () => {
    it('should build dialogue context with player data', async () => {
      const playerWithData = {
        ...mockPlayer,
        flags: { metManager: true },
        variables: { trustLevel: 5 },
        questStates: { mainQuest: 'in_progress' },
      };

      const inventory = [
        { id: 'item-1', name: 'Reality Fragment' },
        { id: 'item-2', name: 'Master Key Fragment' },
      ];

      playerService.getInventory.mockReturnValue(inventory);

      const activeConversation = {
        conversationId: 'conv-1',
        npcId: 'npc-manager',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);

      const currentDialogue = {
        text: 'Hello',
        availableChoices: [{ id: 'c1', text: 'Hi' }],
      };

      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);

      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Response' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      await handler.handle(playerWithData, mockRoom, '1');

      expect(dialogueManager.makeChoice).toHaveBeenCalledWith(
        'conv-1',
        'c1',
        expect.objectContaining({
          gameId: playerWithData.gameId,
          playerId: playerWithData.id,
          npcId: 'npc-manager',
          playerFlags: { metManager: true },
          playerVariables: { trustLevel: 5 },
          playerInventory: ['item-1', 'item-2'],
          questStates: { mainQuest: 'in_progress' },
        }),
      );
    });

    it('should handle players without flags/variables/questStates', async () => {
      const minimalPlayer = {
        id: 'player-2',
        gameId: 'game-1',
        name: 'Minimal Player',
      };

      playerService.getInventory.mockReturnValue([]);

      const activeConversation = {
        conversationId: 'conv-1',
        npcId: 'npc-1',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);

      const currentDialogue = {
        text: 'Hello',
        availableChoices: [{ id: 'c1', text: 'Hi' }],
      };

      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);

      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Response' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      await handler.handle(minimalPlayer, mockRoom, '1');

      expect(dialogueManager.makeChoice).toHaveBeenCalledWith(
        'conv-1',
        'c1',
        expect.objectContaining({
          playerFlags: {},
          playerVariables: {},
          questStates: {},
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors from dialogue manager gracefully', async () => {
      const activeConversation = {
        conversationId: 'conv-1',
        npcId: 'npc-1',
      };

      dialogueManager.getPlayerConversations.mockReturnValue([
        activeConversation,
      ]);

      dialogueManager.getCurrentDialogue.mockRejectedValue(
        new Error('Dialogue not found'),
      );

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to make choice');
    });

    it('should handle most recent conversation when multiple active', async () => {
      const conversations = [
        { conversationId: 'conv-1', npcId: 'npc-1' },
        { conversationId: 'conv-2', npcId: 'npc-2' },
        { conversationId: 'conv-3', npcId: 'npc-3' },
      ];

      dialogueManager.getPlayerConversations.mockReturnValue(conversations);

      const currentDialogue = {
        text: 'Recent conversation',
        availableChoices: [{ id: 'c1', text: 'Continue' }],
      };

      dialogueManager.getCurrentDialogue.mockResolvedValue(currentDialogue);

      const dialogueResult = {
        conversationEnded: false,
        currentNode: { text: 'Response' },
        availableChoices: [],
      };

      dialogueManager.makeChoice.mockResolvedValue(dialogueResult);

      await handler.handle(mockPlayer, mockRoom, '1');

      // Should use the last (most recent) conversation
      expect(dialogueManager.getCurrentDialogue).toHaveBeenCalledWith(
        'conv-3',
        expect.any(Object),
      );
    });
  });
});
