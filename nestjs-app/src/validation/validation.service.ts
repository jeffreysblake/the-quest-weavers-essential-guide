import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as path from 'path';
import * as fs from 'fs';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();
  private schemasPath: string;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.schemasPath = path.join(__dirname, 'schemas');
    this.loadSchemas();
  }

  /**
   * Load all JSON schemas from the schemas directory
   */
  private loadSchemas(): void {
    try {
      const schemaFiles = [
        'game-config.schema.json',
        'room.schema.json',
        'object.schema.json',
        'npc.schema.json',
        'connection.schema.json',
      ];

      for (const schemaFile of schemaFiles) {
        const schemaPath = path.join(this.schemasPath, schemaFile);

        if (!fs.existsSync(schemaPath)) {
          this.logger.warn(`Schema file not found: ${schemaPath}`);
          continue;
        }

        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        const schemaName = schemaFile.replace('.schema.json', '');
        const validate = this.ajv.compile(schema);
        this.validators.set(schemaName, validate);

        this.logger.log(`Loaded schema: ${schemaName}`);
      }

      this.logger.log(`Loaded ${this.validators.size} schemas successfully`);
    } catch (error) {
      this.logger.error(`Failed to load schemas: ${error.message}`);
    }
  }

  /**
   * Validate game configuration
   */
  validateGameConfig(data: any): ValidationResult {
    return this.validate('game-config', data);
  }

  /**
   * Validate room data
   */
  validateRoom(data: any): ValidationResult {
    return this.validate('room', data);
  }

  /**
   * Validate object data
   */
  validateObject(data: any): ValidationResult {
    return this.validate('object', data);
  }

  /**
   * Validate NPC data
   */
  validateNPC(data: any): ValidationResult {
    return this.validate('npc', data);
  }

  /**
   * Validate connections data
   */
  validateConnections(data: any): ValidationResult {
    return this.validate('connection', data);
  }

  /**
   * Generic validation method
   */
  private validate(schemaName: string, data: any): ValidationResult {
    const validator = this.validators.get(schemaName);

    if (!validator) {
      return {
        isValid: false,
        errors: [`Schema not found: ${schemaName}`],
      };
    }

    const isValid = validator(data);

    if (isValid) {
      return {
        isValid: true,
        errors: [],
      };
    }

    const errors = this.formatErrors(validator.errors || []);

    this.logger.warn(
      `Validation failed for ${schemaName}: ${errors.join(', ')}`,
    );

    return {
      isValid: false,
      errors,
    };
  }

  /**
   * Format Ajv errors into human-readable messages
   */
  private formatErrors(errors: ErrorObject[]): string[] {
    return errors.map((error) => {
      const path = error.instancePath || 'root';
      const message = error.message || 'unknown error';

      switch (error.keyword) {
        case 'required':
          return `${path}: missing required property '${error.params.missingProperty}'`;
        case 'type':
          return `${path}: must be ${error.params.type}`;
        case 'enum':
          return `${path}: must be one of [${error.params.allowedValues.join(', ')}]`;
        case 'pattern':
          return `${path}: must match pattern ${error.params.pattern}`;
        case 'minLength':
          return `${path}: must be at least ${error.params.limit} characters`;
        case 'maxLength':
          return `${path}: must be at most ${error.params.limit} characters`;
        case 'minimum':
          return `${path}: must be >= ${error.params.limit}`;
        case 'maximum':
          return `${path}: must be <= ${error.params.limit}`;
        case 'additionalProperties':
          return `${path}: has unexpected property '${error.params.additionalProperty}'`;
        default:
          return `${path}: ${message}`;
      }
    });
  }

  /**
   * Validate entire game directory structure
   */
  async validateGameFiles(
    gameId: string,
    gameDir: string,
  ): Promise<ValidationResult> {
    const allErrors: string[] = [];

    // Validate game config
    const configPath = path.join(gameDir, 'game-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const configResult = this.validateGameConfig(configData);
        if (!configResult.isValid) {
          allErrors.push(
            ...configResult.errors.map((e) => `game-config.json: ${e}`),
          );
        }
      } catch (error) {
        allErrors.push(`game-config.json: Invalid JSON - ${error.message}`);
      }
    } else {
      allErrors.push('game-config.json: File not found');
    }

    // Validate rooms
    const roomsDir = path.join(gameDir, 'rooms');
    if (fs.existsSync(roomsDir)) {
      const roomFiles = fs
        .readdirSync(roomsDir)
        .filter((f) => f.endsWith('.json'));

      for (const roomFile of roomFiles) {
        try {
          const roomData = JSON.parse(
            fs.readFileSync(path.join(roomsDir, roomFile), 'utf-8'),
          );
          const roomResult = this.validateRoom(roomData);
          if (!roomResult.isValid) {
            allErrors.push(
              ...roomResult.errors.map((e) => `rooms/${roomFile}: ${e}`),
            );
          }
        } catch (error) {
          allErrors.push(`rooms/${roomFile}: Invalid JSON - ${error.message}`);
        }
      }
    }

    // Validate objects
    const objectsDir = path.join(gameDir, 'objects');
    if (fs.existsSync(objectsDir)) {
      const objectFiles = fs
        .readdirSync(objectsDir)
        .filter((f) => f.endsWith('.json'));

      for (const objectFile of objectFiles) {
        try {
          const objectData = JSON.parse(
            fs.readFileSync(path.join(objectsDir, objectFile), 'utf-8'),
          );
          const objectResult = this.validateObject(objectData);
          if (!objectResult.isValid) {
            allErrors.push(
              ...objectResult.errors.map((e) => `objects/${objectFile}: ${e}`),
            );
          }
        } catch (error) {
          allErrors.push(
            `objects/${objectFile}: Invalid JSON - ${error.message}`,
          );
        }
      }
    }

    // Validate NPCs
    const npcsDir = path.join(gameDir, 'npcs');
    if (fs.existsSync(npcsDir)) {
      const npcFiles = fs.readdirSync(npcsDir).filter((f) => f.endsWith('.json'));

      for (const npcFile of npcFiles) {
        try {
          const npcData = JSON.parse(
            fs.readFileSync(path.join(npcsDir, npcFile), 'utf-8'),
          );
          const npcResult = this.validateNPC(npcData);
          if (!npcResult.isValid) {
            allErrors.push(
              ...npcResult.errors.map((e) => `npcs/${npcFile}: ${e}`),
            );
          }
        } catch (error) {
          allErrors.push(`npcs/${npcFile}: Invalid JSON - ${error.message}`);
        }
      }
    }

    // Validate connections
    const connectionsPath = path.join(gameDir, 'connections.json');
    if (fs.existsSync(connectionsPath)) {
      try {
        const connectionsData = JSON.parse(
          fs.readFileSync(connectionsPath, 'utf-8'),
        );
        const connectionsResult = this.validateConnections(connectionsData);
        if (!connectionsResult.isValid) {
          allErrors.push(
            ...connectionsResult.errors.map((e) => `connections.json: ${e}`),
          );
        }
      } catch (error) {
        allErrors.push(`connections.json: Invalid JSON - ${error.message}`);
      }
    }

    const isValid = allErrors.length === 0;

    if (isValid) {
      this.logger.log(`Game ${gameId} validation passed`);
    } else {
      this.logger.warn(
        `Game ${gameId} validation failed with ${allErrors.length} errors`,
      );
    }

    return {
      isValid,
      errors: allErrors,
    };
  }
}
