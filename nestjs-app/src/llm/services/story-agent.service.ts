import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { NarrativeGeneratorService } from './narrative-generator.service';
import { RoomGeneratorService } from './room-generator.service';
import { NPCGeneratorService } from './npc-generator.service';
import { RoomService } from '../../entity/room.service';
import { PlayerService } from '../../entity/player.service';
import { ObjectService } from '../../entity/object.service';

interface StoryCreationSession {
  sessionId: string;
  theme: string;
  genre: string;
  currentPhase:
    | 'planning'
    | 'world_building'
    | 'character_creation'
    | 'content_generation'
    | 'refinement'
    | 'completed';
  playerLevel: number;
  preferences: {
    complexity: 'simple' | 'moderate' | 'complex';
    length: 'short' | 'medium' | 'long';
    style: string;
    focusAreas: string[];
  };
  generatedContent: {
    story?: any;
    rooms: any[];
    npcs: any[];
    quests: any[];
    objects: any[];
  };
  userFeedback: Array<{
    phase: string;
    feedback: string;
    timestamp: string;
  }>;
  decisions: Array<{
    question: string;
    options: string[];
    chosen: string;
    reasoning?: string;
  }>;
  state: {
    currentStep: number;
    totalSteps: number;
    errors: string[];
    warnings: string[];
  };
}

export interface AgenticDecision {
  type: 'question' | 'suggestion' | 'action';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  options?: Array<{
    id: string;
    label: string;
    description: string;
    consequences?: string[];
  }>;
  autoExecuteAfter?: number;
  defaultChoice?: string;
}

interface StoryValidationResult {
  isValid: boolean;
  issues: Array<{
    type: 'error' | 'warning' | 'suggestion';
    category: 'consistency' | 'balance' | 'engagement' | 'technical';
    description: string;
    suggestion?: string;
    autoFix?: boolean;
  }>;
  qualityScore: number;
  recommendations: string[];
}

@Injectable()
export class StoryAgentService {
  private readonly logger = new Logger(StoryAgentService.name);
  private activeSessions = new Map<string, StoryCreationSession>();
  private readonly DECISION_TIMEOUT = 30000; // 30 seconds

  constructor(
    private llmService: LLMService,
    private promptTemplateService: PromptTemplateService,
    private contextBuilderService: ContextBuilderService,
    private narrativeService: NarrativeGeneratorService,
    private roomService: RoomService,
    private playerService: PlayerService,
    private objectService: ObjectService,
  ) {}

  /**
   * Start a new agentic story creation session
   */
  async startStoryCreation(request: {
    theme: string;
    genre: string;
    playerLevel: number;
    preferences?: any;
  }): Promise<{ sessionId: string; firstDecision: AgenticDecision }> {
    const sessionId = this.generateSessionId();

    const session: StoryCreationSession = {
      sessionId,
      theme: request.theme,
      genre: request.genre,
      currentPhase: 'planning',
      playerLevel: request.playerLevel,
      preferences: {
        complexity: 'moderate',
        length: 'medium',
        style: 'balanced',
        focusAreas: ['adventure', 'exploration'],
        ...request.preferences,
      },
      generatedContent: {
        rooms: [],
        npcs: [],
        quests: [],
        objects: [],
      },
      userFeedback: [],
      decisions: [],
      state: {
        currentStep: 1,
        totalSteps: this.calculateTotalSteps(
          request.preferences?.length || 'medium',
        ),
        errors: [],
        warnings: [],
      },
    };

    this.activeSessions.set(sessionId, session);
    this.logger.log(
      `Started story creation session: ${sessionId} for theme: ${request.theme}`,
    );

    const firstDecision = await this.generateNextDecision(sessionId);
    if (!firstDecision) {
      throw new Error('Failed to generate initial decision for story creation');
    }
    return { sessionId, firstDecision };
  }

  /**
   * Process user decision and continue with story creation
   */
  async processDecision(
    sessionId: string,
    decisionId: string,
    choice: string,
    feedback?: string,
  ): Promise<{
    nextDecision?: AgenticDecision;
    progress: { phase: string; step: number; total: number };
    generated: any[];
  }> {
    const session = this.getSession(sessionId);

    // Record the decision
    const decision = {
      question: decisionId,
      options: [],
      chosen: choice,
      reasoning: feedback,
    };
    session.decisions.push(decision);

    if (feedback) {
      session.userFeedback.push({
        phase: session.currentPhase,
        feedback,
        timestamp: new Date().toISOString(),
      });
    }

    // Process the choice and advance the session
    await this.advanceSession(session, choice);

    const nextDecision = await this.generateNextDecision(sessionId);

    return {
      nextDecision,
      progress: {
        phase: session.currentPhase,
        step: session.state.currentStep,
        total: session.state.totalSteps,
      },
      generated: this.getGeneratedContent(session),
    };
  }

