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
  canTake?: boolean;
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
