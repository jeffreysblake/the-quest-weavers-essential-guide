import {
  normalizeNameForMatching,
  matchesName,
  getMatchScore,
} from './item-name-matcher.util';

describe('Item Name Matcher Utilities', () => {
  describe('normalizeNameForMatching', () => {
    it('should convert to lowercase', () => {
      expect(normalizeNameForMatching('Brass-Key')).toBe('brass key');
      expect(normalizeNameForMatching('ANCIENT TOME')).toBe('ancient tome');
    });

    it('should replace hyphens with spaces', () => {
      expect(normalizeNameForMatching('first-aid-kit')).toBe('first aid kit');
      expect(normalizeNameForMatching('reality-anchor')).toBe('reality anchor');
    });

    it('should replace underscores with spaces', () => {
      expect(normalizeNameForMatching('laser_gun')).toBe('laser gun');
      expect(normalizeNameForMatching('ancient_tome')).toBe('ancient tome');
    });

    it('should normalize multiple consecutive spaces', () => {
      expect(normalizeNameForMatching('Glowing   Flower')).toBe('glowing flower');
      expect(normalizeNameForMatching('Space    Helmet')).toBe('space helmet');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeNameForMatching('  Flickering-Torch  ')).toBe('flickering torch');
      expect(normalizeNameForMatching('\tBrass Key\t')).toBe('brass key');
    });

    it('should handle combinations of all transformations', () => {
      expect(normalizeNameForMatching('  First-Aid_Kit  ')).toBe('first aid kit');
      expect(normalizeNameForMatching('REALITY-ANCHOR_FRAGMENT')).toBe('reality anchor fragment');
    });

    it('should handle empty strings', () => {
      expect(normalizeNameForMatching('')).toBe('');
      expect(normalizeNameForMatching('   ')).toBe('');
    });
  });

  describe('matchesName', () => {
    describe('exact matching', () => {
      it('should match exact names after normalization', () => {
        expect(matchesName('Brass-Key', 'brass key')).toBe(true);
        expect(matchesName('Ancient_Tome', 'ancient tome')).toBe(true);
        expect(matchesName('laser gun', 'laser gun')).toBe(true);
      });

      it('should be case-insensitive', () => {
        expect(matchesName('Reality Anchor', 'REALITY ANCHOR')).toBe(true);
        expect(matchesName('brass key', 'Brass Key')).toBe(true);
      });
    });

    describe('substring matching', () => {
      it('should match when target is substring of object name', () => {
        expect(matchesName('Standard Issue Mop', 'mop')).toBe(true);
        expect(matchesName('Ancient Tome', 'ancient')).toBe(true);
        expect(matchesName('Reality Anchor Fragment', 'reality anchor')).toBe(true);
      });

      it('should match partial words', () => {
        expect(matchesName('Brass Key', 'brass')).toBe(true);
        expect(matchesName('Brass Key', 'key')).toBe(true);
      });
    });

    describe('word-based matching', () => {
      it('should match when all target words appear in object name', () => {
        expect(matchesName('Standard Issue Mop', 'standard mop')).toBe(true);
        expect(matchesName('Ancient Tome of Power', 'ancient power')).toBe(true);
      });

      it('should match regardless of word order', () => {
        expect(matchesName('Standard Issue Mop', 'issue standard')).toBe(true);
        expect(matchesName('Ancient Tome of Power', 'power ancient')).toBe(true);
      });

      it('should allow partial word matches', () => {
        expect(matchesName('Standard Issue Mop', 'stand iss')).toBe(true);
        expect(matchesName('Reality Anchor Fragment', 'real frag')).toBe(true);
      });
    });

    describe('non-matching cases', () => {
      it('should not match completely different names', () => {
        expect(matchesName('Brass Key', 'silver')).toBe(false);
        expect(matchesName('Ancient Tome', 'modern book')).toBe(false);
      });

      it('should not match when target word is not in object name', () => {
        expect(matchesName('Brass Key', 'ancient brass')).toBe(false);
        expect(matchesName('Reality Anchor', 'void fragment')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(matchesName('Brass Key', '')).toBe(true); // Empty target matches everything
        expect(matchesName('', 'brass')).toBe(false);
      });

      it('should handle single character matches', () => {
        expect(matchesName('A Key', 'a')).toBe(true);
        expect(matchesName('Brass Key', 'b')).toBe(true);
      });
    });
  });

  describe('getMatchScore', () => {
    describe('exact matches', () => {
      it('should return 100 for exact matches', () => {
        expect(getMatchScore('Reality Anchor', 'reality anchor')).toBe(100);
        expect(getMatchScore('Brass-Key', 'brass key')).toBe(100);
        expect(getMatchScore('ancient_tome', 'ancient tome')).toBe(100);
      });

      it('should return 100 for exact matches regardless of case', () => {
        expect(getMatchScore('Reality Anchor', 'REALITY ANCHOR')).toBe(100);
        expect(getMatchScore('brass key', 'Brass Key')).toBe(100);
      });
    });

    describe('substring matches', () => {
      it('should score based on length difference', () => {
        // "reality anchor" (14 chars) vs "Reality Anchor Fragment" (23 chars) = 9 char diff
        const fragmentScore = getMatchScore('Reality Anchor Fragment', 'reality anchor');
        expect(fragmentScore).toBe(90 - 9); // 81

        // Shorter length difference = higher score
        const shortDiffScore = getMatchScore('Reality Anchor X', 'reality anchor');
        expect(shortDiffScore).toBe(90 - 2); // 88 (only 2 extra chars)
      });

      it('should prefer shorter object names (better matches)', () => {
        const anchorScore = getMatchScore('Reality Anchor', 'reality anchor');
        const fragmentScore = getMatchScore('Reality Anchor Fragment', 'reality anchor');

        expect(anchorScore).toBe(100); // Exact match
        expect(fragmentScore).toBeLessThan(anchorScore); // Fragment has lower score
        expect(fragmentScore).toBeGreaterThanOrEqual(50); // But still reasonable score
      });

      it('should have minimum score of 50 for substring matches', () => {
        // Even with very long object names, score should be at least 50
        const longNameScore = getMatchScore(
          'Reality Anchor Fragment of Ultimate Power and Destruction',
          'reality anchor'
        );
        expect(longNameScore).toBeGreaterThanOrEqual(50);
      });

      it('should score "key" matching "Brass Key" higher than "Master Key Fragment"', () => {
        const brassKeyScore = getMatchScore('Brass Key', 'key');
        const fragmentScore = getMatchScore('Master Key Fragment', 'key');

        expect(brassKeyScore).toBeGreaterThan(fragmentScore);
      });
    });

    describe('word-based matches', () => {
      it('should return 25 for word-based matches', () => {
        expect(getMatchScore('Standard Issue Mop', 'standard mop')).toBe(25);
        expect(getMatchScore('Ancient Tome of Power', 'ancient power')).toBe(25);
      });

      it('should return 25 regardless of word order', () => {
        expect(getMatchScore('Standard Issue Mop', 'mop standard')).toBe(25);
        expect(getMatchScore('Ancient Tome of Power', 'power ancient')).toBe(25);
      });
    });

    describe('no matches', () => {
      it('should return 0 for non-matching names', () => {
        expect(getMatchScore('Brass Key', 'silver')).toBe(0);
        expect(getMatchScore('Ancient Tome', 'modern book')).toBe(0);
        expect(getMatchScore('Reality Anchor', 'void fragment')).toBe(0);
      });
    });

    describe('critical bug fix: reality anchor vs fragment', () => {
      it('should score "Reality Anchor" higher than "Reality Anchor Fragment" for target "reality anchor"', () => {
        const anchorScore = getMatchScore('Reality Anchor', 'reality anchor');
        const fragmentScore = getMatchScore('Reality Anchor Fragment', 'reality anchor');

        expect(anchorScore).toBe(100); // Exact match
        expect(fragmentScore).toBeLessThan(90); // Substring match with penalty
        expect(anchorScore).toBeGreaterThan(fragmentScore); // Critical: anchor wins!
      });

      it('should correctly prioritize shorter matches in sorting', () => {
        const items = [
          { name: 'Reality Anchor Fragment', score: 0 },
          { name: 'Reality Anchor', score: 0 },
        ];

        // Calculate scores
        items.forEach(item => {
          item.score = getMatchScore(item.name, 'reality anchor');
        });

        // Sort by score descending (like in base-command.handler.ts)
        items.sort((a, b) => b.score - a.score);

        // First item should be the exact match
        expect(items[0].name).toBe('Reality Anchor');
        expect(items[1].name).toBe('Reality Anchor Fragment');
      });

      it('should handle multiple fragments with different lengths', () => {
        const targets = [
          'Reality Anchor Fragment A',
          'Reality Anchor Fragment',
          'Reality Anchor',
          'Reality Anchor Fragment of Power',
        ];

        const scores = targets.map(name => ({
          name,
          score: getMatchScore(name, 'reality anchor'),
        }));

        scores.sort((a, b) => b.score - a.score);

        // Exact match should win
        expect(scores[0].name).toBe('Reality Anchor');
        expect(scores[0].score).toBe(100);

        // All others should have lower scores
        scores.slice(1).forEach(item => {
          expect(item.score).toBeLessThan(100);
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty target string', () => {
        // Empty string matches everything as substring, but scoring is different
        expect(getMatchScore('Brass Key', '')).toBeGreaterThan(0);
      });

      it('should handle empty object name', () => {
        expect(getMatchScore('', 'brass')).toBe(0);
      });

      it('should handle special characters', () => {
        expect(getMatchScore('First-Aid Kit', 'first aid')).toBeGreaterThan(0);
        expect(getMatchScore('Laser_Gun_2000', 'laser gun')).toBeGreaterThan(0);
      });

      it('should handle single character targets', () => {
        expect(getMatchScore('A Key', 'a')).toBeGreaterThan(0);
        expect(getMatchScore('Brass Key', 'b')).toBeGreaterThan(0);
      });
    });

    describe('scoring consistency', () => {
      it('should always rank matches in order: exact > substring > word-based > no-match', () => {
        const exact = getMatchScore('brass key', 'brass key');
        const substring = getMatchScore('brass key fragment', 'brass key');
        const wordBased = getMatchScore('key fragment brass', 'key brass');
        const noMatch = getMatchScore('silver lock', 'brass key');

        expect(exact).toBeGreaterThan(substring);
        expect(substring).toBeGreaterThan(wordBased);
        expect(wordBased).toBeGreaterThan(noMatch);
        expect(noMatch).toBe(0);

        // Verify actual score ranges
        expect(exact).toBe(100);
        expect(substring).toBeGreaterThanOrEqual(50);
        expect(substring).toBeLessThan(100);
        expect(wordBased).toBe(25);
        expect(noMatch).toBe(0);
      });

      it('should be deterministic (same inputs always give same outputs)', () => {
        const score1 = getMatchScore('Reality Anchor', 'reality anchor');
        const score2 = getMatchScore('Reality Anchor', 'reality anchor');
        const score3 = getMatchScore('Reality Anchor', 'reality anchor');

        expect(score1).toBe(score2);
        expect(score2).toBe(score3);
      });
    });
  });
});
