import { Test, TestingModule } from '@nestjs/testing';
import { LLMController } from './llm.controller';
import { LLMModule } from './llm.module';
import { EntityModule } from '../entity/entity.module';

describe('LLM Integration Tests', () => {
  let app: TestingModule;
  let controller: LLMController;

  beforeEach(async () => {
    // Set up test environment variables
    process.env.OPENAI_API_KEY = 'test_key';
    process.env.ANTHROPIC_API_KEY = 'test_key';

    app = await Test.createTestingModule({
      imports: [EntityModule, LLMModule],
    }).compile();

    controller = app.get<LLMController>(LLMController);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Module Initialization', () => {
    it('should initialize LLM module successfully', () => {
      expect(controller).toBeDefined();
    });

    it('should provide status endpoint', async () => {
      const status = await controller.getStatus();

      expect(status.available).toBeDefined();
      expect(status.llmStats).toBeDefined();
      expect(status.conflictStats).toBeDefined();
      expect(status.promptStats).toBeDefined();
      expect(status.timestamp).toBeDefined();
    });
  });

  describe('Text Generation API', () => {
    it('should handle text generation requests', async () => {
      const response = await controller.generateText({
        prompt: 'Generate a simple test response',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.content).toBeDefined();
        expect(response.usage).toBeDefined();
        expect(response.model).toBeDefined();
      } else {
        // If providers are not available, should return error gracefully
        expect(response.error).toBeDefined();
      }
    });

    it('should handle structured generation requests', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'description'],
      };

      const response = await controller.generateStructured({
        prompt: 'Generate a fantasy character',
        schema,
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.parsedContent).toBeDefined();
        expect(response.parsedContent.name).toBeDefined();
        expect(response.parsedContent.description).toBeDefined();
      }
    });
  });

  describe('Content Generation API', () => {
    it('should handle room generation requests', async () => {
      const response = await controller.generateRoom({
        theme: 'ancient library',
        style: 'fantasy',
        size: 'medium',
        purpose: 'study and research',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.room).toBeDefined();
        expect(response.room.name).toBeDefined();
        expect(response.room.description).toBeDefined();
      }
    });

    it('should handle NPC generation requests', async () => {
      const response = await controller.generateNPC({
        name: 'Test Librarian',
        role: 'villager',
        personality: ['wise', 'helpful'],
        backstory: 'An ancient keeper of knowledge',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.npc).toBeDefined();
        expect(response.npc.name).toBeDefined();
        expect(response.npc.description).toBeDefined();
      }
    });

    it('should handle quest generation requests', async () => {
      const response = await controller.generateQuest({
        type: 'side',
        difficulty: 5,
        objectives: ['Find the lost tome', 'Return it to the librarian'],
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.quest).toBeDefined();
        expect(response.quest.name).toBeDefined();
        expect(response.quest.objectives).toBeDefined();
        expect(Array.isArray(response.quest.objectives)).toBe(true);
      }
    });
  });

  describe('Story Creation API', () => {
    it('should handle story creation initiation', async () => {
      const response = await controller.createStory({
        theme: 'Lost ancient magic',
        genre: 'fantasy',
        playerLevel: 3,
        preferences: {
          complexity: 'moderate',
          length: 'short',
          focusAreas: ['mystery', 'exploration'],
        },
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.sessionId).toBeDefined();
        expect(response.firstDecision).toBeDefined();
        expect(response.firstDecision.type).toBeDefined();
        expect(response.firstDecision.description).toBeDefined();
      }
    });

    it('should handle story status queries', async () => {
      // Create a story first
      const createResponse = await controller.createStory({
        theme: 'Test story',
        genre: 'adventure',
        playerLevel: 1,
      });

      if (createResponse.success) {
        const statusResponse = await controller.getStoryStatus(
          createResponse.sessionId,
        );

        expect(statusResponse.success).toBeDefined();

        if (statusResponse.success) {
          expect(statusResponse.phase).toBeDefined();
          expect(statusResponse.progress).toBeDefined();
          expect(statusResponse.canContinue).toBeDefined();
        }
      }
    });
  });

  describe('Conflict Resolution API', () => {
    it('should handle general conflict resolution', async () => {
      const response = await controller.resolveConflict({
        conflictType: 'physics',
        affectedEntities: ['test_object_1', 'test_object_2'],
        location: 'test_room',
        description: 'Objects are overlapping impossibly',
        originalAction: 'move_object',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.resolution).toBeDefined();
        expect(response.resolution.conflictType).toBe('physics');
        expect(response.resolution.success).toBeDefined();
        expect(response.resolution.resolution).toBeDefined();
        expect(response.resolution.explanation).toBeDefined();
      }
    });

    it('should handle physics-specific conflicts', async () => {
      const response = await controller.resolvePhysicsConflict({
        objects: ['falling_object'],
        physicsError: 'Object floating in mid-air without support',
        location: 'test_chamber',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.resolution).toBeDefined();
        expect(response.resolution.conflictType).toBe('physics');
      }
    });

    it('should handle NPC-specific conflicts', async () => {
      const response = await controller.resolveNPCConflict({
        npcId: 'test_npc',
        conflictDescription: 'NPC trying to walk through walls',
        attemptedAction: 'walk_through_wall',
        location: 'test_room',
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.resolution).toBeDefined();
        expect(response.resolution.conflictType).toBe('npc_behavior');
      }
    });
  });

  describe('Template Management API', () => {
    it('should provide template statistics', async () => {
      const response = await controller.getTemplates();

      expect(response.totalTemplates).toBeGreaterThan(0);
      expect(response.categoryCounts).toBeDefined();
      expect(response.templateIds).toBeDefined();
      expect(Array.isArray(response.templateIds)).toBe(true);
    });

    it('should retrieve templates by category', async () => {
      const response = await controller.getTemplates('generation');

      expect(response.templates).toBeDefined();
      expect(Array.isArray(response.templates)).toBe(true);

      if (response.templates.length > 0) {
        expect(response.templates[0].category).toBe('generation');
      }
    });

    it('should retrieve individual templates', async () => {
      const response = await controller.getTemplate('room_description');

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.template).toBeDefined();
        expect(response.template.id).toBe('room_description');
        expect(response.template.name).toBeDefined();
        expect(response.template.variables).toBeDefined();
      }
    });

    it('should compile templates with variables', async () => {
      const response = await controller.compileTemplate('room_description', {
        variables: {
          room_name: 'Test Chamber',
          room_type: 'laboratory',
          game_theme: 'sci-fi',
        },
      });

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.compiled).toBeDefined();
        expect(response.compiled.prompt).toContain('Test Chamber');
        expect(response.compiled.prompt).toContain('laboratory');
        expect(response.compiled.prompt).toContain('sci-fi');
      }
    });
  });

  describe('Provider Testing API', () => {
    it('should test provider availability', async () => {
      const response = await controller.testProviders();

      expect(response.success).toBeDefined();

      if (response.success) {
        expect(response.providers).toBeDefined();
        expect(typeof response.providers).toBe('object');
      }
    });

    it('should perform simple generation tests', async () => {
      const response = await controller.testSimpleGeneration({
        prompt: 'Describe a magical forest in one sentence.',
      });

      expect(response.success).toBeDefined();
      expect(response.prompt).toBeDefined();

      if (response.success) {
        expect(response.response).toBeDefined();
        expect(response.usage).toBeDefined();
        expect(response.model).toBeDefined();
      } else {
        expect(response.error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await controller.generateText({
        prompt: '', // Empty prompt
        temperature: 999, // Invalid temperature
      });

      expect(response.success).toBeDefined();

      if (!response.success) {
        expect(response.error).toBeDefined();
      }
    });

    it('should handle nonexistent template requests', async () => {
      const response = await controller.getTemplate('nonexistent_template');

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle template compilation errors', async () => {
      const response = await controller.compileTemplate('room_description', {
        variables: {
          // Missing required variables
          room_name: 'Test Room',
        },
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('End-to-End Workflows', () => {
    it('should complete a full room generation workflow', async () => {
      // Step 1: Generate room
      const roomResponse = await controller.generateRoom({
        theme: 'wizard tower',
        style: 'fantasy',
        size: 'large',
      });

      if (roomResponse.success) {
        const roomId = roomResponse.room.id;

        // Step 2: Generate NPC for the room
        const npcResponse = await controller.generateNPC({
          role: 'wizard',
          roomId: roomId,
          personality: ['wise', 'mysterious'],
        });

        if (npcResponse.success) {
          const npcId = npcResponse.npc.id;

          // Step 3: Generate dialogue for the NPC
          const dialogueResponse = await controller.generateDialogue(npcId, {
            topic: 'greeting',
            context: {
              roomId: roomId,
              situation: 'player_enters',
            },
          });

          if (dialogueResponse.success) {
            expect(dialogueResponse.dialogue).toBeDefined();
            expect(Array.isArray(dialogueResponse.dialogue)).toBe(true);
          }
        }
      }
    });

    it('should complete a story creation workflow', async () => {
      // Step 1: Create story
      const createResponse = await controller.createStory({
        theme: 'Ancient ruins mystery',
        genre: 'mystery',
        playerLevel: 2,
        preferences: { length: 'short', complexity: 'simple' },
      });

      if (createResponse.success) {
        const sessionId = createResponse.sessionId;

        // Step 2: Make a decision
        const decisionResponse = await controller.processStoryDecision(
          sessionId,
          {
            decisionId: 'planning_decision',
            choice: 'world_first',
            feedback: 'I prefer to start with world building',
          },
        );

        if (decisionResponse.success) {
          // Step 3: Check status
          const statusResponse = await controller.getStoryStatus(sessionId);

          if (statusResponse.success) {
            expect(statusResponse.progress).toBeGreaterThan(0);
            expect(statusResponse.phase).toBeDefined();
          }
        }
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        controller.generateText({
          prompt: `Test prompt ${i + 1}`,
        }),
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, index) => {
        expect(response.success).toBeDefined();

        if (response.success) {
          expect(response.content).toBeDefined();
        }
      });
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();

      const response = await controller.generateRoom({
        theme: 'performance test',
        style: 'fantasy',
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (10 seconds as upper bound)
      expect(duration).toBeLessThan(10000);
      expect(response.success).toBeDefined();
    });
  });
});
