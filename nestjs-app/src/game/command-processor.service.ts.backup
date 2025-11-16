import { Injectable } from '@nestjs/common';
import { PlayerService } from '../entity/player.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { EntityService } from '../entity/entity.service';
import { CommandResult } from './game.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import { DialogueManagerService } from '../dialogue/dialogue-manager.service';
import { GameStateService } from './game-state.service';
import { IDialogueContext } from '../dialogue/dialogue.interfaces';

@Injectable()
export class CommandProcessorService {
  // Validation constants
  private readonly MAX_COMMAND_LENGTH = 1000; // Prevent DOS with massive commands
  private readonly MIN_POSITION = -10000;
  private readonly MAX_POSITION = 10000;
  private readonly MAX_HEALTH = Number.MAX_SAFE_INTEGER;
  private readonly MAX_INVENTORY_QUANTITY = 999999;
  private readonly ALLOWED_COMMAND_PATTERN = /^[a-z0-9\s\-_.,'":!?]+$/i;

  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private objectService: ObjectService,
    private entityService: EntityService,
    private eventEmitter: EventEmitterService,
    private dialogueManager: DialogueManagerService,
    private gameStateService: GameStateService,
  ) {}

  /**
   * Validate command string - sanitize and check for malicious input
   */
  private validateCommandString(command: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    // Check if command exists
    if (!command || typeof command !== 'string') {
      return { valid: false, error: 'Command must be a non-empty string' };
    }

    // Check command length to prevent DOS attacks
    if (command.length > this.MAX_COMMAND_LENGTH) {
      return {
        valid: false,
        error: `Command too long. Maximum length is ${this.MAX_COMMAND_LENGTH} characters`,
      };
    }

    // Sanitize: trim whitespace and remove null bytes
    const sanitized = command.trim().replace(/\0/g, '');

    // Check for empty command after sanitization
    if (sanitized.length === 0) {
      return { valid: false, error: 'Command cannot be empty' };
    }

    // Check for SQL injection patterns
    const sqlInjectionPatterns = [
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
      /--\s*$/,
      /[;]\s*\w/,
      /'.*OR.*'/i,
      /".*OR.*"/i,
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: 'Invalid command: potential injection detected',
        };
      }
    }

    // Check for command injection patterns (shell commands)
    // Note: Relaxed for game commands - only blocking truly dangerous patterns
    const commandInjectionPatterns = [
      /[;&|`$]/,  // Shell metacharacters
      /\.\.\//,   // Path traversal
      /\0/,       // Null byte (already removed but check again)
    ];

    for (const pattern of commandInjectionPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: 'Invalid command: unsafe characters detected',
        };
      }
    }

    // Verify command contains only allowed characters
    if (!this.ALLOWED_COMMAND_PATTERN.test(sanitized)) {
      return {
        valid: false,
        error: 'Invalid command: contains disallowed characters',
      };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate position coordinates - ensure valid numbers, no Infinity/NaN
   */
  private validatePosition(
    x: number,
    y: number,
    z: number,
  ): { valid: boolean; error?: string } {
    // Check if values are numbers
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number'
    ) {
      return { valid: false, error: 'Position coordinates must be numbers' };
    }

    // Check for NaN
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return { valid: false, error: 'Position coordinates cannot be NaN' };
    }

    // Check for Infinity
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { valid: false, error: 'Position coordinates cannot be Infinity' };
    }

    // Check bounds
    if (x < this.MIN_POSITION || x > this.MAX_POSITION) {
      return {
        valid: false,
        error: `X coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    if (y < this.MIN_POSITION || y > this.MAX_POSITION) {
      return {
        valid: false,
        error: `Y coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    if (z < this.MIN_POSITION || z > this.MAX_POSITION) {
      return {
        valid: false,
        error: `Z coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate item/object name - prevent injection and ensure safe string
   */
  private validateItemName(name: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    // Check if name exists
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Item name must be a non-empty string' };
    }

    // Sanitize: trim whitespace
    const sanitized = name.trim();

    // Check for empty name after sanitization
    if (sanitized.length === 0) {
      return { valid: false, error: 'Item name cannot be empty' };
    }

    // Check reasonable length
    if (sanitized.length > 100) {
      return {
        valid: false,
        error: 'Item name too long. Maximum length is 100 characters',
      };
    }

    // Check for script injection patterns
    const scriptPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: 'Invalid item name: potential script injection detected',
        };
      }
    }

    // Only allow alphanumeric, spaces, hyphens, underscores, and basic punctuation
    const allowedPattern = /^[a-z0-9\s\-_',.!?]+$/i;
    if (!allowedPattern.test(sanitized)) {
      return {
        valid: false,
        error: 'Invalid item name: contains disallowed characters',
      };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate health value
   */
  private validateHealthValue(health: number): {
    valid: boolean;
    error?: string;
  } {
    if (typeof health !== 'number') {
      return { valid: false, error: 'Health must be a number' };
    }

    if (Number.isNaN(health)) {
      return { valid: false, error: 'Health cannot be NaN' };
    }

    if (!Number.isFinite(health)) {
      return { valid: false, error: 'Health cannot be Infinity' };
    }

    if (health < 0) {
      return { valid: false, error: 'Health cannot be negative' };
    }

    if (health > this.MAX_HEALTH) {
      return { valid: false, error: `Health cannot exceed ${this.MAX_HEALTH}` };
    }

    return { valid: true };
  }

  /**
   * Validate inventory quantity
   */
  private validateInventoryQuantity(quantity: number): {
    valid: boolean;
    error?: string;
  } {
    if (typeof quantity !== 'number') {
      return { valid: false, error: 'Quantity must be a number' };
    }

    if (Number.isNaN(quantity)) {
      return { valid: false, error: 'Quantity cannot be NaN' };
    }

    if (!Number.isFinite(quantity)) {
      return { valid: false, error: 'Quantity cannot be Infinity' };
    }

    if (quantity < 0) {
      return { valid: false, error: 'Quantity cannot be negative' };
    }

    if (quantity > this.MAX_INVENTORY_QUANTITY) {
      return {
        valid: false,
        error: `Quantity cannot exceed ${this.MAX_INVENTORY_QUANTITY}`,
      };
    }

    // Ensure it's an integer
    if (!Number.isInteger(quantity)) {
      return { valid: false, error: 'Quantity must be an integer' };
    }

    return { valid: true };
  }

  async processCommand(
    command: string,
    playerId: string,
    gameId: string,
  ): Promise<CommandResult> {
    console.log(
      `[DEBUG] processCommand called - command: "${command}", playerId: ${playerId}, gameId: ${gameId}`,
    );

    // VALIDATION: Validate and sanitize command string at entry point
    const commandValidation = this.validateCommandString(command);
    if (!commandValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: commandValidation.error || 'Invalid command',
      };
    }

    // Use sanitized command
    const normalizedCommand = commandValidation.sanitized!.toLowerCase();
    const parts = normalizedCommand.split(' ');
    const verb = parts[0];
    const target = parts.slice(1).join(' ');

    console.log(
      `[DEBUG] Parsed command - verb: "${verb}", target: "${target}"`,
    );

    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      console.log(`[DEBUG] Player not found: ${playerId}`);
      return {
        success: false,
        type: 'error',
        message: 'Player not found',
      };
    }

    console.log(
      `[DEBUG] Player found - position: (${player.position.x}, ${player.position.y}, ${player.position.z})`,
    );

    // Get current room
    const currentRoom = this.getCurrentRoom(player);
    if (!currentRoom) {
      console.log(`[DEBUG] Current room not found for player position`);
      return {
        success: false,
        type: 'error',
        message: 'Current location not found',
      };
    }

    console.log(
      `[DEBUG] Current room: ${currentRoom.name} at (${currentRoom.position.x}, ${currentRoom.position.y}, ${currentRoom.position.z})`,
    );

    try {
      console.log(`[DEBUG] Processing verb: "${verb}"`);
      switch (verb) {
        case 'look':
        case 'l':
          console.log(`[DEBUG] Handling look command`);
          return await this.handleLook(player, currentRoom, target);

        case 'go':
        case 'move':
        case 'north':
        case 'south':
        case 'east':
        case 'west':
        case 'up':
        case 'down':
          return await this.handleMovement(
            player,
            verb === 'go' || verb === 'move' ? target : verb,
          );

        case 'take':
        case 'get':
        case 'pick':
          return await this.handleTake(player, currentRoom, target);

        case 'drop':
        case 'put':
          return await this.handleDrop(player, currentRoom, target);

        case 'use':
          return await this.handleUse(player, currentRoom, target);

        case 'examine':
        case 'inspect':
          return await this.handleExamine(player, currentRoom, target);

        case 'open':
          return await this.handleOpen(player, currentRoom, target);

        case 'close':
          return await this.handleClose(player, currentRoom, target);

        case 'talk':
        case 'speak':
          return await this.handleTalk(player, currentRoom, target);

        case 'attack':
        case 'fight':
          return await this.handleAttack(player, currentRoom, target);

        case 'cast':
          return await this.handleCast(player, currentRoom, target);

        default:
          return {
            success: false,
            type: 'error',
            message: `I don't understand the command "${verb}". Type "help" for available commands.`,
          };
      }
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: `Command processing failed: ${error.message}`,
      };
    }
  }

  private async handleLook(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    console.log(
      `[DEBUG] handleLook called - player: ${player?.id}, room: ${room?.name}, target: "${target}"`,
    );

    if (!target || target === 'around' || target === 'room') {
      // Look at the room
      const objects = this.roomService.getObjectsInRoom(room.id);
      console.log(`[DEBUG] Found ${objects.length} objects in room ${room.id}`);
      const objectNames = objects.map((obj) => obj.name).filter(Boolean);
      console.log(`[DEBUG] Object names: ${objectNames.join(', ')}`);

      const exits = this.getAvailableExits(room);
      console.log(`[DEBUG] Available exits: ${exits.join(', ')}`);

      const result = {
        success: true,
        type: 'room_description',
        roomDescription: room.description,
        items: objectNames,
        exits: exits,
        playerStatus: {
          location: room.name,
        },
      };

      console.log(
        `[DEBUG] Returning look result:`,
        JSON.stringify(result, null, 2),
      );
      return result;
    } else {
      // Look at specific object
      console.log(`[DEBUG] Looking at specific object: ${target}`);
      return await this.handleExamine(player, room, target);
    }
  }

  private async handleMovement(
    player: any,
    direction: string,
  ): Promise<CommandResult> {
    // Validate direction parameter
    if (!direction || typeof direction !== 'string') {
      return {
        success: false,
        type: 'error',
        message: 'Invalid direction specified',
      };
    }

    const normalizedDirection = direction.toLowerCase().trim();
    const validDirections = ['north', 'south', 'east', 'west', 'up', 'down'];

    if (!validDirections.includes(normalizedDirection)) {
      return {
        success: false,
        type: 'error',
        message: `I don't understand the direction "${direction}". Valid directions are: ${validDirections.join(', ')}.`,
      };
    }

    const currentRoom = this.getCurrentRoom(player);
    if (!currentRoom) {
      return {
        success: false,
        type: 'error',
        message: 'Cannot determine current location',
      };
    }

    // Find the adjacent room in the specified direction
    const targetRoom = this.findAdjacentRoom(currentRoom, normalizedDirection);

    if (!targetRoom) {
      return {
        success: false,
        type: 'movement_blocked',
        message: `You cannot go ${normalizedDirection} from here.`,
      };
    }

    // Calculate new position - move player to the center of the target room
    const newPosition = {
      x: targetRoom.position.x + Math.floor(targetRoom.size.width / 2),
      y: targetRoom.position.y + Math.floor(targetRoom.size.height / 2),
      z: targetRoom.position.z,
    };

    // VALIDATION: Validate new position before moving
    const positionValidation = this.validatePosition(
      newPosition.x,
      newPosition.y,
      newPosition.z,
    );
    if (!positionValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: `Cannot move to that location: ${positionValidation.error}`,
      };
    }

    // Move player to the new position
    this.playerService.movePlayer(player.id, newPosition);

    // Get objects in new room
    const objects = this.roomService.getObjectsInRoom(targetRoom.id);
    const objectNames = objects.map((obj) => obj.name).filter(Boolean);

    return {
      success: true,
      type: 'movement_success',
      message: `You move ${normalizedDirection}.`,
      roomDescription: targetRoom.description,
      items: objectNames,
      exits: this.getAvailableExits(targetRoom),
      playerStatus: {
        location: targetRoom.name,
      },
    };
  }

  private async handleTake(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Take what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    if (targetObject.canTake === false) {
      return {
        success: false,
        type: 'action_failure',
        message: `You cannot take the ${targetObject.name}.`,
      };
    }

    // Transaction: Add to player inventory
    const inventoryAdded = this.playerService.addToInventory(
      player.id,
      targetObject.id,
    );

    if (!inventoryAdded) {
      return {
        success: false,
        type: 'error',
        message: `Failed to add ${targetObject.name} to inventory. Your inventory may be full or corrupted.`,
      };
    }

    // Transaction: Remove from room
    const removedFromRoom = this.roomService.removeObjectFromRoom(
      room.id,
      targetObject.id,
    );

    if (!removedFromRoom) {
      // Rollback: Remove from inventory since we couldn't remove from room
      this.playerService.removeFromInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to take ${targetObject.name}. The object could not be removed from the room.`,
      };
    }

    // Both operations succeeded - transaction complete
    return {
      success: true,
      type: 'action_success',
      message: `You take the ${targetObject.name}.`,
    };
  }

  private async handleDrop(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Drop what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    const inventory = this.playerService.getInventory(player.id);
    const targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't have a ${target}.`,
      };
    }

    // Transaction: Remove from inventory
    const removedFromInventory = this.playerService.removeFromInventory(
      player.id,
      targetObject.id,
    );

    if (!removedFromInventory) {
      return {
        success: false,
        type: 'error',
        message: `Failed to remove ${targetObject.name} from inventory. The item may have already been removed.`,
      };
    }

    // VALIDATION: Validate player position before using it
    const positionValidation = this.validatePosition(
      player.position.x,
      player.position.y,
      player.position.z,
    );
    if (!positionValidation.valid) {
      // Rollback: Add back to inventory
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Cannot drop item: ${positionValidation.error}`,
      };
    }

    // Transaction: Update object position to room
    const positionUpdated = this.objectService.updateObjectPosition(
      targetObject.id,
      {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
    );

    if (!positionUpdated) {
      // Rollback: Add back to inventory since position update failed
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to drop ${targetObject.name}. The object position could not be updated.`,
      };
    }

    // Transaction: Add to room
    const addedToRoom = this.roomService.addObjectToRoom(
      room.id,
      targetObject.id,
    );

    if (!addedToRoom) {
      // Rollback: Restore to inventory since we couldn't add to room
      // Note: We don't need to undo the position update as it will be corrected
      // when the item is back in inventory
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to drop ${targetObject.name}. The object could not be placed in the room.`,
      };
    }

    // All operations succeeded - transaction complete
    return {
      success: true,
      type: 'action_success',
      message: `You drop the ${targetObject.name}.`,
    };
  }

  private async handleExamine(
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
    const itemValidation = this.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    // Check inventory first
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name?.toLowerCase().includes(target.toLowerCase()),
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

  private async handleUse(
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
    const itemValidation = this.validateItemName(target);
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
    let unlockedContainer = null;

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

  private async handleOpen(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Open what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    return {
      success: true,
      type: 'action_result',
      message: `You attempt to open the ${target}. It appears to be locked or stuck.`,
    };
  }

  private async handleClose(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Close what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    return {
      success: true,
      type: 'action_result',
      message: `You close the ${target}.`,
    };
  }

  private async handleTalk(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // Validate target was provided
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Talk to whom?',
      };
    }

    // VALIDATION: Validate NPC name
    const nameValidation = this.validateItemName(target);
    if (!nameValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: nameValidation.error || 'Invalid NPC name',
      };
    }

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
        return this.isPositionInRoom(npc.position, room);
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

  private async handleAttack(
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
    const nameValidation = this.validateItemName(target);
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
          if (room.players && room.players.includes(npc.id)) {
            return true;
          }
          if (npc.position) {
            return this.isPositionInRoom(npc.position, room);
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
    const healthValidation = this.validateHealthValue(targetEntity.health);
    if (!healthValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: `Invalid target health: ${healthValidation.error}`,
      };
    }

    const maxHealthValidation = this.validateHealthValue(
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
          console.error(`Failed to update object state for ${targetEntity.id}:`, error);
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
      if (targetEntity.inventory && targetEntity.inventory.length > 0) {
        const lootItems = targetEntity.inventory || [];
        const lootNames = lootItems
          .map((item: any) => {
            if (typeof item === 'string') {
              const obj = this.objectService.getObject(item);
              return obj?.name || item;
            }
            return item.name || 'an item';
          })
          .join(', ');

        message += ` The ${targetEntity.name} dropped: ${lootNames}.`;

        // Add loot to room (not automatically to player inventory)
        for (const item of lootItems) {
          const itemId = typeof item === 'string' ? item : item.id;
          if (itemId) {
            this.roomService.addObjectToRoom(room.id, itemId);
          }
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
    } else {
      // Target survived - update to fighting state
      if (targetEntity.state !== undefined) {
        try {
          await this.objectService.updateObject(targetEntity.id, {
            state: { ...(targetEntity.state || {}), isActive: true },
          } as any);
        } catch (error) {
          console.error(`Failed to update object state for ${targetEntity.id}:`, error);
        }
      }

      message += ` The ${targetEntity.name} has ${targetEntity.health}/${targetEntity.maxHealth} health remaining.`;

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

  private async handleCast(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message:
          'Cast what? Specify a spell name (e.g., "cast fireball at goblin").',
      };
    }

    // VALIDATION: Validate spell command
    const spellValidation = this.validateItemName(target);
    if (!spellValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: spellValidation.error || 'Invalid spell command',
      };
    }

    // Parse spell name and optional target from command
    // Format: "cast <spell> [at/on] <target>" or just "cast <spell>" for area effects
    const parts = target.toLowerCase().split(/\s+(?:at|on)\s+/);
    const spellInput = parts[0].trim();
    const targetInput = parts[1]?.trim();

    // Map common spell names to effect types
    const spellMap: Record<
      string,
      { type: string; intensity: number; area: boolean }
    > = {
      // Fire spells
      fireball: { type: 'fire', intensity: 8, area: false },
      fire: { type: 'fire', intensity: 6, area: false },
      flame: { type: 'fire', intensity: 5, area: false },
      inferno: { type: 'fire', intensity: 10, area: true },
      firewave: { type: 'fire', intensity: 7, area: true },

      // Lightning spells
      lightning: { type: 'lightning', intensity: 8, area: false },
      'lightning bolt': { type: 'lightning', intensity: 8, area: false },
      bolt: { type: 'lightning', intensity: 6, area: false },
      shock: { type: 'lightning', intensity: 5, area: false },
      'chain lightning': { type: 'lightning', intensity: 9, area: true },
      thunderstorm: { type: 'lightning', intensity: 10, area: true },

      // Ice spells
      ice: { type: 'ice', intensity: 6, area: false },
      'ice shard': { type: 'ice', intensity: 7, area: false },
      frost: { type: 'ice', intensity: 5, area: false },
      freeze: { type: 'ice', intensity: 8, area: false },
      blizzard: { type: 'ice', intensity: 9, area: true },
      'ice storm': { type: 'ice', intensity: 10, area: true },

      // Force spells
      force: { type: 'force', intensity: 6, area: false },
      'force push': { type: 'force', intensity: 7, area: false },
      push: { type: 'force', intensity: 5, area: false },
      shockwave: { type: 'force', intensity: 9, area: true },

      // Poison spells
      poison: { type: 'poison', intensity: 6, area: false },
      'poison cloud': { type: 'poison', intensity: 7, area: true },
      toxic: { type: 'poison', intensity: 8, area: false },

      // Acid spells
      acid: { type: 'acid', intensity: 7, area: false },
      'acid splash': { type: 'acid', intensity: 6, area: false },
      corrosion: { type: 'acid', intensity: 8, area: false },

      // Magic spells
      'magic missile': { type: 'magic', intensity: 5, area: false },
      missile: { type: 'magic', intensity: 5, area: false },
      magic: { type: 'magic', intensity: 6, area: false },
    };

    // Find matching spell
    const spell = spellMap[spellInput];
    if (!spell) {
      return {
        success: false,
        type: 'error',
        message: `Unknown spell "${spellInput}". Try: fireball, lightning, ice, force, poison, acid, or magic missile.`,
      };
    }

    // Area effect spells don't need a target
    if (spell.area && !targetInput) {
      // Cast area spell on entire room
      const result = (this.playerService as any).castAreaSpell(
        player.id,
        spell.type,
        room.id,
        spell.intensity,
      );

      if (!result) {
        return {
          success: false,
          type: 'error',
          message: 'Spell casting failed.',
        };
      }

      return {
        success: result.success,
        type: 'magic',
        message: result.message || 'You cast an area spell!',
      };
    }

    // Single-target spells require a target
    if (!targetInput) {
      return {
        success: false,
        type: 'error',
        message: `You need to specify a target for ${spellInput}. Use "cast ${spellInput} at <target>".`,
      };
    }

    // Find target in room
    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find((obj) =>
      obj.name?.toLowerCase().includes(targetInput.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see "${targetInput}" here to cast ${spellInput} at.`,
      };
    }

    // Cast spell on target using PlayerService
    const result = (this.playerService as any).castSpell(
      player.id,
      spell.type,
      targetObject.id,
      spell.intensity,
    );

    if (!result) {
      return {
        success: false,
        type: 'error',
        message: 'Spell casting failed.',
      };
    }

    return {
      success: result.success,
      type: 'magic',
      message: result.message || 'You cast a spell!',
    };
  }

  // Helper methods
  private getCurrentRoom(player: any): any {
    // NULL CHECK: Ensure player has a valid position
    if (!player || !player.position) {
      console.error(
        `[CommandProcessor] getCurrentRoom: Player or player.position is null/undefined`,
      );
      return undefined;
    }

    // NULL CHECK: Validate position has required coordinates
    if (
      typeof player.position.x !== 'number' ||
      typeof player.position.y !== 'number' ||
      typeof player.position.z !== 'number'
    ) {
      console.error(
        `[CommandProcessor] getCurrentRoom: Player position is invalid: ${JSON.stringify(player.position)}`,
      );
      return undefined;
    }

    const rooms = this.roomService.getAllRooms();
    return rooms.find((room) => this.isPositionInRoom(player.position, room));
  }

  private isPositionInRoom(position: any, room: any): boolean {
    // NULL CHECK: Ensure position is valid
    if (
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      typeof position.z !== 'number'
    ) {
      return false;
    }

    // NULL CHECK: Ensure room is valid
    if (!room || !room.position || !room.size) {
      return false;
    }

    // NULL CHECK: Ensure room.position has required coordinates
    if (
      typeof room.position.x !== 'number' ||
      typeof room.position.y !== 'number' ||
      typeof room.position.z !== 'number'
    ) {
      return false;
    }

    // NULL CHECK: Ensure room.size has required dimensions
    if (
      typeof room.size.width !== 'number' ||
      typeof room.size.height !== 'number' ||
      typeof room.size.depth !== 'number'
    ) {
      return false;
    }

    return (
      position.x >= room.position.x &&
      position.x < room.position.x + room.size.width &&
      position.y >= room.position.y &&
      position.y < room.position.y + room.size.height &&
      position.z >= room.position.z &&
      position.z < room.position.z + room.size.depth
    );
  }

  private getAvailableExits(room: any): string[] {
    // Simple exit detection based on room boundaries
    // In a real implementation, this would be more sophisticated
    const exits: string[] = [];

    // Check for adjacent rooms (simplified)
    const rooms = this.roomService.getAllRooms();

    // North
    if (
      rooms.some((r) => r.position.y === room.position.y + room.size.height)
    ) {
      exits.push('north');
    }
    // South
    if (rooms.some((r) => r.position.y + r.size.height === room.position.y)) {
      exits.push('south');
    }
    // East
    if (rooms.some((r) => r.position.x === room.position.x + room.size.width)) {
      exits.push('east');
    }
    // West
    if (rooms.some((r) => r.position.x + r.size.width === room.position.x)) {
      exits.push('west');
    }

    return exits.length > 0 ? exits : ['north', 'east']; // Default exits for demo
  }

  private findAdjacentRoom(currentRoom: any, direction: string): any {
    const rooms = this.roomService.getAllRooms();

    switch (direction) {
      case 'north':
        // Find room directly north (adjacent on the north side)
        return rooms.find(
          (r) =>
            r.position.y === currentRoom.position.y + currentRoom.size.height &&
            r.position.x < currentRoom.position.x + currentRoom.size.width &&
            r.position.x + r.size.width > currentRoom.position.x &&
            r.position.z === currentRoom.position.z,
        );

      case 'south':
        // Find room directly south (adjacent on the south side)
        return rooms.find(
          (r) =>
            r.position.y + r.size.height === currentRoom.position.y &&
            r.position.x < currentRoom.position.x + currentRoom.size.width &&
            r.position.x + r.size.width > currentRoom.position.x &&
            r.position.z === currentRoom.position.z,
        );

      case 'east':
        // Find room directly east (adjacent on the east side)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x + currentRoom.size.width &&
            r.position.y < currentRoom.position.y + currentRoom.size.height &&
            r.position.y + r.size.height > currentRoom.position.y &&
            r.position.z === currentRoom.position.z,
        );

      case 'west':
        // Find room directly west (adjacent on the west side)
        return rooms.find(
          (r) =>
            r.position.x + r.size.width === currentRoom.position.x &&
            r.position.y < currentRoom.position.y + currentRoom.size.height &&
            r.position.y + r.size.height > currentRoom.position.y &&
            r.position.z === currentRoom.position.z,
        );

      case 'up':
        // Find room directly above (same x,y position, higher z)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x &&
            r.position.y === currentRoom.position.y &&
            r.position.z === currentRoom.position.z + 1,
        );

      case 'down':
        // Find room directly below (same x,y position, lower z)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x &&
            r.position.y === currentRoom.position.y &&
            r.position.z === currentRoom.position.z - 1,
        );

      default:
        return null;
    }
  }
}
