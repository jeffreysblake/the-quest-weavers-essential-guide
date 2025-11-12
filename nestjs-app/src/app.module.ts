import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EntityModule } from './entity/entity.module';
import { RoomModule } from './entity/room.module';
import { PlayerModule } from './entity/player.module';
import { ObjectModule } from './entity/object.module';
import { GameModule } from './game/game.module';
import { DatabaseModule } from './database/database.module';
import { FileSystemModule } from './file-system/file-system.module';
import { CLIModule } from './cli/cli.module';
import { LLMModule } from './llm/llm.module';
import { TTSModule } from './tts/tts.module';
import { STTModule } from './stt/stt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/*'],
      serveRoot: '/',
    }),
    DatabaseModule,
    FileSystemModule,
    EntityModule,
    RoomModule,
    PlayerModule,
    ObjectModule,
    GameModule,
    CLIModule,
    LLMModule,
    TTSModule,
    STTModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}