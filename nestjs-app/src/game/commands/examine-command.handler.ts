import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class ExamineCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
  ) {}

  /**
   * Normalize item name for matching - handles hyphens, underscores, and spaces
   */
  private normalizeNameForMatching(name: string): string {
    return name
      .toLowerCase()
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Check if target matches object name (handles variations like hyphens vs spaces)
   */
  private matchesName(objectName: string, target: string): boolean {
    const normalizedObjectName = this.normalizeNameForMatching(objectName);
    const normalizedTarget = this.normalizeNameForMatching(target);
    return normalizedObjectName.includes(normalizedTarget);
  }

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Examine what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validator.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    // Check inventory first (prioritize inventory over room objects)
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name ? this.matchesName(obj.name, target) : false,
    );

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name ? this.matchesName(obj.name, target) : false,
      );
    }

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    return {
      success: true,
      type: 'examination',
      message: targetObject.description || `It's a ${targetObject.name}.`,
    };
  }
}
