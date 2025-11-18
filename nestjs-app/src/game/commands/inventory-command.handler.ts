import { Injectable } from '@nestjs/common';
import { CommandResult } from '../game.service';

@Injectable()
export class InventoryCommandHandler {
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

    // Format inventory list
    const itemList = player.inventory
      .map((item) => `- ${item.name}`)
      .join('\n');

    return {
      success: true,
      type: 'inventory',
      message: `You are carrying:\n${itemList}`,
      items: player.inventory.map((item) => item.name),
    };
  }
}
