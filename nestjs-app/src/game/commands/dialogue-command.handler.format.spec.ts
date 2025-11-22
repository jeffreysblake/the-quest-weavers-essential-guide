import { Test, TestingModule } from '@nestjs/testing';
import { DialogueCommandHandler } from './dialogue-command.handler';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

describe('DialogueCommandHandler - Format Conversion', () => {
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
            choices: [],
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
});
