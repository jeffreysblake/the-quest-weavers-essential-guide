import { Injectable, Logger } from '@nestjs/common';
import {
  IActionHandler,
  IAction,
  IActionResult,
  IGameContext,
  ActionType,
} from '../action.interfaces';
import { RoomService } from '../../entity/room.service';

/**
 * Handler for movement actions (go, move, travel)
 */
@Injectable()
export class MovementActionHandler implements IActionHandler {
  private readonly logger = new Logger(MovementActionHandler.name);

  constructor(private readonly roomService: RoomService) {}

  canHandle(actionType: ActionType): boolean {
    return [ActionType.MOVE, ActionType.GO, ActionType.TRAVEL].includes(
      actionType,
    );
  }

  async execute(
    action: IAction,
    context: IGameContext,
  ): Promise<IActionResult> {
    const direction = action.parameters?.direction || action.target;

    if (!direction) {
      return {
        success: false,
        message: 'Which direction do you want to go?',
        followUpActions: ['go north', 'go south', 'go east', 'go west'],
      };
    }

    try {
      // Get current room
      const currentRoom = await this.roomService.getRoom(
        context.currentRoomId,
      );
      if (!currentRoom) {
        return {
          success: false,
          message: 'Current room not found',
        };
      }

      // Find connection in that direction
      // This would query the connections table
      // For now, return a placeholder
      return {
        success: true,
        message: `You head ${direction}.`,
        stateChanges: [
          {
            entityId: action.actor,
            entityType: 'player',
            property: 'currentRoomId',
            oldValue: context.currentRoomId,
            newValue: 'new-room-id', // Would be actual connected room
            timestamp: new Date().toISOString(),
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Movement failed: ${error.message}`);
      return {
        success: false,
        message: `Cannot go ${direction}`,
      };
    }
  }

  getHelp(): string {
    return 'Move in a direction: go [north|south|east|west|up|down]';
  }
}
