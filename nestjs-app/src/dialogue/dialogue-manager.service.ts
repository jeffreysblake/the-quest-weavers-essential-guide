import { Injectable, Logger } from '@nestjs/common';
import {
  IDialogueTree,
  IDialogueNode,
  IDialogueChoice,
  IConversationState,
  IDialogueContext,
  IDialogueResult,
  IDialogueCondition,
  IDialogueAction,
  IDialogueHistoryEntry,
  IDialogueTreeData,
  DialogueNodeType,
} from './dialogue.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

/**
 * Manages dialogue trees and conversation state
 */
@Injectable()
export class DialogueManagerService {
  private readonly logger = new Logger(DialogueManagerService.name);
  private dialogueTrees: Map<string, IDialogueTree> = new Map(); // treeId -> tree
  private activeConversations: Map<string, IConversationState> = new Map(); // conversationId -> state

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Register a dialogue tree for an NPC
   */
  registerDialogueTree(treeData: IDialogueTreeData): void {
    // Convert nodes array to Map
    const nodesMap = new Map<string, IDialogueNode>();
    for (const node of treeData.nodes) {
      nodesMap.set(node.id, node);
    }

    const tree: IDialogueTree = {
      id: treeData.id,
      npcId: treeData.npcId,
      name: treeData.name,
      description: treeData.description,
      startNodeId: treeData.startNodeId,
      nodes: nodesMap,
      metadata: treeData.metadata,
    };

    this.dialogueTrees.set(tree.id, tree);
    this.logger.log(
      `Registered dialogue tree '${tree.name}' for NPC '${tree.npcId}' with ${tree.nodes.size} nodes`,
    );
  }

