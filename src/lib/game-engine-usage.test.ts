import { GameSystems } from './game-systems';

describe('Game Engine Usage Test', () => {
  let gameSystems: GameSystems;
  
  beforeEach(() => {
    // Initialize the complete game systems
    gameSystems = new GameSystems();
  });
  
  it('should demonstrate how user stories would be processed in a real game engine', () => {
    const roomSystem = gameSystems.getRoomSystem();
    const itemSystem = gameSystems.getItemSystem();
    const navigationSystem = gameSystems.getNavigationSystem();
    const interactionSystem = gameSystems.getInteractionSystem();
    
    // Create a complete user story scenario
    const forestRoom = roomSystem.createRoom(
      'forest-1',
      'Enchanted Forest',
      'A magical forest with glowing plants.',
      'The forest is alive with magic. You can see strange creatures moving in the shadows.',
      { x: 0, y: 0 },
      { width: 30, height: 30 }
    );
    
    const treasureChest = itemSystem.createItem(
      'chest-1',
      'Treasure Chest',
      'A wooden chest with a lock',
      'container',
      undefined, // value
      undefined, // weight
      true,      // isPortable
      true,      // isContainer
      [],        // containedItems (empty chest)
      'normal',  // state
      100        // health
    );
    
    const magicPotion = itemSystem.createItem(
      'potion-1',
      'Magic Potion',
      'A glowing potion that grants special abilities'
    );
    
    
    // Add items to room
    roomSystem.addItemToRoom('forest-1', 'chest-1');
    
    // Create player
    const player = navigationSystem.createPlayer(
      'player1',
      'Hero',
      'forest-1'
    );
    
    // Simulate user story execution:
    // 1. Player enters forest room
    expect(player.currentRoomId).toBe('forest-1');
    
    // 2. Player finds treasure chest (add to inventory)
    itemSystem.addItemToInventory('player1', treasureChest);
    const openResult = interactionSystem.openContainer('player1', 'chest-1');
    expect(openResult.success).toBe(true);
    
    // 3. Player uses magic potion (in a real implementation)
    // const useResult = interactionSystem.useItem('player1', 'potion-1');
    // expect(useResult.success).toBe(true);
    
    // 4. Player explores forest
    // In a real game, this would trigger environmental interactions
    
    // Verify all systems work together
    expect(roomSystem.getRoom('forest-1').name).toBe('Enchanted Forest');
    expect(itemSystem.getItem('chest-1').type).toBe('container');
  });
  
  it('should demonstrate complex game state management', () => {
    const roomSystem = gameSystems.getRoomSystem();
    const itemSystem = gameSystems.getItemSystem();
    const navigationSystem = gameSystems.getNavigationSystem();
    
    // Create a multi-room scenario
    const startRoom = roomSystem.createRoom(
      'start-1',
      'Starting Room',
      'A simple room with wooden walls.',
      'The room is plain but has a door leading to somewhere else.',
      { x: 0, y: 0 },
      { width: 20, height: 20 }
    );
    
    const puzzleRoom = roomSystem.createRoom(
      'puzzle-1',
      'Puzzle Room',
      'A mysterious room with strange symbols.',
      'The room is filled with ancient puzzles and riddles.',
      { x: 20, y: 0 },
      { width: 25, height: 25 }
    );
    
    const treasureRoom = roomSystem.createRoom(
      'treasure-1',
      'Treasure Room',
      'A grand room filled with gold.',
      'The room is filled with glittering treasures and precious gems.',
      { x: 45, y: 0 },
      { width: 30, height: 30 }
    );
    
    // Connect rooms
    roomSystem.addConnection('start-1', 'puzzle-1', 'east');
    roomSystem.addConnection('puzzle-1', 'treasure-1', 'east');
    
    // Create items
    const key = itemSystem.createItem(
      'key-1',
      'Golden Key',
      'A key that unlocks magical doors'
    );
    
    const treasure = itemSystem.createItem(
      'treasure-1',
      'Treasure Chest',
      'A chest filled with gold and jewels'
    );
    
    // Add items to rooms
    roomSystem.addItemToRoom('puzzle-1', 'key-1');
    roomSystem.addItemToRoom('treasure-1', 'treasure-1');
    
    // Create player
    const player = navigationSystem.createPlayer(
      'hero1',
      'Hero',
      'start-1'
    );
    
    // Verify game state is properly set up
    expect(player.currentRoomId).toBe('start-1');
    expect(roomSystem.getRoom('puzzle-1')).toBeDefined();
    expect(itemSystem.getItem('key-1').name).toBe('Golden Key');
  });
});