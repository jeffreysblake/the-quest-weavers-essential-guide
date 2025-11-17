/**
 * Material Properties Database
 * Default physical properties for common materials in the game
 */
import { IMaterialProperties } from './physics.interface';

const materialDefaults: Record<string, IMaterialProperties> = {
  wood: {
    material: 'wood',
    density: 0.6,
    conductivity: 0.1,
    flammability: 7,
    brittleness: 3,
    resistances: { ice: 2, lightning: 5 },
  },
  metal: {
    material: 'metal',
    density: 7.85,
    conductivity: 8,
    flammability: 0,
    brittleness: 3,
    resistances: { fire: 7, lightning: 2, force: 5, ice: 7 },
  },
  stone: {
    material: 'stone',
    density: 2.5,
    conductivity: 1,
    flammability: 0,
    brittleness: 6,
    resistances: { fire: 9, force: 7 },
  },
  glass: {
    material: 'glass',
    density: 2.5,
    conductivity: 1,
    flammability: 0,
    brittleness: 9,
    resistances: { fire: 5 },
  },
  cloth: {
    material: 'cloth',
    density: 0.5,
    conductivity: 0.1,
    flammability: 8,
    brittleness: 1,
    resistances: { ice: 1 },
  },
  leather: {
    material: 'leather',
    density: 0.9,
    conductivity: 0.2,
    flammability: 5,
    brittleness: 2,
    resistances: { fire: 3, ice: 3 },
  },
  organic: {
    material: 'organic',
    density: 0.8,
    conductivity: 0.3,
    flammability: 6,
    brittleness: 4,
    resistances: { ice: 2 },
  },
};

/**
 * Get default material properties for a given material type
 */
export function getDefaultMaterialProperties(
  material?: string,
): IMaterialProperties | undefined {
  if (!material) return undefined;

  return (
    materialDefaults[material.toLowerCase()] || {
      material,
      density: 1,
      conductivity: 1,
      flammability: 1,
      brittleness: 1,
      resistances: {},
    }
  );
}

/**
 * Check if a material exists in the database
 */
export function hasMaterialProperties(material: string): boolean {
  return material.toLowerCase() in materialDefaults;
}

/**
 * Get all available materials
 */
export function getAllMaterials(): string[] {
  return Object.keys(materialDefaults);
}
