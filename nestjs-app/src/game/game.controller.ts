import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GameService } from './game.service';

@Controller('api/game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('new')
  async createGame() {
    try {
      const result = await this.gameService.createGame();
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to create game: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':gameId')
  async getGame(@Param('gameId') gameId: string) {
    try {
      const result = await this.gameService.getGame(gameId);
      if (!result) {
        throw new HttpException('Game not found', HttpStatus.NOT_FOUND);
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to get game: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':gameId/command')
  async processCommand(
    @Param('gameId') gameId: string,
    @Body('command') command: string,
  ) {
    if (!command) {
      throw new HttpException('Command is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.gameService.processCommand(gameId, command);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to process command: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':gameId/inventory')
  async getInventory(@Param('gameId') gameId: string) {
    try {
      const result = await this.gameService.getInventory(gameId);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to get inventory: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':gameId/map')
  async getMap(@Param('gameId') gameId: string) {
    try {
      const result = await this.gameService.getMap(gameId);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to get map: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':gameId/save')
  async saveGame(
    @Param('gameId') gameId: string,
    @Body('slotName') slotName: string = 'quicksave',
  ) {
    try {
      const result = await this.gameService.saveGame(gameId, slotName);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to save game: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':gameId/load')
  async loadGame(
    @Param('gameId') gameId: string,
    @Body('slotName') slotName: string = 'quicksave',
  ) {
    try {
      const result = await this.gameService.loadGame(gameId, slotName);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to load game: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
