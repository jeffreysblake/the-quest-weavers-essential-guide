import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { ObjectService } from './object.service';
import { IObject } from './object.interface';

@Controller('objects')
export class ObjectController {
  constructor(private readonly objectService: ObjectService) {}

  @Post()
  createObject(@Body() objectData: Omit<IObject, 'id' | 'type'>) {
    return this.objectService.createObject(objectData);
  }

  @Get()
  getAllObjects() {
    return this.objectService.getAllObjects();
  }

  @Get(':id')
  getObject(@Param('id') id: string) {
    return this.objectService.getObject(id);
  }
}
