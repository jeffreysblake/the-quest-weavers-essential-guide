import { Test, TestingModule } from '@nestjs/testing';
import {
  PromptTemplateService,
  PromptTemplate,
} from './prompt-template.service';
import { GameContext } from '../interfaces/llm.interface';

describe('PromptTemplateService', () => {
  let service: PromptTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptTemplateService],
    }).compile();

    service = module.get<PromptTemplateService>(PromptTemplateService);
  });

  describe('Template Management', () => {
    it('should load default templates', () => {
      const stats = service.getStats();
      expect(stats.totalTemplates).toBeGreaterThan(0);
      expect(stats.templateIds).toContain('room_description');
      expect(stats.templateIds).toContain('npc_generation');
      expect(stats.templateIds).toContain('physics_conflict_resolution');
    });

    it('should register custom templates', () => {
      const customTemplate: PromptTemplate = {
        id: 'test_template',
        name: 'Test Template',
        description: 'A test template',
        category: 'generation',
        template: 'Generate a {{item_type}} with {{properties}}',
        variables: [
          {
            name: 'item_type',
            type: 'string',
            required: true,
            description: 'Type of item',
          },
          {
            name: 'properties',
            type: 'string',
            required: false,
            description: 'Item properties',
            defaultValue: 'basic properties',
          },
        ],
        outputFormat: 'text',
        version: '1.0',
      };

      service.registerTemplate(customTemplate);

      const retrieved = service.getTemplate('test_template');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Template');
    });

    it('should retrieve templates by category', () => {
      const generationTemplates = service.getTemplatesByCategory('generation');
      expect(generationTemplates.length).toBeGreaterThan(0);
      expect(
        generationTemplates.every((t) => t.category === 'generation'),
      ).toBe(true);
    });
  });

  describe('Template Compilation', () => {
    it('should compile templates with variables', () => {
      const variables = {
        room_name: 'Ancient Library',
        room_type: 'study',
        game_theme: 'fantasy',
        room_theme: 'scholarly',
      };

      const compiled = service.compileTemplate('room_description', variables);

      expect(compiled.prompt).toContain('Ancient Library');
      expect(compiled.prompt).toContain('study');
      expect(compiled.prompt).toContain('fantasy');
      expect(compiled.variables).toEqual(variables);
      expect(compiled.metadata.templateId).toBe('room_description');
    });

    it('should use default values for missing variables', () => {
      const variables = {
        room_name: 'Test Room',
        room_type: 'generic',
        game_theme: 'fantasy',
        room_theme: 'plain',
      };

      const compiled = service.compileTemplate('room_description', variables);

      // Should use default values for missing optional variables
      expect(compiled.prompt).toBeDefined();
      expect(compiled.variables.room_size).toBe('medium'); // default value
    });

    it('should throw error for missing required variables', () => {
      const variables = {
        room_name: 'Test Room',
        // Missing required variables
      };

      expect(() => {
        service.compileTemplate('room_description', variables);
      }).toThrow('Required variable missing');
    });

    it('should validate variable types', () => {
      const variables = {
        room_name: 123, // Should be string
        room_type: 'study',
        game_theme: 'fantasy',
      };

      expect(() => {
        service.compileTemplate('room_description', variables);
      }).toThrow('has invalid type');
    });
  });

  describe('Context-based Compilation', () => {
    const mockGameContext: GameContext = {
      gameInfo: {
        name: 'Test Adventure',
        theme: 'medieval fantasy',
        genre: 'rpg',
      },
      currentScene: {
        activeRoom: {
          room: {
            id: 'room1',
            name: 'Throne Room',
            description: 'A grand throne room with golden decorations',
            position: { x: 0, y: 0, z: 0 },
          },
          objects: [
            {
              object: {
                id: 'throne1',
                name: 'Golden Throne',
                description: 'An ornate golden throne',
                position: { x: 0, y: 0, z: 0 },
              },
              spatialRelationships: [],
            },
          ],
          connections: [
            {
              direction: 'north',
              targetRoomId: 'room2',
              description: 'North to hallway',
            },
          ],
          ambiance: {
            lighting: 'bright torch light',
            sounds: 'echoing footsteps',
            temperature: 'cool',
          },
        },
        timeOfDay: 'afternoon',
      },
      playerContext: {
        player: {
          id: 'player1',
          name: 'Hero',
          position: { x: 0, y: 0, z: 0 },
          level: 5,
        },
        recentActions: ['entered room'],
        inventory: [],
      },
      constraints: {
        physicsRules: [
          { description: 'Objects fall due to gravity', severity: 'high' },
        ],
        culturalSettings: {
          era: 'medieval',
          technology: 'pre-industrial',
        },
        narrativeGuidelines: {
          tone: 'heroic',
          complexity: 'moderate',
        },
      },
    };

    it('should compile with game context', () => {
      const compiled = service.compileWithContext(
        'room_description',
        mockGameContext,
        {
          room_theme: 'royal',
        },
      );

      expect(compiled.variables.game_name).toBe('Test Adventure');
      expect(compiled.variables.location).toBe('Throne Room');
      expect(compiled.variables.objects_list).toContain('Golden Throne');
      expect(compiled.variables.room_theme).toBe('royal');
    });

    it('should extract context variables correctly', () => {
      const compiled = service.compileWithContext(
        'npc_generation',
        mockGameContext,
        {
          npc_role: 'merchant',
        },
      );

      expect(compiled.variables.game_theme).toBe('medieval fantasy');
      expect(compiled.variables.location).toBe('Throne Room');
      expect(compiled.variables.cultural_setting).toBe('medieval');
      expect(compiled.variables.tech_level).toBe('pre-industrial');
    });
  });

  describe('Template Rendering', () => {
    it('should render templates directly to strings', async () => {
      const variables = {
        room_name: 'Magic Shop',
        room_type: 'store',
        game_theme: 'fantasy',
        room_theme: 'mystical',
      };

      const rendered = await service.renderTemplate(
        'room_description',
        variables,
      );

      expect(typeof rendered).toBe('string');
      expect(rendered).toContain('Magic Shop');
      expect(rendered).toContain('store');
    });

    it('should handle template rendering errors gracefully', async () => {
      await expect(
        service.renderTemplate('nonexistent_template', {}),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('Variable Validation', () => {
    const testTemplate: PromptTemplate = {
      id: 'validation_test',
      name: 'Validation Test',
      description: 'Template for testing validation',
      category: 'generation',
      template: 'Test {{name}} with {{count}} items',
      variables: [
        {
          name: 'name',
          type: 'string',
          required: true,
          description: 'Name field',
          validation: { minLength: 2, maxLength: 50 },
        },
        {
          name: 'count',
          type: 'number',
          required: true,
          description: 'Count field',
          validation: { min: 1, max: 100 },
        },
      ],
      outputFormat: 'text',
      version: '1.0',
    };

    beforeEach(() => {
      service.registerTemplate(testTemplate);
    });

    it('should validate string length constraints', () => {
      expect(() => {
        service.compileTemplate('validation_test', {
          name: 'X', // Too short
          count: 5,
        });
      }).toThrow('too short');

      expect(() => {
        service.compileTemplate('validation_test', {
          name: 'X'.repeat(51), // Too long
          count: 5,
        });
      }).toThrow('too long');
    });

    it('should validate number range constraints', () => {
      expect(() => {
        service.compileTemplate('validation_test', {
          name: 'Valid Name',
          count: 0, // Too small
        });
      }).toThrow('too small');

      expect(() => {
        service.compileTemplate('validation_test', {
          name: 'Valid Name',
          count: 101, // Too large
        });
      }).toThrow('too large');
    });

    it('should accept valid values', () => {
      const compiled = service.compileTemplate('validation_test', {
        name: 'Valid Name',
        count: 50,
      });

      expect(compiled.prompt).toContain('Valid Name');
      expect(compiled.prompt).toContain('50');
    });
  });

  describe('Template Statistics', () => {
    it('should provide accurate statistics', () => {
      const stats = service.getStats();

      expect(stats.totalTemplates).toBeGreaterThan(0);
      expect(stats.categoryCounts).toBeDefined();
      expect(stats.categoryCounts.generation).toBeGreaterThan(0);
      expect(stats.templateIds).toContain('room_description');
      expect(stats.templateIds).toContain('npc_generation');
    });

    it('should update statistics when templates are added', () => {
      const initialStats = service.getStats();

      const newTemplate: PromptTemplate = {
        id: 'stats_test',
        name: 'Stats Test',
        description: 'Template for testing stats',
        category: 'validation',
        template: 'Test template',
        variables: [],
        outputFormat: 'text',
        version: '1.0',
      };

      service.registerTemplate(newTemplate);

      const finalStats = service.getStats();
      expect(finalStats.totalTemplates).toBe(initialStats.totalTemplates + 1);
      expect(finalStats.categoryCounts.validation).toBe(
        (initialStats.categoryCounts.validation || 0) + 1,
      );
      expect(finalStats.templateIds).toContain('stats_test');
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined template gracefully', () => {
      const template = service.getTemplate('nonexistent');
      expect(template).toBeUndefined();
    });

    it('should handle empty category gracefully', () => {
      const templates = service.getTemplatesByCategory('nonexistent');
      expect(templates).toEqual([]);
    });

    it('should handle malformed variable replacement', () => {
      const testTemplate: PromptTemplate = {
        id: 'malformed_test',
        name: 'Malformed Test',
        description: 'Template with malformed variables',
        category: 'generation',
        template: 'Test {{missing_var}} and {{existing_var}}',
        variables: [
          {
            name: 'existing_var',
            type: 'string',
            required: true,
            description: 'Existing variable',
          },
        ],
        outputFormat: 'text',
        version: '1.0',
      };

      service.registerTemplate(testTemplate);

      const compiled = service.compileTemplate('malformed_test', {
        existing_var: 'test',
      });

      expect(compiled.prompt).toContain('test');
      expect(compiled.prompt).toContain('{{missing_var}}'); // Unchanged placeholder
    });
  });
});
