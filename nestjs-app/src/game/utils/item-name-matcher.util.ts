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

/**
 * Calculate match quality score for prioritizing multiple matches
 * Higher score = better match
 *
 * @param objectName - The name of the object being matched
 * @param target - The target string being searched for
 * @returns A numeric score (higher is better), or 0 if no match
 *
 * @example
 * ```typescript
 * getMatchScore('Reality Anchor', 'reality anchor') // Returns: 100 (exact)
 * getMatchScore('Reality Anchor Fragment', 'reality anchor') // Returns: 50 (substring)
 * getMatchScore('Ancient Tome', 'reality anchor') // Returns: 0 (no match)
 * ```
 */
export function getMatchScore(objectName: string, target: string): number {
  const normalizedObjectName = normalizeNameForMatching(objectName);
  const normalizedTarget = normalizeNameForMatching(target);

  // No match
  if (!matchesName(objectName, target)) {
    return 0;
  }

  // Exact match - highest priority
  if (normalizedObjectName === normalizedTarget) {
    return 100;
  }

  // Substring match - prefer shorter object names (less extra text)
  // Score inversely proportional to length difference
  if (normalizedObjectName.includes(normalizedTarget)) {
    const lengthDiff = normalizedObjectName.length - normalizedTarget.length;
    // Shorter names get higher scores (0 extra chars = 90, 1 char = 89, etc.)
    return Math.max(50, 90 - lengthDiff);
  }

  // Word-based match - lowest priority
  return 25;
}
