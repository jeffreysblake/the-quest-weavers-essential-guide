import { Injectable, Logger } from '@nestjs/common';
import { IPlayer } from '../player.interface';
import { IObject } from '../object.interface';
import { IInteractionResult } from '../entity.interface';
import { ObjectService } from '../object.service';

/**
 * Player Interaction Helper
 * Handles all player-object interaction operations including:
 * - Examining objects
 * - Taking/using objects
 * - Opening/closing containers
 */
@Injectable()
export class PlayerInteractionHelper {
  private readonly logger = new Logger(PlayerInteractionHelper.name);

  constructor(private readonly objectService: ObjectService) {}

  /**
   * Examine an object
   */
  examineObject(player: IPlayer, object: IObject): IInteractionResult {
    let description = `You examine the ${object.name}.`;

    if (object.spatialRelationship) {
      const location = this.objectService.getObjectLocation(object.id);
      description += ` ${location}.`;
    }

    if (object.isContainer && object.state?.isOpen) {
      const contents = this.objectService.getObjectsInContainer(object.id);
      if (contents.length > 0) {
        const itemNames = contents.map((item) => item.name).join(', ');
        description += ` Inside you see: ${itemNames}.`;
      } else {
        description += ' It is empty.';
      }
    }

    return {
      success: true,
      message: description,
    };
  }

  /**
   * Take an object
   */
  async takeObject(
    player: IPlayer,
    object: IObject,
    updatePlayerCallback: (player: IPlayer) => Promise<boolean>,
    updateObjectCallback: (objectId: string, updates: Partial<IObject>) => Promise<void>,
  ): Promise<IInteractionResult> {
    if (!object.isPortable) {
      return {
        success: false,
        message: `You cannot take the ${object.name}.`,
      };
    }

    // Remove from current location
    if (object.spatialRelationship?.relationshipType === 'inside') {
      this.objectService.removeObjectFromContainer(
        object.id,
        object.spatialRelationship.targetId,
      );
    }

    // Add to player inventory
    player.inventory.push(object.id);
    object.spatialRelationship = undefined;

    await updatePlayerCallback(player);
    await updateObjectCallback(object.id, object);

    return {
      success: true,
      message: `You take the ${object.name}.`,
      effects: {
        itemTaken: object.id,
      },
    };
  }

  /**
   * Open a container
   */
  async openContainer(
    player: IPlayer,
    object: IObject,
    updateObjectCallback: (objectId: string, updates: Partial<IObject>) => Promise<void>,
  ): Promise<IInteractionResult> {
    if (!object.isContainer) {
      return {
        success: false,
        message: `The ${object.name} cannot be opened.`,
      };
    }

    if (object.state?.isLocked) {
      return {
        success: false,
        message: `The ${object.name} is locked.`,
      };
    }

    if (object.state?.isOpen) {
      return {
        success: false,
        message: `The ${object.name} is already open.`,
      };
    }

    object.state = { ...object.state, isOpen: true };
    await updateObjectCallback(object.id, object);

    return {
      success: true,
      message: `You open the ${object.name}.`,
      effects: {
        containerOpened: object.id,
      },
    };
  }

  /**
   * Close a container
   */
  async closeContainer(
    player: IPlayer,
    object: IObject,
    updateObjectCallback: (objectId: string, updates: Partial<IObject>) => Promise<void>,
  ): Promise<IInteractionResult> {
    if (!object.isContainer) {
      return {
        success: false,
        message: `The ${object.name} cannot be closed.`,
      };
    }

    if (!object.state?.isOpen) {
      return {
        success: false,
        message: `The ${object.name} is already closed.`,
      };
    }

    object.state = { ...object.state, isOpen: false };
    await updateObjectCallback(object.id, object);

    return {
      success: true,
      message: `You close the ${object.name}.`,
      effects: {
        containerClosed: object.id,
      },
    };
  }

  /**
   * Use an object
   */
  async useObject(
    player: IPlayer,
    object: IObject,
    updatePlayerCallback: (player: IPlayer) => Promise<boolean>,
  ): Promise<IInteractionResult> {
    // Basic use implementation - can be extended based on object type
    switch (object.objectType) {
      case 'weapon':
        return {
          success: true,
          message: `You brandish the ${object.name}.`,
        };
      case 'consumable':
        // Remove from inventory if consumed
        const index = player.inventory.indexOf(object.id);
        if (index > -1) {
          player.inventory.splice(index, 1);
          await updatePlayerCallback(player);
        }
        return {
          success: true,
          message: `You use the ${object.name}.`,
          effects: {
            itemConsumed: object.id,
          },
        };
      default:
        return {
          success: true,
          message: `You use the ${object.name}.`,
        };
    }
  }

  /**
   * Give object to player (add to inventory)
   */
  async giveObjectToPlayer(
    player: IPlayer,
    object: IObject,
    addToInventoryCallback: (playerId: string, objectId: string) => Promise<boolean>,
  ): Promise<IInteractionResult> {
    const success = await addToInventoryCallback(player.id, object.id);
    if (success) {
      return {
        success: true,
        message: `${object.name} added to inventory.`,
        effects: {
          itemAdded: object.id,
        },
      };
    } else {
      return {
        success: false,
        message: `Failed to add ${object.name} to inventory.`,
      };
    }
  }
}
