import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, Max, IsInt } from 'class-validator';

export enum ImageModel {
  SDXL = 'sdxl',
  SD3 = 'sd3',
  FLUX_SCHNELL = 'flux-schnell',
}

export enum Sampler {
  EULER = 'euler',
  EULER_A = 'euler_a',
  DPM_PP_2M = 'dpmpp_2m',
  DPM_PP_SDE = 'dpmpp_sde',
  DDIM = 'ddim',
}

export class GenerateImageDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  negativePrompt?: string;

  @IsInt()
  @Min(256)
  @Max(2048)
  @IsOptional()
  width?: number = 1024;

  @IsInt()
  @Min(256)
  @Max(2048)
  @IsOptional()
  height?: number = 1024;

  @IsInt()
  @Min(1)
  @Max(150)
  @IsOptional()
  steps?: number = 20;

  @IsNumber()
  @Min(1)
  @Max(30)
  @IsOptional()
  cfgScale?: number = 7.5;

  @IsInt()
  @IsOptional()
  seed?: number;

  @IsEnum(Sampler)
  @IsOptional()
  sampler?: Sampler = Sampler.DPM_PP_2M;

  @IsEnum(ImageModel)
  @IsOptional()
  model?: ImageModel = ImageModel.SDXL;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  priority?: number = 10;
}
