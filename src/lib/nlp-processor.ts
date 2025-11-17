/**
 * Natural Language Processing utilities for Quest Weaver
 * Handles stemming, stop word removal, synonyms, and command normalization
 */

export class NLPProcessor {
  // Common stop words to filter out
  private static readonly STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'i', 'me', 'my', 'we', 'us', 'you', 'your', 'can', 'could',
    'would', 'should', 'want', 'need', 'please', 'like'
  ]);

  // Synonym mappings for common game actions
  private static readonly SYNONYMS = new Map<string, string[]>([
    ['take', ['get', 'grab', 'pick', 'pickup', 'obtain', 'acquire', 'collect', 'gather', 'buy', 'purchase']],
    ['drop', ['put', 'place', 'set', 'leave', 'discard', 'release']],
    ['use', ['employ', 'utilize', 'apply', 'operate', 'wield']],
    ['activate', ['turn_on', 'enable', 'start', 'trigger', 'power_on']],
    ['open', ['unlock', 'unseal', 'uncover', 'reveal']],
    ['close', ['shut', 'seal', 'lock', 'secure']],
    ['look', ['see', 'view', 'observe', 'watch', 'peek', 'glance', 'stare', 'listen']],
    ['examine', ['inspect', 'study', 'check', 'investigate', 'analyze', 'scrutinize', 'understand', 'search']],
    ['go', ['move', 'walk', 'run', 'travel', 'head', 'proceed', 'advance', 'navigate']],
    ['attack', ['hit', 'strike', 'fight', 'battle', 'assault', 'destroy']],
    ['talk', ['speak', 'say', 'tell', 'chat', 'converse']],
    ['communicate', ['interface', 'contact', 'signal', 'transmit', 'make']],
    ['eat', ['consume', 'devour', 'swallow', 'bite', 'chew']],
    ['drink', ['sip', 'gulp', 'swallow', 'consume']],
    ['throw', ['toss', 'hurl', 'fling', 'launch', 'cast', 'pitch']],
    ['break', ['shatter', 'crack', 'split', 'demolish']],
    ['smash', ['demolish', 'destroy', 'crush']],
    ['incinerate', ['destroy', 'vaporize', 'obliterate']],
    ['consume', ['devour', 'absorb', 'digest']],
    ['burn', ['kindle', 'incinerate']],
    ['light', ['ignite', 'illuminate']],
    ['cut', ['slice', 'chop', 'hack', 'sever', 'cleave']],
    ['climb', ['ascend', 'scale', 'mount', 'clamber']],
    ['jump', ['leap', 'hop', 'bound', 'vault', 'spring']],
    ['pull', ['drag', 'tug', 'yank', 'draw', 'haul']],
    ['push', ['shove', 'press', 'thrust', 'force']],
    ['turn', ['rotate', 'twist', 'spin', 'revolve']],
    ['wear', ['don', 'equip', 'put_on', 'dress']],
    ['remove', ['take_off', 'doff', 'unequip', 'strip']],
    ['give', ['offer', 'present', 'hand', 'bestow', 'grant']],
    ['combine', ['merge', 'mix', 'blend', 'join', 'attach']],
    ['scan', ['sweep', 'search', 'analyze', 'detect']],
    ['upload', ['transfer', 'send', 'transmit', 'load']],
    ['calibrate', ['adjust', 'tune', 'set', 'configure']],
    ['read', ['study', 'peruse', 'review', 'learn']],
    ['prepare', ['ready', 'setup', 'arrange', 'organize']],
    ['wave', ['brandish', 'flourish', 'swing']],
    ['cast', ['perform', 'invoke', 'channel']],
    ['position', ['place', 'locate', 'arrange', 'situate']]
  ]);

  // Simple stemming rules (basic English)
  private static readonly STEMMING_RULES = [
    { suffix: 'ies', replacement: 'y' },    // flies -> fly
    { suffix: 'ied', replacement: 'y' },    // tried -> try  
    { suffix: 'ying', replacement: 'y' },   // trying -> try
    { suffix: 'ing', replacement: '' },     // taking -> tak
    { suffix: 'ly', replacement: '' },      // quickly -> quick
    { suffix: 'ed', replacement: '' },      // opened -> open
    { suffix: 'es', replacement: '' },      // boxes -> box
    { suffix: 's', replacement: '' }        // items -> item
  ];

  /**
   * Process input text with NLP techniques
   */
  static processInput(input: string): string {
    let processed = input.toLowerCase().trim();
    
    // Remove punctuation and normalize spaces
    processed = processed.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ');
    
    // Split into words
    let words = processed.split(' ');
    
    // Remove stop words
    words = words.filter(word => !this.STOP_WORDS.has(word));
    
    // Apply stemming
    words = words.map(word => this.stemWord(word));
    
    // Apply synonym mapping only to the first word (likely the action) and known action synonyms
    words = words.map((word, index) => {
      // Always map synonyms for the first word (likely action)
      if (index === 0) {
        return this.mapSynonym(word);
      }
      
      // Check if this word is a known action synonym before mapping
      const isActionSynonym = Array.from(this.SYNONYMS.values()).some(synonyms => synonyms.includes(word));
      if (isActionSynonym) {
        return this.mapSynonym(word);
      }
      
      // Keep object words unchanged
      return word;
    });
    
    return words.join(' ');
  }

  /**
   * Basic word stemming
   */
  private static stemWord(word: string): string {
    if (word.length <= 3) return word;
    
    for (const rule of this.STEMMING_RULES) {
      if (word.endsWith(rule.suffix)) {
        const stem = word.slice(0, -rule.suffix.length) + rule.replacement;
        // Don't stem if it makes the word too short
        if (stem.length >= 3) {
          return stem;
        }
      }
    }
    
    return word;
  }

  /**
   * Map synonyms to base words
   */
  private static mapSynonym(word: string): string {
    for (const [baseWord, synonyms] of Array.from(this.SYNONYMS.entries())) {
      if (synonyms.includes(word)) {
        return baseWord;
      }
    }
    return word;
  }

  /**
   * Extract action and objects from processed input
   */
  static parseCommand(processedInput: string): { action?: string; objects: string[] } {
    const words = processedInput.split(' ').filter(w => w.length > 0);
    
    if (words.length === 0) {
      return { objects: [] };
    }
    
    // Common action words that should be prioritized
    const actionWords = ['take', 'drop', 'use', 'open', 'close', 'look', 'examine', 'go', 'attack', 'talk', 'eat', 'drink', 'throw', 'break', 'burn', 'cut', 'climb', 'jump', 'pull', 'push', 'turn', 'wear', 'remove', 'light', 'ignite', 'smash', 'incinerate', 'consume', 'communicate', 'interface', 'scan', 'upload', 'calibrate', 'combine', 'attach', 'give', 'offer', 'trade', 'read', 'prepare', 'wave', 'cast', 'position', 'hold', 'get', 'grab', 'pick', 'move', 'activate', 'buy', 'purchase', 'listen', 'search', 'navigate'];
    
    let action: string | undefined;
    let objects: string[] = [];
    
    // Find the first action word
    for (let i = 0; i < words.length; i++) {
      if (actionWords.includes(words[i])) {
        action = words[i];
        // Everything after the action are potential objects
        objects = words.slice(i + 1);
        break;
      }
    }
    
    // If no action found, assume first word is action
    if (!action && words.length > 0) {
      action = words[0];
      objects = words.slice(1);
    }
    
    return { action, objects };
  }

  /**
   * Generate helpful error messages for unrecognized commands
   */
  static generateHelpMessage(input: string): string {
    const processed = this.processInput(input);
    const parsed = this.parseCommand(processed);
    
    if (!parsed.action) {
      return "I'm not sure what you want to do. Try commands like 'take lamp', 'open door', or 'examine room'.";
    }
    
    const suggestions = [];
    
    // Suggest similar actions
    const actionSuggestions = Array.from(this.SYNONYMS.keys()).filter(action => 
      action.includes(parsed.action!) || parsed.action!.includes(action)
    );
    
    if (actionSuggestions.length > 0) {
      suggestions.push(`Did you mean: ${actionSuggestions.slice(0, 3).join(', ')}?`);
    }
    
    if (parsed.objects.length === 0) {
      suggestions.push(`What do you want to ${parsed.action}?`);
    }
    
    return suggestions.length > 0 
      ? suggestions.join(' ') 
      : `I understand you want to ${parsed.action}, but I'm not sure how to do that here.`;
  }

  /**
   * Check if two phrases mean the same thing
   */
  static areSimilar(phrase1: string, phrase2: string): boolean {
    const processed1 = this.processInput(phrase1);
    const processed2 = this.processInput(phrase2);
    
    return processed1 === processed2;
  }
}