  /**
   * Get current session status
   */
  getSessionStatus(sessionId: string): {
    phase: string;
    progress: number;
    generated: any;
    canContinue: boolean;
  } {
    const session = this.getSession(sessionId);

    return {
      phase: session.currentPhase,
      progress: session.state.currentStep / session.state.totalSteps,
      generated: session.generatedContent,
      canContinue: session.currentPhase !== 'completed',
    };
  }

  /**
   * Validate generated story content
   */
  async validateStory(sessionId: string): Promise<StoryValidationResult> {
    const session = this.getSession(sessionId);

    const validationPrompt = await this.promptTemplateService.renderTemplate(
      'story_validation',
      {
        story: JSON.stringify(session.generatedContent.story, null, 2),
        rooms: session.generatedContent.rooms.length.toString(),
        npcs: session.generatedContent.npcs.length.toString(),
        quests: session.generatedContent.quests.length.toString(),
        theme: session.theme,
        genre: session.genre,
        playerLevel: session.playerLevel.toString(),
      },
    );

    const schema = {
      type: 'object',
      required: ['isValid', 'issues', 'qualityScore', 'recommendations'],
      properties: {
        isValid: { type: 'boolean' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'category', 'description'],
            properties: {
              type: {
                type: 'string',
                enum: ['error', 'warning', 'suggestion'],
              },
              category: {
                type: 'string',
                enum: ['consistency', 'balance', 'engagement', 'technical'],
              },
              description: { type: 'string' },
              suggestion: { type: 'string' },
              autoFix: { type: 'boolean' },
            },
          },
        },
        qualityScore: { type: 'number', minimum: 0, maximum: 100 },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
    };

    const response =
      await this.llmService.generateStructuredResponse<StoryValidationResult>(
        validationPrompt,
        schema,
        { temperature: 0.3 },
      );

