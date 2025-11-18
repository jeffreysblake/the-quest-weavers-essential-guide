import { IEntity } from './entity.interface';
import { IMaterialProperties, IPhysicsEffect } from './physics.interface';

export interface ISpatialRelationship {
  relationshipType:
    | 'on_top_of'
    | 'inside'
    | 'next_to'
    | 'underneath'
    | 'attached_to';
  targetId: string;
  description?: string;
}

export interface IObject extends IEntity {
  description?: string;
  objectType: 'item' | 'furniture' | 'weapon' | 'consumable' | 'container';
  material?: string;
  weight?: number;
  properties?: {
    weight?: number;
    value?: number;
    durability?: number;
  };
  spatialRelationship?: ISpatialRelationship;
  canContain?: boolean;
  isContainer?: boolean;
  containerCapacity?: number;
  /**
   * Indicates whether the object can be picked up and placed in the player's inventory.
   *
   * **Naming Conventions:**
   * - `isPortable` is the canonical TypeScript property name (camelCase)
   * - JSON files can use `is_portable` (snake_case) which gets auto-converted by the entity converter
   * - Legacy `canTake` property is supported for backward compatibility
   *
   * **Default Value:** true (objects are portable by default unless explicitly set to false)
   *
   * @example
   * // TypeScript usage
   * const sword: IObject = { isPortable: true, ... };
   *
   * // JSON file (auto-converted to isPortable)
   * { "is_portable": true }
   *
   * // Legacy JSON file (auto-converted to isPortable)
   * { "canTake": true }
   */
  isPortable?: boolean;
  containedObjects?: string[];
  state?: {
    isOpen?: boolean;
    isLocked?: boolean;
    isActive?: boolean;
    isOnFire?: boolean;
    frozen?: boolean;
    brittle?: boolean;
    destroyed?: boolean;
  };
  materialProperties?: IMaterialProperties;
  currentEffects?: IPhysicsEffect[];
  health?: number;
  maxHealth?: number;
  gameId?: string;
  roomId?: string;
}
