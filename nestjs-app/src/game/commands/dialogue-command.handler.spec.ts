import { Test, TestingModule } from '@nestjs/testing';
import { DialogueCommandHandler } from './dialogue-command.handler';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('DialogueCommandHandler', () => {
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

  describe('dialogue format conversion', () => {
    it('should convert NPC dialogue format to DialogueTreeData format', async () => {
      const npcWithOldFormat = {
        id: 'npc-merchant',
        name: 'Merchant Bob',
        dialogueTreeData: {
          id: 'merchant-dialogue',
          initial_greeting: {
            text: 'Welcome to my shop!',
            choices: [
              { text: 'Show me your wares', leads_to: 'show_items' },
              { text: 'Goodbye', leads_to: null },
            ],
          },
          show_items: {
            text: 'Here are my finest goods!',
            choices: [],
          },
        },
      };

      const merchantRoom = {
        ...mockRoom,
        players: ['npc-merchant'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-merchant': npcWithOldFormat,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Welcome to my shop!' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, merchantRoom, 'merchant');

      const registeredTree = (dialogueManager.registerDialogueTree as jest.Mock)
        .mock.calls[0][0];

      expect(registeredTree.id).toBe('merchant-dialogue');
      expect(registeredTree.npcId).toBe('npc-merchant');
      expect(registeredTree.nodes.length).toBeGreaterThanOrEqual(2);

      // Find the initial_greeting node
      const greetingNode = registeredTree.nodes.find(
        (n: any) => n.id === 'initial_greeting',
      );
      expect(greetingNode).toBeDefined();
      expect(greetingNode.text).toBe('Welcome to my shop!');
      expect(greetingNode.speaker).toBe('npc-merchant');
      expect(greetingNode.choices).toHaveLength(2);
      expect(greetingNode.choices[0].text).toBe('Show me your wares');
      expect(greetingNode.choices[0].nextNodeId).toBe('show_items');

      // Find the show_items node
      const showItemsNode = registeredTree.nodes.find(
        (n: any) => n.id === 'show_items',
      );
      expect(showItemsNode).toBeDefined();
      expect(showItemsNode.text).toBe('Here are my finest goods!');
    });

    it('should handle nodes with actions during conversion', async () => {
      const npcWithActions = {
        id: 'npc-quest',
        name: 'Quest Giver',
        dialogueTreeData: {
          id: 'quest-dialogue',
          quest_start: {
            text: 'Will you help me?',
            actions: [{ type: 'setFlag', flag: 'quest_started', value: true }],
            choices: [{ text: 'Yes', leads_to: 'quest_accepted' }],
          },
        },
      };

      const questRoom = {
        ...mockRoom,
        players: ['npc-quest'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-quest': npcWithActions,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Will you help me?' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, questRoom, 'quest');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'quest_start',
              actions: [{ type: 'setFlag', flag: 'quest_started', value: true }],
            }),
          ]),
        }),
      );
    });

    it('should handle choice conditions during conversion', async () => {
      const npcWithConditions = {
        id: 'npc-guard',
        name: 'Gate Guard',
        dialogueTreeData: {
          id: 'guard-dialogue',
          check_entry: {
            text: 'Halt!',
            choices: [
              {
                text: 'I have a pass',
                leads_to: 'enter',
                conditions: [{ type: 'hasItem', itemId: 'gate-pass' }],
              },
            ],
          },
        },
      };

      const guardRoom = {
        ...mockRoom,
        players: ['npc-guard'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-guard': npcWithConditions,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Halt!' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, guardRoom, 'guard');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              choices: expect.arrayContaining([
                expect.objectContaining({
                  conditions: [{ type: 'hasItem', itemId: 'gate-pass' }],
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it('should handle choice actions during conversion', async () => {
      const npcWithChoiceActions = {
        id: 'npc-trainer',
        name: 'Trainer',
        dialogueTreeData: {
          id: 'trainer-dialogue',
          offer_training: {
            text: 'Want to train?',
            choices: [
              {
                text: 'Yes',
                leads_to: 'training_complete',
                actions: [{ type: 'giveItem', itemId: 'training-certificate' }],
              },
            ],
          },
        },
      };

      const trainerRoom = {
        ...mockRoom,
        players: ['npc-trainer'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-trainer': npcWithChoiceActions,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Want to train?' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, trainerRoom, 'trainer');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              choices: expect.arrayContaining([
                expect.objectContaining({
                  actions: [
                    { type: 'giveItem', itemId: 'training-certificate' },
                  ],
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it('should handle endsConversation flag in choices', async () => {
      const npcWithEndFlag = {
        id: 'npc-farewell',
        name: 'Farewell NPC',
        dialogueTreeData: {
          id: 'farewell-dialogue',
          goodbye: {
            text: 'Goodbye!',
            choices: [
              {
                text: 'Farewell',
                leads_to: null,
                endsConversation: true,
              },
            ],
          },
        },
      };

      const farewellRoom = {
        ...mockRoom,
        players: ['npc-farewell'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-farewell': npcWithEndFlag,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Goodbye!' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, farewellRoom, 'farewell');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              choices: expect.arrayContaining([
                expect.objectContaining({
                  endsConversation: true,
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it('should handle nodes without choices', async () => {
      const npcNoChoices = {
        id: 'npc-monologue',
        name: 'Monologue NPC',
        dialogueTreeData: {
          id: 'monologue-dialogue',
          speech: {
            text: 'I have much to say...',
          },
        },
      };

      const monologueRoom = {
        ...mockRoom,
        players: ['npc-monologue'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-monologue': npcNoChoices,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'I have much to say...' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, monologueRoom, 'monologue');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'speech',
              text: 'I have much to say...',
            }),
          ]),
        }),
      );
    });

    it('should handle nodes with missing text', async () => {
      const npcMissingText = {
        id: 'npc-silent',
        name: 'Silent NPC',
        dialogueTreeData: {
          id: 'silent-dialogue',
          silent_node: {
            choices: [{ text: 'Continue', leads_to: 'next' }],
          },
        },
      };

      const silentRoom = {
        ...mockRoom,
        players: ['npc-silent'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-silent': npcMissingText,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: '' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, silentRoom, 'silent');

      expect(dialogueManager.registerDialogueTree).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'silent_node',
              text: '',
            }),
          ]),
        }),
      );
    });

    it('should use nextNodeId if provided instead of leads_to', async () => {
      const npcMixedFormat = {
        id: 'npc-mixed',
        name: 'Mixed Format NPC',
        dialogueTreeData: {
          id: 'mixed-dialogue',
          start: {
            text: 'Hello',
            choices: [
              { text: 'Option 1', nextNodeId: 'node1' },
              { text: 'Option 2', leads_to: 'node2' },
            ],
          },
        },
      };

      const mixedRoom = {
        ...mockRoom,
        players: ['npc-mixed'],
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-mixed': npcMixedFormat,
        },
      });

      dialogueManager.getDialogueTree.mockReturnValue(null);

      dialogueManager.startConversation.mockResolvedValue({
        currentNode: { text: 'Hello' },
        availableChoices: [],
      });

      await handler.handle(mockPlayer, mixedRoom, 'mixed');

      const registeredTree = (dialogueManager.registerDialogueTree as jest.Mock)
        .mock.calls[0][0];

      const startNode = registeredTree.nodes.find((n: any) => n.id === 'start');
      expect(startNode).toBeDefined();
      expect(startNode.choices[0].text).toBe('Option 1');
      expect(startNode.choices[0].nextNodeId).toBe('node1');
      expect(startNode.choices[1].text).toBe('Option 2');
      expect(startNode.choices[1].nextNodeId).toBe('node2');
    });
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