  /**
   * Start a conversation with an NPC
   */
  async startConversation(
    gameId: string,
    playerId: string,
    npcId: string,
    treeId: string,
    context: IDialogueContext,
  ): Promise<IDialogueResult> {
    const tree = this.dialogueTrees.get(treeId);

    if (!tree) {
      throw new Error(`Dialogue tree '${treeId}' not found`);
    }

    if (tree.npcId !== npcId) {
      throw new Error(`Dialogue tree '${treeId}' does not belong to NPC '${npcId}'`);
    }

    // Create conversation state
    const conversationId = `${gameId}_${playerId}_${npcId}_${Date.now()}`;
    const now = new Date().toISOString();

    const conversationState: IConversationState = {
      conversationId,
      gameId,
      playerId,
      npcId,
      treeId,
      currentNodeId: tree.startNodeId,
      history: [],
      variables: {},
      startedAt: now,
      lastUpdated: now,
    };

    this.activeConversations.set(conversationId, conversationState);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'conversation_started',
        conversationId,
        npcId,
        treeId,
      },
      gameId,
    );

    this.logger.log(`Started conversation ${conversationId} with NPC ${npcId}`);

    // Get current node and available choices
    return await this.getCurrentDialogue(conversationId, context);
  }

  /**
   * Get current dialogue node and available choices
   */
  async getCurrentDialogue(
    conversationId: string,
    context: IDialogueContext,
  ): Promise<IDialogueResult> {
    const state = this.activeConversations.get(conversationId);

    if (!state) {
      throw new Error(`Conversation '${conversationId}' not found`);
    }

    const tree = this.dialogueTrees.get(state.treeId);
    if (!tree) {
      throw new Error(`Dialogue tree '${state.treeId}' not found`);
    }

    const currentNode = tree.nodes.get(state.currentNodeId);
    if (!currentNode) {
      throw new Error(`Dialogue node '${state.currentNodeId}' not found`);
    }

    // Execute node actions
    const actionsTriggered: IDialogueAction[] = [];
    if (currentNode.actions) {
      for (const action of currentNode.actions) {
        await this.executeAction(action, context);
        actionsTriggered.push(action);
      }
    }

    // Add to history
    if (currentNode.text) {
      const historyEntry: IDialogueHistoryEntry = {
        nodeId: currentNode.id,
        speaker: currentNode.speaker || state.npcId,
        text: currentNode.text,
        timestamp: new Date().toISOString(),
      };
      state.history.push(historyEntry);
    }

    // Check if conversation ended
    if (currentNode.type === DialogueNodeType.END) {
      this.activeConversations.delete(conversationId);

      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'conversation_ended',
          conversationId,
          npcId: state.npcId,
        },
        state.gameId,
      );

      return {
        success: true,
        currentNode,
        availableChoices: [],
        conversationEnded: true,
        actionsTriggered,
      };
    }

    // Get available choices (filter by conditions)
    const availableChoices: IDialogueChoice[] = [];
    if (currentNode.choices) {
      for (const choice of currentNode.choices) {
        if (await this.checkChoiceConditions(choice, context)) {
          availableChoices.push(choice);
        }
      }
    }

    state.lastUpdated = new Date().toISOString();

    return {
      success: true,
      currentNode,
      availableChoices,
      conversationEnded: false,
      actionsTriggered,
    };
  }

  /**
   * Player makes a dialogue choice
   */
  async makeChoice(
    conversationId: string,
    choiceId: string,
    context: IDialogueContext,
  ): Promise<IDialogueResult> {
    const state = this.activeConversations.get(conversationId);

    if (!state) {
      throw new Error(`Conversation '${conversationId}' not found`);
    }

    const tree = this.dialogueTrees.get(state.treeId);
    if (!tree) {
      throw new Error(`Dialogue tree '${state.treeId}' not found`);
    }

    const currentNode = tree.nodes.get(state.currentNodeId);
    if (!currentNode) {
      throw new Error(`Current dialogue node not found`);
    }

    // Find the choice
    const choice = currentNode.choices?.find((c) => c.id === choiceId);
    if (!choice) {
      throw new Error(`Choice '${choiceId}' not found`);
    }

    // Verify choice conditions
    const conditionsMet = await this.checkChoiceConditions(choice, context);
    if (!conditionsMet) {
      return {
        success: false,
        currentNode,
        availableChoices: [],
        message: 'Choice conditions not met',
      };
    }

    // Add choice to history
    const historyEntry: IDialogueHistoryEntry = {
      nodeId: currentNode.id,
      speaker: context.playerId,
      text: choice.text,
      choiceId: choice.id,
      choiceText: choice.text,
      timestamp: new Date().toISOString(),
    };
    state.history.push(historyEntry);

    // Execute choice actions
    if (choice.actions) {
      for (const action of choice.actions) {
        await this.executeAction(action, context);
      }
    }

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'dialogue_choice_made',
        conversationId,
        choiceId,
        choiceText: choice.text,
      },
      state.gameId,
    );

    // Check if conversation ends
    if (choice.endsConversation) {
      this.activeConversations.delete(conversationId);

      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'conversation_ended',
          conversationId,
          npcId: state.npcId,
        },
        state.gameId,
      );

      return {
        success: true,
        currentNode,
        availableChoices: [],
        conversationEnded: true,
      };
    }

    // Move to next node
    if (choice.nextNodeId) {
      state.currentNodeId = choice.nextNodeId;
      state.lastUpdated = new Date().toISOString();
      return await this.getCurrentDialogue(conversationId, context);
    }

    // No next node specified
    return {
      success: false,
      currentNode,
      availableChoices: [],
      message: 'No next node specified for choice',
    };
  }

  /**
   * Check if choice conditions are met
   */
  private async checkChoiceConditions(
    choice: IDialogueChoice,
    context: IDialogueContext,
  ): Promise<boolean> {
    if (!choice.conditions || choice.conditions.length === 0) {
      return true;
    }

    for (const condition of choice.conditions) {
      const met = await this.checkCondition(condition, context);
      if (!met) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check a dialogue condition
   */
  private async checkCondition(
    condition: IDialogueCondition,
    context: IDialogueContext,
  ): Promise<boolean> {
    switch (condition.type) {
      case 'flag':
        return this.checkFlagCondition(condition, context);

      case 'variable':
        return this.checkVariableCondition(condition, context);

      case 'item':
        return this.checkItemCondition(condition, context);

      case 'quest':
        return this.checkQuestCondition(condition, context);

      case 'custom':
        if (condition.customCheck) {
          return await condition.customCheck(context);
        }
        return false;

      default:
        this.logger.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  /**
   * Check flag condition
   */
  private checkFlagCondition(
    condition: IDialogueCondition,
    context: IDialogueContext,
  ): boolean {
    const flagValue = context.playerFlags[condition.key];

    switch (condition.operator) {
      case 'equals':
        return flagValue === condition.value;
      case 'not_equals':
        return flagValue !== condition.value;
      case 'exists':
        return flagValue !== undefined;
      default:
        return flagValue === true;
    }
  }

  /**
   * Check variable condition
   */
  private checkVariableCondition(
    condition: IDialogueCondition,
    context: IDialogueContext,
  ): boolean {
    const variableValue = context.playerVariables[condition.key];

    switch (condition.operator) {
      case 'equals':
        return variableValue === condition.value;
      case 'not_equals':
        return variableValue !== condition.value;
      case 'greater':
        return variableValue > condition.value;
      case 'less':
        return variableValue < condition.value;
      case 'exists':
        return variableValue !== undefined;
      default:
        return variableValue === condition.value;
    }
  }

  /**
   * Check item condition
   */
  private checkItemCondition(
    condition: IDialogueCondition,
    context: IDialogueContext,
  ): boolean {
    return context.playerInventory.includes(condition.key);
  }

  /**
   * Check quest condition
   */
  private checkQuestCondition(
    condition: IDialogueCondition,
    context: IDialogueContext,
  ): boolean {
    const questState = context.questStates[condition.key];

    switch (condition.operator) {
      case 'equals':
        return questState === condition.value;
      case 'not_equals':
        return questState !== condition.value;
      case 'exists':
        return questState !== undefined;
      default:
        return questState === condition.value;
    }
  }

  /**
   * Execute a dialogue action
   */
  private async executeAction(
    action: IDialogueAction,
    context: IDialogueContext,
  ): Promise<void> {
    switch (action.type) {
      case 'set_flag':
        if (action.key) {
          context.playerFlags[action.key] = action.value ?? true;
        }
        break;

      case 'set_variable':
        if (action.key) {
          context.playerVariables[action.key] = action.value;
        }
        break;

      case 'give_item':
        if (action.itemId) {
          context.playerInventory.push(action.itemId);
        }
        break;

      case 'update_quest':
        if (action.questId) {
          context.questStates[action.questId] = action.value;
        }
        break;

      case 'custom':
        if (action.customAction) {
          await action.customAction(context);
        }
        break;

      default:
        this.logger.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * End an active conversation
   */
  async endConversation(conversationId: string): Promise<void> {
    const state = this.activeConversations.get(conversationId);

    if (state) {
      this.activeConversations.delete(conversationId);

      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'conversation_ended',
          conversationId,
          npcId: state.npcId,
        },
        state.gameId,
      );

      this.logger.log(`Ended conversation ${conversationId}`);
    }
  }

  /**
   * Get conversation state
   */
  getConversationState(conversationId: string): IConversationState | undefined {
    return this.activeConversations.get(conversationId);
  }

  /**
   * Get all active conversations for a player
   */
  getPlayerConversations(gameId: string, playerId: string): IConversationState[] {
    const conversations: IConversationState[] = [];

    for (const state of this.activeConversations.values()) {
      if (state.gameId === gameId && state.playerId === playerId) {
        conversations.push(state);
      }
    }

    return conversations;
  }

  /**
   * Get dialogue tree
   */
  getDialogueTree(treeId: string): IDialogueTree | undefined {
    return this.dialogueTrees.get(treeId);
  }

  /**
   * Get all dialogue trees for an NPC
   */
  getNpcDialogueTrees(npcId: string): IDialogueTree[] {
    const trees: IDialogueTree[] = [];

    for (const tree of this.dialogueTrees.values()) {
      if (tree.npcId === npcId) {
        trees.push(tree);
      }
    }

    return trees;
  }

  /**
   * Remove dialogue tree
   */
  removeDialogueTree(treeId: string): void {
    this.dialogueTrees.delete(treeId);
    this.logger.log(`Removed dialogue tree '${treeId}'`);
  }

  /**
   * Clear all dialogue trees
   */
  clearAllDialogueTrees(): void {
    this.dialogueTrees.clear();
    this.logger.log('Cleared all dialogue trees');
  }

  /**
   * Clear all active conversations
   */
  clearAllConversations(): void {
    this.activeConversations.clear();
    this.logger.log('Cleared all active conversations');
  }
}
