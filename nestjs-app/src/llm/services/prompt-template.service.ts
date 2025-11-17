import { Injectable, Logger } from '@nestjs/common';
import { GameContext } from '../interfaces/llm.interface';
import { defaultTemplates } from '../templates';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'generation' | 'conflict_resolution' | 'enhancement' | 'validation';
  template: string;
  variables: PromptVariable[];
  systemPrompt?: string;
  examples?: PromptExample[];
  constraints?: string[];
  outputFormat?: 'text' | 'json' | 'structured';
  version: string;
}

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}

export interface PromptExample {
  input: Record<string, any>;
  expectedOutput: string;
  description: string;
}

export interface CompiledPrompt {
  prompt: string;
  systemPrompt?: string;
  variables: Record<string, any>;
  metadata: {
    templateId: string;
    compiledAt: string;
    variables: string[];
  };
}

@Injectable()
export class PromptTemplateService {
  private readonly logger = new Logger(PromptTemplateService.name);
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.loadDefaultTemplates();
  }

  /**
   * Register a new prompt template
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
    this.logger.log(
      `Registered prompt template: ${template.id} (${template.category})`,
    );
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List templates by category
   */
  getTemplatesByCategory(category: string): PromptTemplate[] {
    return Array.from(this.templates.values()).filter(
      (template) => template.category === category,
    );
  }

  /**
   * Compile a template with provided variables
   */
  compileTemplate(
    templateId: string,
    variables: Record<string, any>,
  ): CompiledPrompt {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate variables
    this.validateVariables(template, variables);

    // Compile the prompt
    const prompt = this.replaceVariables(template.template, variables);
    const systemPrompt = template.systemPrompt
      ? this.replaceVariables(template.systemPrompt, variables)
      : undefined;

    return {
      prompt,
      systemPrompt,
      variables,
      metadata: {
        templateId,
        compiledAt: new Date().toISOString(),
        variables: Object.keys(variables),
      },
    };
  }

  /**
   * Compile template with game context
   */
  compileWithContext(
    templateId: string,
    context: GameContext,
    additionalVariables: Record<string, any> = {},
  ): CompiledPrompt {
    const contextVariables = this.extractContextVariables(context);
    const allVariables = { ...contextVariables, ...additionalVariables };

    return this.compileTemplate(templateId, allVariables);
  }

  /**
   * Render template directly to string (convenience method)
   */
  async renderTemplate(
    templateId: string,
    variables: Record<string, any>,
  ): Promise<string> {
    const compiled = this.compileTemplate(templateId, variables);
    return compiled.prompt;
  }

  /**
   * Load default templates from external files
   */
  private loadDefaultTemplates(): void {
    defaultTemplates.forEach((template) => {
      this.registerTemplate(template);
    });
    this.logger.log(`Loaded ${this.templates.size} default prompt templates`);
  }


  /**
   * Extract variables from game context
   */
  private extractContextVariables(context: GameContext): Record<string, any> {
    const variables: Record<string, any> = {};

    // Game info
    variables.game_name = context.gameInfo.name;
    variables.game_theme = context.gameInfo.theme;
    variables.game_genre = context.gameInfo.genre;

    // Current scene
    if (context.currentScene.activeRoom) {
      variables.location = context.currentScene.activeRoom.room.name;
      variables.room_name = context.currentScene.activeRoom.room.name;
      variables.room_type =
        context.currentScene.activeRoom.room.type || 'unknown';
      variables.room_theme =
        context.currentScene.activeRoom.room.description || '';

      // Objects in room
      const objectNames = context.currentScene.activeRoom.objects.map(
        (obj) => obj.object.name,
      );
      variables.objects_list =
        objectNames.length > 0 ? objectNames.join(', ') : 'none';
      variables.existing_objects = objectNames.join(', ');

      // Room connections
      const connections = context.currentScene.activeRoom.connections.map(
        (conn) => `${conn.direction} to ${conn.targetRoomId}`,
      );
      variables.connected_rooms = connections.join(', ');

      // Ambiance
      variables.lighting = context.currentScene.activeRoom.ambiance.lighting;
      variables.time_of_day = context.currentScene.timeOfDay || 'unknown';
    }

    // World constraints
    if (context.constraints) {
      variables.cultural_setting =
        context.constraints.culturalSettings?.era || 'fantasy';
      variables.tech_level =
        context.constraints.culturalSettings?.technology || 'medieval';
      variables.narrative_style =
        context.constraints.narrativeGuidelines?.tone || 'balanced';

      // Physics rules
      const physicsRules =
        context.constraints.physicsRules?.map((rule) => rule.description) || [];
      variables.physics_rules = physicsRules.join(', ');
    }

    // Player context
    if (context.playerContext) {
      variables.player_level =
        context.playerContext.player.level?.toString() || '1';
      variables.player_relationship = 'neutral'; // Default
    }

    return variables;
  }

  /**
   * Validate template variables
   */
  private validateVariables(
    template: PromptTemplate,
    variables: Record<string, any>,
  ): void {
    for (const variable of template.variables) {
      const value = variables[variable.name];

      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        throw new Error(`Required variable missing: ${variable.name}`);
      }

      // Use default value if not provided
      if (value === undefined && variable.defaultValue !== undefined) {
        variables[variable.name] = variable.defaultValue;
        continue;
      }

      if (value !== undefined) {
        // Type validation
        if (!this.validateVariableType(value, variable.type)) {
          throw new Error(
            `Variable ${variable.name} has invalid type. Expected ${variable.type}, got ${typeof value}`,
          );
        }

        // Additional validation
        if (variable.validation) {
          this.validateVariableConstraints(
            variable.name,
            value,
            variable.validation,
          );
        }
      }
    }
  }

  /**
   * Validate variable type
   */
  private validateVariableType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Validate variable constraints
   */
  private validateVariableConstraints(
    name: string,
    value: any,
    validation: any,
  ): void {
    if (typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        throw new Error(
          `Variable ${name} is too short. Minimum length: ${validation.minLength}`,
        );
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        throw new Error(
          `Variable ${name} is too long. Maximum length: ${validation.maxLength}`,
        );
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        throw new Error(`Variable ${name} does not match required pattern`);
      }
    }

    if (typeof value === 'number') {
      if (validation.min && value < validation.min) {
        throw new Error(
          `Variable ${name} is too small. Minimum: ${validation.min}`,
        );
      }
      if (validation.max && value > validation.max) {
        throw new Error(
          `Variable ${name} is too large. Maximum: ${validation.max}`,
        );
      }
    }
  }

  /**
   * Replace variables in template string
   */
  private replaceVariables(
    template: string,
    variables: Record<string, any>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      const value = variables[variableName];
      if (value === undefined) {
        this.logger.warn(`Template variable not found: ${variableName}`);
        return match; // Keep the placeholder if variable not found
      }
      return String(value);
    });
  }

  /**
   * Get template statistics
   */
  getStats(): {
    totalTemplates: number;
    categoryCounts: Record<string, number>;
    templateIds: string[];
  } {
    const categoryCounts: Record<string, number> = {};

    for (const template of this.templates.values()) {
      categoryCounts[template.category] =
        (categoryCounts[template.category] || 0) + 1;
    }

    return {
      totalTemplates: this.templates.size,
      categoryCounts,
      templateIds: Array.from(this.templates.keys()),
    };
  }
}
