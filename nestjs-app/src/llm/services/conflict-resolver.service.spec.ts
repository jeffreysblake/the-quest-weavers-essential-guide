import { Test, TestingModule } from '@nestjs/testing';
import { ConflictResolverService } from './conflict-resolver.service';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { PhysicsService } from '../../physics/physics.service';
import { RoomService } from '../../entity/room.service';
import { PlayerService } from '../../entity/player.service';
import { ObjectService } from '../../entity/object.service';
import { ConflictType, ConflictResolution } from '../interfaces/llm.interface';

// Mock services
const mockLLMService = {
  generateStructuredResponse: jest.fn(),
};

const mockPromptTemplateService = {
  renderTemplate: jest.fn(),
};

const mockContextBuilderService = {
  buildRoomContext: jest.fn(),
  buildNPCContext: jest.fn(),
  buildObjectContext: jest.fn(),
};

const mockPhysicsService = {};

const mockRoomService = {
  findAll: jest.fn().mockReturnValue([]),
  findById: jest.fn(),
};

const mockPlayerService = {
  findAll: jest.fn().mockReturnValue([]),
  findById: jest.fn(),
  update: jest.fn(),
};

const mockObjectService = {
  findAll: jest.fn().mockReturnValue([]),
  findById: jest.fn(),
  update: jest.fn(),
};

