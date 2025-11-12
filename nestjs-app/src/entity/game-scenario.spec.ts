import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PlayerService } from './player.service';
import { RoomService } from './room.service';
import { PhysicsService } from './physics.service';

describe('Game Scenario Integration Tests', () => {
  let entityService: EntityService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let roomService: RoomService;

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
  });

  describe('Complete Room Setup and Interactions', () => {
    it('should create a complete room scenario with spatial relationships and interactions', () => {
      // Create a room
      const room = roomService.createRoom({
        name: 'Study Room',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        environment: {
          lighting: 'dim candlelight',
          sound: 'quiet',
        },
      });

      // Create furniture
      const desk = objectService.createObject({
        name: 'wooden desk',
        position: { x: 5, y: 5, z: 0 },
        objectType: 'furniture',
        isPortable: false,
        properties: {
          weight: 100,
        },
      });

      const chest = objectService.createObject({
        name: 'treasure chest',
        position: { x: 2, y: 3, z: 0 },
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 5,
        isPortable: false,
        state: {
          isOpen: true, // Start open so we can place items
          isLocked: false,
        },
      });

      // Create items
      const sword = objectService.createObject({
        name: 'iron sword',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'weapon',
        isPortable: true,
        properties: {
          weight: 5,
          durability: 100,
        },
      });

      const key = objectService.createObject({
        name: 'brass key',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'item',
        isPortable: true,
        properties: {
          weight: 0.1,
        },
      });

      const potion = objectService.createObject({
        name: 'health potion',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'consumable',
        isPortable: true,
        properties: {
          weight: 0.5,
        },
      });

      // Create player
      const player = playerService.createPlayer({
        name: 'Hero',
        position: { x: 1, y: 1, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Add entities to room
      roomService.addObjectToRoom(room.id, desk.id);
      roomService.addObjectToRoom(room.id, chest.id);
      roomService.addObjectToRoom(room.id, sword.id);
      roomService.addObjectToRoom(room.id, key.id);
      roomService.addObjectToRoom(room.id, potion.id);
      roomService.addPlayerToRoom(room.id, player.id);

      // Set up spatial relationships
      objectService.placeObject(sword.id, {
        relationshipType: 'on_top_of',
        targetId: desk.id,
        description: 'The iron sword lies on the wooden desk',
      });

      objectService.placeObject(key.id, {
        relationshipType: 'inside',
        targetId: chest.id,
        description: 'The brass key is hidden inside the treasure chest',
      });

      objectService.placeObject(potion.id, {
        relationshipType: 'next_to',
        targetId: chest.id,
        description: 'The health potion sits next to the treasure chest',
      });

      // Verify spatial relationships
      expect(objectService.getObjectLocation(sword.id)).toBe(
        'The iron sword lies on the wooden desk',
      );
      expect(objectService.getObjectLocation(key.id)).toBe(
        'The brass key is hidden inside the treasure chest',
      );
      expect(objectService.getObjectLocation(potion.id)).toBe(
        'The health potion sits next to the treasure chest',
      );

      // Close the chest first so we can test opening it
      chest.state = { isOpen: false, isLocked: false };
      entityService.updateEntity(chest.id, chest);

      // Test interactions

      // 1. Examine the chest (closed)
      let result = playerService.interactWithObject(
        player.id,
        chest.id,
        'examine',
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('treasure chest');

      // 2. Try to examine contents of closed chest (should not show contents)
      expect(result.message).not.toContain('Inside you see');

      // 3. Open the chest
      result = playerService.interactWithObject(player.id, chest.id, 'open');
      expect(result.success).toBe(true);
      expect(result.message).toBe('You open the treasure chest.');
      expect(result.effects?.containerOpened).toBe(chest.id);

      // 4. Examine the open chest (should show contents)
      result = playerService.interactWithObject(player.id, chest.id, 'examine');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Inside you see: brass key');

      // 5. Take the key from the chest
      result = playerService.interactWithObject(player.id, key.id, 'take');
      expect(result.success).toBe(true);
      expect(result.message).toBe('You take the brass key.');
      expect(result.effects?.itemTaken).toBe(key.id);

      // Verify key is in player inventory
      const updatedPlayer = playerService.getPlayer(player.id);
      expect(updatedPlayer?.inventory).toContain(key.id);

      // Verify key is no longer in chest
      const chestContents = objectService.getObjectsInContainer(chest.id);
      expect(chestContents).toHaveLength(0);

      // 6. Take the sword from the desk
      result = playerService.interactWithObject(player.id, sword.id, 'take');
      expect(result.success).toBe(true);
      expect(result.message).toBe('You take the iron sword.');

      // 7. Try to take the desk (should fail - not portable)
      result = playerService.interactWithObject(player.id, desk.id, 'take');
      expect(result.success).toBe(false);
      expect(result.message).toBe('You cannot take the wooden desk.');

      // 8. Take the potion
      result = playerService.interactWithObject(player.id, potion.id, 'take');
      expect(result.success).toBe(true);

      // 9. Use the potion (consumable)
      result = playerService.interactWithObject(player.id, potion.id, 'use');
      expect(result.success).toBe(true);
      expect(result.message).toBe('You use the health potion.');
      expect(result.effects?.itemConsumed).toBe(potion.id);

      // Verify potion is removed from inventory
      const finalPlayer = playerService.getPlayer(player.id);
      expect(finalPlayer?.inventory).not.toContain(potion.id);
      expect(finalPlayer?.inventory).toContain(key.id);
      expect(finalPlayer?.inventory).toContain(sword.id);

      // 10. Close the chest
      result = playerService.interactWithObject(player.id, chest.id, 'close');
      expect(result.success).toBe(true);
      expect(result.message).toBe('You close the treasure chest.');

      // 11. Try to close it again (should fail)
      result = playerService.interactWithObject(player.id, chest.id, 'close');
      expect(result.success).toBe(false);
      expect(result.message).toBe('The treasure chest is already closed.');
    });

    it('should handle container capacity limits', () => {
      // Create a small chest with capacity 2
      const smallChest = objectService.createObject({
        name: 'small chest',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 2,
        isPortable: false,
        state: { isOpen: true },
      });

      // Create 3 items
      const item1 = objectService.createObject({
        name: 'coin',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'item',
        isPortable: true,
      });

      const item2 = objectService.createObject({
        name: 'gem',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'item',
        isPortable: true,
      });

      const item3 = objectService.createObject({
        name: 'ring',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'item',
        isPortable: true,
      });

      // Place first two items successfully
      expect(
        objectService.placeObject(item1.id, {
          relationshipType: 'inside',
          targetId: smallChest.id,
        }),
      ).toBe(true);

      expect(
        objectService.placeObject(item2.id, {
          relationshipType: 'inside',
          targetId: smallChest.id,
        }),
      ).toBe(true);

      // Third item should fail due to capacity
      expect(
        objectService.placeObject(item3.id, {
          relationshipType: 'inside',
          targetId: smallChest.id,
        }),
      ).toBe(false);

      // Verify only 2 items in chest
      const contents = objectService.getObjectsInContainer(smallChest.id);
      expect(contents).toHaveLength(2);
    });

    it('should handle locked containers', () => {
      const player = playerService.createPlayer({
        name: 'Player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const lockedChest = objectService.createObject({
        name: 'locked chest',
        position: { x: 0, y: 0, z: 0 },
        objectType: 'container',
        isContainer: true,
        canContain: true,
        isPortable: false,
        state: {
          isOpen: false,
          isLocked: true,
        },
      });

      // Try to open locked chest
      const result = playerService.interactWithObject(
        player.id,
        lockedChest.id,
        'open',
      );
      expect(result.success).toBe(false);
      expect(result.message).toBe('The locked chest is locked.');
    });
  });
});
