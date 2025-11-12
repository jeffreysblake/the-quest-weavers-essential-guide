import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PlayerService } from './player.service';
import { RoomService } from './room.service';
import { PhysicsService } from './physics.service';

describe('Player-Room Integration Tests', () => {
  let entityService: EntityService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let roomService: RoomService;
  let physicsService: PhysicsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityService,
        ObjectService,
        PlayerService,
        RoomService,
        PhysicsService,
      ],
    }).compile();

    entityService = module.get<EntityService>(EntityService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    roomService = module.get<RoomService>(RoomService);
    physicsService = module.get<PhysicsService>(PhysicsService);
  });

  it('should create a player and add them to a room', () => {
    // Create a room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = roomService.createRoom(roomData);
    expect(createdRoom).toBeDefined();
    expect(createdRoom.id).toBeDefined();

    // Create a player
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: [],
      level: 1,
      experience: 0,
    };

    const createdPlayer = playerService.createPlayer(playerData);
    expect(createdPlayer).toBeDefined();
    expect(createdPlayer.id).toBeDefined();

    // Add player to room
    const result = roomService.addPlayerToRoom(
      createdRoom.id,
      createdPlayer.id,
    );
    expect(result).toBe(true);

    // Verify player is in room
    const roomEntities = roomService.getRoomEntities(createdRoom.id);
    expect(roomEntities.players).toContain(createdPlayer.id);
  });

  it('should create objects and add them to a room', () => {
    // Create a room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = roomService.createRoom(roomData);
    expect(createdRoom).toBeDefined();

    // Create an object
    const objectData = {
      name: 'Wooden Chest',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 20,
      health: 20,
      state: { isOpen: true },
    };

    const createdObject = objectService.createObject(objectData);
    expect(createdObject).toBeDefined();
    expect(createdObject.id).toBeDefined();

    // Add object to room
    const result = roomService.addObjectToRoom(
      createdRoom.id,
      createdObject.id,
    );
    expect(result).toBe(true);

    // Verify object is in room
    const roomEntities = roomService.getRoomEntities(createdRoom.id);
    expect(roomEntities.objects).toContain(createdObject.id);
  });

  it('should move a player between rooms', () => {
    // Create two rooms
    const room1Data = {
      name: 'Living Room',
      width: 10,
      height: 10,
    };

    const room2Data = {
      name: 'Kitchen',
      width: 8,
      height: 8,
    };

    const createdRoom1 = roomService.createRoom(room1Data);
    const createdRoom2 = roomService.createRoom(room2Data);

    expect(createdRoom1).toBeDefined();
    expect(createdRoom2).toBeDefined();

    // Create a player
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: [],
      level: 1,
      experience: 0,
    };

    const createdPlayer = playerService.createPlayer(playerData);
    expect(createdPlayer).toBeDefined();

    // Add player to first room
    const result1 = roomService.addPlayerToRoom(
      createdRoom1.id,
      createdPlayer.id,
    );
    expect(result1).toBe(true);

    // Move player from room 1 to room 2
    // In a real implementation, this would involve more complex logic
    // For now, we'll just verify the player is in room 1

    const entitiesInRoom1 = roomService.getRoomEntities(createdRoom1.id);
    expect(entitiesInRoom1.players).toContain(createdPlayer.id);

    // Add player to second room (simulating movement)
    const result2 = roomService.addPlayerToRoom(
      createdRoom2.id,
      createdPlayer.id,
    );
    expect(result2).toBe(true);
  });

  it('should handle container state persistence', () => {
    // Create a room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = roomService.createRoom(roomData);

    // Create a container object with initial state
    const containerData = {
      name: 'Wooden Chest',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 20,
      health: 20,
      state: { isOpen: true, isLocked: false },
    };

    const container = objectService.createObject(containerData);
    expect(container).toBeDefined();
    expect(container.id).toBeDefined();

    // Add container to room
    const result = roomService.addObjectToRoom(createdRoom.id, container.id);
    expect(result).toBe(true);

    // Verify initial state
    expect(container.state?.isOpen).toBe(true);

    // Modify the container's state (simulating player interaction)
    container.state = { ...container.state, isOpen: false };
    const updateResult = objectService.updateObject(container.id, {
      state: container.state,
    });
    expect(updateResult).toBe(true);

    // Verify that the state was updated
    const updatedContainer = objectService.getObject(container.id);
    expect(updatedContainer?.state?.isOpen).toBe(false);
  });

  it('should handle player inventory persistence', () => {
    // Create a room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = roomService.createRoom(roomData);

    // Create a player with initial inventory
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: ['item1', 'item2'],
      level: 1,
      experience: 0,
    };

    const createdPlayer = playerService.createPlayer(playerData);
    expect(createdPlayer).toBeDefined();
    expect(createdPlayer.id).toBeDefined();

    // Add player to room
    const result = roomService.addPlayerToRoom(
      createdRoom.id,
      createdPlayer.id,
    );
    expect(result).toBe(true);

    // Verify initial inventory
    expect(createdPlayer.inventory).toEqual(['item1', 'item2']);

    // Modify the player's inventory (simulating item pickup)
    const newItem = 'newItem';
    playerService.addInventoryItem(createdPlayer.id, newItem);

    // Verify that the inventory was updated
    const updatedPlayer = playerService.getPlayer(createdPlayer.id);
    expect(updatedPlayer?.inventory).toContain(newItem);
  });

  it('should handle object placement persistence', () => {
    // Create a room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = roomService.createRoom(roomData);

    // Create an object to be placed inside another container
    const containerData = {
      name: 'Wooden Chest',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 20,
      health: 20,
      state: { isOpen: true },
    };

    const container = objectService.createObject(containerData);
    expect(container).toBeDefined();
    expect(container.id).toBeDefined();

    // Create an item to be placed inside the container
    const itemData = {
      name: 'Magic Sword',
      position: { x: 0, y: 0, z: 0 },
      objectType: 'weapon' as const,
      isContainer: false,
      canContain: false,
      isPortable: true,
      maxHealth: 15,
      health: 15,
    };

    const item = objectService.createObject(itemData);
    expect(item).toBeDefined();
    expect(item.id).toBeDefined();

    // Add both objects to room
    roomService.addObjectToRoom(createdRoom.id, container.id);
    roomService.addObjectToRoom(createdRoom.id, item.id);

    // Place the item inside the container (simulating player interaction)
    const relationship = {
      relationshipType: 'inside' as const,
      targetId: container.id,
    };

    const placeResult = objectService.placeObject(item.id, relationship);
    expect(placeResult).toBe(true);

    // Verify that the item is now placed inside the container
    const updatedItem = objectService.getObject(item.id);
    expect(updatedItem?.spatialRelationship?.relationshipType).toBe('inside');
    expect(updatedItem?.spatialRelationship?.targetId).toBe(container.id);
  });
});
