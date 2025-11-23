import { Injectable } from '@nestjs/common';
import { CommandResult } from '../game.service';
import { ObjectService } from '../../entity/object.service';

@Injectable()
export class InventoryCommandHandler {
  constructor(private objectService: ObjectService) {}

  async handle(
    player: any,
    currentRoom: any,
    target?: string,
  ): Promise<CommandResult> {
    // Show player's inventory
    if (!player.inventory || player.inventory.length === 0) {
      return {
        success: true,
        type: 'inventory',
        message: 'You are not carrying anything.',
        items: [],
      };
    }

    // Get actual objects from inventory IDs
    const inventoryObjects = player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean);

    // Check if all items were filtered out (invalid IDs)
    if (inventoryObjects.length === 0) {
      return {
        success: true,
        type: 'inventory',
        message: 'You are not carrying anything.',
        items: [],
      };
    }

    // Format inventory list
    const itemList = inventoryObjects
      .map((item) => `- ${item.name}`)
      .join('\n');

    return {
      success: true,
      type: 'inventory',
      message: `You are carrying:\n${itemList}`,
      items: inventoryObjects.map((item) => item.name),
    };
  }
}
