/**
 * Command Parser for Quest Weaver
 * Parses player commands into actionable game events
 * Enhanced with Natural Language Processing capabilities
 */

import { GameSystems } from './game-systems';
import { PlayerInteractionResult } from './player-interaction';
import { NLPProcessor } from './nlp-processor';

export interface ParsedCommand {
  action: 'move' | 'use' | 'open' | 'take' | 'throw' | 'look' | 'inventory' | 'help' | 'examine' | 'break' | 'hold' | 'burn' | 
          'drop' | 'close' | 'go' | 'attack' | 'talk' | 'eat' | 'drink' | 'cut' | 'climb' | 'jump' | 'pull' | 'push' | 
          'turn' | 'wear' | 'remove' | 'get' | 'grab' | 'pick' | 'give' | 'activate' | 'interface' | 'communicate' | 
          'scan' | 'upload' | 'calibrate' | 'combine' | 'attach' | 'light' | 'ignite' | 'offer' | 'trade' | 'read' | 
          'prepare' | 'wave' | 'cast' | 'position' | 'smash' | 'incinerate' | 'consume';
  target?: string;
  item?: string;
  direction?: string;
  room?: string;
  confidence?: number; // How confident we are in this parse
  originalInput?: string; // Store original for debugging
}

export class CommandParser {
  private gameSystems: GameSystems;
  
  constructor(gameSystems: GameSystems) {
    this.gameSystems = gameSystems;
  }
  
  /**
   * Parse a player command into structured data
   * Enhanced with NLP processing for flexible input
   */
  parseCommand(input: string): ParsedCommand | null {
    if (!input || !input.trim()) return null;

    const originalInput = input.trim();
    const normalizedInput = originalInput.toLowerCase();

    // Handle common phrase patterns BEFORE NLP to strip unnecessary words
    let processedInput = normalizedInput;

    if (normalizedInput.startsWith('i want to ')) {
      processedInput = normalizedInput.substring(10); // Remove "i want to "
    } else if (normalizedInput.startsWith('try to ') || normalizedInput.startsWith('attempt to ')) {
      const prefixLen = normalizedInput.startsWith('try to ') ? 7 : 11;
      processedInput = normalizedInput.substring(prefixLen); // Remove "try to " or "attempt to "
    } else if (normalizedInput.startsWith('can i ')) {
      processedInput = normalizedInput.substring(6); // Remove "can i "
    } else if (normalizedInput.startsWith('please ')) {
      processedInput = normalizedInput.substring(7); // Remove "please "
    }

    // First try NLP-enhanced parsing on the processed input
    const nlpResult = this.parseWithNLP(processedInput);
    if (nlpResult) {
      nlpResult.originalInput = originalInput; // Preserve original input
      return nlpResult;
    }

    // Fallback to original parsing for backward compatibility
    const result = this.parseCommandText(processedInput);
    if (result) {
      result.originalInput = originalInput;
      result.confidence = 0.7; // Decent confidence for direct parsing
    }
    return result;
  }

  /**
   * Parse command using NLP processing
   */
  private parseWithNLP(input: string): ParsedCommand | null {
    try {
      // Process input with NLP
      const processedInput = NLPProcessor.processInput(input);
      const parsed = NLPProcessor.parseCommand(processedInput);
      
      if (!parsed.action) return null;
      
      // Convert NLP result to ParsedCommand format
      const command: ParsedCommand = {
        action: parsed.action as any, // Type assertion needed due to expanded action types
        originalInput: input,
        confidence: 0.9 // High confidence for NLP parsing
      };
      
      // Handle objects from NLP parsing
      if (parsed.objects.length > 0) {
        // Look for direction words, but only if they're standalone directions
        // Don't override non-movement actions like "pick up"
        const directions = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
        const direction = parsed.objects.find(obj => directions.includes(obj));
        
        // Only treat as directional movement if:
        // 1. A direction word is found, AND
        // 2. The original action suggests movement (go, move, walk, etc.), OR
        // 3. The input doesn't contain common phrases like "pick up", "clean up", etc.
        const isMovementAction = ['go', 'move', 'walk', 'travel', 'head'].includes(parsed.action || '');
        const containsPickUp = input.toLowerCase().includes('pick up');
        
        if (direction && (isMovementAction || (!containsPickUp && parsed.action === 'go'))) {
          command.direction = direction;
          command.action = 'move'; // Override action for directional movement
        }
        
        // Handle "at" target (for throwing, etc.) in original input
        const originalLower = input.toLowerCase();
        if (originalLower.includes(' at ')) {
          const atIndex = originalLower.indexOf(' at ');
          const beforeAt = originalLower.substring(0, atIndex);
          const afterAt = originalLower.substring(atIndex + 4);
          
          // Extract item before "at"
          const itemMatch = beforeAt.match(/(?:throw|use|give)\s+(.+?)$/);
          if (itemMatch) {
            command.item = itemMatch[1].trim();
          }
          
          // Extract target after "at"
          command.target = afterAt.trim();
        } else if (originalLower.includes(' to ') && parsed.action === 'give') {
          // Handle "give item to person" pattern
          const toIndex = originalLower.indexOf(' to ');
          const beforeTo = originalLower.substring(0, toIndex);
          const afterTo = originalLower.substring(toIndex + 4);
          
          const itemMatch = beforeTo.match(/(?:give|offer)\s+(.+?)$/);
          if (itemMatch) {
            command.item = itemMatch[1].trim();
          }
          command.target = afterTo.trim();
        } else if (originalLower.includes(' with ')) {
          // Handle various "X with Y" patterns
          const withIndex = originalLower.indexOf(' with ');
          const beforeWith = originalLower.substring(0, withIndex);
          const afterWith = originalLower.substring(withIndex + 6);
          
          // For communication/interface commands, the target is what we're interfacing WITH
          if (originalLower.includes('interface with') || originalLower.includes('communicate with') || parsed.action === 'communicate') {
            command.item = afterWith.trim(); // What we're interfacing with
            command.target = afterWith.trim(); // Same as item for interface commands
          } else {
            // Handle "use item with target", "burn item with target", "buy item with currency" patterns
            const itemMatch = beforeWith.match(/(?:use|combine|burn|attack|hit|buy|take|get|purchase|want\s+to\s+burn|want\s+to\s+use|want\s+to\s+attack|want\s+to\s+buy)\s+(.+?)$/) ||
                            beforeWith.match(/(?:burn|use|attack|hit|buy|take|get|purchase)\s+(.+?)$/);
            if (itemMatch) {
              command.item = itemMatch[itemMatch.length - 1].trim(); // Get the last capture group
            }
            command.target = afterWith.trim();
          }
        } else {
          // Handle simple single-object commands or multi-word items
          if (!direction) {
            command.item = parsed.objects.join(' ');
          } else {
            command.item = parsed.objects.filter(obj => obj !== direction).join(' ');
          }
        }
      }
      
      return command;
    } catch (error) {
      // If NLP processing fails, return null to fallback to original parsing
      return null;
    }
  }
  
