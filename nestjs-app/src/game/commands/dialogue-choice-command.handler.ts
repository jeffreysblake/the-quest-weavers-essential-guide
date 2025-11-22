import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { IDialogueContext } from '../../dialogue/dialogue.interfaces';

@Injectable()
export class DialogueChoiceCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomNavHelper: RoomNavigationHelperService,
    private gameStateService: GameStateService,
    private dialogueManager: DialogueManagerService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // Target should be a choice number (1, 2, 3, etc.)
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Reply with what? Please specify a choice number (e.g., "reply 1").',
      };
    }

    // Parse choice number
    const choiceIndex = parseInt(target, 10);
    if (isNaN(choiceIndex) || choiceIndex < 1) {
      return {
        success: false,
        type: 'error',
        message: `Invalid choice number "${target}". Please use a number like 1, 2, 3, etc.`,
      };
    }

    // Get active conversations for this player
    const activeConversations = this.dialogueManager.getPlayerConversations(
      player.gameId,
      player.id,
    );

    if (!activeConversations || activeConversations.length === 0) {
      return {
        success: false,
        type: 'action_failure',
        message: 'You are not currently in a conversation. Talk to someone first.',
      };
    }

    // Get the most recent active conversation
    const activeConversation = activeConversations[activeConversations.length - 1];

    try {
      // Get current dialogue to access available choices
      const context = this.buildDialogueContext(player, activeConversation);
      const currentDialogue = await this.dialogueManager.getCurrentDialogue(
        activeConversation.conversationId,
        context,
      );

      // Validate choice index
      if (choiceIndex > currentDialogue.availableChoices.length) {
        return {
          success: false,
          type: 'error',
          message: `Choice ${choiceIndex} doesn't exist. Please choose between 1 and ${currentDialogue.availableChoices.length}.`,
        };
      }

      // Get the choice object (convert 1-based index to 0-based)
      const choice = currentDialogue.availableChoices[choiceIndex - 1];

      // Make the choice
      const dialogueResult = await this.dialogueManager.makeChoice(
        activeConversation.conversationId,
        choice.id,
        context,
      );

      // Check if conversation ended
      if (dialogueResult.conversationEnded) {
        // Get NPC from gameState to check if hostile (combat should start)
        const gameState = await this.gameStateService.getGameState(player.gameId);
        const npc = gameState.npcs ? gameState.npcs[activeConversation.npcId] : null;

        // If NPC is hostile, suggest combat
        let endMessage = dialogueResult.currentNode.text || 'The conversation has ended.';
        if (npc && npc.hostile) {
          endMessage += '\n\n[The tension rises. Combat is imminent! Type "attack ' + (npc.name || 'enemy').toLowerCase() + '" to fight!]';
        }

        return {
          success: true,
          type: 'dialogue',
          message: endMessage,
          dialogue: {
            npcName: npc ? npc.name : 'NPC',
            text: dialogueResult.currentNode.text || '',
            choices: [],
          },
        };
      }

      // Return the next dialogue node
      // Format choices with numbers for easier selection
      const numberedChoices = dialogueResult.availableChoices.map(
        (c, index) => `${index + 1}. ${c.text}`,
      );

      return {
        success: true,
        type: 'dialogue',
        message: `You say: "${choice.text}"`,
        dialogue: {
          npcName: 'NPC', // Will be filled in by context
          text: dialogueResult.currentNode.text || '',
          choices: numberedChoices,
        },
      };
    } catch (error) {
      console.error('Error making dialogue choice:', error);
      return {
        success: false,
        type: 'error',
        message: `Failed to make choice: ${error.message}`,
      };
    }
  }

  /**
   * Build dialogue context for conditions and actions
   */
  private buildDialogueContext(
    player: any,
    conversationState: any,
  ): IDialogueContext {
    // Get player inventory item IDs
    const inventory = this.playerService.getInventory(player.id);
    const inventoryIds = inventory.map((item) => item.id);

    // Build context
    const context: IDialogueContext = {
      gameId: player.gameId,
      playerId: player.id,
      npcId: conversationState.npcId,
      conversationState: conversationState,
      playerFlags: player.flags || {},
      playerVariables: player.variables || {},
      playerInventory: inventoryIds,
      questStates: player.questStates || {},
    };

    return context;
  }
}
