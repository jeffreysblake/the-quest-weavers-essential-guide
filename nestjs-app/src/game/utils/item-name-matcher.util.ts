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
 * Supports multiple matching strategies:
 * 1. Exact match (after normalization)
 * 2. Substring match (e.g., "mop" matches "Standard Issue Mop")
 * 3. Word-based match (all target words appear in object name)
 *
 * @param objectName - The name of the object to match against
 * @param target - The target string to search for
 * @returns true if the target matches the object name using any strategy
 *
 * @example
 * ```typescript
 * matchesName('Brass-Key', 'brass key') // Returns: true (exact)
 * matchesName('Ancient_Tome', 'ancient') // Returns: true (substring)
 * matchesName('Standard Issue Mop', 'standard mop') // Returns: true (word-based)
 * matchesName('Standard Issue Mop', 'issue standard') // Returns: true (word-based, any order)
 * matchesName('Brass Key', 'silver') // Returns: false
 * ```
 */
export function matchesName(objectName: string, target: string): boolean {
  const normalizedObjectName = normalizeNameForMatching(objectName);
  const normalizedTarget = normalizeNameForMatching(target);

  // Strategy 1: Exact match
  if (normalizedObjectName === normalizedTarget) {
    return true;
  }

  // Strategy 2: Substring match (original behavior)
  if (normalizedObjectName.includes(normalizedTarget)) {
    return true;
  }

  // Strategy 3: Word-based match - all target words must appear in object name
  // This allows "standard mop" to match "standard issue mop"
  const objectWords = normalizedObjectName.split(' ');
  const targetWords = normalizedTarget.split(' ');

  // Check if all target words appear in the object name
  const allWordsMatch = targetWords.every((targetWord) =>
    objectWords.some((objectWord) => objectWord.includes(targetWord)),
  );

  return allWordsMatch;
}
