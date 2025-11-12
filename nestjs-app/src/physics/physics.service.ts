import { Injectable } from '@nestjs/common';
import * as CANNON from 'cannon-es';

export interface PhysicsEntity {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };
  mass: number;
  friction?: number;
  restitution?: number;
  active: boolean;
}

export interface PhysicsSystemStatus {
  entityCount: number;
  isRunning: boolean;
  worldExists: boolean;
  bodyCount: number;
}

@Injectable()
export class PhysicsService {
  private entities: Map<string, PhysicsEntity> = new Map();
  private world: CANNON.World | null = null;
  private bodyMap: Map<string, CANNON.Body> = new Map();
  private entityUpdateTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initializePhysicsWorld();
  }

  /**
   * Initialize physics simulation with Cannon.js
   */
  private initializePhysicsWorld(): void {
    try {
      if (!this.world) {
        // Create a new physics world with proper configuration
        const world = new CANNON.World();
        world.gravity.set(0, -9.82, 0); // Earth-like gravity
        world.broadphase = new CANNON.NaiveBroadphase();
        // TODO: Set solver iterations - API changed in cannon-es
        // world.solver.iterations = 10;
        
        this.world = world;
      }
    } catch (error) {
      console.error('Error initializing physics system:', error);
    }
  }

  /**
   * Physics update logic with Cannon.js - optimized for performance and safety
   */
  private async updatePhysics(): Promise<void> {
    if (!this.world || !this.entityUpdateTimer) return;

    try {
      // Step the physics world at fixed time step to ensure consistency
      this.world.step(1/60); // Fixed time step
      
      // Update entity positions and rotations from Cannon.js physics
      for (const [entityId, entity] of this.entities.entries()) {
        if (!entity.active || !this.bodyMap.has(entityId)) continue;
        
        const body = this.bodyMap.get(entityId);
        if (body) {
          // Update position from Cannon.js physics
          const newPosition = {
            x: body.position.x,
            y: body.position.y,
            z: body.position.z
          };
          
          // Update rotation from Cannon.js physics
          const newRotation = {
            x: body.quaternion.x,
            y: body.quaternion.y,
            z: body.quaternion.z
          };

          const updatedEntity: PhysicsEntity = {
            ...entity,
            position: newPosition,
            rotation: newRotation
          };
          
          // Update entity in map
          this.entities.set(entityId, updatedEntity);
        }
      }
    } catch (error) {
      console.error('Error in physics update:', error);
    }
  }

  /**
   * Add a new physics entity with Cannon.js - properly handles resource allocation
   */
  createEntity(entity: Omit<PhysicsEntity, 'id'>): PhysicsEntity {
    if (!this.world) return entity as PhysicsEntity;
    
    try {
      // Create unique ID for the entity
      const newEntity: PhysicsEntity = {
        ...entity,
        id: `physics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      let shape: CANNON.Shape;
      
      // Create different shapes based on size parameters
      if (newEntity.size.width > 0 && newEntity.size.height > 0) {
        // Create a box shape for entities with defined dimensions
        shape = new CANNON.Box(
          new CANNON.Vec3(
            newEntity.size.width / 2,
            newEntity.size.height / 2, 
            newEntity.size.depth / 2
          )
        );
      } else {
        // Default to sphere if no size specified or invalid dimensions
        shape = new CANNON.Sphere(newEntity.mass);
      }
      
      const body = new CANNON.Body({
        mass: newEntity.mass,
        position: new CANNON.Vec3(
          newEntity.position.x, 
          newEntity.position.y, 
          newEntity.position.z
        ),
        shape: shape
        // TODO: Set friction and restitution via material
        // friction: newEntity.friction || 0.1,
        // restitution: newEntity.restitution || 0.5
      });
      
      // Add body to world for physics simulation
      this.world.addBody(body);
      
      // Store reference for later updates and cleanup
      this.bodyMap.set(newEntity.id, body);
      
      // Store entity in map
      this.entities.set(newEntity.id, newEntity);
      
      return newEntity;
    } catch (error) {
      console.error('Error creating physics entity:', error);
      throw error;
    }
  }

  /**
   * Remove an entity from the physics system with proper resource deallocation
   */
  removeEntity(entityId: string): boolean {
    if (!this.world || !this.bodyMap.has(entityId)) return false;
    
    try {
      // Remove body from world to prevent further simulation updates
      const body = this.bodyMap.get(entityId);
      if (body) {
        this.world.removeBody(body);
      }
      
      // Remove reference for cleanup
      this.bodyMap.delete(entityId);
      
      // Remove entity from map
      return this.entities.delete(entityId);
    } catch (error) {
      console.error('Error removing physics entity:', error);
      throw error;
    }
  }

  /**
   * Get all entities with their current physics state
   */
  findAll(): PhysicsEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Find a specific entity by ID
   */
  findOne(id: string): PhysicsEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Update an existing entity's properties
   */
  updateEntity(entityId: string, updates: Partial<PhysicsEntity>): PhysicsEntity | undefined {
    const existingEntity = this.entities.get(entityId);
    
    if (!existingEntity) {
      return undefined;
    }
    
    // Apply updates to the entity
    const updatedEntity: PhysicsEntity = {
      ...existingEntity,
      ...updates
    };
    
    // If mass, friction or restitution changed, update the physics body properties
    const body = this.bodyMap.get(entityId);
    if (body && (updates.mass || updates.friction || updates.restitution)) {
      try {
        if (updates.mass !== undefined) {
          body.mass = updates.mass;
        }
        if (updates.friction !== undefined) {
          // TODO: Set friction via material: body.material.friction = updates.friction;
          // body.friction = updates.friction;
        }
        if (updates.restitution !== undefined) {
          // TODO: Set restitution via material: body.material.restitution = updates.restitution;
          // body.restitution = updates.restitution;
        }
      } catch (error) {
        console.error('Error updating physics body properties:', error);
      }
    }
    
    this.entities.set(entityId, updatedEntity);
    return updatedEntity;
  }

  /**
   * Start/stop physics simulation with proper timing and resource management
   */
  toggleSimulation(): void {
    if (!this.world) {
      console.warn('Physics world not initialized');
      return;
    }

    if (this.entityUpdateTimer) {
      // Stop the simulation
      clearInterval(this.entityUpdateTimer);
      this.entityUpdateTimer = null;
    } else {
      // Start the simulation at ~60fps for consistent physics updates
      this.entityUpdateTimer = setInterval(() => this.updatePhysics(), 16);
    }
  }

  /**
   * Apply force to an entity - properly handles Cannon.js force application
   */
  applyForce(entityId: string, force: { x: number; y: number; z: number }): void {
    if (!this.world || !this.bodyMap.has(entityId)) return;
    
    try {
      const body = this.bodyMap.get(entityId);
      if (body) {
        // Apply force to the body using Cannon.js
        body.applyForce(
          new CANNON.Vec3(force.x, force.y, force.z),
          new CANNON.Vec3(0, 0, 0)
        );
      }
    } catch (error) {
      console.error('Error applying force:', error);
    }
  }

  /**
   * Reset an entity's physics properties to default state
   */
  resetEntityPhysics(entityId: string): void {
    if (!this.world || !this.bodyMap.has(entityId)) return;
    
    try {
      const body = this.bodyMap.get(entityId);
      if (body) {
        // Reset position and velocity to default state
        body.position.set(0, 10, 0);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        
        // Reset rotation to identity quaternion
        body.quaternion.set(0, 0, 0, 1);
      }
    } catch (error) {
      console.error('Error resetting physics:', error);
    }
  }

  /**
   * Apply gravity to all entities in the system
   */
  applyGravity(): void {
    if (!this.world) return;
    
    try {
      this.world.gravity.set(0, -9.82, 0); // Earth-like gravity
    } catch (error) {
      console.error('Error applying gravity:', error);
    }
  }

  /**
   * Get system status information for debugging and monitoring
   */
  getSystemStatus(): PhysicsSystemStatus {
    return {
      entityCount: this.entities.size,
      isRunning: !!this.entityUpdateTimer,
      worldExists: !!this.world,
      bodyCount: this.bodyMap.size
    };
  }

  /**
   * Cleanup system resources when shutting down
   */
  cleanup(): void {
    // Stop the simulation if running
    if (this.entityUpdateTimer) {
      clearInterval(this.entityUpdateTimer);
      this.entityUpdateTimer = null;
    }
    
    // Clean up physics bodies and world
    try {
      if (this.bodyMap.size > 0 && this.world) {
        this.bodyMap.forEach((body, id) => {
          try {
            this.world?.removeBody(body);
          } catch (error) {
            console.error('Error removing body:', error);
          }
        });
        this.bodyMap.clear();
      }
      
      if (this.world) {
        // Properly dispose of the physics world
        this.world = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Step the physics simulation manually - for testing or controlled updates
   */
  step(deltaTime: number): void {
    if (!this.world || !this.entityUpdateTimer) return;
    
    try {
      this.world.step(1/60); // Fixed time step
    } catch (error) {
      console.error('Error stepping physics simulation:', error);
    }
  }

  /**
   * Get all entities with their current physics state
   */
  getEntities(): PhysicsEntity[] {
    return Array.from(this.entities.values());
  }
}