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
});
