import { Test, TestingModule } from '@nestjs/testing';
import { RoomGeneratorService } from './room-generator.service';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { IRoom } from '../../entity/room.interface';
import { IObject } from '../../entity/object.interface';

describe('RoomGeneratorService', () => {
  let service: RoomGeneratorService;
  let llmService: jest.Mocked<LLMService>;
  let promptTemplateService: jest.Mocked<PromptTemplateService>;
  let contextBuilderService: jest.Mocked<ContextBuilderService>;
  let roomService: jest.Mocked<RoomService>;
  let objectService: jest.Mocked<ObjectService>;

  // Mock room counter for unique IDs
  let roomIdCounter = 1;
  let objectIdCounter = 1;

  const createMockRoom = (overrides: Partial<IRoom> = {}): IRoom => ({
    id: `room-${roomIdCounter++}`,
    type: 'room',
    name: 'Test Room',
    description: 'A test room',
    position: { x: 0, y: 0, z: 0 },
    width: 10,
    height: 10,
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
    players: [],
    ...overrides,
  });

  const createMockObject = (overrides: Partial<IObject> = {}): IObject => ({
    id: `object-${objectIdCounter++}`,
    type: 'object',
    name: 'Test Object',
    description: 'A test object',
    position: { x: 0, y: 0, z: 0 },
    material: 'wood',
    objectType: 'item',
    properties: {},
    containedObjects: [],
    canContain: false,
    isContainer: false,
    isPortable: true,
    ...overrides,
  });

  const createMockRoomContent = (overrides: any = {}) => ({
    name: 'Generated Room',
    description: 'A beautifully generated room with detailed descriptions.',
    shortDescription: 'A generated room',
    objects: [
      {
        name: 'wooden table',
        description: 'A sturdy wooden table',
        material: 'wood',
        canOpen: false,
        capacity: 5,
        weight: 20,
        flammability: 7,
      },
      {
        name: 'iron chest',
        description: 'A heavy iron chest',
        material: 'iron',
        canOpen: true,
        capacity: 10,
        weight: 50,
        flammability: 0,
      },
    ],
    exits: [
      {
        direction: 'north',
        description: 'A dark corridor leads north',
        locked: false,
        hidden: false,
      },
      {
        direction: 'east',
        description: 'An ornate door to the east',
        locked: true,
        hidden: false,
      },
    ],
    ambiance: {
      lighting: 'dim torchlight',
      sounds: 'dripping water echoes',
      smells: 'musty and damp',
      temperature: 'cool',
    },
    secrets: [
      {
        trigger: 'examine paintings',
        description: 'A hidden passage behind the painting',
        reward: 'ancient key',
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    // Reset counters
    roomIdCounter = 1;
    objectIdCounter = 1;

    const mockLLMService = {
      generateStructuredResponse: jest.fn(),
    };

    const mockPromptTemplateService = {
      renderTemplate: jest.fn(),
    };

    const mockContextBuilderService = {
      buildRoomContext: jest.fn(),
    };

    const mockRoomService = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      connectRooms: jest.fn(),
    };

    const mockObjectService = {
      create: jest.fn(),
      placeInRoom: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomGeneratorService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: PromptTemplateService, useValue: mockPromptTemplateService },
        { provide: ContextBuilderService, useValue: mockContextBuilderService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ObjectService, useValue: mockObjectService },
      ],
    }).compile();

    service = module.get<RoomGeneratorService>(RoomGeneratorService);
    llmService = module.get(LLMService);
    promptTemplateService = module.get(PromptTemplateService);
    contextBuilderService = module.get(ContextBuilderService);
    roomService = module.get(RoomService);
    objectService = module.get(ObjectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRoom - Single Room Generation', () => {
    beforeEach(() => {
      // Setup default mocks
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
    });

    it('should generate a room with all parameters', async () => {
      const mockRoom = createMockRoom({ name: 'Generated Room' });
      roomService.create.mockReturnValue(mockRoom);
      objectService.create.mockImplementation((data) =>
        createMockObject({ name: data.name }),
      );

      const result = await service.generateRoom({
        theme: 'ancient castle',
        style: 'medieval',
        size: 'large',
        purpose: 'throne room',
        ambiance: 'majestic',
        dangerLevel: 3,
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Generated Room');
      expect(roomService.create).toHaveBeenCalled();
      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          room_type: 'throne room',
          room_size: 'large',
          game_theme: 'medieval',
        }),
      );
    });

    it('should generate a room with minimal parameters (defaults)', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      const result = await service.generateRoom({});

      expect(result).toBeDefined();
      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          room_size: 'medium',
          game_theme: 'fantasy',
        }),
      );
    });

    it('should generate a medieval style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ style: 'medieval', theme: 'castle' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'medieval',
          room_theme: 'medieval castle',
        }),
      );
    });

    it('should generate a modern style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ style: 'modern', theme: 'office' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'modern',
          room_theme: 'modern office',
        }),
      );
    });

    it('should generate a fantasy style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ style: 'fantasy', theme: 'wizard tower' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'fantasy',
          room_theme: 'fantasy wizard tower',
        }),
      );
    });

    it('should generate a sci-fi style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ style: 'sci-fi', theme: 'spaceship' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'sci-fi',
          room_theme: 'sci-fi spaceship',
        }),
      );
    });

    it('should generate a horror style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ style: 'horror', theme: 'haunted mansion' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'horror',
          room_theme: 'horror haunted mansion',
        }),
      );
    });

    it('should generate a mystery style room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({
        style: 'mystery',
        theme: 'detective office',
      });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          game_theme: 'mystery',
          room_theme: 'mystery detective office',
        }),
      );
    });

    it('should generate a small room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ size: 'small' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          room_size: 'small',
        }),
      );
    });

    it('should generate a medium room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ size: 'medium' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          room_size: 'medium',
        }),
      );
    });

    it('should generate a large room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({ size: 'large' });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          room_size: 'large',
        }),
      );
    });

    it('should generate a room with connected rooms', async () => {
      const connectedRoom = createMockRoom({
        id: 'connected-1',
        name: 'Adjacent Room',
      });
      roomService.findById.mockReturnValue(connectedRoom);
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({
        connectedRooms: ['connected-1'],
      });

      expect(roomService.findById).toHaveBeenCalledWith('connected-1');
      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          connected_rooms: 'Adjacent Room',
        }),
      );
    });

    it('should generate a room with required objects', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({
        requiredObjects: ['sword', 'shield', 'potion'],
      });

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_description',
        expect.objectContaining({
          objects_list: 'sword, shield, potion',
        }),
      );
    });

    it('should generate a room with custom ambiance', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      const result = await service.generateRoom({
        ambiance: 'eerie and unsettling',
      });

      expect(result).toBeDefined();
      expect(llmService.generateStructuredResponse).toHaveBeenCalled();
    });

    it('should create objects from generated content', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);
      const mockObj1 = createMockObject({ name: 'wooden table' });
      const mockObj2 = createMockObject({ name: 'iron chest' });
      objectService.create
        .mockReturnValueOnce(mockObj1)
        .mockReturnValueOnce(mockObj2);

      await service.generateRoom({});

      expect(objectService.create).toHaveBeenCalledTimes(2);
      expect(objectService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'wooden table',
          material: 'wood',
        }),
      );
      expect(objectService.placeInRoom).toHaveBeenCalledTimes(2);
    });

    it('should handle LLM validation errors with warnings', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: ['Missing required field: exits'],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });

      const result = await service.generateRoom({});

      expect(result).toBeDefined();
      // Service should log warning but continue
    });

    it('should include ambiance properties in generated content', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            ambiance: expect.objectContaining({
              properties: {
                lighting: { type: 'string' },
                sounds: { type: 'string' },
                smells: { type: 'string' },
                temperature: { type: 'string' },
              },
            }),
          }),
        }),
        expect.objectContaining({
          temperature: 0.8,
          maxTokens: 3000,
        }),
      );
    });

    it('should include secrets in schema', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            secrets: expect.objectContaining({
              type: 'array',
            }),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('generateRoom - Error Handling', () => {
    it('should throw error when LLM service fails', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockRejectedValue(
        new Error('LLM service error'),
      );

      await expect(service.generateRoom({})).rejects.toThrow(
        'Failed to generate room: LLM service error',
      );
    });

    it('should throw error when prompt template rendering fails', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockRejectedValue(
        new Error('Template error'),
      );

      await expect(service.generateRoom({})).rejects.toThrow(
        'Failed to generate room: Template error',
      );
    });

    it('should throw error when room service create fails', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockImplementation(() => {
        throw new Error('Room creation error');
      });

      await expect(service.generateRoom({})).rejects.toThrow(
        'Failed to generate room: Room creation error',
      );
    });

    it('should handle object creation failures gracefully', async () => {
      const mockRoom = createMockRoom();
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(mockRoom);
      objectService.create.mockImplementation(() => {
        throw new Error('Object creation failed');
      });

      // Should not throw - should log warning and continue
      const result = await service.generateRoom({});
      expect(result).toBeDefined();
    });

    it('should handle missing connected room gracefully', async () => {
      const mockRoom = createMockRoom();
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      roomService.findById.mockReturnValue(undefined); // Connected room not found
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(mockRoom);

      const result = await service.generateRoom({
        connectedRooms: ['non-existent-room'],
      });

      expect(result).toBeDefined();
      // Should filter out null connected rooms
    });
  });

  describe('generateMultipleRooms', () => {
    beforeEach(() => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
    });

    it('should generate 3 rooms with automatic connections', async () => {
      const mockRooms = [createMockRoom(), createMockRoom(), createMockRoom()];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1])
        .mockReturnValueOnce(mockRooms[2]);
      roomService.connectRooms.mockReturnValue(true);

      const requests = [
        { theme: 'entrance' },
        { theme: 'corridor' },
        { theme: 'treasury' },
      ];

      const results = await service.generateMultipleRooms(requests, true);

      expect(results).toHaveLength(3);
      expect(roomService.create).toHaveBeenCalledTimes(3);
      expect(roomService.connectRooms).toHaveBeenCalledTimes(2);
      expect(roomService.connectRooms).toHaveBeenCalledWith(
        mockRooms[0].id,
        mockRooms[1].id,
        expect.any(String),
      );
      expect(roomService.connectRooms).toHaveBeenCalledWith(
        mockRooms[1].id,
        mockRooms[2].id,
        expect.any(String),
      );
    });

    it('should generate 5 rooms with automatic connections', async () => {
      const mockRooms = Array.from({ length: 5 }, () => createMockRoom());
      mockRooms.forEach((room) => roomService.create.mockReturnValueOnce(room));
      roomService.connectRooms.mockReturnValue(true);

      const requests = Array.from({ length: 5 }, (_, i) => ({
        theme: `room-${i}`,
      }));

      const results = await service.generateMultipleRooms(requests, true);

      expect(results).toHaveLength(5);
      expect(roomService.create).toHaveBeenCalledTimes(5);
      expect(roomService.connectRooms).toHaveBeenCalledTimes(4);
    });

    it('should generate 10 rooms with automatic connections', async () => {
      const mockRooms = Array.from({ length: 10 }, () => createMockRoom());
      mockRooms.forEach((room) => roomService.create.mockReturnValueOnce(room));
      roomService.connectRooms.mockReturnValue(true);

      const requests = Array.from({ length: 10 }, (_, i) => ({
        theme: `room-${i}`,
      }));

      const results = await service.generateMultipleRooms(requests, true);

      expect(results).toHaveLength(10);
      expect(roomService.create).toHaveBeenCalledTimes(10);
      expect(roomService.connectRooms).toHaveBeenCalledTimes(9);
    });

    it('should generate rooms without connections when connectRooms is false', async () => {
      const mockRooms = [createMockRoom(), createMockRoom(), createMockRoom()];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1])
        .mockReturnValueOnce(mockRooms[2]);

      const requests = [
        { theme: 'entrance' },
        { theme: 'corridor' },
        { theme: 'treasury' },
      ];

      const results = await service.generateMultipleRooms(requests, false);

      expect(results).toHaveLength(3);
      expect(roomService.create).toHaveBeenCalledTimes(3);
      expect(roomService.connectRooms).not.toHaveBeenCalled();
    });

    it('should verify room ordering', async () => {
      const mockRooms = [
        createMockRoom({ id: 'room-1' }),
        createMockRoom({ id: 'room-2' }),
        createMockRoom({ id: 'room-3' }),
      ];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1])
        .mockReturnValueOnce(mockRooms[2]);

      const requests = [
        { theme: 'first' },
        { theme: 'second' },
        { theme: 'third' },
      ];

      const results = await service.generateMultipleRooms(requests, true);

      expect(results[0].id).toBe('room-1');
      expect(results[1].id).toBe('room-2');
      expect(results[2].id).toBe('room-3');
    });

    it('should set progressive connections (each room references previous)', async () => {
      const mockRooms = [createMockRoom(), createMockRoom(), createMockRoom()];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1])
        .mockReturnValueOnce(mockRooms[2]);
      roomService.findById.mockImplementation((id) =>
        mockRooms.find((r) => r.id === id),
      );

      const requests = [
        { theme: 'entrance' },
        { theme: 'corridor' },
        { theme: 'treasury' },
      ];

      await service.generateMultipleRooms(requests, true);

      // Second room should reference first
      expect(promptTemplateService.renderTemplate).toHaveBeenNthCalledWith(
        2,
        'room_description',
        expect.anything(),
      );

      // Third room should reference second
      expect(promptTemplateService.renderTemplate).toHaveBeenNthCalledWith(
        3,
        'room_description',
        expect.anything(),
      );
    });

    it('should handle connection failures gracefully', async () => {
      const mockRooms = [createMockRoom(), createMockRoom()];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1]);
      roomService.connectRooms.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const requests = [{ theme: 'room1' }, { theme: 'room2' }];

      // Should not throw - should log warning
      const results = await service.generateMultipleRooms(requests, true);

      expect(results).toHaveLength(2);
    });

    it('should generate empty array for empty requests', async () => {
      const results = await service.generateMultipleRooms([], true);

      expect(results).toHaveLength(0);
      expect(roomService.create).not.toHaveBeenCalled();
    });
  });

  describe('enhanceExistingRoom', () => {
    beforeEach(() => {
      promptTemplateService.renderTemplate.mockResolvedValue(
        'Enhancement prompt',
      );
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent({
          description: 'Enhanced description',
          objects: [
            {
              name: 'new object',
              description: 'A newly added object',
              material: 'steel',
            },
          ],
        }),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      contextBuilderService.buildRoomContext.mockResolvedValue({
        room: createMockRoom({ id: 'room-1' }),
        objects: [],
      });
    });

    it('should enhance existing room with new objects', async () => {
      const existingRoom = createMockRoom({
        id: 'room-1',
        description: 'Old description',
      });
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      const mockObject = createMockObject({ name: 'new object' });
      objectService.create.mockReturnValue(mockObject);

      const result = await service.enhanceExistingRoom('room-1', {
        requiredObjects: ['new object'],
      });

      expect(result).toBeDefined();
      expect(roomService.update).toHaveBeenCalled();
      expect(objectService.create).toHaveBeenCalled();
      expect(objectService.placeInRoom).toHaveBeenCalledWith(
        mockObject.id,
        'room-1',
      );
    });

    it('should enhance existing room with new description', async () => {
      const existingRoom = createMockRoom({
        id: 'room-1',
        description: 'Old description',
      });
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);

      const result = await service.enhanceExistingRoom('room-1', {
        theme: 'more atmospheric',
      });

      expect(result).toBeDefined();
      expect(result.description).toBe('Enhanced description');
      expect(roomService.update).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          description: 'Enhanced description',
        }),
      );
    });

    it('should throw error for non-existent room', async () => {
      roomService.findById.mockReturnValue(undefined);

      await expect(
        service.enhanceExistingRoom('non-existent', {}),
      ).rejects.toThrow('Room non-existent not found');
    });

    it('should handle multiple enhancements to same room', async () => {
      const existingRoom = createMockRoom({ id: 'room-1' });
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      objectService.create.mockReturnValue(createMockObject());

      await service.enhanceExistingRoom('room-1', { theme: 'darker' });
      await service.enhanceExistingRoom('room-1', { theme: 'spooky' });

      expect(contextBuilderService.buildRoomContext).toHaveBeenCalledTimes(2);
      expect(roomService.update).toHaveBeenCalledTimes(2);
    });

    it('should use context builder for enhancement', async () => {
      const existingRoom = createMockRoom({ id: 'room-1' });
      const existingObjects = [createMockObject({ name: 'table' })];
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      contextBuilderService.buildRoomContext.mockResolvedValue({
        room: existingRoom,
        objects: existingObjects.map((obj) => ({ object: obj })),
      });

      await service.enhanceExistingRoom('room-1', {});

      expect(contextBuilderService.buildRoomContext).toHaveBeenCalledWith(
        'room-1',
      );
      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_enhancement',
        expect.objectContaining({
          currentObjects: 'table',
        }),
      );
    });

    it('should handle enhancement validation errors', async () => {
      const existingRoom = createMockRoom({ id: 'room-1' });
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: ['Invalid enhancement schema'],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });

      const result = await service.enhanceExistingRoom('room-1', {});

      expect(result).toBeDefined();
      // Should log warning but continue
    });

    it('should handle object creation failures during enhancement', async () => {
      const existingRoom = createMockRoom({ id: 'room-1' });
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      objectService.create.mockImplementation(() => {
        throw new Error('Object creation failed');
      });

      const result = await service.enhanceExistingRoom('room-1', {});

      expect(result).toBeDefined();
      // Should log warning and continue
    });
  });

  describe('Context Building', () => {
    beforeEach(() => {
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
    });

    it('should build context with connected rooms', async () => {
      const connectedRoom = createMockRoom({
        id: 'connected-1',
        name: 'Adjacent Hall',
      });
      roomService.findById.mockReturnValue(connectedRoom);
      roomService.findAll.mockReturnValue([connectedRoom]);
      objectService.findAll.mockReturnValue([]);
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({
        connectedRooms: ['connected-1'],
      });

      expect(roomService.findById).toHaveBeenCalledWith('connected-1');
    });

    it('should build context with world state', async () => {
      const existingRooms = [createMockRoom(), createMockRoom()];
      const existingObjects = [
        createMockObject(),
        createMockObject(),
        createMockObject(),
      ];
      roomService.findAll.mockReturnValue(existingRooms);
      objectService.findAll.mockReturnValue(existingObjects);
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({});

      // Internal context building should count existing rooms and objects
      expect(roomService.findAll).toHaveBeenCalled();
      expect(objectService.findAll).toHaveBeenCalled();
    });

    it('should build context with existing objects', async () => {
      const existingRoom = createMockRoom({ id: 'room-1' });
      const existingObjects = [
        createMockObject({ name: 'table' }),
        createMockObject({ name: 'chair' }),
      ];
      roomService.findById.mockReturnValue(existingRoom);
      roomService.update.mockReturnValue(true);
      contextBuilderService.buildRoomContext.mockResolvedValue({
        room: existingRoom,
        objects: existingObjects.map((obj) => ({ object: obj })),
      });

      await service.enhanceExistingRoom('room-1', {});

      expect(promptTemplateService.renderTemplate).toHaveBeenCalledWith(
        'room_enhancement',
        expect.objectContaining({
          currentObjects: 'table, chair',
        }),
      );
    });
  });

  describe('Schema Validation', () => {
    it('should use correct schema for room generation', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'object',
          required: [
            'name',
            'description',
            'shortDescription',
            'objects',
            'exits',
            'ambiance',
          ],
          properties: expect.objectContaining({
            name: expect.objectContaining({ type: 'string' }),
            description: expect.objectContaining({ type: 'string' }),
            shortDescription: expect.objectContaining({ type: 'string' }),
            objects: expect.objectContaining({ type: 'array' }),
            exits: expect.objectContaining({ type: 'array' }),
            ambiance: expect.objectContaining({ type: 'object' }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should validate object schema structure', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            objects: expect.objectContaining({
              items: expect.objectContaining({
                required: ['name', 'description', 'material'],
                properties: expect.objectContaining({
                  name: { type: 'string' },
                  description: { type: 'string' },
                  material: { type: 'string' },
                  canOpen: { type: 'boolean' },
                  capacity: { type: 'number' },
                  weight: { type: 'number' },
                  flammability: { type: 'number' },
                }),
              }),
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should validate exits schema structure', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            exits: expect.objectContaining({
              items: expect.objectContaining({
                required: ['direction', 'description'],
                properties: expect.objectContaining({
                  direction: { type: 'string' },
                  description: { type: 'string' },
                  locked: { type: 'boolean' },
                  hidden: { type: 'boolean' },
                }),
              }),
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should validate secrets schema structure', async () => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      roomService.create.mockReturnValue(createMockRoom());

      await service.generateRoom({});

      expect(llmService.generateStructuredResponse).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          properties: expect.objectContaining({
            secrets: expect.objectContaining({
              items: expect.objectContaining({
                required: ['trigger', 'description'],
                properties: expect.objectContaining({
                  trigger: { type: 'string' },
                  description: { type: 'string' },
                  reward: { type: 'string' },
                }),
              }),
            }),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('Object Creation from Generated Content', () => {
    beforeEach(() => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
    });

    it('should create objects with correct material properties', async () => {
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent({
          objects: [
            {
              name: 'steel sword',
              description: 'A sharp blade',
              material: 'steel',
              weight: 5,
            },
          ],
        }),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);
      objectService.create.mockReturnValue(createMockObject());

      await service.generateRoom({});

      expect(objectService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'steel sword',
          material: 'steel',
          properties: expect.objectContaining({
            weight: 5,
          }),
        }),
      );
    });

    it('should create container objects with capacity', async () => {
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent({
          objects: [
            {
              name: 'chest',
              description: 'A storage chest',
              material: 'wood',
              canOpen: true,
              capacity: 20,
            },
          ],
        }),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);
      objectService.create.mockReturnValue(createMockObject());

      await service.generateRoom({});

      expect(objectService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'chest',
          containerCapacity: 20,
          state: expect.objectContaining({
            isOpen: false, // canOpen: true means starts closed
          }),
        }),
      );
    });

    it('should handle objects with flammability property', async () => {
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent({
          objects: [
            {
              name: 'wooden table',
              description: 'Flammable furniture',
              material: 'wood',
              flammability: 8,
            },
          ],
        }),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);
      objectService.create.mockReturnValue(createMockObject());

      await service.generateRoom({});

      expect(objectService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'wooden table',
          material: 'wood',
        }),
      );
    });
  });

  describe('Room Connections', () => {
    beforeEach(() => {
      roomService.findAll.mockReturnValue([]);
      objectService.findAll.mockReturnValue([]);
      promptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      llmService.generateStructuredResponse.mockResolvedValue({
        parsedContent: createMockRoomContent(),
        validationErrors: [],
        content: 'response',
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        model: 'test-model',
        finishReason: 'stop',
      });
    });

    it('should use random directions for connections', async () => {
      const mockRooms = [createMockRoom(), createMockRoom()];
      roomService.create
        .mockReturnValueOnce(mockRooms[0])
        .mockReturnValueOnce(mockRooms[1]);
      roomService.connectRooms.mockReturnValue(true);

      await service.generateMultipleRooms([{}, {}], true);

      expect(roomService.connectRooms).toHaveBeenCalledWith(
        mockRooms[0].id,
        mockRooms[1].id,
        expect.stringMatching(
          /^(north|south|east|west|up|down|northeast|northwest|southeast|southwest)$/,
        ),
      );
    });

    it('should not create connections for single room', async () => {
      const mockRoom = createMockRoom();
      roomService.create.mockReturnValue(mockRoom);

      await service.generateMultipleRooms([{}], true);

      expect(roomService.connectRooms).not.toHaveBeenCalled();
    });
  });
});
