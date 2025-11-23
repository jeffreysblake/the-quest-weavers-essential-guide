import { Test, TestingModule } from '@nestjs/testing';
import { PlayerInteractionHelper } from './player-interaction.helper';
import { ObjectService } from '../object.service';
import { IPlayer } from '../player.interface';
import { IObject } from '../object.interface';

describe('PlayerInteractionHelper', () => {
  let helper: PlayerInteractionHelper;
  let mockObjectService: jest.Mocked<Partial<ObjectService>>;

  const mockPlayer: IPlayer = {
    id: 'player-1',
    gameId: 'game-123',
    name: 'Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: ['sword-1'],
    level: 1,
    experience: 0,
    roomId: 'room-1',
  };

  const createMockObject = (overrides: Partial<IObject> = {}): IObject => ({
    id: 'object-1',
    name: 'Test Object',
    gameId: 'game-123',
    position: { x: 5, y: 5, z: 0 },
    objectType: 'item',
    ...overrides,
  });

  beforeEach(async () => {
    mockObjectService = {
      getObjectLocation: jest.fn(),
      getObjectsInContainer: jest.fn(),
      removeObjectFromContainer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerInteractionHelper,
        { provide: ObjectService, useValue: mockObjectService },
      ],
    }).compile();

    helper = module.get<PlayerInteractionHelper>(PlayerInteractionHelper);
  });

  describe('examineObject', () => {
    it('should examine basic object', () => {
      const object = createMockObject({ name: 'Iron Sword' });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You examine the Iron Sword.');
    });

    it('should include spatial relationship location', () => {
      mockObjectService.getObjectLocation.mockReturnValue('on the table');
      const object = createMockObject({
        name: 'Key',
        spatialRelationship: {
          relationshipType: 'on',
          targetId: 'table-1',
        },
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You examine the Key. on the table.');
      expect(mockObjectService.getObjectLocation).toHaveBeenCalledWith('object-1');
    });

    it('should show contents of open container with items', () => {
      mockObjectService.getObjectsInContainer.mockReturnValue([
        createMockObject({ id: 'item-1', name: 'Gold Coin' }),
        createMockObject({ id: 'item-2', name: 'Silver Ring' }),
      ]);
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
        state: { isOpen: true },
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toContain('You examine the Chest.');
      expect(result.message).toContain('Inside you see: Gold Coin, Silver Ring.');
      expect(mockObjectService.getObjectsInContainer).toHaveBeenCalledWith('object-1');
    });

    it('should show empty for open container without items', () => {
      mockObjectService.getObjectsInContainer.mockReturnValue([]);
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
        state: { isOpen: true },
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toContain('You examine the Chest.');
      expect(result.message).toContain('It is empty.');
    });

    it('should not show contents for closed container', () => {
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
        state: { isOpen: false },
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You examine the Chest.');
      expect(mockObjectService.getObjectsInContainer).not.toHaveBeenCalled();
    });

    it('should not show contents for container without state', () => {
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You examine the Chest.');
      expect(mockObjectService.getObjectsInContainer).not.toHaveBeenCalled();
    });

    it('should handle object with spatial relationship and container', () => {
      mockObjectService.getObjectLocation.mockReturnValue('on the shelf');
      mockObjectService.getObjectsInContainer.mockReturnValue([
        createMockObject({ id: 'item-1', name: 'Potion' }),
      ]);
      const object = createMockObject({
        name: 'Medicine Box',
        isContainer: true,
        state: { isOpen: true },
        spatialRelationship: {
          relationshipType: 'on',
          targetId: 'shelf-1',
        },
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toContain('You examine the Medicine Box.');
      expect(result.message).toContain('on the shelf.');
      expect(result.message).toContain('Inside you see: Potion.');
    });

    it('should handle non-container object', () => {
      const object = createMockObject({
        name: 'Sword',
        isContainer: false,
      });

      const result = helper.examineObject(mockPlayer, object);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You examine the Sword.');
      expect(mockObjectService.getObjectsInContainer).not.toHaveBeenCalled();
    });
  });

  describe('takeObject', () => {
    let updatePlayerCallback: jest.Mock;
    let updateObjectCallback: jest.Mock;

    beforeEach(() => {
      updatePlayerCallback = jest.fn().mockResolvedValue(true);
      updateObjectCallback = jest.fn().mockResolvedValue(undefined);
    });

    it('should successfully take portable object', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Key',
        isPortable: true,
      });

      const result = await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You take the Key.');
      expect(result.effects).toEqual({ itemTaken: 'object-1' });
      expect(player.inventory).toContain('object-1');
    });

    it('should reject taking non-portable object', async () => {
      const player = { ...mockPlayer };
      const object = createMockObject({
        name: 'Statue',
        isPortable: false,
      });

      const result = await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('You cannot take the Statue.');
      expect(updatePlayerCallback).not.toHaveBeenCalled();
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should remove object from container when taking', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Coin',
        isPortable: true,
        spatialRelationship: {
          relationshipType: 'inside',
          targetId: 'chest-1',
        },
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(mockObjectService.removeObjectFromContainer).toHaveBeenCalledWith(
        'object-1',
        'chest-1',
      );
    });

    it('should not remove from container if not inside relationship', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Book',
        isPortable: true,
        spatialRelationship: {
          relationshipType: 'on',
          targetId: 'table-1',
        },
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(mockObjectService.removeObjectFromContainer).not.toHaveBeenCalled();
    });

    it('should clear spatial relationship when taking object', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Ring',
        isPortable: true,
        spatialRelationship: {
          relationshipType: 'on',
          targetId: 'desk-1',
        },
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(object.spatialRelationship).toBeUndefined();
    });

    it('should call update player callback', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Gem',
        isPortable: true,
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(updatePlayerCallback).toHaveBeenCalledWith(player);
    });

    it('should call update object callback with correct parameters', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        id: 'gem-1',
        name: 'Gem',
        isPortable: true,
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(updateObjectCallback).toHaveBeenCalledWith('gem-1', object);
    });

    it('should add object ID to player inventory', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };
      const object = createMockObject({
        id: 'shield-1',
        name: 'Shield',
        isPortable: true,
      });

      await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(player.inventory).toEqual(['sword-1', 'shield-1']);
    });

    it('should handle taking object without spatial relationship', async () => {
      const player = { ...mockPlayer, inventory: [] };
      const object = createMockObject({
        name: 'Scroll',
        isPortable: true,
        spatialRelationship: undefined,
      });

      const result = await helper.takeObject(
        player,
        object,
        updatePlayerCallback,
        updateObjectCallback,
      );

      expect(result.success).toBe(true);
      expect(mockObjectService.removeObjectFromContainer).not.toHaveBeenCalled();
    });
  });

  describe('openContainer', () => {
    let updateObjectCallback: jest.Mock;

    beforeEach(() => {
      updateObjectCallback = jest.fn().mockResolvedValue(undefined);
    });

    it('should successfully open unlocked container', async () => {
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
        state: { isOpen: false, isLocked: false },
      });

      const result = await helper.openContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You open the Chest.');
      expect(result.effects).toEqual({ containerOpened: 'object-1' });
      expect(object.state.isOpen).toBe(true);
    });

    it('should reject opening non-container', async () => {
      const object = createMockObject({
        name: 'Sword',
        isContainer: false,
      });

      const result = await helper.openContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('The Sword cannot be opened.');
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should reject opening locked container', async () => {
      const object = createMockObject({
        name: 'Safe',
        isContainer: true,
        state: { isOpen: false, isLocked: true },
      });

      const result = await helper.openContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('The Safe is locked.');
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should reject opening already open container', async () => {
      const object = createMockObject({
        name: 'Box',
        isContainer: true,
        state: { isOpen: true },
      });

      const result = await helper.openContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('The Box is already open.');
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should call update object callback', async () => {
      const object = createMockObject({
        id: 'chest-1',
        name: 'Chest',
        isContainer: true,
        state: { isOpen: false },
      });

      await helper.openContainer(mockPlayer, object, updateObjectCallback);

      expect(updateObjectCallback).toHaveBeenCalledWith('chest-1', object);
    });

    it('should preserve other state properties when opening', async () => {
      const object = createMockObject({
        name: 'Cabinet',
        isContainer: true,
        state: { isOpen: false, isLocked: false, customProp: 'value' },
      });

      await helper.openContainer(mockPlayer, object, updateObjectCallback);

      expect(object.state).toEqual({
        isOpen: true,
        isLocked: false,
        customProp: 'value',
      });
    });
  });

  describe('closeContainer', () => {
    let updateObjectCallback: jest.Mock;

    beforeEach(() => {
      updateObjectCallback = jest.fn().mockResolvedValue(undefined);
    });

    it('should successfully close open container', async () => {
      const object = createMockObject({
        name: 'Chest',
        isContainer: true,
        state: { isOpen: true },
      });

      const result = await helper.closeContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You close the Chest.');
      expect(result.effects).toEqual({ containerClosed: 'object-1' });
      expect(object.state.isOpen).toBe(false);
    });

    it('should reject closing non-container', async () => {
      const object = createMockObject({
        name: 'Sword',
        isContainer: false,
      });

      const result = await helper.closeContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('The Sword cannot be closed.');
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should reject closing already closed container', async () => {
      const object = createMockObject({
        name: 'Box',
        isContainer: true,
        state: { isOpen: false },
      });

      const result = await helper.closeContainer(
        mockPlayer,
        object,
        updateObjectCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('The Box is already closed.');
      expect(updateObjectCallback).not.toHaveBeenCalled();
    });

    it('should call update object callback', async () => {
      const object = createMockObject({
        id: 'chest-1',
        name: 'Chest',
        isContainer: true,
        state: { isOpen: true },
      });

      await helper.closeContainer(mockPlayer, object, updateObjectCallback);

      expect(updateObjectCallback).toHaveBeenCalledWith('chest-1', object);
    });

    it('should preserve other state properties when closing', async () => {
      const object = createMockObject({
        name: 'Cabinet',
        isContainer: true,
        state: { isOpen: true, isLocked: false, customProp: 'value' },
      });

      await helper.closeContainer(mockPlayer, object, updateObjectCallback);

      expect(object.state).toEqual({
        isOpen: false,
        isLocked: false,
        customProp: 'value',
      });
    });
  });

  describe('useObject', () => {
    let updatePlayerCallback: jest.Mock;

    beforeEach(() => {
      updatePlayerCallback = jest.fn().mockResolvedValue(true);
    });

    it('should use weapon object', async () => {
      const object = createMockObject({
        name: 'Sword',
        objectType: 'weapon',
      });

      const result = await helper.useObject(
        mockPlayer,
        object,
        updatePlayerCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You brandish the Sword.');
      expect(updatePlayerCallback).not.toHaveBeenCalled();
    });

    it('should use consumable and remove from inventory', async () => {
      const player = { ...mockPlayer, inventory: ['potion-1', 'sword-1'] };
      const object = createMockObject({
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
      });

      const result = await helper.useObject(
        player,
        object,
        updatePlayerCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You use the Health Potion.');
      expect(result.effects).toEqual({ itemConsumed: 'potion-1' });
      expect(player.inventory).toEqual(['sword-1']);
      expect(updatePlayerCallback).toHaveBeenCalledWith(player);
    });

    it('should use consumable not in inventory', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };
      const object = createMockObject({
        id: 'potion-1',
        name: 'Health Potion',
        objectType: 'consumable',
      });

      const result = await helper.useObject(
        player,
        object,
        updatePlayerCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You use the Health Potion.');
      expect(result.effects).toEqual({ itemConsumed: 'potion-1' });
      expect(player.inventory).toEqual(['sword-1']);
      expect(updatePlayerCallback).not.toHaveBeenCalled();
    });

    it('should use furniture object type', async () => {
      const object = createMockObject({
        name: 'Chair',
        objectType: 'furniture',
      });

      const result = await helper.useObject(
        mockPlayer,
        object,
        updatePlayerCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('You use the Chair.');
      expect(updatePlayerCallback).not.toHaveBeenCalled();
    });

    it('should handle removing item from inventory', async () => {
      const player = { ...mockPlayer, inventory: ['food-1', 'water-1'] };
      const object = createMockObject({
        id: 'food-1',
        name: 'Bread',
        objectType: 'consumable',
      });

      await helper.useObject(player, object, updatePlayerCallback);

      expect(player.inventory).toEqual(['water-1']);
    });
  });

  describe('giveObjectToPlayer', () => {
    let addToInventoryCallback: jest.Mock;

    beforeEach(() => {
      addToInventoryCallback = jest.fn();
    });

    it('should successfully add object to inventory', async () => {
      addToInventoryCallback.mockResolvedValue(true);
      const object = createMockObject({
        id: 'gem-1',
        name: 'Ruby',
      });

      const result = await helper.giveObjectToPlayer(
        mockPlayer,
        object,
        addToInventoryCallback,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ruby added to inventory.');
      expect(result.effects).toEqual({ itemAdded: 'gem-1' });
      expect(addToInventoryCallback).toHaveBeenCalledWith('player-1', 'gem-1');
    });

    it('should fail when inventory add fails', async () => {
      addToInventoryCallback.mockResolvedValue(false);
      const object = createMockObject({
        id: 'gem-1',
        name: 'Ruby',
      });

      const result = await helper.giveObjectToPlayer(
        mockPlayer,
        object,
        addToInventoryCallback,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to add Ruby to inventory.');
      expect(result.effects).toBeUndefined();
    });

    it('should call callback with correct parameters', async () => {
      addToInventoryCallback.mockResolvedValue(true);
      const player = { ...mockPlayer, id: 'player-123' };
      const object = createMockObject({
        id: 'item-456',
        name: 'Diamond',
      });

      await helper.giveObjectToPlayer(player, object, addToInventoryCallback);

      expect(addToInventoryCallback).toHaveBeenCalledWith('player-123', 'item-456');
    });
  });
});