    return response.parsedContent;
  }

  /**
   * Auto-fix story issues where possible
   */
  async autoFixStoryIssues(sessionId: string): Promise<{
    fixedIssues: string[];
    remainingIssues: string[];
  }> {
    const session = this.getSession(sessionId);
    const validation = await this.validateStory(sessionId);

    const fixableIssues = validation.issues.filter((issue) => issue.autoFix);
    const fixedIssues: string[] = [];
    const remainingIssues: string[] = [];

    for (const issue of validation.issues) {
      if (issue.autoFix) {
        try {
          await this.fixStoryIssue(session, issue);
          fixedIssues.push(issue.description);
        } catch (error) {
          remainingIssues.push(`Failed to fix: ${issue.description}`);
        }
      } else {
        remainingIssues.push(issue.description);
      }
    }

    return { fixedIssues, remainingIssues };
  }

  /**
   * Finalize and deploy the story
   */
  async finalizeStory(sessionId: string): Promise<{
    deployedElements: {
      rooms: string[];
      npcs: string[];
      quests: string[];
    };
    summary: string;
  }> {
    const session = this.getSession(sessionId);

    if (session.currentPhase !== 'completed') {
      throw new Error('Story creation not completed yet');
    }

    const validation = await this.validateStory(sessionId);
    if (
      !validation.isValid &&
      validation.issues.some((i) => i.type === 'error')
    ) {
      throw new Error('Story has critical errors that prevent deployment');
    }

    // Deploy the generated content to the game world
    const deployedElements = await this.deployStoryElements(session);

    // Generate a summary
    const summaryPrompt = await this.promptTemplateService.renderTemplate(
      'story_summary',
      {
        theme: session.theme,
        genre: session.genre,
        roomCount: deployedElements.rooms.length.toString(),
        npcCount: deployedElements.npcs.length.toString(),
        questCount: deployedElements.quests.length.toString(),
      },
    );

    const summaryResponse = await this.llmService.generateResponse(
      summaryPrompt,
      { temperature: 0.7 },
    );

    session.currentPhase = 'completed';
    this.activeSessions.set(sessionId, session);

    this.logger.log(`Finalized story creation session: ${sessionId}`);

    return {
      deployedElements,
      summary: summaryResponse.content,
    };
  }

  private async generateNextDecision(
    sessionId: string,
  ): Promise<AgenticDecision | undefined> {
    const session = this.getSession(sessionId);

    switch (session.currentPhase) {
      case 'planning':
        return this.generatePlanningDecision(session);
      case 'world_building':
        return this.generateWorldBuildingDecision(session);
      case 'character_creation':
        return this.generateCharacterCreationDecision(session);
      case 'content_generation':
        return this.generateContentDecision(session);
      case 'refinement':
        return this.generateRefinementDecision(session);
      case 'completed':
        return undefined;
      default:
        throw new Error(`Unknown phase: ${session.currentPhase}`);
    }
  }

  private async generatePlanningDecision(
    session: StoryCreationSession,
  ): Promise<AgenticDecision> {
    const decisionPrompt = `Based on the theme "${session.theme}" and genre "${session.genre}", 
    what aspect should we focus on first for this ${session.preferences.complexity} complexity story?`;

    return {
      type: 'question',
      priority: 'high',
      description: decisionPrompt,
      options: [
        {
          id: 'world_first',
          label: 'Build the World First',
          description: 'Create locations and environments before characters',
          consequences: [
            'Rich environmental storytelling',
            'Characters fit naturally into world',
          ],
        },
        {
          id: 'characters_first',
          label: 'Create Characters First',
          description: 'Develop NPCs and their relationships before locations',
          consequences: [
            'Character-driven narrative',
            'Locations serve character needs',
          ],
        },
        {
          id: 'story_driven',
          label: 'Plot-Driven Approach',
          description: 'Start with core story structure and build around it',
          consequences: [
            'Tight narrative focus',
            'All elements serve the plot',
          ],
        },
      ],
      autoExecuteAfter: this.DECISION_TIMEOUT,
      defaultChoice: 'world_first',
    };
  }

  private async generateWorldBuildingDecision(
    session: StoryCreationSession,
  ): Promise<AgenticDecision> {
    const roomCount = this.calculateRoomCount(session.preferences.length);

    return {
      type: 'question',
      priority: 'medium',
      description: `How many locations should we create? (Recommended: ${roomCount} for ${session.preferences.length} length)`,
      options: [
        {
          id: 'minimal',
          label: `Minimal (${Math.floor(roomCount * 0.7)})`,
          description: 'Focused, tightly connected locations',
        },
        {
          id: 'recommended',
          label: `Recommended (${roomCount})`,
          description: 'Balanced variety and depth',
        },
        {
          id: 'expanded',
          label: `Expanded (${Math.floor(roomCount * 1.3)})`,
          description: 'Rich world with optional exploration',
        },
      ],
      autoExecuteAfter: this.DECISION_TIMEOUT,
      defaultChoice: 'recommended',
    };
  }

  private async generateCharacterCreationDecision(
    session: StoryCreationSession,
  ): Promise<AgenticDecision> {
    const npcCount = this.calculateNPCCount(session.preferences.length);

    return {
      type: 'question',
      priority: 'medium',
      description: 'What type of characters should populate this world?',
      options: [
        {
          id: 'diverse_cast',
          label: 'Diverse Cast',
          description:
            'Mix of allies, enemies, and neutrals with varied backgrounds',
        },
        {
          id: 'focused_relationships',
          label: 'Focused Relationships',
          description:
            'Fewer characters with deeper, interconnected relationships',
        },
        {
          id: 'antagonist_driven',
          label: 'Antagonist-Driven',
          description: 'Strong villains and their network of minions/allies',
        },
      ],
      autoExecuteAfter: this.DECISION_TIMEOUT,
      defaultChoice: 'diverse_cast',
    };
  }

  private async generateContentDecision(
    session: StoryCreationSession,
  ): Promise<AgenticDecision> {
    return {
      type: 'action',
      priority: 'high',
      description:
        'Ready to generate story content. This will create all locations, characters, and quests.',
      options: [
        {
          id: 'generate_all',
          label: 'Generate Everything',
          description: 'Create all story elements based on previous decisions',
        },
        {
          id: 'preview_first',
          label: 'Preview First',
          description:
            'Show a preview of what will be generated before creating',
        },
      ],
      defaultChoice: 'generate_all',
    };
  }

  private async generateRefinementDecision(
    session: StoryCreationSession,
  ): Promise<AgenticDecision> {
    const validation = await this.validateStory(session.sessionId);

    if (validation.isValid && validation.qualityScore >= 80) {
      return {
        type: 'suggestion',
        priority: 'low',
        description: `Story looks great! Quality score: ${validation.qualityScore}/100. Ready to finalize?`,
        options: [
          {
            id: 'finalize',
            label: 'Finalize Story',
            description: 'Deploy the story to the game world',
          },
          {
            id: 'more_polish',
            label: 'More Polish',
            description: 'Continue refining the story',
          },
        ],
        defaultChoice: 'finalize',
      };
    }

    return {
      type: 'question',
      priority: 'medium',
      description: `Story quality score: ${validation.qualityScore}/100. What would you like to improve?`,
      options: validation.recommendations.slice(0, 3).map((rec, index) => ({
        id: `improve_${index}`,
        label: rec,
        description: 'Focus on this improvement area',
      })),
    };
  }

  private async advanceSession(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    switch (session.currentPhase) {
      case 'planning':
        await this.advancePlanning(session, choice);
        break;
      case 'world_building':
        await this.advanceWorldBuilding(session, choice);
        break;
      case 'character_creation':
        await this.advanceCharacterCreation(session, choice);
        break;
      case 'content_generation':
        await this.advanceContentGeneration(session, choice);
        break;
      case 'refinement':
        await this.advanceRefinement(session, choice);
        break;
    }

    session.state.currentStep++;
    this.activeSessions.set(session.sessionId, session);
  }

  private async advancePlanning(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    // Store planning decision and move to next phase
    session.currentPhase =
      choice === 'characters_first' ? 'character_creation' : 'world_building';
  }

  private async advanceWorldBuilding(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    const roomCount = this.parseRoomChoice(choice, session.preferences.length);

    // Generate rooms based on choice
    const storyOutline = await this.narrativeService.generateStory({
      genre: session.genre as any,
      theme: session.theme,
      targetLength: session.preferences.length as any,
      playerLevel: session.playerLevel,
    });

    session.generatedContent.story = storyOutline;
    session.currentPhase = 'character_creation';
  }

  private async advanceCharacterCreation(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    // Character creation logic would go here
    session.currentPhase = 'content_generation';
  }

  private async advanceContentGeneration(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    if (choice === 'generate_all' || choice === 'preview_first') {
      // Generate all story content
      if (session.generatedContent.story) {
        const implemented = await this.narrativeService.implementStory(
          session.generatedContent.story,
        );
        session.generatedContent.rooms = implemented.rooms;
        session.generatedContent.npcs = implemented.npcs;
        session.generatedContent.quests = implemented.quests;
      }
    }

    session.currentPhase = 'refinement';
  }

  private async advanceRefinement(
    session: StoryCreationSession,
    choice: string,
  ): Promise<void> {
    if (choice === 'finalize') {
      session.currentPhase = 'completed';
    }
    // Otherwise stay in refinement phase for more improvements
  }

  private async deployStoryElements(session: StoryCreationSession): Promise<{
    rooms: string[];
    npcs: string[];
    quests: string[];
  }> {
    const deployed = {
      rooms: [] as string[],
      npcs: [] as string[],
      quests: [] as string[],
    };

    // Deploy rooms to the game world
    for (const room of session.generatedContent.rooms) {
      deployed.rooms.push(room.id || room.name);
    }

    // Deploy NPCs
    for (const npc of session.generatedContent.npcs) {
      deployed.npcs.push(npc.id || npc.name);
    }

    // Store quests (would integrate with quest system)
    for (const quest of session.generatedContent.quests) {
      deployed.quests.push(quest.name);
    }

    return deployed;
  }

  private async fixStoryIssue(
    session: StoryCreationSession,
    issue: any,
  ): Promise<void> {
    // Auto-fix logic would go here based on issue type
    this.logger.log(`Auto-fixing issue: ${issue.description}`);
  }

  private getSession(sessionId: string): StoryCreationSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Story creation session not found: ${sessionId}`);
    }
    return session;
  }

  private generateSessionId(): string {
    return `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateTotalSteps(length: string): number {
    switch (length) {
      case 'short':
        return 8;
      case 'medium':
        return 12;
      case 'long':
        return 18;
      default:
        return 10;
    }
  }

  private calculateRoomCount(length: string): number {
    switch (length) {
      case 'short':
        return 5;
      case 'medium':
        return 10;
      case 'long':
        return 20;
      default:
        return 8;
    }
  }

  private calculateNPCCount(length: string): number {
    switch (length) {
      case 'short':
        return 3;
      case 'medium':
        return 6;
      case 'long':
        return 12;
      default:
        return 5;
    }
  }

  private parseRoomChoice(choice: string, length: string): number {
    const base = this.calculateRoomCount(length);
    switch (choice) {
      case 'minimal':
        return Math.floor(base * 0.7);
      case 'expanded':
        return Math.floor(base * 1.3);
      default:
        return base;
    }
  }

  private getGeneratedContent(session: StoryCreationSession): any[] {
    const content: any[] = [];
    if (session.generatedContent.story)
      content.push({ type: 'story', data: session.generatedContent.story });
    if (session.generatedContent.rooms.length)
      content.push({
        type: 'rooms',
        count: session.generatedContent.rooms.length,
      });
    if (session.generatedContent.npcs.length)
      content.push({
        type: 'npcs',
        count: session.generatedContent.npcs.length,
      });
    if (session.generatedContent.quests.length)
      content.push({
        type: 'quests',
        count: session.generatedContent.quests.length,
      });
    return content;
  }
}
