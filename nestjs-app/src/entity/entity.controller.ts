import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IBaseEntity, IEntity } from './entity.interface';

@Controller('entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

  @Post()
  create(@Body() entityData: Omit<IEntity, 'id'>) {
    return this.entityService.createEntity(entityData);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entityService.getEntity(id);
  }

  @Get()
  findAll() {
    return this.entityService.getAllEntities();
  }
}
