/**
 * Comprehensive test suite for Dialogue Manager Service
 * Tests dialogue trees, conversation management, conditions, and actions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DialogueManagerService } from './dialogue-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  IDialogueTreeData,
  IDialogueNode,
  IDialogueChoice,
  IDialogueContext,
  IDialogueCondition,
  IDialogueAction,
  DialogueNodeType,
  IConversationState,
} from './dialogue.interfaces';
import { GameEventType } from '../events/event.interfaces';

describe('DialogueManagerService', () => {
  let service: DialogueManagerService;
  let eventEmitter: EventEmitterService;

  const mockEventEmitter = {
    emit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogueManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<DialogueManagerService>(DialogueManagerService);
    eventEmitter = module.get<EventEmitterService>(EventEmitterService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    test('should be defined', () => {
      expect(service).toBeDefined();
    });

    test('should have eventEmitter injected', () => {
      expect(eventEmitter).toBeDefined();
    });

    test('should initialize with empty dialogue trees', () => {
      const tree = service.getDialogueTree('nonexistent');
      expect(tree).toBeUndefined();
    });

    test('should initialize with empty conversations', () => {
      const conversations = service.getPlayerConversations('game1', 'player1');
      expect(conversations).toHaveLength(0);
    });
  });

  describe('Dialogue Tree Registration', () => {
    const createBasicTreeData = (): IDialogueTreeData => ({
      id: 'tree1',
      npcId: 'npc1',
      name: 'Test Dialogue',
      description: 'A test dialogue tree',
      startNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          type: DialogueNodeType.TEXT,
          speaker: 'npc1',
          text: 'Hello, traveler!',
          choices: [
            {
              id: 'choice1',
              text: 'Hello!',
              nextNodeId: 'node2',
            },
            {
              id: 'choice2',
              text: 'Goodbye',
              endsConversation: true,
            },
          ],
        },
        {
          id: 'node2',
          type: DialogueNodeType.TEXT,
          speaker: 'npc1',
          text: 'How can I help you?',
          choices: [],
        },
      ],
    });

    test('should register dialogue tree successfully', () => {
      const treeData = createBasicTreeData();
      service.registerDialogueTree(treeData);

      const tree = service.getDialogueTree('tree1');
      expect(tree).toBeDefined();
      expect(tree?.id).toBe('tree1');
      expect(tree?.npcId).toBe('npc1');
      expect(tree?.name).toBe('Test Dialogue');
    });

    test('should convert nodes array to Map', () => {
      const treeData = createBasicTreeData();
      service.registerDialogueTree(treeData);

      const tree = service.getDialogueTree('tree1');
      expect(tree?.nodes).toBeInstanceOf(Map);
      expect(tree?.nodes.size).toBe(2);
    });

    test('should store metadata', () => {
      const treeData = createBasicTreeData();
      treeData.metadata = { theme: 'greeting', difficulty: 'easy' };
      service.registerDialogueTree(treeData);

      const tree = service.getDialogueTree('tree1');
      expect(tree?.metadata).toEqual({ theme: 'greeting', difficulty: 'easy' });
    });

    test('should register multiple dialogue trees', () => {
      const tree1 = createBasicTreeData();
      const tree2 = { ...createBasicTreeData(), id: 'tree2', npcId: 'npc2', name: 'Second Tree' };

      service.registerDialogueTree(tree1);
      service.registerDialogueTree(tree2);

      expect(service.getDialogueTree('tree1')).toBeDefined();
      expect(service.getDialogueTree('tree2')).toBeDefined();
    });

    test('should allow overwriting existing tree', () => {
      const tree1 = createBasicTreeData();
      service.registerDialogueTree(tree1);

      const tree2 = { ...createBasicTreeData(), name: 'Updated Dialogue' };
      service.registerDialogueTree(tree2);

      const tree = service.getDialogueTree('tree1');
      expect(tree?.name).toBe('Updated Dialogue');
    });
  });

  describe('Starting Conversations', () => {
    const treeData: IDialogueTreeData = {
      id: 'tree1',
      npcId: 'npc1',
      name: 'Test Dialogue',
      startNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          type: DialogueNodeType.TEXT,
          speaker: 'npc1',
          text: 'Welcome!',
          choices: [
            { id: 'choice1', text: 'Thanks!', nextNodeId: 'node2' },
          ],
        },
        {
          id: 'node2',
          type: DialogueNodeType.TEXT,
          speaker: 'npc1',
          text: 'Goodbye!',
          choices: [],
        },
      ],
    };

    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    beforeEach(() => {
      service.registerDialogueTree(treeData);
    });

    test('should start conversation successfully', async () => {
      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.success).toBe(true);
      expect(result.currentNode.text).toBe('Welcome!');
      expect(result.availableChoices).toHaveLength(1);
      expect(result.conversationEnded).toBe(false);
    });

    test('should throw error for non-existent tree', async () => {
      const context = createContext();
      await expect(
        service.startConversation('game1', 'player1', 'npc1', 'nonexistent', context)
      ).rejects.toThrow("Dialogue tree 'nonexistent' not found");
    });

    test('should throw error for mismatched NPC', async () => {
      const context = createContext();
      await expect(
        service.startConversation('game1', 'player1', 'wrong_npc', 'tree1', context)
      ).rejects.toThrow("Dialogue tree 'tree1' does not belong to NPC 'wrong_npc'");
    });

    test('should create conversation state', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      const conversations = service.getPlayerConversations('game1', 'player1');
      expect(conversations).toHaveLength(1);
      expect(conversations[0].treeId).toBe('tree1');
      expect(conversations[0].currentNodeId).toBe('node1');
    });

    test('should emit conversation_started event', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'conversation_started',
          npcId: 'npc1',
          treeId: 'tree1',
        }),
        'game1'
      );
    });

    test('should initialize conversation history', async () => {
      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      const conversations = service.getPlayerConversations('game1', 'player1');
      expect(conversations[0].history).toBeDefined();
    });

    test('should allow multiple simultaneous conversations', async () => {
      const tree2: IDialogueTreeData = {
        id: 'tree2',
        npcId: 'npc2',
        name: 'Second Tree',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Hello from NPC 2',
            choices: [],
          },
        ],
      };
      service.registerDialogueTree(tree2);

      const context1 = createContext();
      const context2 = { ...createContext(), npcId: 'npc2' };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context1);
      await service.startConversation('game1', 'player1', 'npc2', 'tree2', context2);

      const conversations = service.getPlayerConversations('game1', 'player1');
      expect(conversations).toHaveLength(2);
    });
  });

  describe('Getting Current Dialogue', () => {
    const treeData: IDialogueTreeData = {
      id: 'tree1',
      npcId: 'npc1',
      name: 'Test',
      startNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          type: DialogueNodeType.TEXT,
          speaker: 'npc1',
          text: 'Test text',
          choices: [
            { id: 'choice1', text: 'Response 1', nextNodeId: 'node2' },
          ],
        },
        {
          id: 'node2',
          type: DialogueNodeType.END,
          text: 'Farewell',
        },
      ],
    };

    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    beforeEach(() => {
      service.registerDialogueTree(treeData);
    });

    test('should throw error for non-existent conversation', async () => {
      const context = createContext();
      await expect(
        service.getCurrentDialogue('nonexistent', context)
      ).rejects.toThrow("Conversation 'nonexistent' not found");
    });

    test('should return current node and available choices', async () => {
      const context = createContext();
      const startResult = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.getCurrentDialogue(conversationId, context);
      expect(result.success).toBe(true);
      expect(result.currentNode.text).toBe('Test text');
      expect(result.availableChoices).toHaveLength(1);
    });

    test('should add node to history', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');

      expect(conversations[0].history.length).toBeGreaterThan(0);
      expect(conversations[0].history[0].text).toBe('Test text');
    });

    test('should handle END node type', async () => {
      const endTreeData: IDialogueTreeData = {
        id: 'tree_end',
        npcId: 'npc1',
        name: 'End Test',
        startNodeId: 'end_node',
        nodes: [
          {
            id: 'end_node',
            type: DialogueNodeType.END,
            text: 'The End',
            choices: [],
          },
        ],
      };
      service.registerDialogueTree(endTreeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree_end', context);

      expect(result.conversationEnded).toBe(true);
      expect(result.availableChoices).toHaveLength(0);
    });

    test('should emit conversation_ended event for END node', async () => {
      const endTreeData: IDialogueTreeData = {
        id: 'tree_end',
        npcId: 'npc1',
        name: 'End Test',
        startNodeId: 'end_node',
        nodes: [
          {
            id: 'end_node',
            type: DialogueNodeType.END,
            text: 'The End',
          },
        ],
      };
      service.registerDialogueTree(endTreeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree_end', context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'conversation_ended',
        }),
        'game1'
      );
    });
  });

  describe('Making Choices', () => {
    const treeData: IDialogueTreeData = {
      id: 'tree1',
      npcId: 'npc1',
      name: 'Choice Test',
      startNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          type: DialogueNodeType.TEXT,
          text: 'Choose wisely',
          choices: [
            { id: 'choice1', text: 'Option 1', nextNodeId: 'node2' },
            { id: 'choice2', text: 'Option 2', nextNodeId: 'node3' },
            { id: 'choice3', text: 'Goodbye', endsConversation: true },
          ],
        },
        {
          id: 'node2',
          type: DialogueNodeType.TEXT,
          text: 'You chose option 1',
          choices: [],
        },
        {
          id: 'node3',
          type: DialogueNodeType.TEXT,
          text: 'You chose option 2',
          choices: [],
        },
      ],
    };

    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    beforeEach(() => {
      service.registerDialogueTree(treeData);
    });

    test('should make choice and transition to next node', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.makeChoice(conversationId, 'choice1', context);
      expect(result.success).toBe(true);
      expect(result.currentNode.text).toBe('You chose option 1');
    });

    test('should throw error for non-existent conversation', async () => {
      const context = createContext();
      await expect(
        service.makeChoice('nonexistent', 'choice1', context)
      ).rejects.toThrow("Conversation 'nonexistent' not found");
    });

    test('should throw error for invalid choice', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      await expect(
        service.makeChoice(conversationId, 'invalid_choice', context)
      ).rejects.toThrow("Choice 'invalid_choice' not found");
    });

    test('should add choice to history', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      await service.makeChoice(conversationId, 'choice1', context);

      const updatedConversations = service.getPlayerConversations('game1', 'player1');
      const history = updatedConversations[0].history;
      const choiceEntry = history.find(entry => entry.choiceId === 'choice1');
      expect(choiceEntry).toBeDefined();
      expect(choiceEntry?.choiceText).toBe('Option 1');
    });

    test('should emit dialogue_choice_made event', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      jest.clearAllMocks();
      await service.makeChoice(conversationId, 'choice1', context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'dialogue_choice_made',
          choiceId: 'choice1',
          choiceText: 'Option 1',
        }),
        'game1'
      );
    });

    test('should end conversation when endsConversation is true', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.makeChoice(conversationId, 'choice3', context);
      expect(result.conversationEnded).toBe(true);

      const remainingConversations = service.getPlayerConversations('game1', 'player1');
      expect(remainingConversations).toHaveLength(0);
    });

    test('should fail when no nextNodeId specified', async () => {
      const badTreeData: IDialogueTreeData = {
        id: 'tree_bad',
        npcId: 'npc1',
        name: 'Bad Tree',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              { id: 'choice1', text: 'Option' }, // No nextNodeId or endsConversation
            ],
          },
        ],
      };
      service.registerDialogueTree(badTreeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree_bad', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.makeChoice(conversationId, 'choice1', context);
      expect(result.success).toBe(false);
      expect(result.message).toBe('No next node specified for choice');
    });
  });

  describe('Condition Checking', () => {
    const createContext = (overrides?: Partial<IDialogueContext>): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
      ...overrides,
    });

    describe('Flag Conditions', () => {
      test('should check flag equals condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Flag Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option with flag',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'met_npc', operator: 'equals', value: true },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerFlags: { met_npc: true } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should filter choice when flag condition not met', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Flag Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option with flag',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'met_npc', operator: 'equals', value: true },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerFlags: { met_npc: false } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(0);
      });

      test('should check flag exists condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Flag Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'some_flag', operator: 'exists' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerFlags: { some_flag: true } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should check flag not_equals condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Flag Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'flag1', operator: 'not_equals', value: true },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerFlags: { flag1: false } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });
    });

    describe('Variable Conditions', () => {
      test('should check variable equals condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Variable Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'variable', key: 'gold', operator: 'equals', value: 100 },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerVariables: { gold: 100 } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should check variable greater condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Variable Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'variable', key: 'level', operator: 'greater', value: 5 },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerVariables: { level: 10 } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should check variable less condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Variable Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'variable', key: 'weight', operator: 'less', value: 50 },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerVariables: { weight: 30 } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should check variable exists condition', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Variable Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'variable', key: 'score', operator: 'exists' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerVariables: { score: 0 } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });
    });

    describe('Item Conditions', () => {
      test('should check item in inventory', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Item Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'item', key: 'magic_sword' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerInventory: ['magic_sword', 'health_potion'] });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should filter choice when item not in inventory', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Item Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'item', key: 'rare_gem' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ playerInventory: ['health_potion'] });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(0);
      });
    });

    describe('Quest Conditions', () => {
      test('should check quest state equals', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Quest Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'quest', key: 'main_quest', operator: 'equals', value: 'completed' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ questStates: { main_quest: 'completed' } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should check quest exists', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Quest Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'quest', key: 'side_quest', operator: 'exists' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({ questStates: { side_quest: 'in_progress' } });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });
    });

    describe('Custom Conditions', () => {
      test('should check custom condition', async () => {
        const customCheck = jest.fn().mockResolvedValue(true);
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Custom Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'custom', key: 'custom', customCheck },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(customCheck).toHaveBeenCalled();
        expect(result.availableChoices).toHaveLength(1);
      });

      test('should handle custom condition rejection', async () => {
        const customCheck = jest.fn().mockResolvedValue(false);
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Custom Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'custom', key: 'custom', customCheck },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(0);
      });
    });

    describe('Multiple Conditions', () => {
      test('should require all conditions to be met', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Multiple Conditions Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'flag1', operator: 'equals', value: true },
                    { type: 'variable', key: 'level', operator: 'greater', value: 5 },
                    { type: 'item', key: 'sword' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({
          playerFlags: { flag1: true },
          playerVariables: { level: 10 },
          playerInventory: ['sword'],
        });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(1);
      });

      test('should fail if any condition not met', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Multiple Conditions Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Option',
                  nextNodeId: 'node2',
                  conditions: [
                    { type: 'flag', key: 'flag1', operator: 'equals', value: true },
                    { type: 'variable', key: 'level', operator: 'greater', value: 5 },
                    { type: 'item', key: 'sword' },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Success',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext({
          playerFlags: { flag1: true },
          playerVariables: { level: 3 }, // Fails this condition
          playerInventory: ['sword'],
        });
        const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(result.availableChoices).toHaveLength(0);
      });
    });

    test('should reject choice when conditions not met', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Locked Option',
                nextNodeId: 'node2',
                conditions: [
                  { type: 'flag', key: 'has_key', operator: 'equals', value: true },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };
      service.registerDialogueTree(treeData);

      const context = createContext({ playerFlags: { has_key: false } });
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.makeChoice(conversationId, 'choice1', context);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Choice conditions not met');
    });
  });

  describe('Action Execution', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    describe('Set Flag Action', () => {
      test('should execute set_flag action on node entry', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              actions: [
                { type: 'set_flag', key: 'met_npc', value: true },
              ],
              choices: [],
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(context.playerFlags.met_npc).toBe(true);
      });

      test('should execute set_flag action on choice', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              choices: [
                {
                  id: 'choice1',
                  text: 'Accept Quest',
                  nextNodeId: 'node2',
                  actions: [
                    { type: 'set_flag', key: 'quest_accepted', value: true },
                  ],
                },
              ],
            },
            {
              id: 'node2',
              type: DialogueNodeType.TEXT,
              text: 'Good luck!',
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
        const conversations = service.getPlayerConversations('game1', 'player1');
        const conversationId = conversations[0].conversationId;

        await service.makeChoice(conversationId, 'choice1', context);

        expect(context.playerFlags.quest_accepted).toBe(true);
      });
    });

    describe('Set Variable Action', () => {
      test('should execute set_variable action', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              actions: [
                { type: 'set_variable', key: 'reputation', value: 10 },
              ],
              choices: [],
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(context.playerVariables.reputation).toBe(10);
      });
    });

    describe('Give Item Action', () => {
      test('should execute give_item action', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              actions: [
                { type: 'give_item', itemId: 'health_potion' },
              ],
              choices: [],
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(context.playerInventory).toContain('health_potion');
      });
    });

    describe('Update Quest Action', () => {
      test('should execute update_quest action', async () => {
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              actions: [
                { type: 'update_quest', questId: 'main_quest', value: 'completed' },
              ],
              choices: [],
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(context.questStates.main_quest).toBe('completed');
      });
    });

    describe('Custom Action', () => {
      test('should execute custom action', async () => {
        const customAction = jest.fn();
        const treeData: IDialogueTreeData = {
          id: 'tree1',
          npcId: 'npc1',
          name: 'Action Test',
          startNodeId: 'node1',
          nodes: [
            {
              id: 'node1',
              type: DialogueNodeType.TEXT,
              text: 'Test',
              actions: [
                { type: 'custom', customAction },
              ],
              choices: [],
            },
          ],
        };
        service.registerDialogueTree(treeData);

        const context = createContext();
        await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

        expect(customAction).toHaveBeenCalledWith(context);
      });
    });

    test('should return triggered actions in result', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Action Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'set_flag', key: 'flag1', value: true },
              { type: 'give_item', itemId: 'item1' },
            ],
            choices: [],
          },
        ],
      };
      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.actionsTriggered).toHaveLength(2);
      expect(result.actionsTriggered?.[0].type).toBe('set_flag');
      expect(result.actionsTriggered?.[1].type).toBe('give_item');
    });
  });

  describe('Conversation Management', () => {
    const treeData: IDialogueTreeData = {
      id: 'tree1',
      npcId: 'npc1',
      name: 'Test',
      startNodeId: 'node1',
      nodes: [
        {
          id: 'node1',
          type: DialogueNodeType.TEXT,
          text: 'Hello',
          choices: [],
        },
      ],
    };

    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    beforeEach(() => {
      service.registerDialogueTree(treeData);
    });

    test('should end conversation manually', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      await service.endConversation(conversationId);

      const remainingConversations = service.getPlayerConversations('game1', 'player1');
      expect(remainingConversations).toHaveLength(0);
    });

    test('should emit event when ending conversation', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      jest.clearAllMocks();
      await service.endConversation(conversationId);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'conversation_ended',
        }),
        'game1'
      );
    });

    test('should handle ending non-existent conversation', async () => {
      await service.endConversation('nonexistent');
      // Should not throw error
      expect(true).toBe(true);
    });

    test('should get conversation state', async () => {
      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const state = service.getConversationState(conversationId);
      expect(state).toBeDefined();
      expect(state?.playerId).toBe('player1');
      expect(state?.npcId).toBe('npc1');
    });

    test('should return undefined for non-existent conversation state', () => {
      const state = service.getConversationState('nonexistent');
      expect(state).toBeUndefined();
    });

    test('should get player conversations filtered by game and player', async () => {
      const context1 = createContext();
      const context2 = { ...createContext(), playerId: 'player2' };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context1);
      await service.startConversation('game1', 'player2', 'npc1', 'tree1', context2);

      const player1Conversations = service.getPlayerConversations('game1', 'player1');
      const player2Conversations = service.getPlayerConversations('game1', 'player2');

      expect(player1Conversations).toHaveLength(1);
      expect(player2Conversations).toHaveLength(1);
      expect(player1Conversations[0].playerId).toBe('player1');
      expect(player2Conversations[0].playerId).toBe('player2');
    });
  });

  describe('Dialogue Tree Management', () => {
    test('should get NPC dialogue trees', () => {
      const tree1: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Tree 1',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test' },
        ],
      };

      const tree2: IDialogueTreeData = {
        id: 'tree2',
        npcId: 'npc1',
        name: 'Tree 2',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test 2' },
        ],
      };

      const tree3: IDialogueTreeData = {
        id: 'tree3',
        npcId: 'npc2',
        name: 'Tree 3',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test 3' },
        ],
      };

      service.registerDialogueTree(tree1);
      service.registerDialogueTree(tree2);
      service.registerDialogueTree(tree3);

      const npc1Trees = service.getNpcDialogueTrees('npc1');
      expect(npc1Trees).toHaveLength(2);
      expect(npc1Trees.map(t => t.id)).toContain('tree1');
      expect(npc1Trees.map(t => t.id)).toContain('tree2');
    });

    test('should remove dialogue tree', () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test' },
        ],
      };

      service.registerDialogueTree(treeData);
      expect(service.getDialogueTree('tree1')).toBeDefined();

      service.removeDialogueTree('tree1');
      expect(service.getDialogueTree('tree1')).toBeUndefined();
    });

    test('should clear all dialogue trees', () => {
      const tree1: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Tree 1',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test' },
        ],
      };

      const tree2: IDialogueTreeData = {
        id: 'tree2',
        npcId: 'npc2',
        name: 'Tree 2',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test 2' },
        ],
      };

      service.registerDialogueTree(tree1);
      service.registerDialogueTree(tree2);

      service.clearAllDialogueTrees();

      expect(service.getDialogueTree('tree1')).toBeUndefined();
      expect(service.getDialogueTree('tree2')).toBeUndefined();
    });

    test('should clear all conversations', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test' },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      expect(service.getPlayerConversations('game1', 'player1')).toHaveLength(1);

      service.clearAllConversations();
      expect(service.getPlayerConversations('game1', 'player1')).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle dialogue tree with no choices', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'No Choices',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'No choices here',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      expect(result.availableChoices).toHaveLength(0);
    });

    test('should handle empty dialogue tree', () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Empty',
        startNodeId: 'node1',
        nodes: [],
      };

      service.registerDialogueTree(treeData);

      const tree = service.getDialogueTree('tree1');
      expect(tree?.nodes.size).toBe(0);
    });

    test('should handle node without text', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'No Text',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      expect(result.currentNode.text).toBeUndefined();
    });

    test('should handle unknown condition type', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Unknown Condition',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Option',
                nextNodeId: 'node2',
                conditions: [
                  { type: 'unknown' as any, key: 'test' },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      // Unknown condition should fail, filtering out the choice
      expect(result.availableChoices).toHaveLength(0);
    });

    test('should handle unknown action type', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Unknown Action',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'unknown' as any, key: 'test' },
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      // Should not throw, just log warning
      await expect(
        service.startConversation('game1', 'player1', 'npc1', 'tree1', context)
      ).resolves.toBeDefined();
    });

    test('should handle circular dialogue references', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Circular',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Node 1',
            choices: [
              { id: 'choice1', text: 'Go to Node 2', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Node 2',
            choices: [
              { id: 'choice2', text: 'Back to Node 1', nextNodeId: 'node1' },
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Navigate in circle
      await service.makeChoice(conversationId, 'choice1', context);
      const result = await service.makeChoice(conversationId, 'choice2', context);

      expect(result.currentNode.id).toBe('node1');
    });

    test('should handle action without required key', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'set_flag' } as any, // Missing key
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      // Should not throw, action just won't execute
      await expect(
        service.startConversation('game1', 'player1', 'npc1', 'tree1', context)
      ).resolves.toBeDefined();
    });

    test('should handle very long conversation history', async () => {
      const nodes: IDialogueNode[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `node${i}`,
          type: DialogueNodeType.TEXT,
          text: `Node ${i}`,
          choices: i < 99 ? [{ id: `choice${i}`, text: 'Next', nextNodeId: `node${i + 1}` }] : [],
        });
      }

      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Long Conversation',
        startNodeId: 'node0',
        nodes,
      };

      service.registerDialogueTree(treeData);

      const context = {
        gameId: 'game1',
        playerId: 'player1',
        npcId: 'npc1',
        conversationState: null as any,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        questStates: {},
      };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Navigate through several nodes
      for (let i = 0; i < 10; i++) {
        await service.makeChoice(conversationId, `choice${i}`, context);
      }

      const finalConversations = service.getPlayerConversations('game1', 'player1');
      expect(finalConversations[0].history.length).toBeGreaterThan(10);
    });
  });

  describe('Safety: Dialogue Dead-Ends', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should throw error when navigating to non-existent node', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Broken Navigation',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Choose your path',
            choices: [
              { id: 'choice1', text: 'Go somewhere', nextNodeId: 'nonexistent_node' },
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      await expect(
        service.makeChoice(conversationId, 'choice1', context)
      ).rejects.toThrow("Dialogue node 'nonexistent_node' not found");
    });

    test('should throw error when starting with non-existent start node', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Bad Start',
        startNodeId: 'nonexistent_start',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'You will never see this',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await expect(
        service.startConversation('game1', 'player1', 'npc1', 'tree1', context)
      ).rejects.toThrow("Dialogue node 'nonexistent_start' not found");
    });

    test('should handle self-referencing node without infinite loop', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Self Reference',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'I point to myself!',
            choices: [
              { id: 'choice1', text: 'Loop back', nextNodeId: 'node1' },
              { id: 'choice2', text: 'Exit', endsConversation: true },
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Loop multiple times
      await service.makeChoice(conversationId, 'choice1', context);
      await service.makeChoice(conversationId, 'choice1', context);
      const result = await service.makeChoice(conversationId, 'choice1', context);

      expect(result.currentNode.id).toBe('node1');
      expect(result.conversationEnded).toBe(false);
    });

    test('should detect when all conditional responses fail', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'All Locked',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'All options are locked',
            choices: [
              {
                id: 'choice1',
                text: 'Need flag',
                nextNodeId: 'node2',
                conditions: [{ type: 'flag', key: 'has_flag', operator: 'equals', value: true }],
              },
              {
                id: 'choice2',
                text: 'Need item',
                nextNodeId: 'node2',
                conditions: [{ type: 'item', key: 'magic_key' }],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
      expect(result.conversationEnded).toBe(false);
    });

    test('should handle choice with empty text', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Empty Choice',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              { id: 'choice1', text: '', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'You chose empty',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(1);
      expect(result.availableChoices[0].text).toBe('');
    });

    test('should handle node with undefined choices array', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Undefined Choices',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'No choices defined',
            // choices is undefined
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
    });

    test('should handle choice without nextNodeId and without endsConversation', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Dead End Choice',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Choose',
            choices: [
              { id: 'choice1', text: 'Nowhere to go' }, // No nextNodeId, no endsConversation
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      const result = await service.makeChoice(conversationId, 'choice1', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No next node specified for choice');
    });
  });

  describe('Safety: Dialogue State Corruption', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should handle tree deletion during active conversation', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Temporary Tree',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Starting node',
            choices: [
              { id: 'choice1', text: 'Continue', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Second node',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Delete the tree while conversation is active
      service.removeDialogueTree('tree1');

      // Try to make choice - should throw because tree is gone
      await expect(
        service.makeChoice(conversationId, 'choice1', context)
      ).rejects.toThrow("Dialogue tree 'tree1' not found");
    });

    test('should handle corrupted conversation state with invalid node', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Node 1',
            choices: [
              { id: 'choice1', text: 'Next', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Node 2',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Manually corrupt the state
      const state = service.getConversationState(conversationId);
      if (state) {
        state.currentNodeId = 'corrupted_node_id';
      }

      // Should throw error when trying to get current dialogue
      await expect(
        service.getCurrentDialogue(conversationId, context)
      ).rejects.toThrow("Dialogue node 'corrupted_node_id' not found");
    });

    test('should maintain conversation isolation between players', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Node 1',
            choices: [
              { id: 'choice1', text: 'Next', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Node 2',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context1 = createContext();
      const context2 = { ...createContext(), playerId: 'player2' };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context1);
      await service.startConversation('game1', 'player2', 'npc1', 'tree1', context2);

      const player1Convos = service.getPlayerConversations('game1', 'player1');
      const player2Convos = service.getPlayerConversations('game1', 'player2');

      expect(player1Convos).toHaveLength(1);
      expect(player2Convos).toHaveLength(1);
      expect(player1Convos[0].conversationId).not.toBe(player2Convos[0].conversationId);

      // Player 1 makes choice
      await service.makeChoice(player1Convos[0].conversationId, 'choice1', context1);

      // Verify player 2 is still on node1
      const player2State = service.getConversationState(player2Convos[0].conversationId);
      expect(player2State?.currentNodeId).toBe('node1');
    });

    test('should handle conversation history with corrupted entries', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      const conversations = service.getPlayerConversations('game1', 'player1');
      const state = conversations[0];

      // Manually corrupt history
      state.history.push({
        nodeId: 'fake_node',
        speaker: 'unknown',
        text: 'Corrupted',
        timestamp: 'invalid_timestamp',
      });

      expect(state.history).toHaveLength(2);
      expect(state.history[1].nodeId).toBe('fake_node');
    });

    test('should handle missing conversation state gracefully', async () => {
      await expect(
        service.getCurrentDialogue('nonexistent_conversation_id', createContext())
      ).rejects.toThrow("Conversation 'nonexistent_conversation_id' not found");
    });

    test('should clear all conversations without affecting trees', () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      service.clearAllConversations();

      expect(service.getDialogueTree('tree1')).toBeDefined();
      expect(service.getPlayerConversations('game1', 'player1')).toHaveLength(0);
    });

    test('should clear all trees without affecting conversations', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      service.clearAllDialogueTrees();

      expect(service.getDialogueTree('tree1')).toBeUndefined();
      expect(service.getPlayerConversations('game1', 'player1')).toHaveLength(1);
    });
  });

  describe('Safety: Response Validation', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should handle duplicate choice IDs', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Duplicate Choices',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              { id: 'choice1', text: 'First choice', nextNodeId: 'node2' },
              { id: 'choice1', text: 'Second choice (same ID)', nextNodeId: 'node3' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Node 2',
          },
          {
            id: 'node3',
            type: DialogueNodeType.TEXT,
            text: 'Node 3',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Will use the first matching choice
      const result = await service.makeChoice(conversationId, 'choice1', context);
      expect(result.currentNode.id).toBe('node2');
    });

    test('should handle null or undefined choice ID', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              { id: 'choice1', text: 'Valid choice', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Try to make choice with null ID - should throw or not find choice
      await expect(
        service.makeChoice(conversationId, null as any, context)
      ).rejects.toThrow("Choice 'null' not found");
    });

    test('should handle choice with condition that always fails', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Always Locked',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Impossible',
                nextNodeId: 'node2',
                conditions: [
                  { type: 'variable', key: 'impossible', operator: 'equals', value: 999 },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'You will never reach here',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      context.playerVariables.impossible = 0; // Will never equal 999

      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
    });

    test('should handle empty choices array', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Empty Choices',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'No options',
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
      expect(result.conversationEnded).toBe(false);
    });

    test('should verify choice conditions before execution', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Conditional Choice',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Needs flag',
                nextNodeId: 'node2',
                conditions: [{ type: 'flag', key: 'special', operator: 'equals', value: true }],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Try to make choice without meeting condition
      const result = await service.makeChoice(conversationId, 'choice1', context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Choice conditions not met');
    });
  });

  describe('Safety: Choice Availability Edge Cases', () => {
    const createContext = (overrides?: Partial<IDialogueContext>): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
      ...overrides,
    });

    test('should handle dynamic choice invalidation', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Dynamic Lock',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Needs item',
                nextNodeId: 'node2',
                conditions: [{ type: 'item', key: 'magic_key' }],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      // Start with item
      const context = createContext({ playerInventory: ['magic_key'] });
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Remove item before making choice
      context.playerInventory = [];

      // Choice should now fail
      const result = await service.makeChoice(conversationId, 'choice1', context);
      expect(result.success).toBe(false);
    });

    test('should handle level requirement not met', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Level Lock',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'High level option',
                nextNodeId: 'node2',
                conditions: [{ type: 'variable', key: 'level', operator: 'greater', value: 10 }],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext({ playerVariables: { level: 5 } });
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
    });

    test('should handle multiple required items with one missing', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Multiple Items',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Need all items',
                nextNodeId: 'node2',
                conditions: [
                  { type: 'item', key: 'sword' },
                  { type: 'item', key: 'shield' },
                  { type: 'item', key: 'potion' },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext({ playerInventory: ['sword', 'shield'] }); // Missing potion
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(result.availableChoices).toHaveLength(0);
    });

    test('should show choice when all complex conditions met', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Complex Conditions',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            choices: [
              {
                id: 'choice1',
                text: 'Complex',
                nextNodeId: 'node2',
                conditions: [
                  { type: 'flag', key: 'flag1', operator: 'equals', value: true },
                  { type: 'variable', key: 'gold', operator: 'greater', value: 100 },
                  { type: 'item', key: 'key' },
                  { type: 'quest', key: 'main_quest', operator: 'equals', value: 'active' },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Success',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext({
        playerFlags: { flag1: true },
        playerVariables: { gold: 150 },
        playerInventory: ['key'],
        questStates: { main_quest: 'active' },
      });

      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      expect(result.availableChoices).toHaveLength(1);
    });
  });

  describe('Safety: NPC Dialogue Edge Cases', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should handle NPC with no registered dialogue trees', () => {
      const trees = service.getNpcDialogueTrees('nonexistent_npc');
      expect(trees).toHaveLength(0);
    });

    test('should handle multiple simultaneous conversations with same NPC', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Hello',
            choices: [
              { id: 'choice1', text: 'Hi', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Goodbye',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();

      // Start two conversations with same NPC - add small delay to ensure unique timestamps
      const result1 = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      // Add a tiny delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const result2 = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      const conversations = service.getPlayerConversations('game1', 'player1');
      expect(conversations).toHaveLength(2);
      expect(conversations[0].conversationId).not.toBe(conversations[1].conversationId);
    });

    test('should isolate conversations between different games', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context1 = createContext();
      const context2 = { ...createContext(), gameId: 'game2' };

      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context1);
      await service.startConversation('game2', 'player1', 'npc1', 'tree1', context2);

      const game1Convos = service.getPlayerConversations('game1', 'player1');
      const game2Convos = service.getPlayerConversations('game2', 'player1');

      expect(game1Convos).toHaveLength(1);
      expect(game2Convos).toHaveLength(1);
    });

    test('should handle NPC with multiple dialogue trees', () => {
      const tree1: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Greeting',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Hello' },
        ],
      };

      const tree2: IDialogueTreeData = {
        id: 'tree2',
        npcId: 'npc1',
        name: 'Quest',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Need help?' },
        ],
      };

      service.registerDialogueTree(tree1);
      service.registerDialogueTree(tree2);

      const trees = service.getNpcDialogueTrees('npc1');
      expect(trees).toHaveLength(2);
    });

    test('should prevent starting conversation with wrong NPC', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Test',
        startNodeId: 'node1',
        nodes: [
          { id: 'node1', type: DialogueNodeType.TEXT, text: 'Test' },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = { ...createContext(), npcId: 'npc2' };

      await expect(
        service.startConversation('game1', 'player1', 'npc2', 'tree1', context)
      ).rejects.toThrow("Dialogue tree 'tree1' does not belong to NPC 'npc2'");
    });
  });

  describe('Safety: Action Execution Safety', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should handle give_item action without itemId', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Bad Item Action',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'give_item' } as any, // Missing itemId
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(context.playerInventory).toHaveLength(0);
    });

    test('should handle update_quest action without questId', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Bad Quest Action',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'update_quest', value: 'completed' } as any, // Missing questId
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(Object.keys(context.questStates)).toHaveLength(0);
    });

    test('should handle set_variable action with undefined value', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Undefined Value',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'set_variable', key: 'score' }, // No value specified
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(context.playerVariables.score).toBeUndefined();
    });

    test('should execute multiple actions in sequence', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Multiple Actions',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'set_flag', key: 'flag1', value: true },
              { type: 'set_variable', key: 'gold', value: 100 },
              { type: 'give_item', itemId: 'sword' },
              { type: 'update_quest', questId: 'quest1', value: 'active' },
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      const result = await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(context.playerFlags.flag1).toBe(true);
      expect(context.playerVariables.gold).toBe(100);
      expect(context.playerInventory).toContain('sword');
      expect(context.questStates.quest1).toBe('active');
      expect(result.actionsTriggered).toHaveLength(4);
    });

    test('should handle custom action that throws error', async () => {
      const failingAction = jest.fn().mockRejectedValue(new Error('Action failed'));

      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Failing Action',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'custom', customAction: failingAction },
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();

      await expect(
        service.startConversation('game1', 'player1', 'npc1', 'tree1', context)
      ).rejects.toThrow('Action failed');
    });

    test('should execute actions on both node and choice', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Double Actions',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'set_flag', key: 'node_flag', value: true },
            ],
            choices: [
              {
                id: 'choice1',
                text: 'Continue',
                nextNodeId: 'node2',
                actions: [
                  { type: 'set_flag', key: 'choice_flag', value: true },
                ],
              },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Done',
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      expect(context.playerFlags.node_flag).toBe(true);

      const conversations = service.getPlayerConversations('game1', 'player1');
      await service.makeChoice(conversations[0].conversationId, 'choice1', context);

      expect(context.playerFlags.choice_flag).toBe(true);
    });

    test('should handle duplicate item additions', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Duplicate Items',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Test',
            actions: [
              { type: 'give_item', itemId: 'potion' },
              { type: 'give_item', itemId: 'potion' },
              { type: 'give_item', itemId: 'potion' },
            ],
            choices: [],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);

      // Should add three potions (duplicates allowed)
      expect(context.playerInventory.filter(item => item === 'potion')).toHaveLength(3);
    });
  });

  describe('Safety: Infinite Loop Prevention', () => {
    const createContext = (): IDialogueContext => ({
      gameId: 'game1',
      playerId: 'player1',
      npcId: 'npc1',
      conversationState: null as any,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      questStates: {},
    });

    test('should handle deep circular loop without stack overflow', async () => {
      const nodes: IDialogueNode[] = [];
      const loopSize = 50;

      for (let i = 0; i < loopSize; i++) {
        const nextIndex = (i + 1) % loopSize;
        nodes.push({
          id: `node${i}`,
          type: DialogueNodeType.TEXT,
          text: `Node ${i}`,
          choices: [
            { id: `choice${i}`, text: 'Next', nextNodeId: `node${nextIndex}` },
          ],
        });
      }

      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Deep Loop',
        startNodeId: 'node0',
        nodes,
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Navigate through loop multiple times
      for (let i = 0; i < 100; i++) {
        const nodeIndex = i % loopSize;
        const result = await service.makeChoice(conversationId, `choice${nodeIndex}`, context);
        expect(result.success).toBe(true);
      }

      // Should still be in valid state
      const state = service.getConversationState(conversationId);
      expect(state).toBeDefined();
    });

    test('should track conversation history through loops', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Loop Tracker',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Start',
            choices: [
              { id: 'choice1', text: 'Loop', nextNodeId: 'node1' },
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Loop 5 times
      for (let i = 0; i < 5; i++) {
        await service.makeChoice(conversationId, 'choice1', context);
      }

      const state = service.getConversationState(conversationId);
      // Each loop adds 2 entries: node text + choice
      expect(state?.history.length).toBeGreaterThan(10);
    });

    test('should handle three-way circular reference', async () => {
      const treeData: IDialogueTreeData = {
        id: 'tree1',
        npcId: 'npc1',
        name: 'Triangle Loop',
        startNodeId: 'node1',
        nodes: [
          {
            id: 'node1',
            type: DialogueNodeType.TEXT,
            text: 'Node 1',
            choices: [
              { id: 'choice1', text: 'To Node 2', nextNodeId: 'node2' },
            ],
          },
          {
            id: 'node2',
            type: DialogueNodeType.TEXT,
            text: 'Node 2',
            choices: [
              { id: 'choice2', text: 'To Node 3', nextNodeId: 'node3' },
            ],
          },
          {
            id: 'node3',
            type: DialogueNodeType.TEXT,
            text: 'Node 3',
            choices: [
              { id: 'choice3', text: 'Back to Node 1', nextNodeId: 'node1' },
            ],
          },
        ],
      };

      service.registerDialogueTree(treeData);

      const context = createContext();
      await service.startConversation('game1', 'player1', 'npc1', 'tree1', context);
      const conversations = service.getPlayerConversations('game1', 'player1');
      const conversationId = conversations[0].conversationId;

      // Complete triangle multiple times
      await service.makeChoice(conversationId, 'choice1', context);
      await service.makeChoice(conversationId, 'choice2', context);
      await service.makeChoice(conversationId, 'choice3', context);

      const result = await service.getCurrentDialogue(conversationId, context);
      expect(result.currentNode.id).toBe('node1');
    });
  });
});
