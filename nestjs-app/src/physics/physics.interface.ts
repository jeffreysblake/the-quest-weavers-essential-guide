export interface PhysicsBody {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  mass: number;
  shape: 'box' | 'sphere' | 'plane';
}

export interface PhysicsWorld {
  addBody(body: PhysicsBody): void;
  removeBody(id: string): void;
  step(deltaTime: number): void;
  getBody(id: string): PhysicsBody | undefined;
}
