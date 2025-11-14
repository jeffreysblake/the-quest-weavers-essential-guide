export type MaterialType =
  | 'wood'
  | 'metal'
  | 'stone'
  | 'water'
  | 'cloth'
  | 'glass'
  | 'leather'
  | 'paper'
  | 'organic'
  | 'crystal'
  | 'ice'
  | 'gas';

export type EffectType =
  | 'fire'
  | 'lightning'
  | 'ice'
  | 'force'
  | 'poison'
  | 'acid'
  | 'magic';

export interface IMaterialProperties {
  material: MaterialType;
  density?: number; // affects mass and durability
  conductivity?: number; // 0-10, how well it conducts electricity/heat
  flammability?: number; // 0-10, how easily it catches fire
  brittleness?: number; // 0-10, how easily it breaks
  resistances?: Partial<Record<EffectType, number>>; // 0-10, resistance to effects
  properties?: {
    waterproof?: boolean;
    magnetic?: boolean;
    explosive?: boolean;
    transparent?: boolean;
    porous?: boolean;
  };
}

export interface IPhysicsEffect {
  type: EffectType;
  intensity: number; // 1-10
  duration?: number; // milliseconds, undefined = instant
  sourceId?: string; // what caused this effect
  spreadRadius?: number; // how far the effect spreads
  description: string;
}

export interface IPhysicsResult {
  success: boolean;
  message: string;
  effects?: IPhysicsEffect[];
  chainReactions?: {
    targetId: string;
    effect: IPhysicsEffect;
  }[];
  objectsAffected?: {
    objectId: string;
    damage?: number;
    newState?: any;
    destroyed?: boolean;
  }[];
}

export interface IPhysicsObject {
  id: string;
  materialProperties: IMaterialProperties;
  currentEffects?: IPhysicsEffect[];
  health?: number;
  maxHealth?: number;
}
