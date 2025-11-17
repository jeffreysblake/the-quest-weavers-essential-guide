import { IObject } from './object.interface';

/**
 * Object Spatial Placement Helper
 * Contains validation logic for placing objects in spatial relationships
 */
export class ObjectPlacementHelper {
  /**
   * Validate if an object can be placed in a specific relationship with a target
   */
  static canPlaceObject(
    object: IObject,
    target: any,
    relationshipType: string,
  ): boolean {
    // Basic validation
    if (object.id === target.id) return false;

    switch (relationshipType) {
      case 'inside':
        if (target.type !== 'object') return false;
        const targetObj = target as IObject;
        if (!targetObj.isContainer || !targetObj.canContain) return false;
        if (targetObj.state?.isLocked) return false;

        // Container must be open to place items inside (unless it starts open)
        if (
          targetObj.state &&
          targetObj.state.isOpen !== undefined &&
          !targetObj.state.isOpen
        ) {
          return false;
        }

        // Check capacity
        const currentCount = targetObj.containedObjects?.length || 0;
        const capacity = targetObj.containerCapacity || 10;
        return currentCount < capacity;

      case 'on_top_of':
        // Can't place on top of very small objects
        return (
          target.type === 'object' &&
          (target as IObject).objectType === 'furniture'
        );

      case 'next_to':
      case 'underneath':
      case 'attached_to':
        return true;

      default:
        return false;
    }
  }

  /**
   * Get human-readable description of placement error
   */
  static getPlacementError(
    object: IObject,
    target: any,
    relationshipType: string,
  ): string {
    if (object.id === target.id) {
      return 'Cannot place an object in relation to itself';
    }

    switch (relationshipType) {
      case 'inside':
        if (target.type !== 'object') {
          return 'Target is not an object';
        }
        const targetObj = target as IObject;
        if (!targetObj.isContainer) {
          return `${targetObj.name} is not a container`;
        }
        if (!targetObj.canContain) {
          return `${targetObj.name} cannot contain objects`;
        }
        if (targetObj.state?.isLocked) {
          return `${targetObj.name} is locked`;
        }
        if (
          targetObj.state &&
          targetObj.state.isOpen !== undefined &&
          !targetObj.state.isOpen
        ) {
          return `${targetObj.name} is closed`;
        }

        const currentCount = targetObj.containedObjects?.length || 0;
        const capacity = targetObj.containerCapacity || 10;
        if (currentCount >= capacity) {
          return `${targetObj.name} is full (${currentCount}/${capacity})`;
        }
        return 'Unknown error';

      case 'on_top_of':
        if (target.type !== 'object') {
          return 'Target is not an object';
        }
        if ((target as IObject).objectType !== 'furniture') {
          return 'Can only place objects on top of furniture';
        }
        return 'Unknown error';

      default:
        return `Invalid relationship type: ${relationshipType}`;
    }
  }

  /**
   * Validate relationship type is supported
   */
  static isValidRelationshipType(relationshipType: string): boolean {
    const validTypes = [
      'inside',
      'on_top_of',
      'next_to',
      'underneath',
      'attached_to',
    ];
    return validTypes.includes(relationshipType);
  }
}
