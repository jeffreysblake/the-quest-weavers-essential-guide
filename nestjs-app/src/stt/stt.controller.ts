import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { STTService } from './stt.service';
import { TranscribeDto } from './stt.dto';

@Controller('api/stt')
export class STTController {
  private readonly logger = new Logger(STTController.name);

  constructor(private readonly sttService: STTService) {}

  @Get('status')
  getStatus() {
    const stats = this.sttService.getStats();
    const isAvailable = this.sttService.isAvailable();

    return {
      status: isAvailable ? 'available' : 'unavailable',
      ...stats,
    };
  }

  @Get('languages')
  getSupportedLanguages() {
    return {
      languages: this.sttService.getSupportedLanguages(),
    };
  }

  @Get('models')
  getSupportedModels() {
    return {
      models: this.sttService.getSupportedModels(),
    };
  }

  @Get('providers')
  getProviders() {
    return {
      providers: this.sttService.getProviders(),
    };
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: TranscribeDto,
    @Query('provider') provider?: string,
  ) {
    if (!this.sttService.isAvailable()) {
      throw new HttpException(
        'STT service is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!file) {
      throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);
    }

    // Validate file size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      throw new HttpException(
        'Audio file is too large (max 25MB)',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(
      `Transcribing audio file: ${file.originalname} (${file.size} bytes)`,
    );

    try {
      const result = await this.sttService.transcribe(
        file.buffer,
        {
          language: dto.language,
          model: dto.model,
          wordTimestamps: dto.wordTimestamps,
          temperature: dto.temperature,
        },
        provider,
      );

      return {
        success: true,
        transcription: result.text,
        language: result.language,
        languageProbability: result.languageProbability,
        duration: result.duration,
        segments: result.segments,
      };
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw new HttpException(
        error.message || 'Transcription failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('transcribe-base64')
  async transcribeBase64(
    @Body() body: { audio: string; dto?: TranscribeDto },
    @Query('provider') provider?: string,
  ) {
    if (!this.sttService.isAvailable()) {
      throw new HttpException(
        'STT service is not available',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!body.audio) {
      throw new HttpException(
        'Base64 audio data is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const audioBuffer = Buffer.from(body.audio, 'base64');

      this.logger.log(
        `Transcribing base64 audio (${audioBuffer.length} bytes)`,
      );

      const result = await this.sttService.transcribe(
        audioBuffer,
        {
          language: body.dto?.language,
          model: body.dto?.model,
          wordTimestamps: body.dto?.wordTimestamps,
          temperature: body.dto?.temperature,
        },
        provider,
      );

      return {
        success: true,
        transcription: result.text,
        language: result.language,
        languageProbability: result.languageProbability,
        duration: result.duration,
        segments: result.segments,
      };
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw new HttpException(
        error.message || 'Transcription failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
