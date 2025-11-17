import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

@Injectable()
export class UseCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private objectService: ObjectService,
    private validator: CommandValidatorService,
    private eventEmitter: EventEmitterService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Use what?',
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

    // Find the item in inventory first, then in room
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    let itemLocation: 'inventory' | 'room' = 'inventory';

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name?.toLowerCase().includes(target.toLowerCase()),
      );
      itemLocation = 'room';
    }

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    // Handle different item types
    switch (targetObject.objectType) {
      case 'consumable':
        return await this.handleConsumableUse(
          player,
          targetObject,
          itemLocation,
        );

      case 'weapon':
        return await this.handleWeaponUse(player, targetObject, itemLocation);

      case 'container':
        // Containers should be opened, not used
        if (targetObject.isContainer) {
          return {
            success: false,
            type: 'action_failure',
            message: `You need to open the ${targetObject.name} first. Try "open ${targetObject.name}".`,
          };
        }
        break;

      case 'item':
        // Check if it's a key (keys have special properties)
        if (
          targetObject.properties?.isKey ||
          targetObject.name?.toLowerCase().includes('key')
        ) {
          return await this.handleKeyUse(player, room, targetObject);
        }
        // Check if it's a tool with specific effects
        if (targetObject.properties?.toolType) {
          return await this.handleToolUse(player, targetObject, itemLocation);
        }
        break;

      case 'furniture':
        return {
          success: false,
          type: 'action_failure',
          message: `You can't use the ${targetObject.name} like that.`,
        };
    }

    // Generic use for other items
    await this.eventEmitter.emit(
      GameEventType.OBJECT_USED,
      {
        playerId: player.id,
        objectId: targetObject.id,
        objectName: targetObject.name,
        objectType: targetObject.objectType,
      },
      player.gameId,
    );

    return {
      success: true,
      type: 'action_result',
      message: `You use the ${targetObject.name}. Nothing obvious happens.`,
    };
  }

  /**
   * Handle using a consumable item (potions, food, etc.)
   */
  private async handleConsumableUse(
    player: any,
    item: any,
    location: 'inventory' | 'room',
  ): Promise<CommandResult> {
    if (location === 'room') {
      return {
        success: false,
        type: 'action_failure',
        message: `You need to pick up the ${item.name} first before you can use it.`,
      };
    }

    // Apply effects based on item properties
    const effects: string[] = [];
    let healthRestored = 0;
    let manaRestored = 0;

    // Health restoration
    if (item.properties?.healAmount) {
      const currentHealth = player.health || 0;
      const maxHealth = player.maxHealth || 100;
      const healAmount = Math.min(
        item.properties.healAmount,
        maxHealth - currentHealth,
      );

      if (healAmount > 0) {
        const newHealth = currentHealth + healAmount;
        this.playerService.updatePlayer(player.id, { health: newHealth });
        healthRestored = healAmount;
        effects.push(`restores ${healAmount} health`);
      } else if (currentHealth >= maxHealth) {
        effects.push('but your health is already full');
      }
    }

    // Mana restoration (if player has mana system)
    if (item.properties?.manaAmount && player.mana !== undefined) {
      const currentMana = player.mana || 0;
      const maxMana = player.maxMana || 100;
      const manaAmount = Math.min(
        item.properties.manaAmount,
        maxMana - currentMana,
      );

      if (manaAmount > 0) {
        const newMana = currentMana + manaAmount;
        this.playerService.updatePlayer(player.id, {
          ...player,
          mana: newMana,
        });
        manaRestored = manaAmount;
        effects.push(`restores ${manaAmount} mana`);
      }
    }

    // Buff effects
    if (item.properties?.buffType) {
      effects.push(`grants ${item.properties.buffType} buff`);
    }

    // Remove or reduce the item from inventory
    const removed = this.playerService.removeFromInventory(player.id, item.id);

    if (!removed) {
      return {
        success: false,
        type: 'error',
        message: `Failed to consume ${item.name}.`,
      };
    }

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.OBJECT_USED,
      {
        playerId: player.id,
        objectId: item.id,
        objectName: item.name,
        objectType: item.objectType,
        consumed: true,
        healthRestored,
        manaRestored,
      },
      player.gameId,
    );

    const effectDescription =
      effects.length > 0 ? ` It ${effects.join(' and ')}.` : '';

    return {
      success: true,
      type: 'action_result',
      message: `You consume the ${item.name}.${effectDescription}`,
      playerStatus: {
        health: player.health,
      },
    };
  }

  /**
   * Handle using/equipping a weapon
   */
  private async handleWeaponUse(
    player: any,
    item: any,
    location: 'inventory' | 'room',
  ): Promise<CommandResult> {
    if (location === 'room') {
      return {
        success: false,
        type: 'action_failure',
        message: `You need to pick up the ${item.name} first before you can use it.`,
      };
    }

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.OBJECT_USED,
      {
        playerId: player.id,
        objectId: item.id,
        objectName: item.name,
        objectType: item.objectType,
        equipped: true,
      },
      player.gameId,
    );

    const damageInfo = item.properties?.damage
      ? ` (${item.properties.damage} damage)`
      : '';

    return {
      success: true,
      type: 'action_result',
      message: `You ready the ${item.name}${damageInfo}. You can now use it in combat.`,
    };
  }

  /**
   * Handle using a key to unlock something
   */
  private async handleKeyUse(
    player: any,
    room: any,
    item: any,
  ): Promise<CommandResult> {
    // Look for locked containers in the room
    const objects = this.roomService.getObjectsInRoom(room.id);
    const lockedContainers = objects.filter(
      (obj) => obj.isContainer && obj.state?.isLocked,
    );

    if (lockedContainers.length === 0) {
      return {
        success: false,
        type: 'action_failure',
        message: `There's nothing here to unlock with the ${item.name}.`,
      };
    }

    // Try to find a matching container (by key ID in properties)
    const targetContainerId = item.properties?.unlocks;
    let unlockedContainer: any = null;

    if (targetContainerId) {
      unlockedContainer = lockedContainers.find(
        (c) => c.id === targetContainerId,
      );
    } else {
      // Generic key - unlock the first locked container
      unlockedContainer = lockedContainers[0];
    }

    if (!unlockedContainer) {
      return {
        success: false,
        type: 'action_failure',
        message: `The ${item.name} doesn't fit any of the locks here.`,
      };
    }

    // Unlock the container
    unlockedContainer.state = {
      ...unlockedContainer.state,
      isLocked: false,
    };
    this.objectService.updateObject(unlockedContainer.id, {
      state: unlockedContainer.state,
    });

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.OBJECT_USED,
      {
        playerId: player.id,
        objectId: item.id,
        objectName: item.name,
        targetId: unlockedContainer.id,
        targetName: unlockedContainer.name,
        action: 'unlock',
      },
      player.gameId,
    );

    // Optionally reduce key durability or consume it
    if (item.properties?.consumeOnUse) {
      this.playerService.removeFromInventory(player.id, item.id);
      return {
        success: true,
        type: 'action_result',
        message: `You use the ${item.name} to unlock the ${unlockedContainer.name}. The key breaks in the process.`,
      };
    }

    if (item.properties?.durability !== undefined) {
      item.properties.durability -= 1;
      if (item.properties.durability <= 0) {
        this.playerService.removeFromInventory(player.id, item.id);
        return {
          success: true,
          type: 'action_result',
          message: `You use the ${item.name} to unlock the ${unlockedContainer.name}. The key breaks from wear.`,
        };
      }
      this.objectService.updateObject(item.id, { properties: item.properties });
    }

    return {
      success: true,
      type: 'action_result',
      message: `You use the ${item.name} to unlock the ${unlockedContainer.name}. You hear a satisfying click.`,
    };
  }

  /**
   * Handle using a tool
   */
  private async handleToolUse(
    player: any,
    item: any,
    location: 'inventory' | 'room',
  ): Promise<CommandResult> {
    if (location === 'room') {
      return {
        success: false,
        type: 'action_failure',
        message: `You need to pick up the ${item.name} first before you can use it.`,
      };
    }

    const toolType = item.properties.toolType;
    let message = '';
    let effectApplied = false;

    // Handle different tool types
    switch (toolType) {
      case 'torch':
      case 'lantern':
        if (!item.state?.isActive) {
          item.state = { ...item.state, isActive: true };
          this.objectService.updateObject(item.id, { state: item.state });
          message = `You light the ${item.name}. It illuminates the area.`;
          effectApplied = true;
        } else {
          message = `The ${item.name} is already lit.`;
        }
        break;

      case 'rope':
        message = `You ready the ${item.name}. You can now climb or tie things.`;
        effectApplied = true;
        break;

      case 'shovel':
        message = `You grip the ${item.name}. You can now dig.`;
        effectApplied = true;
        break;

      case 'lockpick':
        message = `You take out the ${item.name}. You can now attempt to pick locks.`;
        effectApplied = true;
        break;

      default:
        message = `You use the ${item.name}.`;
        effectApplied = true;
    }

    // Reduce durability if applicable
    if (item.properties?.durability !== undefined && effectApplied) {
      item.properties.durability -= 1;

      if (item.properties.durability <= 0) {
        this.playerService.removeFromInventory(player.id, item.id);
        message += ` The ${item.name} breaks from use.`;
      } else {
        this.objectService.updateObject(item.id, {
          properties: item.properties,
        });
      }
    }

    // Emit event
    if (effectApplied) {
      await this.eventEmitter.emit(
        GameEventType.OBJECT_USED,
        {
          playerId: player.id,
          objectId: item.id,
          objectName: item.name,
          toolType,
        },
        player.gameId,
      );
    }

    return {
      success: true,
      type: 'action_result',
      message,
    };
  }
}
