import { Injectable, Logger } from '@nestjs/common';
import { FileScannerService } from '../file-scanner.service';
import { ValidationService } from '../../validation/validation.service';

/**
 * JSON File Loader Helper
 * Handles loading and validating JSON files from the filesystem including:
 * - File size validation and resource limits
 * - JSON parsing with error handling
 * - Schema validation for different entity types
 * - Directory scanning and batch file loading
 */
@Injectable()
export class JsonFileLoaderHelper {
  private readonly logger = new Logger(JsonFileLoaderHelper.name);

  // Resource limits for different file types
  private readonly MAX_CONFIG_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_ENTITY_SIZE = 5 * 1024 * 1024; // 5MB

  constructor(
    private readonly fileScannerService: FileScannerService,
    private readonly validationService: ValidationService,
  ) {}

  /**
   * Load and validate a single JSON file with size limits
   */
  async loadAndValidateJson<T>(
    filePath: string,
    validator: (data: any) => { isValid: boolean; errors: string[] },
    maxSize: number = this.MAX_ENTITY_SIZE,
  ): Promise<{ data: T | null; errors: string[] }> {
    try {
      const content = await this.fileScannerService.getFileContent(filePath);

      // Check file size
      const fileSize = Buffer.byteLength(content, 'utf8');
      if (fileSize > maxSize) {
        return {
          data: null,
          errors: [
            `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${(maxSize / 1024 / 1024).toFixed(2)}MB`,
          ],
        };
      }

      // Parse JSON
      const data = JSON.parse(content);

      // Validate schema
      const validationResult = validator(data);
      if (!validationResult.isValid) {
        return {
          data: null,
          errors: validationResult.errors,
        };
      }

      return { data, errors: [] };
    } catch (error) {
      return {
        data: null,
        errors: [`Failed to load file: ${error.message}`],
      };
    }
  }

  /**
   * Load all JSON files from a directory
   */
  async loadJsonFilesFromDirectory(dirPath: string): Promise<{
    files: Array<{ fileName: string; content: string }>;
    errors: string[];
  }> {
    const files: Array<{ fileName: string; content: string }> = [];
    const errors: string[] = [];

    try {
      const fs = require('fs');
      if (!fs.existsSync(dirPath)) {
        return { files, errors: [`Directory not found: ${dirPath}`] };
      }

      const fileNames = fs
        .readdirSync(dirPath)
        .filter((f: string) => f.endsWith('.json'));

      for (const fileName of fileNames) {
        try {
          const filePath = `${dirPath}/${fileName}`;
          const content =
            await this.fileScannerService.getFileContent(filePath);
          files.push({ fileName, content });
        } catch (error) {
          errors.push(`Failed to load ${fileName}: ${error.message}`);
        }
      }

      return { files, errors };
    } catch (error) {
      return {
        files,
        errors: [`Failed to read directory ${dirPath}: ${error.message}`],
      };
    }
  }

  /**
   * Load game configuration with validation
   */
  async loadGameConfig(
    gameId: string,
  ): Promise<{ data: any | null; errors: string[] }> {
    const configPath = `${this.fileScannerService.getGamesDirectory()}/${gameId}/game-config.json`;

    return await this.loadAndValidateJson(
      configPath,
      (data) => this.validationService.validateGameConfig(data),
      this.MAX_CONFIG_SIZE,
    );
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fs = require('fs');
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}
