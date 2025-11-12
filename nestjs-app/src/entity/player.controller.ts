import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';
import { PlayerService } from './player.service';
import { IPlayer } from './player.interface';

@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Post()
  createPlayer(@Body() playerData: Omit<IPlayer, 'id' | 'type'>) {
    return this.playerService.createPlayer(playerData);
  }

  @Get(':id')
  getPlayer(@Param('id') id: string) {
    return this.playerService.getPlayer(id);
  }

  @Patch(':id/inventory')
  addInventoryItem(@Param('id') playerId: string, @Body() item: any) {
    const success = this.playerService.addInventoryItem(playerId, item);
    return { success };
  }
}
