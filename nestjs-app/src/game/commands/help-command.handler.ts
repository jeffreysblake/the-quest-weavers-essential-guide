import { Injectable } from '@nestjs/common';
import { CommandResult } from '../game.service';

@Injectable()
export class HelpCommandHandler {
  async handle(
    player: any,
    currentRoom: any,
    target?: string,
  ): Promise<CommandResult> {
    const helpText = `
Available Commands:

MOVEMENT:
  north, south, east, west (or n, s, e, w) - Move in a direction
  northeast, northwest, southeast, southwest (or ne, nw, se, sw) - Move diagonally
  up, down - Move vertically

INVENTORY:
  take [item] - Pick up an item
  drop [item] - Drop an item from your inventory
  inventory (or i, inv) - Check what you're carrying
  examine [item] - Look at something closely
  use [item] - Use an item

INTERACTION:
  look (or l) - Look around the current room
  talk [npc] - Speak with an NPC
  reply [number] (or choose, answer, select) - Choose a dialogue option
  1, 2, 3, etc. - Quick dialogue choice by number
  attack [npc] - Attack an NPC
  open [container] - Open a container
  close [container] - Close a container

SYSTEM:
  help - Show this help message
  save - Save your progress
  load - Load your saved game

TIPS:
  - Talk to NPCs to learn about quests and get hints
  - Use dialogue choices (1, 2, 3) to progress conversations
  - Examine NPCs to see what items they might have
  - Some NPCs may need to be defeated in combat to obtain quest items
`;

    return {
      success: true,
      type: 'help',
      message: helpText.trim(),
    };
  }
}
