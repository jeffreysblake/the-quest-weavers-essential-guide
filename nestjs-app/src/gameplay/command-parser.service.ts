import { Injectable, Logger } from '@nestjs/common';
import { IAction, ActionType } from './action.interfaces';

/**
 * Parsed command structure
 */
export interface IParsedCommand {
  verb: string;
  action: ActionType;
  target?: string;
  tool?: string; // indirect object (use key on door)
  direction?: string;
  raw: string;
}

/**
 * Command parser for natural language input
 * Converts player text commands into structured actions
 */
@Injectable()
export class CommandParserService {
  private readonly logger = new Logger(CommandParserService.name);

  // Verb synonyms mapped to action types
  private readonly verbMappings = new Map<string, ActionType>([
    // Movement
    ['go', ActionType.GO],
    ['move', ActionType.MOVE],
    ['walk', ActionType.GO],
    ['run', ActionType.GO],
    ['travel', ActionType.TRAVEL],
    ['head', ActionType.GO],

    // Take/Drop
    ['take', ActionType.TAKE],
    ['get', ActionType.TAKE],
    ['grab', ActionType.TAKE],
    ['pick', ActionType.TAKE],
    ['pickup', ActionType.TAKE],
    ['drop', ActionType.DROP],
    ['put', ActionType.DROP],
    ['place', ActionType.DROP],

    // Use/Interact
    ['use', ActionType.USE],
    ['activate', ActionType.USE],
    ['apply', ActionType.USE],

    // Examine
    ['examine', ActionType.EXAMINE],
    ['look', ActionType.EXAMINE],
    ['inspect', ActionType.EXAMINE],
    ['check', ActionType.EXAMINE],
    ['read', ActionType.EXAMINE],

    // Open/Close
    ['open', ActionType.OPEN],
    ['close', ActionType.CLOSE],
    ['shut', ActionType.CLOSE],

    // Lock/Unlock
    ['lock', ActionType.LOCK],
    ['unlock', ActionType.UNLOCK],

    // NPC
    ['talk', ActionType.TALK],
    ['speak', ActionType.TALK],
    ['chat', ActionType.TALK],
    ['ask', ActionType.ASK],
    ['give', ActionType.GIVE],
    ['trade', ActionType.TRADE],
    ['attack', ActionType.ATTACK],
    ['fight', ActionType.ATTACK],
    ['hit', ActionType.ATTACK],

    // Inventory
    ['inventory', ActionType.INVENTORY],
    ['inv', ActionType.INVENTORY],
    ['items', ActionType.INVENTORY],
    ['equip', ActionType.EQUIP],
    ['wear', ActionType.EQUIP],
    ['wield', ActionType.EQUIP],
    ['unequip', ActionType.UNEQUIP],
    ['remove', ActionType.UNEQUIP],

    // System
    ['help', ActionType.HELP],
    ['status', ActionType.STATUS],
    ['save', ActionType.SAVE],
    ['load', ActionType.LOAD],
    ['quit', ActionType.QUIT],
    ['exit', ActionType.QUIT],
  ]);

  // Common prepositions to filter
  private readonly prepositions = new Set([
    'to',
    'at',
    'on',
    'in',
    'with',
    'the',
    'a',
    'an',
  ]);

  // Directional keywords
  private readonly directions = new Set([
    'north',
    'south',
    'east',
    'west',
    'northeast',
    'northwest',
    'southeast',
    'southwest',
    'up',
    'down',
    'in',
    'out',
    'n',
    's',
    'e',
    'w',
    'ne',
    'nw',
    'se',
    'sw',
    'u',
    'd',
  ]);

  /**
   * Parse player input into structured command
   */
  parse(input: string): IParsedCommand {
    const raw = input.trim();
    const lowered = raw.toLowerCase();
    const words = this.tokenize(lowered);

    if (words.length === 0) {
      return {
        verb: '',
        action: ActionType.CUSTOM,
        raw,
      };
    }

    // Extract verb (first word)
    const verb = words[0];
    const action = this.verbMappings.get(verb) || ActionType.CUSTOM;

    // Handle single-word commands
    if (words.length === 1) {
      return { verb, action, raw };
    }

    // Check for direction (for movement commands)
    if (this.directions.has(words[1])) {
      return {
        verb,
        action: ActionType.GO,
        direction: this.expandDirection(words[1]),
        raw,
      };
    }

    // Parse multi-word command
    const filteredWords = words
      .slice(1)
      .filter((w) => !this.prepositions.has(w));

    // Check for "use X on Y" pattern
    const onIndex = words.indexOf('on');
    const withIndex = words.indexOf('with');

    if (onIndex > 0 && onIndex < words.length - 1) {
      // "use key on door"
      return {
        verb,
        action,
        tool: words
          .slice(1, onIndex)
          .filter((w) => !this.prepositions.has(w))
          .join(' '),
        target: words
          .slice(onIndex + 1)
          .filter((w) => !this.prepositions.has(w))
          .join(' '),
        raw,
      };
    }

    if (withIndex > 0 && withIndex < words.length - 1) {
      // "unlock door with key"
      return {
        verb,
        action,
        target: words
          .slice(1, withIndex)
          .filter((w) => !this.prepositions.has(w))
          .join(' '),
        tool: words
          .slice(withIndex + 1)
          .filter((w) => !this.prepositions.has(w))
          .join(' '),
        raw,
      };
    }

    // Default: everything after verb is the target
    return {
      verb,
      action,
      target: filteredWords.join(' '),
      raw,
    };
  }

