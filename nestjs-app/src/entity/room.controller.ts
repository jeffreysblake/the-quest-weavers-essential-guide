import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { RoomService } from './room.service';
import { IRoom } from './room.interface';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  createRoom(@Body() roomData: Omit<IRoom, 'id' | 'type'>) {
    return this.roomService.createRoom(roomData);
  }

  @Get(':id')
  getRoom(@Param('id') id: string) {
    return this.roomService.getRoom(id);
  }

  @Get()
  getAllRooms() {
    return this.roomService.getAllRooms();
  }

  @Patch(':id/players/:playerId')
  addPlayerToRoom(
    @Param('id') roomId: string,
    @Param('playerId') playerId: string,
  ) {
    const success = this.roomService.addPlayerToRoom(roomId, playerId);
    return { success };
  }

  @Patch(':id/objects/:objectId')
  addObjectToRoom(
    @Param('id') roomId: string,
    @Param('objectId') objectId: string,
  ) {
    const success = this.roomService.addObjectToRoom(roomId, objectId);
    return { success };
  }
}
