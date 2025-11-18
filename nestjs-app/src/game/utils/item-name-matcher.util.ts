/**
 * Item Name Matching Utilities
 *
 * Provides utilities for normalizing and matching item names in a flexible way.
 * Handles variations like hyphens, underscores, and spaces to provide a better
 * user experience when referencing game objects.
 *
 * @example
 * ```typescript
 * import { normalizeNameForMatching, matchesName } from './item-name-matcher.util';
 *
 * // Normalize a name for comparison
 * const normalized = normalizeNameForMatching('Ancient-Tome'); // 'ancient tome'
 *
 * // Check if a target matches an object name
 * const matches = matchesName('Ancient-Tome', 'ancient tome'); // true
 * const matches2 = matchesName('Brass_Key', 'brass key'); // true
 * ```
 */

/**
 * Normalize item name for matching - handles hyphens, underscores, and spaces
 *
 * This function converts a name to a standardized format for comparison:
 * - Converts to lowercase
 * - Replaces hyphens and underscores with spaces
 * - Normalizes multiple consecutive spaces to single spaces
 * - Trims leading/trailing whitespace
 *
 * @param name - The name to normalize
 * @returns The normalized name in lowercase with standardized spacing
 *
 * @example
 * ```typescript
 * normalizeNameForMatching('Brass-Key') // Returns: 'brass key'
 * normalizeNameForMatching('ancient_tome') // Returns: 'ancient tome'
 * normalizeNameForMatching('Glowing   Flower') // Returns: 'glowing flower'
 * normalizeNameForMatching('  Flickering-Torch  ') // Returns: 'flickering torch'
 * ```
 */
export function normalizeNameForMatching(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

/**
 * Check if target matches object name (handles variations like hyphens vs spaces)
 *
 * Compares two names in a flexible way by normalizing both before comparison.
 * Uses substring matching, so partial names will match as long as they are
 * contained in the object name.
 *
 * @param objectName - The name of the object to match against
 * @param target - The target string to search for
 * @returns true if the normalized target is found within the normalized object name
 *
 * @example
 * ```typescript
 * matchesName('Brass-Key', 'brass key') // Returns: true
 * matchesName('Ancient_Tome', 'ancient') // Returns: true (partial match)
 * matchesName('Glowing Flower', 'glowing-flower') // Returns: true
 * matchesName('Brass Key', 'silver') // Returns: false
 * ```
 */
export function matchesName(objectName: string, target: string): boolean {
  const normalizedObjectName = normalizeNameForMatching(objectName);
  const normalizedTarget = normalizeNameForMatching(target);
  return normalizedObjectName.includes(normalizedTarget);
}
