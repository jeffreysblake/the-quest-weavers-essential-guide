import { IBaseEntity, IEntity } from './entity.interface';

export interface IRoom extends IBaseEntity {
  description?: string;
  longDescription?: string;
  width: number;
  height: number;
  size: {
    width: number;
    height: number;
    depth: number;
  };
  objects: string[]; // Array of object IDs
  players: string[]; // Array of player IDs
  connections?: { [direction: string]: string }; // Room connections
  environment?: {
    lighting?: string;
    sound?: string;
    weather?: string;
  };
  gameId?: string;
}
