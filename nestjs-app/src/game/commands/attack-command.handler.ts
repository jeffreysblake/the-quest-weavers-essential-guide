import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { RoomService } from '../../entity/room.service';
import { EntityService } from '../../entity/entity.service';
import { ObjectService } from '../../entity/object.service';
import { PlayerService } from '../../entity/player.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';
import { EventEmitterService } from '../../events/event-emitter.service';
import { GameEventType } from '../../events/event.interfaces';

@Injectable()
export class AttackCommandHandler implements ICommandHandler {
  constructor(
    private roomService: RoomService,
    private entityService: EntityService,
    private objectService: ObjectService,
    private playerService: PlayerService,
    private validator: CommandValidatorService,
    private roomNavHelper: RoomNavigationHelperService,
    private gameStateService: GameStateService,
    private eventEmitter: EventEmitterService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // Validate target parameter
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Attack what?',
      };
    }

    // VALIDATION: Validate target name
    const nameValidation = this.validator.validateItemName(target);
    if (!nameValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: nameValidation.error || 'Invalid target name',
      };
    }

    // Get all objects/entities in the room to find the target
    const roomObjects = this.roomService.getObjectsInRoom(room.id);
    let targetEntity = roomObjects.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    // If not found in objects, check NPCs in the room
    if (!targetEntity) {
      const gameState = await this.gameStateService.getGameState(player.gameId);
      if (gameState.npcs) {
        const npcsInRoom = Object.values(gameState.npcs).filter((npc: any) => {
          // Only check if NPC is in this room via room.players array
          // Position-based matching is disabled to avoid NPCs appearing in multiple rooms
          if (room.players && room.players.includes(npc.id)) {
            return true;
          }

          return false;
        });
        targetEntity = npcsInRoom.find((npc: any) =>
          npc.name?.toLowerCase().includes(target.toLowerCase()),
        );
      }
    }

    // Validate target exists
    if (!targetEntity) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here to attack.`,
      };
    }

    // Validate target is attackable (has health)
    if (
      targetEntity.health === undefined ||
      targetEntity.maxHealth === undefined
    ) {
      return {
        success: false,
        type: 'action_failure',
        message: `You cannot attack the ${targetEntity.name}.`,
      };
    }

    // VALIDATION: Validate health values
    const healthValidation = this.validator.validateHealthValue(
      targetEntity.health,
    );
    if (!healthValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: `Invalid target health: ${healthValidation.error}`,
      };
    }

    const maxHealthValidation = this.validator.validateHealthValue(
      targetEntity.maxHealth,
    );
    if (!maxHealthValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: `Invalid target max health: ${maxHealthValidation.error}`,
      };
    }

    // Check if target is already dead
    if (targetEntity.health <= 0) {
      return {
        success: false,
        type: 'action_failure',
        message: `The ${targetEntity.name} is already dead.`,
      };
    }

    // Calculate damage based on player stats/level
    // Base damage: 5-15 + (player level * 2)
    // Add some randomness for variety
    const baseDamage = Math.floor(Math.random() * 11) + 5; // 5-15
    const levelBonus = (player.level || 1) * 2;
    const totalDamage = baseDamage + levelBonus;

    // Apply damage to target
    const previousHealth = targetEntity.health;
    targetEntity.health = Math.max(0, targetEntity.health - totalDamage);
    const actualDamage = previousHealth - targetEntity.health;

    // Update the entity with new health
    try {
      await this.entityService.updateEntity(targetEntity.id, {
        health: targetEntity.health,
      });
    } catch (error) {
      console.error(`Failed to update target entity ${targetEntity.id}:`, error);
    }

    // Emit entity updated event
    this.eventEmitter.emit(
      GameEventType.ENTITY_UPDATED,
      {
        entityType: 'object',
        entityId: targetEntity.id,
        entityName: targetEntity.name,
        previousState: { health: previousHealth },
        newState: { health: targetEntity.health },
      },
      player.gameId,
    );

    // Check if target died
    const targetDied = targetEntity.health <= 0;

    let message = `You attack the ${targetEntity.name} for ${actualDamage} damage!`;

    if (targetDied) {
      return await this.handleTargetDefeat(
        player,
        room,
        targetEntity,
        message,
        actualDamage,
      );
    } else {
      return await this.handleTargetSurvive(targetEntity, message, actualDamage, player);
    }
  }

  private async handleTargetDefeat(
    player: any,
    room: any,
    targetEntity: any,
    message: string,
    actualDamage: number,
  ): Promise<CommandResult> {
    // Handle target death
    message += ` The ${targetEntity.name} is defeated!`;

    // Mark entity as dead
    try {
      await this.entityService.updateEntity(targetEntity.id, {
        health: 0,
      });
    } catch (error) {
      console.error(`Failed to update target entity ${targetEntity.id}:`, error);
    }

    // If it's an object with state, mark as destroyed
    if (targetEntity.state !== undefined) {
      try {
        await this.objectService.updateObject(targetEntity.id, {
          state: { ...targetEntity.state, destroyed: true },
        } as any);
      } catch (error) {
        console.error(
          `Failed to update object state for ${targetEntity.id}:`,
          error,
        );
      }
    }

    // Calculate experience reward based on target's level/max health
    const baseXP = Math.floor((targetEntity.maxHealth || 100) / 10);
    const targetLevel = targetEntity.level || 1;
    const experienceGained = baseXP + targetLevel * 10;

    // Give experience to player
    const newExperience = (player.experience || 0) + experienceGained;
    const experienceToLevel = (player.level || 1) * 100;
    let leveledUp = false;
    let newLevel = player.level || 1;

    // Check for level up
    if (newExperience >= experienceToLevel) {
      newLevel += 1;
      leveledUp = true;
      message += ` You gained ${experienceGained} experience and leveled up to level ${newLevel}!`;
    } else {
      message += ` You gained ${experienceGained} experience.`;
    }

    // Update player with experience and potentially new level
    const playerUpdates: any = {
      experience: newExperience,
    };

    if (leveledUp) {
      playerUpdates.level = newLevel;
      // Increase max health on level up
      const newMaxHealth = (player.maxHealth || 100) + 10;
      playerUpdates.maxHealth = newMaxHealth;
      playerUpdates.health = Math.min(player.health + 10, newMaxHealth); // Heal a bit on level up

      // Emit level up event
      this.eventEmitter.emit(
        GameEventType.PLAYER_LEVEL_UP,
        {
          playerId: player.id,
          previousLevel: player.level,
          newLevel: newLevel,
          newMaxHealth: newMaxHealth,
        },
        player.gameId,
      );
    }

    this.playerService.updatePlayer(player.id, playerUpdates);

    // Emit player health/experience changed event
    this.eventEmitter.emit(
      GameEventType.PLAYER_INVENTORY_CHANGED,
      {
        playerId: player.id,
        experienceGained: experienceGained,
        newExperience: newExperience,
      },
      player.gameId,
    );

    // Handle loot drop (if target has inventory)
    // Check both inventory property and direct array
    const lootItems = targetEntity.inventory || [];

    if (lootItems.length > 0) {
      const lootNames: string[] = [];

      // Add loot to room (not automatically to player inventory)
      for (const item of lootItems) {
        let itemId: string | null = null;
        let itemName: string | null = null;

        if (typeof item === 'string') {
          itemId = item;
          const obj = this.objectService.getObject(item);
          itemName = obj?.name || item;
        } else if (item && item.id) {
          itemId = item.id;
          itemName = item.name || 'an item';
        }

        if (itemId) {
          try {
            this.roomService.addObjectToRoom(room.id, itemId);
            if (itemName) {
              lootNames.push(itemName);
            }
          } catch (error) {
            console.error(`Failed to add loot item ${itemId} to room:`, error);
          }
        }
      }

      if (lootNames.length > 0) {
        message += ` The ${targetEntity.name} dropped: ${lootNames.join(', ')}.`;
      }
    }

    return {
      success: true,
      type: 'combat',
      message: message,
      combatResult: {
        damage: actualDamage,
        targetDefeated: true,
        experienceGained: experienceGained,
        leveledUp: leveledUp,
        newLevel: leveledUp ? newLevel : undefined,
      },
    };
  }

  private async handleTargetSurvive(
    targetEntity: any,
    message: string,
    actualDamage: number,
    player?: any,
  ): Promise<CommandResult> {
    // Target survived - update to fighting state
    if (targetEntity.state !== undefined) {
      try {
        await this.objectService.updateObject(targetEntity.id, {
          state: { ...(targetEntity.state || {}), isActive: true },
        } as any);
      } catch (error) {
        console.error(
          `Failed to update object state for ${targetEntity.id}:`,
          error,
        );
      }
    }

    message += ` The ${targetEntity.name} has ${targetEntity.health}/${targetEntity.maxHealth} health remaining.`;

    // NPC COUNTER-ATTACK: If the player is provided and the target can fight back
    if (player && targetEntity.level !== undefined) {
      // Calculate NPC damage based on NPC's level
      const npcBaseDamage = Math.floor(Math.random() * 8) + 3; // 3-10
      const npcLevelBonus = (targetEntity.level || 1) * 1.5;
      const npcDamage = Math.floor(npcBaseDamage + npcLevelBonus);

      // Apply damage to player
      const previousPlayerHealth = player.health || 100;
      const newPlayerHealth = Math.max(0, previousPlayerHealth - npcDamage);

      // Update player health
      try {
        await this.playerService.updatePlayer(player.id, {
          health: newPlayerHealth,
        });

        // Emit player health changed event
        this.eventEmitter.emit(
          GameEventType.ENTITY_UPDATED,
          {
            entityType: 'player',
            entityId: player.id,
            previousState: { health: previousPlayerHealth },
            newState: { health: newPlayerHealth },
          },
          player.gameId,
        );
      } catch (error) {
        console.error(`Failed to update player ${player.id} health:`, error);
      }

      // Add counter-attack to message
      message += `\n\nThe ${targetEntity.name} counter-attacks, dealing ${npcDamage} damage to you!`;
      message += ` You have ${newPlayerHealth}/${player.maxHealth || 100} health remaining.`;

      // Check if player died
      if (newPlayerHealth <= 0) {
        message += `\n\nYou have been defeated by the ${targetEntity.name}!`;
      }

      return {
        success: true,
        type: 'combat',
        message: message,
        combatResult: {
          damage: actualDamage,
          targetDefeated: false,
          targetHealthRemaining: targetEntity.health,
          targetMaxHealth: targetEntity.maxHealth,
          playerDamageTaken: npcDamage,
          playerHealthRemaining: newPlayerHealth,
          playerDefeated: newPlayerHealth <= 0,
        },
      };
    }

    return {
      success: true,
      type: 'combat',
      message: message,
      combatResult: {
        damage: actualDamage,
        targetDefeated: false,
        targetHealthRemaining: targetEntity.health,
        targetMaxHealth: targetEntity.maxHealth,
      },
    };
  }
}
