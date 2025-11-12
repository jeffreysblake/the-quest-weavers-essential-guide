export interface IBaseEntity {
  id: string;
  name: string;
  description?: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  type: 'player' | 'object' | 'room';
  gameId?: string;
}

export interface IInteractionResult {
  success: boolean;
  message: string;
  effects?: {
    [key: string]: any;
  };
}

export interface IEntity extends IBaseEntity {
  health?: number;
  inventory?: any[];
  gameId?: string;
  interactWith?(other: IEntity): IInteractionResult;
}
