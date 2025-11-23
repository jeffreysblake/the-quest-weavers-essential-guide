import { ObjectPlacementHelper } from './object-placement.helper';
import { IObject } from './object.interface';

describe('ObjectPlacementHelper', () => {
  // Test Data Helpers
  const createMockObject = (overrides: Partial<IObject> = {}): IObject => ({
    id: 'object-1',
    name: 'Test Object',
    gameId: 'game-123',
    type: 'object',
    position: { x: 5, y: 5, z: 0 },
    objectType: 'item',
    ...overrides,
  });

  const createMockContainer = (
    overrides: Partial<IObject> = {},
  ): IObject => ({
    id: 'container-1',
    name: 'Test Container',
    gameId: 'game-123',
    type: 'object',
    position: { x: 5, y: 5, z: 0 },
    objectType: 'container',
    isContainer: true,
    canContain: true,
    containerCapacity: 10,
    containedObjects: [],
    ...overrides,
  });

  const createMockFurniture = (overrides: Partial<IObject> = {}): IObject => ({
    id: 'furniture-1',
    name: 'Test Furniture',
    gameId: 'game-123',
    type: 'object',
    position: { x: 5, y: 5, z: 0 },
    objectType: 'furniture',
    ...overrides,
  });

  // canPlaceObject - Basic Validation (2 tests)
  describe('canPlaceObject - Basic Validation', () => {
    it('should reject placement of object in relation to itself', () => {
      const object = createMockObject({ id: 'same-1' });
      const target = createMockObject({ id: 'same-1' });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject invalid relationship types', () => {
      const object = createMockObject();
      const target = createMockContainer();

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'invalid_type',
      );

      expect(result).toBe(false);
    });
  });

  // canPlaceObject - Inside Relationship (12 tests)
  describe('canPlaceObject - Inside Relationship', () => {
    it('should allow placement inside valid open container', () => {
      const object = createMockObject();
      const target = createMockContainer({
        state: { isOpen: true },
        containedObjects: [],
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should allow placement inside container without state (implicitly open)', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containedObjects: [],
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should reject placement inside non-object target', () => {
      const object = createMockObject();
      const target = { type: 'room', id: 'room-1' };

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside non-container object', () => {
      const object = createMockObject();
      const target = createMockObject({ isContainer: false });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside object without isContainer property', () => {
      const object = createMockObject();
      const target = createMockObject();

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside container that cannot contain', () => {
      const object = createMockObject();
      const target = createMockContainer({ canContain: false });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside locked container', () => {
      const object = createMockObject();
      const target = createMockContainer({
        state: { isLocked: true, isOpen: false },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside closed container', () => {
      const object = createMockObject();
      const target = createMockContainer({
        state: { isOpen: false },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should reject placement inside container at capacity', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containerCapacity: 3,
        containedObjects: ['item-1', 'item-2', 'item-3'],
        state: { isOpen: true },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });

    it('should allow placement inside container below capacity', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containerCapacity: 5,
        containedObjects: ['item-1', 'item-2'],
        state: { isOpen: true },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should use default capacity of 10 when not specified', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containerCapacity: undefined,
        containedObjects: Array(9).fill('item'),
        state: { isOpen: true },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should reject placement when at default capacity of 10', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containerCapacity: undefined,
        containedObjects: Array(10).fill('item'),
        state: { isOpen: true },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(false);
    });
  });

  // canPlaceObject - On Top Of Relationship (3 tests)
  describe('canPlaceObject - On Top Of Relationship', () => {
    it('should allow placement on top of furniture', () => {
      const object = createMockObject();
      const target = createMockFurniture();

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'on_top_of',
      );

      expect(result).toBe(true);
    });

    it('should reject placement on top of non-furniture object', () => {
      const object = createMockObject();
      const target = createMockObject({ objectType: 'item' });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'on_top_of',
      );

      expect(result).toBe(false);
    });

    it('should reject placement on top of non-object target', () => {
      const object = createMockObject();
      const target = { type: 'room', id: 'room-1' };

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'on_top_of',
      );

      expect(result).toBe(false);
    });
  });

  // canPlaceObject - Always Valid Relationships (1 test)
  describe('canPlaceObject - Always Valid Relationships', () => {
    it('should allow next_to, underneath, and attached_to relationships', () => {
      const object = createMockObject();
      const target = createMockObject({ id: 'target-1' });

      expect(ObjectPlacementHelper.canPlaceObject(object, target, 'next_to')).toBe(true);
      expect(ObjectPlacementHelper.canPlaceObject(object, target, 'underneath')).toBe(true);
      expect(ObjectPlacementHelper.canPlaceObject(object, target, 'attached_to')).toBe(true);
    });
  });

  // getPlacementError - Basic Errors (2 tests)
  describe('getPlacementError - Basic Errors', () => {
    it('should return error for self-reference', () => {
      const object = createMockObject({ id: 'same-1' });
      const target = createMockObject({ id: 'same-1' });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Cannot place an object in relation to itself');
    });

    it('should return error for invalid relationship type', () => {
      const object = createMockObject();
      const target = createMockObject({ id: 'target-1' });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'invalid_type',
      );

      expect(error).toBe('Invalid relationship type: invalid_type');
    });
  });

  // getPlacementError - Inside Relationship Errors (7 tests)
  describe('getPlacementError - Inside Relationship Errors', () => {
    it('should return error when target is not an object', () => {
      const object = createMockObject();
      const target = { type: 'room', id: 'room-1' };

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Target is not an object');
    });

    it('should return error when target is not a container', () => {
      const object = createMockObject();
      const target = createMockObject({
        id: 'target-1',
        name: 'Sword',
        isContainer: false,
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Sword is not a container');
    });

    it('should return error when target cannot contain objects', () => {
      const object = createMockObject();
      const target = createMockContainer({
        name: 'Sealed Box',
        canContain: false,
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Sealed Box cannot contain objects');
    });

    it('should return error when target is locked', () => {
      const object = createMockObject();
      const target = createMockContainer({
        name: 'Locked Chest',
        state: { isLocked: true },
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Locked Chest is locked');
    });

    it('should return error when target is closed', () => {
      const object = createMockObject();
      const target = createMockContainer({
        name: 'Closed Box',
        state: { isOpen: false },
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Closed Box is closed');
    });

    it('should return error when target is at capacity', () => {
      const object = createMockObject();
      const target = createMockContainer({
        name: 'Full Bag',
        containerCapacity: 5,
        containedObjects: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
        state: { isOpen: true },
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Full Bag is full (5/5)');
    });

    it('should return error with default capacity when at limit', () => {
      const object = createMockObject();
      const target = createMockContainer({
        name: 'Backpack',
        containerCapacity: undefined,
        containedObjects: Array(10).fill('item'),
        state: { isOpen: true },
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'inside',
      );

      expect(error).toBe('Backpack is full (10/10)');
    });
  });

  // getPlacementError - On Top Of Relationship Errors (2 tests)
  describe('getPlacementError - On Top Of Relationship Errors', () => {
    it('should return error when target is not an object', () => {
      const object = createMockObject();
      const target = { type: 'room', id: 'room-1' };

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'on_top_of',
      );

      expect(error).toBe('Target is not an object');
    });

    it('should return error when target is not furniture', () => {
      const object = createMockObject();
      const target = createMockObject({
        id: 'target-1',
        objectType: 'item',
      });

      const error = ObjectPlacementHelper.getPlacementError(
        object,
        target,
        'on_top_of',
      );

      expect(error).toBe('Can only place objects on top of furniture');
    });
  });

  // isValidRelationshipType - Validation (3 tests)
  describe('isValidRelationshipType', () => {
    it('should validate all supported relationship types', () => {
      expect(ObjectPlacementHelper.isValidRelationshipType('inside')).toBe(true);
      expect(ObjectPlacementHelper.isValidRelationshipType('on_top_of')).toBe(true);
      expect(ObjectPlacementHelper.isValidRelationshipType('next_to')).toBe(true);
      expect(ObjectPlacementHelper.isValidRelationshipType('underneath')).toBe(true);
      expect(ObjectPlacementHelper.isValidRelationshipType('attached_to')).toBe(true);
    });

    it('should reject invalid relationship type', () => {
      expect(ObjectPlacementHelper.isValidRelationshipType('invalid_type')).toBe(false);
    });

    it('should reject empty string as relationship type', () => {
      expect(ObjectPlacementHelper.isValidRelationshipType('')).toBe(false);
    });
  });

  // Edge Cases and Complex Scenarios (3 tests)
  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle container with state but undefined isOpen', () => {
      const object = createMockObject();
      const target = createMockContainer({
        state: { isLocked: false },
        // isOpen is undefined - should allow placement
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should handle container with empty containedObjects array', () => {
      const object = createMockObject();
      const target = createMockContainer({
        containerCapacity: 1,
        containedObjects: [],
        state: { isOpen: true },
      });

      const result = ObjectPlacementHelper.canPlaceObject(
        object,
        target,
        'inside',
      );

      expect(result).toBe(true);
    });

    it('should handle placement when different objects have same spatial relationship', () => {
      const object1 = createMockObject({ id: 'obj-1' });
      const object2 = createMockObject({ id: 'obj-2' });
      const target = createMockFurniture();

      const result1 = ObjectPlacementHelper.canPlaceObject(
        object1,
        target,
        'on_top_of',
      );
      const result2 = ObjectPlacementHelper.canPlaceObject(
        object2,
        target,
        'on_top_of',
      );

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });
});
