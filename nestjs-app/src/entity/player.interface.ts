import { IEntity } from './entity.interface';

export interface IPlayer extends IEntity {
  health: number;
  maxHealth?: number;
  inventory: any[];
  level: number;
  experience: number;
  gameId?: string;
  roomId?: string;
  dialogueTreeData?: any; // For NPCs with dialogue trees
  dialogueTreeId?: string; // Alternative: reference to dialogue tree
}
