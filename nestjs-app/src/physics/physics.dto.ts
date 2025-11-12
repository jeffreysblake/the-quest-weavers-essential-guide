import { IsString, IsNotEmpty, IsNumber, IsOptional, ValidateNested, IsEnum, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

enum PhysicsShape {
  BOX = 'box',
  SPHERE = 'sphere',
  PLANE = 'plane',
}

class Vector3Dto {
  @IsNumber()
  @IsNotEmpty()
  x: number;

  @IsNumber()
  @IsNotEmpty()
  y: number;

  @IsNumber()
  @IsNotEmpty()
  z: number;
}

export class CreatePhysicsBodyDto {
  @ValidateNested()
  @Type(() => Vector3Dto)
  @IsNotEmpty()
  position: Vector3Dto;

  @ValidateNested()
  @Type(() => Vector3Dto)
  @IsNotEmpty()
  velocity: Vector3Dto;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  mass: number;

  @IsEnum(PhysicsShape)
  @IsNotEmpty()
  shape: 'box' | 'sphere' | 'plane';
}

export class UpdatePhysicsBodyDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @ValidateNested()
  @Type(() => Vector3Dto)
  @IsOptional()
  position?: Vector3Dto;

  @ValidateNested()
  @Type(() => Vector3Dto)
  @IsOptional()
  velocity?: Vector3Dto;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  mass?: number;
}