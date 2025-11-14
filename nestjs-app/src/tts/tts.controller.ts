import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Query,
  HttpException,
  HttpStatus,
  StreamableFile,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { TTSService } from './tts.service';
import { GenerateSpeechDto } from './tts.dto';

@Controller('api/tts')
export class TTSController {
  private readonly logger = new Logger(TTSController.name);

  constructor(private readonly ttsService: TTSService) {}

  @Get('status')
  getStatus() {
    const stats = this.ttsService.getStats();
    const isAvailable = this.ttsService.isAvailable();

    return {
      status: isAvailable ? 'available' : 'unavailable',
      ...stats,
    };
  }

  @Get('voices')
  getVoices() {
    return {
      voices: this.ttsService.getAvailableVoices(),
    };
  }

  @Get('providers')
  getProviders() {
    return {
      providers: this.ttsService.getProviders(),
    };
  }

  @Post('generate')
  async generateSpeech(
    @Body() dto: GenerateSpeechDto,
    @Query('provider') provider?: string,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<StreamableFile> {
    if (!this.ttsService.isAvailable()) {
      throw new HttpException(
        'TTS service is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!dto.text || dto.text.trim().length === 0) {
      throw new HttpException('Text is required', HttpStatus.BAD_REQUEST);
    }

    if (dto.text.length > 5000) {
      throw new HttpException(
        'Text is too long (max 5000 characters)',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`Generating speech for ${dto.text.length} characters`);

    try {
      const result = await this.ttsService.generateSpeech(
        dto.text,
        {
          voice: dto.voice,
          speed: dto.speed,
          format: dto.format,
          language: dto.language,
        },
        provider,
      );

      const stream = Readable.from(result.audioBuffer);

      // Determine content type based on format
      const contentType = this.getContentType(result.format);

      if (res) {
        res.set({
          'Content-Type': contentType,
          'Content-Length': result.audioBuffer.length.toString(),
          'Content-Disposition': `inline; filename="speech.${result.format}"`,
          'Cache-Control': 'public, max-age=3600',
        });
      }

      return new StreamableFile(stream);
    } catch (error) {
      this.logger.error(`Speech generation failed: ${error.message}`);
      throw new HttpException(
        error.message || 'Speech generation failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('synthesize')
  async synthesizeText(
    @Body() dto: GenerateSpeechDto,
    @Query('provider') provider?: string,
  ) {
    if (!this.ttsService.isAvailable()) {
      throw new HttpException(
        'TTS service is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const result = await this.ttsService.generateSpeech(
        dto.text,
        {
          voice: dto.voice,
          speed: dto.speed,
          format: dto.format,
          language: dto.language,
        },
        provider,
      );

      // Return base64 encoded audio
      return {
        audio: result.audioBuffer.toString('base64'),
        format: result.format,
        voice: result.voice,
        size: result.audioBuffer.length,
      };
    } catch (error) {
      this.logger.error(`Speech synthesis failed: ${error.message}`);
      throw new HttpException(
        error.message || 'Speech synthesis failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getContentType(format: string): string {
    const contentTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      opus: 'audio/opus',
    };

    return contentTypes[format] || 'application/octet-stream';
  }
}
