import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { DialogueManagerService } from '../../dialogue/dialogue-manager.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';
import { IDialogueContext } from '../../dialogue/dialogue.interfaces';

@Injectable()
export class DialogueCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private validator: CommandValidatorService,
    private roomNavHelper: RoomNavigationHelperService,
    private gameStateService: GameStateService,
    private dialogueManager: DialogueManagerService,
    private eventEmitter: EventEmitterService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
    gameId?: string,
  ): Promise<CommandResult> {
    // Validate target was provided
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Talk to whom?',
      };
    }

    // Remove common prepositions from target (e.g., "talk to knight" -> "knight")
    let cleanedTarget = target.trim();
    if (cleanedTarget.startsWith('to ')) {
      cleanedTarget = cleanedTarget.substring(3).trim();
    }
    if (cleanedTarget.startsWith('with ')) {
      cleanedTarget = cleanedTarget.substring(5).trim();
    }

    // VALIDATION: Validate NPC name
    const nameValidation = this.validator.validateItemName(cleanedTarget);
    if (!nameValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: nameValidation.error || 'Invalid NPC name',
      };
    }

    // Use cleaned target for NPC lookup
    target = cleanedTarget;

    // Get game state to access NPCs
    const gameState = await this.gameStateService.getGameState(player.gameId);

    if (!gameState.npcs) {
      return {
        success: false,
        type: 'error',
        message: 'There is nobody to talk to here.',
      };
    }

    // Find NPCs in the current room
    const npcsInRoom = Object.values(gameState.npcs).filter((npc: any) => {
      // Check if NPC is in the same room (stored in room.players array or has matching position)
      if (room.players && room.players.includes(npc.id)) {
        return true;
      }

      // Fallback: Check if NPC position is within room bounds
      if (npc.position) {
        return this.roomNavHelper.isPositionInRoom(npc.position, room);
      }

      return false;
    });

    // Find the target NPC by name (case-insensitive partial match)
    const targetNpc = npcsInRoom.find((npc: any) =>
      npc.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetNpc) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see ${target} here.`,
      };
    }

    // Check if NPC is alive
    if (targetNpc.health !== undefined && targetNpc.health <= 0) {
      return {
        success: false,
        type: 'action_failure',
        message: `${targetNpc.name} is dead and cannot speak.`,
      };
    }

    // Check if NPC can talk (has dialogue tree)
    if (!targetNpc.dialogueTreeData && !targetNpc.dialogueTreeId) {
      return {
        success: false,
        type: 'action_failure',
        message: `${targetNpc.name} doesn't seem interested in talking.`,
      };
    }

    // Get dialogue tree ID (could be stored directly or in dialogueTreeData)
    const dialogueTreeId =
      targetNpc.dialogueTreeId || targetNpc.dialogueTreeData?.id;

    if (!dialogueTreeId) {
      return {
        success: false,
        type: 'action_failure',
        message: `${targetNpc.name} has nothing to say right now.`,
      };
    }

    // Check if dialogue tree exists
    const dialogueTree = this.dialogueManager.getDialogueTree(dialogueTreeId);
    if (!dialogueTree) {
      // If dialogue tree data is provided but not registered, register it
      if (targetNpc.dialogueTreeData) {
        try {
          this.dialogueManager.registerDialogueTree(targetNpc.dialogueTreeData);
        } catch (error) {
          return {
            success: false,
            type: 'error',
            message: `Failed to load dialogue for ${targetNpc.name}.`,
          };
        }
      } else {
        return {
          success: false,
          type: 'error',
          message: `${targetNpc.name} has no dialogue configured.`,
        };
      }
    }

    // Check for existing active conversation
    const existingConversations = this.dialogueManager.getPlayerConversations(
      player.gameId,
      player.id,
    );
    const activeConversation = existingConversations.find(
      (conv) => conv.npcId === targetNpc.id,
    );

    try {
      let dialogueResult;

      if (activeConversation) {
        // Continue existing conversation
        const context = this.buildDialogueContext(
          player,
          targetNpc,
          activeConversation,
        );
        dialogueResult = await this.dialogueManager.getCurrentDialogue(
          activeConversation.conversationId,
          context,
        );
      } else {
        // Start new conversation
        const context = this.buildDialogueContext(player, targetNpc, null);
        dialogueResult = await this.dialogueManager.startConversation(
          player.gameId,
          player.id,
          targetNpc.id,
          dialogueTreeId,
          context,
        );
      }

      // Emit dialogue event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'player_talked_to_npc',
          playerId: player.id,
          npcId: targetNpc.id,
          npcName: targetNpc.name,
          roomId: room.id,
        },
        player.gameId,
      );

      // Convert dialogue result to command result
      return {
        success: true,
        type: 'dialogue',
        message: `You speak with ${targetNpc.name}.`,
        dialogue: {
          npcName: targetNpc.name,
          text: dialogueResult.currentNode.text || '',
          choices: dialogueResult.availableChoices.map((choice) => choice.text),
        },
      };
    } catch (error) {
      console.error(`Error handling dialogue with ${targetNpc.name}:`, error);
      return {
        success: false,
        type: 'error',
        message: `Failed to talk with ${targetNpc.name}: ${error.message}`,
      };
    }
  }

  /**
   * Build dialogue context for conditions and actions
   */
  private buildDialogueContext(
    player: any,
    npc: any,
    conversationState: any,
  ): IDialogueContext {
    // Get player inventory item IDs
    const inventory = this.playerService.getInventory(player.id);
    const inventoryIds = inventory.map((item) => item.id);

    // Build context
    const context: IDialogueContext = {
      gameId: player.gameId,
      playerId: player.id,
      npcId: npc.id,
      conversationState: conversationState || {
        conversationId: '',
        gameId: player.gameId,
        playerId: player.id,
        npcId: npc.id,
        treeId: '',
        currentNodeId: '',
        history: [],
        variables: {},
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
      playerFlags: player.flags || {},
      playerVariables: player.variables || {},
      playerInventory: inventoryIds,
      questStates: player.questStates || {},
    };

    return context;
  }
}
