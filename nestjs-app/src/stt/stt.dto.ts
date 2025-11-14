import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export enum STTModel {
  TINY = 'tiny',
  TINY_EN = 'tiny.en',
  BASE = 'base',
  BASE_EN = 'base.en',
  SMALL = 'small',
  SMALL_EN = 'small.en',
  MEDIUM = 'medium',
  MEDIUM_EN = 'medium.en',
  LARGE_V2 = 'large-v2',
  LARGE_V3 = 'large-v3',
}

export class TranscribeDto {
  @IsString()
  @IsOptional()
  language?: string;

  @IsEnum(STTModel)
  @IsOptional()
  model?: STTModel;

  @IsBoolean()
  @IsOptional()
  wordTimestamps?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  temperature?: number;
}

export class TranscribeFileDto extends TranscribeDto {
  @IsString()
  filePath: string;
}
