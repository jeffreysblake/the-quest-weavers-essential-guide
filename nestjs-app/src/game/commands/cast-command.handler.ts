import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class CastCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
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
        message:
          'Cast what? Specify a spell name (e.g., "cast fireball at goblin").',
      };
    }

    // VALIDATION: Validate spell command
    const spellValidation = this.validator.validateItemName(target);
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
}