  private parseCommandText(input: string): ParsedCommand | null {
    const parts = input.split(' ');
    
    // Handle movement commands
    if (input.includes('go') || input.includes('move')) {
      return this.parseMovementCommand(input);
    }
    
    // Handle item-related commands
    if (input.includes('use')) {
      return this.parseUseCommand(input);
    }
    
    if (input.includes('open')) {
      return this.parseOpenCommand(input);
    }
    
    if (input.includes('take') || input.includes('pick up')) {
      return this.parseTakeCommand(input);
    }
    
    if (input.includes('throw')) {
      return this.parseThrowCommand(input);
    }
    
    if (input.includes('examine')) {
      return this.parseExamineCommand(input);
    }
    
    if (input.includes('break')) {
      return this.parseBreakCommand(input);
    }
    
    if (input.includes('hold')) {
      return this.parseHoldCommand(input);
    }
    
    if (input.includes('burn')) {
      return this.parseBurnCommand(input);
    }
    
    // Handle look command
    if (input.includes('look')) {
      return { action: 'look' };
    }
    
    // Handle inventory command
    if (input.includes('inventory') || input.includes('inv')) {
      return { action: 'inventory' };
    }
    
    // Handle help command
    if (input.includes('help')) {
      return { action: 'help' };
    }
    
    return null; // Unknown command
  }
  
  private parseMovementCommand(input: string): ParsedCommand | null {
    const directions = ['north', 'south', 'east', 'west'];
    for (const dir of directions) {
      if (input.includes(dir)) {
        return { action: 'move', direction: dir };
      }
    }
    
    // Handle "go to room" style commands
    const match = input.match(/go to (.+)/);
    if (match) {
      return { action: 'move', room: match[1] };
    }
    
    return null;
  }
  
  private parseUseCommand(input: string): ParsedCommand | null {
    // Look for item name after "use"
    const match = input.match(/use (.+)/);
    if (match) {
      return { action: 'use', item: match[1] };
    }
    
    return null;
  }
  
  private parseOpenCommand(input: string): ParsedCommand | null {
    // Look for item name after "open"
    const match = input.match(/open (.+)/);
    if (match) {
      return { action: 'open', item: match[1] };
    }
    
    return null;
  }
  
  private parseTakeCommand(input: string): ParsedCommand | null {
    // Look for item name after "take" or "pick up"
    const match = input.match(/(take|pick up) (.+)/);
    if (match) {
      return { action: 'take', item: match[2] };
    }
    
    return null;
  }
  
  private parseThrowCommand(input: string): ParsedCommand | null {
    // Look for "throw item at target" pattern
    const atMatch = input.match(/throw (.+) at (.+)/);
    if (atMatch) {
      return { action: 'throw', item: atMatch[1], target: atMatch[2] };
    }
    
    // Look for basic "throw item" pattern
    const basicMatch = input.match(/throw (.+)/);
    if (basicMatch) {
      return { action: 'throw', item: basicMatch[1] };
    }
    
    return null;
  }
  
  private parseExamineCommand(input: string): ParsedCommand | null {
    // Look for item name after "examine"
    const match = input.match(/examine (.+)/);
    if (match) {
      return { action: 'examine', item: match[1] };
    }
    
    return null;
  }
  
  private parseBreakCommand(input: string): ParsedCommand | null {
    // Look for item name after "break"
    const match = input.match(/break (.+)/);
    if (match) {
      return { action: 'break', item: match[1] };
    }
    
    return null;
  }
  
  private parseHoldCommand(input: string): ParsedCommand | null {
    // Look for item name after "hold"
    const match = input.match(/hold (.+)/);
    if (match) {
      return { action: 'hold', item: match[1] };
    }
    
    return null;
  }
  
  private parseBurnCommand(input: string): ParsedCommand | null {
    // Look for item name after "burn"
    const match = input.match(/burn (.+)/);
    if (match) {
      return { action: 'burn', item: match[1] };
    }
    
    return null;
  }
}
