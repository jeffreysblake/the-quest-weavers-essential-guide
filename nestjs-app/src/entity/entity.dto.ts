import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class PositionDto {
  @IsNumber()
  @IsNotEmpty()
  x: number;

  @IsNumber()
  @IsNotEmpty()
  y: number;
}

export class CreateEntityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested()
  @Type(() => PositionDto)
  @IsNotEmpty()
  position: PositionDto;

  @IsBoolean()
  @IsNotEmpty()
  active: boolean;
}

export class UpdateEntityDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsOptional()
  name?: string;

  @ValidateNested()
  @Type(() => PositionDto)
  @IsOptional()
  position?: PositionDto;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