describe('ConflictResolverService', () => {
  let service: ConflictResolverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictResolverService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: PromptTemplateService, useValue: mockPromptTemplateService },
        { provide: ContextBuilderService, useValue: mockContextBuilderService },
        { provide: PhysicsService, useValue: mockPhysicsService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: ObjectService, useValue: mockObjectService },
      ],
    }).compile();

    service = module.get<ConflictResolverService>(ConflictResolverService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Basic Conflict Resolution', () => {
    it('should resolve physics conflicts', async () => {
      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Reset object positions',
            explanation: 'Objects were moved to safe positions',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Items shift slightly to stable positions.',
          consistency_notes: 'Maintains world physics',
        },
        validationErrors: undefined,
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['object1', 'object2'],
        location: 'test_room',
        description: 'Objects overlapping impossibly',
        originalAction: 'move_object',
      });

      expect(resolution.success).toBe(true);
      expect(resolution.conflictType).toBe('physics');
      expect(resolution.resolution).toBe('Reset object positions');
      expect(resolution.explanation).toBe(
        'Objects were moved to safe positions',
      );
      expect(resolution.narrativeDescription).toBe(
        'Items shift slightly to stable positions.',
      );
    });

    it('should handle NPC behavior conflicts', async () => {
      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Correct NPC behavior',
            explanation: 'NPC action was adjusted to be consistent',
            side_effects: ['NPC mood slightly affected'],
            reversible: false,
          },
          narrative_description:
            'The character pauses and reconsiders their approach.',
          consistency_notes: 'Behavior now matches personality',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'NPC conflict prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      const resolution = await service.handleNPCConflict({
        npcId: 'npc1',
        conflictDescription: 'NPC attempting impossible action',
        attemptedAction: 'fly_without_wings',
        location: 'test_room',
      });

      expect(resolution.success).toBe(true);
      expect(resolution.conflictType).toBe('npc_behavior');
      expect(resolution.sideEffects).toContain('NPC mood slightly affected');
    });

    it('should handle object state conflicts', async () => {
      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Resolve state contradiction',
            explanation: 'Object state was corrected',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'The object settles into a stable state.',
          consistency_notes: 'State is now consistent',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'Object conflict prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      const resolution = await service.handleObjectConflict({
        objectId: 'obj1',
        conflictDescription: 'Object in contradictory state',
        currentState: { open: true, locked: true },
        desiredState: { open: true, locked: false },
      });

      expect(resolution.success).toBe(true);
      expect(resolution.conflictType).toBe('object_state');
    });
  });

  describe('Hook System', () => {
    it('should register and use custom hooks', async () => {
      let hookCalled = false;

      const customHook = {
        name: 'test_hook',
        triggerConditions: ['test_condition'],
        priority: 10,
        handler: async (context: any): Promise<ConflictResolution | null> => {
          hookCalled = true;
          return {
            conflictType: context.type,
            success: true,
            resolution: 'Hook resolved the conflict',
            explanation: 'Custom hook handled this',
            appliedChanges: ['hook_action'],
            sideEffects: [],
            alternativeSolutions: [],
            narrativeDescription: 'Hook narrative',
            confidence: 1.0,
            processingTime: 0,
            requiresPlayerConfirmation: false,
            metadata: {
              resolverType: 'hook',
              hookName: 'test_hook',
              timestamp: new Date().toISOString(),
            },
          };
        },
      };

      service.registerHook(customHook);

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        description: 'test_condition occurred',
        originalAction: 'test_action',
      });

      expect(hookCalled).toBe(true);
      expect(resolution.resolution).toBe('Hook resolved the conflict');
      expect(resolution.metadata?.hookName).toBe('test_hook');
    });

    it('should fall back to LLM when hooks return null', async () => {
      const nullHook = {
        name: 'null_hook',
        triggerConditions: ['null_condition'],
        priority: 10,
        handler: async (): Promise<ConflictResolution | null> => null,
      };

      service.registerHook(nullHook);

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'LLM fallback solution',
            explanation: 'Hook failed, LLM resolved',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'LLM provides solution.',
          consistency_notes: 'Fallback worked',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'Fallback prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        description: 'null_condition occurred',
        originalAction: 'test_action',
      });

      expect(resolution.resolution).toBe('LLM fallback solution');
      expect(resolution.metadata?.resolverType).toBe('llm');
    });
  });

  describe('Failsafe Mechanisms', () => {
    it('should provide failsafe resolution when all methods fail', async () => {
      mockPromptTemplateService.renderTemplate.mockRejectedValue(
        new Error('Template error'),
      );

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        description: 'Catastrophic failure',
        originalAction: 'impossible_action',
      });

      expect(resolution.success).toBe(false);
      expect(resolution.resolution).toBe('Reset to safe state');
      expect(resolution.metadata?.resolverType).toBe('failsafe');
    });

    it('should handle LLM service failures gracefully', async () => {
      mockPromptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      mockLLMService.generateStructuredResponse.mockRejectedValue(
        new Error('LLM unavailable'),
      );

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        description: 'LLM failure test',
        originalAction: 'test_action',
      });

      expect(resolution.success).toBe(false);
      expect(resolution.metadata?.resolverType).toBe('failsafe');
    });
  });

  describe('Resolution Application', () => {
    it('should apply physics resolutions to objects', async () => {
      const testObject = {
        id: 'obj1',
        name: 'Test Object',
        position: { x: 0, y: 0, z: 0 },
      };

      mockObjectService.findById.mockReturnValue(testObject);

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Reset positions',
            explanation: 'Objects repositioned',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Objects move to safe positions.',
          consistency_notes: 'Physics maintained',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'Physics prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      await service.handlePhysicsConflict({
        objects: ['obj1'],
        physicsError: 'Overlap detected',
        location: 'test_room',
      });

      expect(mockObjectService.update).toHaveBeenCalledWith('obj1', testObject);
    });

    it('should apply NPC resolutions to players', async () => {
      const testNPC = {
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 0, y: 0, z: 0 },
      };

      mockPlayerService.findById.mockReturnValue(testNPC);

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Correct behavior',
            explanation: 'NPC behavior fixed',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'The NPC acts more naturally.',
          consistency_notes: 'Behavior consistent',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue('NPC prompt');
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      await service.handleNPCConflict({
        npcId: 'npc1',
        conflictDescription: 'Impossible behavior',
        attemptedAction: 'teleport',
        location: 'test_room',
      });

      expect(mockPlayerService.update).toHaveBeenCalledWith('npc1', testNPC);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track resolution statistics', async () => {
      const initialStats = service.getResolutionStats();

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Test resolution',
            explanation: 'Test explanation',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Test narrative.',
          consistency_notes: 'Test consistency',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        description: 'Test conflict',
        originalAction: 'test_action',
      });

      const finalStats = service.getResolutionStats();
      expect(finalStats.totalConflicts).toBeGreaterThan(
        initialStats.totalConflicts,
      );
    });

    it('should categorize resolutions by type', async () => {
      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Test resolution',
            explanation: 'Test explanation',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Test narrative.',
          consistency_notes: 'Test consistency',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue('Test prompt');
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      await service.resolveConflict('npc_behavior', {
        affectedEntities: ['npc1'],
        description: 'NPC test conflict',
        originalAction: 'test_action',
      });

      const stats = service.getResolutionStats();
      expect(stats.resolutionsByType['npc_behavior']).toBeGreaterThan(0);
    });
  });

  describe('Context Building', () => {
    it('should build appropriate context for conflicts', async () => {
      const mockRoomContext = {
        room: { id: 'room1', name: 'Test Room' },
        objects: [],
        players: [],
      };

      mockContextBuilderService.buildRoomContext.mockResolvedValue(
        mockRoomContext,
      );

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Context-aware resolution',
            explanation: 'Used room context',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Resolution with context.',
          consistency_notes: 'Context maintained',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'Context prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      await service.resolveConflict('world_consistency', {
        affectedEntities: ['room1'],
        location: 'room1',
        description: 'World consistency issue',
        originalAction: 'validate_world',
      });

      expect(mockContextBuilderService.buildRoomContext).toHaveBeenCalledWith(
        'room1',
      );
    });

    it('should handle context building failures gracefully', async () => {
      mockContextBuilderService.buildRoomContext.mockRejectedValue(
        new Error('Context error'),
      );

      const mockLLMResponse = {
        parsedContent: {
          primary_solution: {
            action: 'Resolution without context',
            explanation: 'Proceeded without full context',
            side_effects: [],
            reversible: true,
          },
          narrative_description: 'Resolution without context.',
          consistency_notes: 'Limited context',
        },
      };

      mockPromptTemplateService.renderTemplate.mockResolvedValue(
        'Limited context prompt',
      );
      mockLLMService.generateStructuredResponse.mockResolvedValue(
        mockLLMResponse,
      );

      const resolution = await service.resolveConflict('physics', {
        affectedEntities: ['obj1'],
        location: 'unknown_room',
        description: 'Physics conflict',
        originalAction: 'test_action',
      });

      expect(resolution.success).toBe(true);
      // Should still work despite context building failure
    });
  });
});
