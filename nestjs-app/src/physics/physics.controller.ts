import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { PhysicsService } from './physics.service';
import { CreatePhysicsBodyDto } from './physics.dto';
import { UpdatePhysicsBodyDto } from './physics.dto';

@Controller('physics')
export class PhysicsController {
  constructor(private readonly physicsService: PhysicsService) {}

  /**
   * Create a new physics entity
   * @param createPhysicsBodyDto
   * @returns Created physics entity
   */
  @Post()
  create(@Body() createPhysicsBodyDto: CreatePhysicsBodyDto) {
    return this.physicsService.createEntity({
      name: `physics-entity-${Date.now()}`,
      position: createPhysicsBodyDto.position,
      rotation: { x: 0, y: 0, z: 0 },
      mass: createPhysicsBodyDto.mass,
      size: { width: 1, height: 1, depth: 1 },
      active: true,
    });
  }

  /**
   * Retrieve all physics entities
   * @returns Array of physics entities
   */
  @Get()
  findAll() {
    return this.physicsService.findAll();
  }

  /**
   * Retrieve specific physics entity by ID
   * @param id
   * @returns Physics entity with matching ID or undefined
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    const entity = this.physicsService.findOne(id);
    if (!entity) {
      return { error: 'Physics entity not found' };
    }
    return entity;
  }

  /**
   * Update existing physics entity
   * @param id
   * @param updatePhysicsBodyDto
   * @returns Updated physics entity or undefined if not found
   */
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePhysicsBodyDto: UpdatePhysicsBodyDto,
  ) {
    const entity = this.physicsService.findOne(id);
    if (!entity) {
      return { error: 'Physics entity not found' };
    }

    return this.physicsService.updateEntity(id, updatePhysicsBodyDto);
  }

  /**
   * Remove physics entity by ID
   * @param id
   * @returns Boolean indicating success or failure
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    const success = this.physicsService.removeEntity(id);
    return {
      success,
      message: success ? 'Physics entity removed' : 'Physics entity not found',
    };
  }
}