  /**
   * Create structured action from parsed command
   */
  createAction(parsedCommand: IParsedCommand, playerId: string): IAction {
    return {
      type: parsedCommand.action,
      actor: playerId,
      verb: parsedCommand.verb,
      target: parsedCommand.target,
      tool: parsedCommand.tool,
      parameters: {
        direction: parsedCommand.direction,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get suggestions for partial input
   */
  getSuggestions(partialInput: string): string[] {
    const lowered = partialInput.toLowerCase();
    const suggestions: string[] = [];

    // Suggest verbs
    for (const [verb, action] of this.verbMappings.entries()) {
      if (verb.startsWith(lowered)) {
        suggestions.push(verb);
      }
    }

    return suggestions.slice(0, 10); // Limit to 10 suggestions
  }

  /**
   * Get help text for a verb
   */
  getVerbHelp(verb: string): string | undefined {
    const action = this.verbMappings.get(verb.toLowerCase());
    if (!action) return undefined;

    const helpTexts: Record<ActionType, string> = {
      [ActionType.GO]: 'go [direction] - Move in a direction',
      [ActionType.TAKE]: 'take [object] - Pick up an object',
      [ActionType.DROP]: 'drop [object] - Drop an object',
      [ActionType.USE]: 'use [object] (on [target]) - Use an object',
      [ActionType.EXAMINE]: 'examine [object] - Look at something closely',
      [ActionType.OPEN]: 'open [object] - Open something',
      [ActionType.CLOSE]: 'close [object] - Close something',
      [ActionType.UNLOCK]: 'unlock [object] (with [key]) - Unlock something',
      [ActionType.LOCK]: 'lock [object] (with [key]) - Lock something',
      [ActionType.TALK]: 'talk (to [npc]) - Speak with someone',
      [ActionType.GIVE]: 'give [object] to [npc] - Give an item',
      [ActionType.INVENTORY]: 'inventory - Check your items',
      [ActionType.HELP]: 'help - Show this help',
      [ActionType.SAVE]: 'save - Save your progress',
      [ActionType.LOAD]: 'load - Load saved progress',
      [ActionType.QUIT]: 'quit - Exit the game',
      // Add defaults for other types
      [ActionType.MOVE]: 'move - Move around',
      [ActionType.TRAVEL]: 'travel - Travel',
      [ActionType.ASK]: 'ask - Ask a question',
      [ActionType.TRADE]: 'trade - Trade items',
      [ActionType.ATTACK]: 'attack - Attack',
      [ActionType.EQUIP]: 'equip - Equip an item',
      [ActionType.UNEQUIP]: 'unequip - Unequip an item',
      [ActionType.STATUS]: 'status - Check your status',
      [ActionType.LOOK]: 'look - Look around',
      [ActionType.CUSTOM]: 'custom action',
    };

    return helpTexts[action];
  }

  /**
   * Get all available verbs
   */
  getAllVerbs(): string[] {
    return Array.from(this.verbMappings.keys()).sort();
  }

  /**
   * Tokenize input into words
   */
  private tokenize(input: string): string[] {
    return input
      .toLowerCase()
      .replace(/[.,!?;:]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  /**
   * Expand abbreviated directions
   */
  private expandDirection(dir: string): string {
    const expansions: Record<string, string> = {
      n: 'north',
      s: 'south',
      e: 'east',
      w: 'west',
      ne: 'northeast',
      nw: 'northwest',
      se: 'southeast',
      sw: 'southwest',
      u: 'up',
      d: 'down',
    };
    return expansions[dir] || dir;
  }

  /**
   * Validate command syntax
   */
  validateCommand(parsedCommand: IParsedCommand): {
    valid: boolean;
    error?: string;
  } {
    if (!parsedCommand.verb) {
      return { valid: false, error: 'No verb provided' };
    }

    // Validate based on action type
    switch (parsedCommand.action) {
      case ActionType.GO:
      case ActionType.MOVE:
        if (!parsedCommand.direction && !parsedCommand.target) {
          return { valid: false, error: 'Which direction?' };
        }
        break;
      case ActionType.TAKE:
      case ActionType.DROP:
      case ActionType.USE:
      case ActionType.EXAMINE:
        if (!parsedCommand.target) {
          return {
            valid: false,
            error: 'What do you want to ' + parsedCommand.verb + '?',
          };
        }
        break;
    }

    return { valid: true };
  }
}
