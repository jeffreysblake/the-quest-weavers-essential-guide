import { Injectable, Logger } from '@nestjs/common';
import {
  IQuest,
  IPlayerQuest,
  IQuestObjective,
  IQuestContext,
  IQuestUpdateResult,
  IQuestStartResult,
  IQuestReward,
  IQuestPrerequisite,
  IObjectiveCondition,
  QuestState,
  ObjectiveType,
} from './quest.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

/**
 * Manages quest definitions and player quest progress
 */
@Injectable()
export class QuestManagerService {
  private readonly logger = new Logger(QuestManagerService.name);
  private quests: Map<string, IQuest> = new Map(); // questId -> quest
  private playerQuests: Map<string, IPlayerQuest[]> = new Map(); // playerId -> quests

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Register a quest definition
   */
  registerQuest(quest: IQuest): void {
    this.quests.set(quest.id, quest);
    this.logger.log(
      `Registered quest '${quest.name}' (${quest.id}) with ${quest.objectives.length} objectives`,
    );
  }

  /**
   * Start a quest for a player
   */
  async startQuest(
    questId: string,
    playerId: string,
    context: IQuestContext,
  ): Promise<IQuestStartResult> {
    const quest = this.quests.get(questId);

    if (!quest) {
      return {
        success: false,
        message: `Quest '${questId}' not found`,
      };
    }

    // Check if already started
    const existingQuest = this.getPlayerQuest(playerId, questId);
    if (existingQuest && existingQuest.state !== QuestState.NOT_STARTED) {
      return {
        success: false,
        message: `Quest '${quest.name}' already ${existingQuest.state}`,
      };
    }

    // Check prerequisites
    const prerequisitesFailed: string[] = [];
    if (quest.prerequisites) {
      for (const prerequisite of quest.prerequisites) {
        const met = await this.checkPrerequisite(prerequisite, context);
        if (!met) {
          prerequisitesFailed.push(this.getPrerequisiteDescription(prerequisite));
        }
      }
    }

    if (prerequisitesFailed.length > 0) {
      return {
        success: false,
        message: `Prerequisites not met: ${prerequisitesFailed.join(', ')}`,
        prerequisitesFailed,
      };
    }

    // Create player quest
    const now = new Date().toISOString();
    const playerQuest: IPlayerQuest = {
      questId: quest.id,
      playerId,
      gameId: quest.gameId,
      state: QuestState.ACTIVE,
      objectives: JSON.parse(JSON.stringify(quest.objectives)), // Deep copy
      startedAt: now,
    };

    // Set time limit expiration if applicable
    if (quest.timeLimit) {
      const expiresAt = new Date(Date.now() + quest.timeLimit * 1000).toISOString();
      playerQuest.timeLimitExpiresAt = expiresAt;
    }

    // Store player quest
    const playerQuestList = this.playerQuests.get(playerId) || [];
    playerQuestList.push(playerQuest);
    this.playerQuests.set(playerId, playerQuestList);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'quest_started',
        questId,
        playerId,
        questName: quest.name,
      },
      quest.gameId,
    );

    this.logger.log(`Player ${playerId} started quest '${quest.name}'`);

    return {
      success: true,
      message: `Quest '${quest.name}' started`,
      quest: playerQuest,
    };
  }

  /**
   * Update quest objective progress
   */
  async updateObjective(
    playerId: string,
    questId: string,
    objectiveId: string,
    increment: number = 1,
    context: IQuestContext,
  ): Promise<IQuestUpdateResult> {
    const playerQuest = this.getPlayerQuest(playerId, questId);

    if (!playerQuest) {
      return {
        success: false,
        message: `Quest '${questId}' not found for player`,
      };
    }

    if (playerQuest.state !== QuestState.ACTIVE) {
      return {
        success: false,
        message: `Quest is ${playerQuest.state}, cannot update`,
      };
    }

    // Find objective
    const objective = playerQuest.objectives.find((obj) => obj.id === objectiveId);

    if (!objective) {
      return {
        success: false,
        message: `Objective '${objectiveId}' not found`,
      };
    }

    if (objective.completed) {
      return {
        success: false,
        message: `Objective '${objectiveId}' already completed`,
      };
    }

    // Update progress
    const currentCount = objective.currentCount || 0;
    const targetCount = objective.targetCount || 1;
    objective.currentCount = Math.min(currentCount + increment, targetCount);

    const objectiveCompleted = objective.currentCount >= targetCount;

    if (objectiveCompleted) {
      objective.completed = true;

      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'quest_objective_completed',
          questId,
          objectiveId,
          playerId,
        },
        playerQuest.gameId,
      );

      this.logger.log(
        `Player ${playerId} completed objective '${objective.description}' in quest ${questId}`,
      );
    }

    // Check if all required objectives are completed
    const allRequiredCompleted = playerQuest.objectives
      .filter((obj) => !obj.optional)
      .every((obj) => obj.completed);

    if (allRequiredCompleted) {
      return await this.completeQuest(playerId, questId, context);
    }

    return {
      success: true,
      message: objectiveCompleted
        ? `Objective '${objective.description}' completed`
        : `Objective progress: ${objective.currentCount}/${targetCount}`,
      objectiveCompleted,
      objectiveId,
    };
  }

  /**
   * Complete a quest
   */
  private async completeQuest(
    playerId: string,
    questId: string,
    context: IQuestContext,
  ): Promise<IQuestUpdateResult> {
    const playerQuest = this.getPlayerQuest(playerId, questId);
    const quest = this.quests.get(questId);

    if (!playerQuest || !quest) {
      return {
        success: false,
        message: 'Quest not found',
      };
    }

    playerQuest.state = QuestState.COMPLETED;
    playerQuest.completedAt = new Date().toISOString();

    // Grant rewards
    if (quest.rewards) {
      for (const reward of quest.rewards) {
        await this.grantReward(reward, context);
      }
    }

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'quest_completed',
        questId,
        playerId,
        questName: quest.name,
        rewards: quest.rewards,
      },
      playerQuest.gameId,
    );

    this.logger.log(`Player ${playerId} completed quest '${quest.name}'`);

    // Check if next quest in chain should auto-start
    let nextQuestUnlocked: string | undefined;
    if (quest.nextQuestId) {
      const nextQuest = this.quests.get(quest.nextQuestId);
      if (nextQuest?.autoStart) {
        const startResult = await this.startQuest(quest.nextQuestId, playerId, context);
        if (startResult.success) {
          nextQuestUnlocked = quest.nextQuestId;
        }
      }
    }

    return {
      success: true,
      message: `Quest '${quest.name}' completed!`,
      questCompleted: true,
      rewards: quest.rewards,
      nextQuestUnlocked,
    };
  }

  /**
   * Fail a quest
   */
  async failQuest(playerId: string, questId: string): Promise<IQuestUpdateResult> {
    const playerQuest = this.getPlayerQuest(playerId, questId);
    const quest = this.quests.get(questId);

    if (!playerQuest || !quest) {
      return {
        success: false,
        message: 'Quest not found',
      };
    }

    playerQuest.state = QuestState.FAILED;
    playerQuest.failedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'quest_failed',
        questId,
        playerId,
        questName: quest.name,
      },
      playerQuest.gameId,
    );

    this.logger.log(`Player ${playerId} failed quest '${quest.name}'`);

    return {
      success: true,
      message: `Quest '${quest.name}' failed`,
      questFailed: true,
    };
  }

  /**
   * Abandon a quest
   */
  async abandonQuest(playerId: string, questId: string): Promise<IQuestUpdateResult> {
    const quest = this.quests.get(questId);

    if (!quest) {
      return {
        success: false,
        message: 'Quest not found',
      };
    }

    if (!quest.canAbandon) {
      return {
        success: false,
        message: `Quest '${quest.name}' cannot be abandoned`,
      };
    }

    const playerQuestList = this.playerQuests.get(playerId) || [];
    const index = playerQuestList.findIndex((pq) => pq.questId === questId);

    if (index === -1) {
      return {
        success: false,
        message: 'Quest not found for player',
      };
    }

    playerQuestList.splice(index, 1);
    this.playerQuests.set(playerId, playerQuestList);

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'quest_abandoned',
        questId,
        playerId,
        questName: quest.name,
      },
      quest.gameId,
    );

    this.logger.log(`Player ${playerId} abandoned quest '${quest.name}'`);

    return {
      success: true,
      message: `Quest '${quest.name}' abandoned`,
    };
  }

  /**
   * Check quest fail conditions
   */
  async checkFailConditions(
    playerId: string,
    questId: string,
    context: IQuestContext,
  ): Promise<boolean> {
    const quest = this.quests.get(questId);
    const playerQuest = this.getPlayerQuest(playerId, questId);

    if (!quest || !playerQuest || playerQuest.state !== QuestState.ACTIVE) {
      return false;
    }

    // Check time limit
    if (playerQuest.timeLimitExpiresAt) {
      const now = Date.now();
      const expiresAt = new Date(playerQuest.timeLimitExpiresAt).getTime();
      if (now > expiresAt) {
        await this.failQuest(playerId, questId);
        return true;
      }
    }

    // Check fail conditions
    if (quest.failConditions) {
      for (const condition of quest.failConditions) {
        const met = await this.checkCondition(condition, context);
        if (met) {
          await this.failQuest(playerId, questId);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check quest prerequisite
   */
  private async checkPrerequisite(
    prerequisite: IQuestPrerequisite,
    context: IQuestContext,
  ): Promise<boolean> {
    switch (prerequisite.type) {
      case 'quest':
        if (prerequisite.questId) {
          return context.completedQuests.includes(prerequisite.questId);
        }
        return false;

      case 'level':
        if (prerequisite.requiredLevel && context.playerLevel) {
          return context.playerLevel >= prerequisite.requiredLevel;
        }
        return false;

      case 'flag':
        if (prerequisite.flagKey) {
          return context.playerFlags[prerequisite.flagKey] === prerequisite.flagValue;
        }
        return false;

      case 'item':
        if (prerequisite.itemId) {
          return context.playerInventory.includes(prerequisite.itemId);
        }
        return false;

      case 'custom':
        if (prerequisite.customCheck) {
          return await prerequisite.customCheck(context);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Check objective condition
   */
  private async checkCondition(
    condition: IObjectiveCondition,
    context: IQuestContext,
  ): Promise<boolean> {
    switch (condition.type) {
      case 'flag':
        if (condition.key) {
          const flagValue = context.playerFlags[condition.key];
          return this.compareValues(flagValue, condition.operator, condition.value);
        }
        return false;

      case 'variable':
        if (condition.key) {
          const varValue = context.playerVariables[condition.key];
          return this.compareValues(varValue, condition.operator, condition.value);
        }
        return false;

      case 'item':
        if (condition.key) {
          return context.playerInventory.includes(condition.key);
        }
        return false;

      case 'custom':
        if (condition.customCheck) {
          return await condition.customCheck(context);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    actualValue: any,
    operator: string | undefined,
    expectedValue: any,
  ): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'not_equals':
        return actualValue !== expectedValue;
      case 'greater':
        return actualValue > expectedValue;
      case 'less':
        return actualValue < expectedValue;
      case 'exists':
        return actualValue !== undefined;
      default:
        return actualValue === expectedValue;
    }
  }

  /**
   * Grant quest reward
   */
  private async grantReward(reward: IQuestReward, context: IQuestContext): Promise<void> {
    switch (reward.type) {
      case 'item':
        if (reward.itemId) {
          const count = reward.itemCount || 1;
          for (let i = 0; i < count; i++) {
            context.playerInventory.push(reward.itemId);
          }
        }
        break;

      case 'experience':
        // This would integrate with player level system
        break;

      case 'flag':
        if (reward.flagKey) {
          context.playerFlags[reward.flagKey] = reward.flagValue ?? true;
        }
        break;

      case 'variable':
        if (reward.variableKey) {
          context.playerVariables[reward.variableKey] = reward.variableValue;
        }
        break;

      case 'custom':
        if (reward.customReward) {
          await reward.customReward(context);
        }
        break;
    }
  }

  /**
   * Get prerequisite description
   */
  private getPrerequisiteDescription(prerequisite: IQuestPrerequisite): string {
    switch (prerequisite.type) {
      case 'quest':
        return `Quest ${prerequisite.questId} must be completed`;
      case 'level':
        return `Level ${prerequisite.requiredLevel} required`;
      case 'flag':
        return `Flag ${prerequisite.flagKey} must be ${prerequisite.flagValue}`;
      case 'item':
        return `Item ${prerequisite.itemId} required`;
      default:
        return 'Unknown prerequisite';
    }
  }

  /**
   * Get player quest
   */
  getPlayerQuest(playerId: string, questId: string): IPlayerQuest | undefined {
    const quests = this.playerQuests.get(playerId) || [];
    return quests.find((q) => q.questId === questId);
  }

  /**
   * Get all player quests
   */
  getPlayerQuests(playerId: string, state?: QuestState): IPlayerQuest[] {
    const quests = this.playerQuests.get(playerId) || [];
    if (state) {
      return quests.filter((q) => q.state === state);
    }
    return quests;
  }

  /**
   * Get quest definition
   */
  getQuest(questId: string): IQuest | undefined {
    return this.quests.get(questId);
  }

  /**
   * Get all quests for a game
   */
  getGameQuests(gameId: string): IQuest[] {
    const quests: IQuest[] = [];
    for (const quest of this.quests.values()) {
      if (quest.gameId === gameId) {
        quests.push(quest);
      }
    }
    return quests;
  }

  /**
   * Remove quest definition
   */
  removeQuest(questId: string): void {
    this.quests.delete(questId);
    this.logger.log(`Removed quest '${questId}'`);
  }

  /**
   * Clear all quests
   */
  clearAllQuests(): void {
    this.quests.clear();
    this.logger.log('Cleared all quest definitions');
  }

  /**
   * Clear all player quests
   */
  clearPlayerQuests(playerId: string): void {
    this.playerQuests.delete(playerId);
    this.logger.log(`Cleared all quests for player ${playerId}`);
  }
}
