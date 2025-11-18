import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';
import { BaseCommandHandler } from './base-command.handler';

@Injectable()
export class UseCommandHandler extends BaseCommandHandler {
  constructor(
    playerService: PlayerService,
    roomService: RoomService,
    private objectService: ObjectService,
    validator: CommandValidatorService,
    private eventEmitter: EventEmitterService,
  ) {
    super(playerService, roomService, validator);
  }

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // Use base class validation
    const validation = this.validateTarget(target, 'use');
    if (validation) return validation;

    // Parse "use X on Y" syntax
    let itemToUse = target;
    let targetForUse: string | null = null;

    if (target.includes(' on ')) {
      const parts = target.split(' on ');
      itemToUse = parts[0].trim();
      targetForUse = parts[1].trim();
    }

    // Use base class method to find object
    const targetObject = this.findObjectInInventoryOrRoom(player, room, itemToUse);

    if (!targetObject) {
      return this.createNotFoundError(target);
    }

    // Determine item location for later use
    const inventory = this.playerService.getInventory(player.id);
    const itemLocation: 'inventory' | 'room' = inventory.find(
      (obj) => obj.id === targetObject.id,
    )
      ? 'inventory'
      : 'room';

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
        // Check if it's the Cosmic Repair Station
        if (
          targetObject.name &&
          (targetObject.name.toLowerCase().includes('cosmic repair station') ||
            targetObject.name.toLowerCase().includes('repair station'))
        ) {
          return await this.handleCosmicRepairStation(player, targetObject);
        }

        return {
          success: false,
          type: 'action_failure',
          message: `You can't use the ${targetObject.name} like that.`,
        };
    }

    // Check if it's the Cosmic Repair Station (might not be typed as furniture)
    if (
      targetObject.name &&
      (targetObject.name.toLowerCase().includes('cosmic repair station') ||
        targetObject.name.toLowerCase().includes('repair station'))
    ) {
      return await this.handleCosmicRepairStation(player, targetObject);
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

  /**
   * Handle using the Cosmic Repair Station to win the game
   */
  private async handleCosmicRepairStation(
    player: any,
    repairStation: any,
  ): Promise<CommandResult> {
    // Get player's inventory
    const inventory = this.playerService.getInventory(player.id);
    const inventoryNames = inventory.map((item) =>
      item.name ? item.name.toLowerCase() : '',
    );

    // Define required items
    const requiredShards = [
      'vacuum shard',
      'nozzle fragment',
      'canister fragment',
      'filter fragment',
      'handle fragment',
      'power core fragment',
    ];

    const requiredArtifacts = [
      'celestial spray bottle',
      'divine duster',
      'quantum mop',
      'holy scrub brush',
      'eternal sponge',
    ];

    // Count how many shards player has (looking for "shard" or "fragment" in name)
    const shardsFound = inventory.filter((item) => {
      const itemName = item.name ? item.name.toLowerCase() : '';
      return itemName.includes('shard') || itemName.includes('fragment');
    });

    // Count how many artifacts player has
    const artifactsFound = inventory.filter((item) => {
      const itemName = item.name ? item.name.toLowerCase() : '';
      return (
        itemName.includes('celestial spray') ||
        itemName.includes('divine duster') ||
        itemName.includes('quantum mop') ||
        itemName.includes('holy scrub') ||
        itemName.includes('scrub brush') ||
        itemName.includes('eternal sponge')
      );
    });

    const hasAllShards = shardsFound.length >= 5;
    const hasAllArtifacts = artifactsFound.length >= 5;

    // Check if player has all required items
    if (!hasAllShards || !hasAllArtifacts) {
      let message = `You activate the Cosmic Repair Station, but it hums disappointedly. You need:\n\n`;

      if (!hasAllShards) {
        message += `- All 5 Vacuum Shards (you have ${shardsFound.length}/5)\n`;
      } else {
        message += `- All 5 Vacuum Shards ✓\n`;
      }

      if (!hasAllArtifacts) {
        message += `- All 5 Sacred Cleaning Artifacts (you have ${artifactsFound.length}/5)\n`;
      } else {
        message += `- All 5 Sacred Cleaning Artifacts ✓\n`;
      }

      message += `\nFind the missing items and return!`;

      return {
        success: false,
        type: 'action_result',
        message: message,
      };
    }

    // Player has everything - VICTORY!
    const victoryMessage = `
╔═══════════════════════════════════════════════════════════════╗
║                    🌟 VICTORY! 🌟                             ║
╚═══════════════════════════════════════════════════════════════╝

You place all five Vacuum Shards and five Sacred Cleaning Artifacts into the Cosmic Repair Station!

The machine springs to life with a brilliant glow. Energy arcs between the sacred artifacts as the vacuum shards begin to merge together. The room fills with the sound of cosmic humming and the scent of lemon-fresh cleanliness.

With a final burst of light, the VACUUM OF ETERNITY reforms before you - whole, pristine, and radiating with power!

Professor Scrubsworth rushes in: "By the Great Mop! You did it! The fabric of reality stabilizes! The cosmic mess recedes! You've saved the universe from descending into eternal chaos!"

Director Dustbane appears, actually smiling: "Rodriguez... I never doubted you. Well, maybe a little. Okay, a lot. But you proved yourself! You're not just a janitor - you're the COSMIC CUSTODIAN!"

The Vacuum of Eternity hums with approval. Reality itself feels cleaner. The station is safe. The universe is tidy once more.

═══════════════════════════════════════════════════════════════

           🎉 CONGRATULATIONS - GAME COMPLETED! 🎉

              You have saved reality from disorder!
                  The cosmos thanks you, janitor!

═══════════════════════════════════════════════════════════════
`;

    // Emit victory event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'game_completed',
        playerId: player.id,
        completionTime: new Date().toISOString(),
      },
      player.gameId,
    );

    return {
      success: true,
      type: 'victory',
      message: victoryMessage,
    };
  }
}
