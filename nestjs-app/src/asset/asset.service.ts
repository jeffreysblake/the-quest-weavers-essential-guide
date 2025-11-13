import { Injectable, Logger } from '@nestjs/common';
import { FileScannerService } from '../file-system/file-scanner.service';
import {
  IAsset,
  IAssetLink,
  IAssetGenerationRequest,
  IAssetGenerationResult,
  IAssetQuery,
  AssetType,
  AssetCategory,
  AssetEntityType,
} from './asset.interfaces';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface AssetMetadataFile {
  gameId: string;
  assets: IAsset[];
  links: IAssetLink[];
  created: string;
  updated: string;
}

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(private readonly fileScannerService: FileScannerService) {}

  /**
   * Get asset metadata file path for a game
   */
  private getMetadataPath(gameId: string): string {
    const gameDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}`;
    return path.join(gameDir, 'assets', 'metadata.json');
  }

  /**
   * Load asset metadata from file
   */
  private async loadMetadata(gameId: string): Promise<AssetMetadataFile> {
    const metadataPath = this.getMetadataPath(gameId);

    if (!fs.existsSync(metadataPath)) {
      // Create default metadata file
      await this.fileScannerService.ensureGameDirectory(gameId);
      return {
        gameId,
        assets: [],
        links: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
    }

    const content = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as AssetMetadataFile;

    // Ensure links array exists (for backward compatibility)
    if (!metadata.links) {
      metadata.links = [];
    }

    return metadata;
  }

  /**
   * Save asset metadata to file
   */
  private async saveMetadata(
    gameId: string,
    metadata: AssetMetadataFile,
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(gameId);
    metadata.updated = new Date().toISOString();

    await this.fileScannerService.writeFileContent(
      metadataPath,
      JSON.stringify(metadata, null, 2),
    );

    this.logger.log(`Saved asset metadata for game ${gameId}`);
  }

  /**
   * Register a new asset
   */
  async registerAsset(
    gameId: string,
    assetData: Omit<IAsset, 'id' | 'version' | 'createdAt'>,
  ): Promise<IAsset> {
    const metadata = await this.loadMetadata(gameId);

    const asset: IAsset = {
      ...assetData,
      id: uuidv4(),
      gameId,
      version: 1,
      createdAt: new Date().toISOString(),
    };

    metadata.assets.push(asset);
    await this.saveMetadata(gameId, metadata);

    this.logger.log(`Registered asset ${asset.id} for game ${gameId}`);
    return asset;
  }

  /**
   * Link an asset to an entity
   */
  async linkAssetToEntity(
    gameId: string,
    entityType: AssetEntityType,
    entityId: string,
    assetId: string,
    isPrimary: boolean = false,
  ): Promise<IAssetLink> {
    const metadata = await this.loadMetadata(gameId);

    // Check if asset exists
    const asset = metadata.assets.find((a) => a.id === assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found in game ${gameId}`);
    }

    // Check if link already exists
    const existingLink = metadata.links.find(
      (l) =>
        l.entityType === entityType &&
        l.entityId === entityId &&
        l.assetId === assetId,
    );

    if (existingLink) {
      this.logger.warn(
        `Link already exists between ${entityType}:${entityId} and asset ${assetId}`,
      );
      return existingLink;
    }

    // If this is primary, unset any existing primary links for this entity
    if (isPrimary) {
      metadata.links.forEach((link) => {
        if (link.entityType === entityType && link.entityId === entityId) {
          link.isPrimary = false;
        }
      });
    }

    // Create new link
    const link: IAssetLink = {
      id: metadata.links.length + 1,
      gameId,
      entityType,
      entityId,
      assetId,
      isPrimary,
      createdAt: new Date().toISOString(),
    };

    metadata.links.push(link);
    await this.saveMetadata(gameId, metadata);

    this.logger.log(
      `Linked asset ${assetId} to ${entityType}:${entityId} (primary: ${isPrimary})`,
    );
    return link;
  }

  /**
   * Get all assets for a specific entity
   */
  async getAssetsForEntity(
    gameId: string,
    entityType: AssetEntityType,
    entityId: string,
  ): Promise<IAsset[]> {
    const metadata = await this.loadMetadata(gameId);

    // Find all links for this entity
    const entityLinks = metadata.links.filter(
      (l) => l.entityType === entityType && l.entityId === entityId,
    );

    // Get corresponding assets
    const assets = entityLinks
      .map((link) => metadata.assets.find((a) => a.id === link.assetId))
      .filter((asset): asset is IAsset => asset !== undefined);

    // Sort by primary first, then by display order
    return assets.sort((a, b) => {
      const linkA = entityLinks.find((l) => l.assetId === a.id)!;
      const linkB = entityLinks.find((l) => l.assetId === b.id)!;

      if (linkA.isPrimary && !linkB.isPrimary) return -1;
      if (!linkA.isPrimary && linkB.isPrimary) return 1;

      return (linkA.displayOrder || 0) - (linkB.displayOrder || 0);
    });
  }

  /**
   * Get primary asset for an entity
   */
  async getPrimaryAsset(
    gameId: string,
    entityType: AssetEntityType,
    entityId: string,
  ): Promise<IAsset | null> {
    const metadata = await this.loadMetadata(gameId);

    const primaryLink = metadata.links.find(
      (l) =>
        l.entityType === entityType &&
        l.entityId === entityId &&
        l.isPrimary,
    );

    if (!primaryLink) {
      return null;
    }

    return (
      metadata.assets.find((a) => a.id === primaryLink.assetId) || null
    );
  }

  /**
   * Query assets by filters
   */
  async queryAssets(query: IAssetQuery): Promise<IAsset[]> {
    const metadata = await this.loadMetadata(query.gameId!);

    let assets = metadata.assets;

    if (query.assetType) {
      assets = assets.filter((a) => a.assetType === query.assetType);
    }

    if (query.category) {
      assets = assets.filter((a) => a.category === query.category);
    }

    if (query.entityType || query.entityId) {
      // Get assets linked to specific entity
      const links = metadata.links.filter((l) => {
        if (query.entityType && l.entityType !== query.entityType) return false;
        if (query.entityId && l.entityId !== query.entityId) return false;
        return true;
      });

      const linkedAssetIds = new Set(links.map((l) => l.assetId));
      assets = assets.filter((a) => linkedAssetIds.has(a.id));
    }

    if (query.tags && query.tags.length > 0) {
      assets = assets.filter((a) =>
        query.tags!.some((tag) => a.tags?.includes(tag)),
      );
    }

    return assets;
  }

  /**
   * Get asset by ID
   */
  async getAssetById(gameId: string, assetId: string): Promise<IAsset | null> {
    const metadata = await this.loadMetadata(gameId);
    return metadata.assets.find((a) => a.id === assetId) || null;
  }

  /**
   * Update asset metadata
   */
  async updateAsset(
    gameId: string,
    assetId: string,
    updates: Partial<IAsset>,
  ): Promise<IAsset> {
    const metadata = await this.loadMetadata(gameId);

    const assetIndex = metadata.assets.findIndex((a) => a.id === assetId);
    if (assetIndex === -1) {
      throw new Error(`Asset ${assetId} not found in game ${gameId}`);
    }

    metadata.assets[assetIndex] = {
      ...metadata.assets[assetIndex],
      ...updates,
      id: assetId, // Preserve ID
      gameId, // Preserve game ID
      updatedAt: new Date().toISOString(),
    };

    await this.saveMetadata(gameId, metadata);

    this.logger.log(`Updated asset ${assetId}`);
    return metadata.assets[assetIndex];
  }

  /**
   * Delete asset
   */
  async deleteAsset(gameId: string, assetId: string): Promise<void> {
    const metadata = await this.loadMetadata(gameId);

    const asset = metadata.assets.find((a) => a.id === assetId);
    if (!asset) {
      throw new Error(`Asset ${assetId} not found in game ${gameId}`);
    }

    // Remove asset file if it exists
    const gameDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}`;
    const fullPath = path.join(gameDir, asset.filePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      this.logger.log(`Deleted asset file: ${fullPath}`);
    }

    // Remove asset from metadata
    metadata.assets = metadata.assets.filter((a) => a.id !== assetId);

    // Remove all links to this asset
    metadata.links = metadata.links.filter((l) => l.assetId !== assetId);

    await this.saveMetadata(gameId, metadata);

    this.logger.log(`Deleted asset ${assetId} and its links`);
  }

  /**
   * Unlink asset from entity
   */
  async unlinkAssetFromEntity(
    gameId: string,
    entityType: AssetEntityType,
    entityId: string,
    assetId: string,
  ): Promise<void> {
    const metadata = await this.loadMetadata(gameId);

    metadata.links = metadata.links.filter(
      (l) =>
        !(
          l.entityType === entityType &&
          l.entityId === entityId &&
          l.assetId === assetId
        ),
    );

    await this.saveMetadata(gameId, metadata);

    this.logger.log(
      `Unlinked asset ${assetId} from ${entityType}:${entityId}`,
    );
  }

  /**
   * Placeholder for image generation
   * Will be implemented when AI image generation is integrated
   */
  async generateImage(
    request: IAssetGenerationRequest,
  ): Promise<IAssetGenerationResult> {
    this.logger.warn(
      'Image generation not yet implemented - returning placeholder',
    );

    return {
      success: false,
      message:
        'Image generation not yet implemented. This will be integrated with AI image generation services in the future.',
    };
  }

  /**
   * Placeholder for audio generation
   * Will be implemented when AI audio generation is integrated
   */
  async generateAudio(
    request: IAssetGenerationRequest,
  ): Promise<IAssetGenerationResult> {
    this.logger.warn(
      'Audio generation not yet implemented - returning placeholder',
    );

    return {
      success: false,
      message:
        'Audio generation not yet implemented. This will be integrated with AI audio generation services (e.g., kokoro-tts) in the future.',
    };
  }

  /**
   * Get asset statistics for a game
   */
  async getAssetStats(gameId: string): Promise<{
    totalAssets: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    totalSize: number;
  }> {
    const metadata = await this.loadMetadata(gameId);

    const stats = {
      totalAssets: metadata.assets.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      totalSize: 0,
    };

    metadata.assets.forEach((asset) => {
      // Count by type
      stats.byType[asset.assetType] =
        (stats.byType[asset.assetType] || 0) + 1;

      // Count by category
      stats.byCategory[asset.category] =
        (stats.byCategory[asset.category] || 0) + 1;

      // Sum file sizes
      if (asset.fileSize) {
        stats.totalSize += asset.fileSize;
      }
    });

    return stats;
  }
}
