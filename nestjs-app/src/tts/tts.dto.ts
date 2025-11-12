import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';

export enum AudioFormat {
  MP3 = 'mp3',
  WAV = 'wav',
  OPUS = 'opus',
}

export class GenerateSpeechDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  voice?: string;

  @IsNumber()
  @Min(0.25)
  @Max(4.0)
  @IsOptional()
  speed?: number;

  @IsEnum(AudioFormat)
  @IsOptional()
  format?: AudioFormat;

  @IsString()
  @IsOptional()
  language?: string;
}

export class TTSVoiceDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  provider?: string;
}
