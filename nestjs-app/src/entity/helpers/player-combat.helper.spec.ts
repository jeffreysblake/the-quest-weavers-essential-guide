import { Test, TestingModule } from '@nestjs/testing';
import { PlayerCombatHelper } from './player-combat.helper';
import { PhysicsService } from '../physics.service';
import { IPlayer } from '../player.interface';
import { EffectType } from '../physics.interface';

describe('PlayerCombatHelper', () => {
  let helper: PlayerCombatHelper;
  let physicsService: jest.Mocked<PhysicsService>;

  const mockPlayer: IPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Wizard',
    location: 'room-1',
    level: 5,
    experience: 100,
    health: 100,
    maxHealth: 100,
    mana: 50,
    maxMana: 50,
    inventory: [],
  };

  beforeEach(async () => {
    const mockPhysicsService = {
      applyEffect: jest.fn(),
      applyAreaEffect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerCombatHelper,
        { provide: PhysicsService, useValue: mockPhysicsService },
      ],
    }).compile();

    helper = module.get<PlayerCombatHelper>(PlayerCombatHelper);
    physicsService = module.get(PhysicsService);
  });

  describe('castSpell - intensity validation', () => {
    it('should reject NaN, Infinity, and non-numeric intensity values', async () => {
      const invalidValues = [
        NaN,
        Infinity,
        -Infinity,
        '10' as any,
        null as any,
        {} as any,
      ];

      for (const value of invalidValues) {
        const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', value);
        expect(result.success).toBe(false);
        expect(result.message).toBe('Invalid spell intensity');
        expect(physicsService.applyEffect).not.toHaveBeenCalled();
      }
    });

    it('should reject negative intensity values', async () => {
      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', -5);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Spell intensity must be positive');
      expect(physicsService.applyEffect).not.toHaveBeenCalled();
    });

    it('should cap intensity at 1000 when exceeding maximum', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 1500);

      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 1000 }),
      );
    });

    it('should accept zero and positive decimal intensities', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', 0);
      expect(result.success).toBe(true);

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 7.5);
      expect(physicsService.applyEffect).toHaveBeenLastCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 7.5 }),
      );
    });
  });

  describe('castSpell - spell types and mechanics', () => {
    const spellTypes: EffectType[] = [
      'fire',
      'lightning',
      'ice',
      'force',
      'poison',
      'acid',
      'magic',
    ];

    const expectedSpellNames: Record<EffectType, string> = {
      fire: 'Fireball',
      lightning: 'Lightning Bolt',
      ice: 'Ice Shard',
      force: 'Force Push',
      poison: 'Poison Cloud',
      acid: 'Acid Splash',
      magic: 'Magic Missile',
    };

    it('should cast all spell types successfully', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Target hit!',
      });

      for (const spellType of spellTypes) {
        const result = await helper.castSpell(mockPlayer, spellType, 'target-1', 5);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Test Wizard casts');
        expect(result.message).toContain(expectedSpellNames[spellType]);
        expect(result.message).toContain('Target hit!');
        expect(physicsService.applyEffect).toHaveBeenLastCalledWith(
          'target-1',
          expect.objectContaining({
            type: spellType,
            intensity: 5,
            sourceId: 'player-1',
          }),
        );
      }
    });

    it('should use default intensity of 5 when not provided', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1');

      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 5 }),
      );
    });

    it('should handle unknown spell type gracefully', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      const result = await helper.castSpell(
        mockPlayer,
        'unknown' as any,
        'target-1',
        5,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Unknown Spell');
    });
  });

  describe('castSpell - spell descriptions by intensity', () => {
    it('should use "weak" prefix for intensity <= 3', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 1);
      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ description: 'weak fireball' }),
      );

      await helper.castSpell(mockPlayer, 'lightning', 'target-1', 3);
      expect(physicsService.applyEffect).toHaveBeenLastCalledWith(
        'target-1',
        expect.objectContaining({ description: 'weak lightning bolt' }),
      );
    });

    it('should use normal prefix for intensity 4-6', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'ice', 'target-1', 5);
      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ description: 'ice shard' }),
      );

      await helper.castSpell(mockPlayer, 'magic', 'target-1', 6);
      expect(physicsService.applyEffect).toHaveBeenLastCalledWith(
        'target-1',
        expect.objectContaining({ description: 'magic missile' }),
      );
    });

    it('should use "powerful" prefix for intensity > 6', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 7);
      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ description: 'powerful fireball' }),
      );

      await helper.castSpell(mockPlayer, 'poison', 'target-1', 10);
      expect(physicsService.applyEffect).toHaveBeenLastCalledWith(
        'target-1',
        expect.objectContaining({ description: 'powerful poison cloud' }),
      );
    });
  });

  describe('castSpell - physics service integration', () => {
    it('should return success when physics service succeeds', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Target destroyed!',
      });

      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Target destroyed!');
    });

    it('should return failure when physics service fails', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: false,
        message: 'Target is immune!',
      });

      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', 5);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Target is immune!');
    });

    it('should include physics result in effects', async () => {
      const mockPhysicsResult = {
        success: true,
        message: 'Effect applied',
        objectsAffected: [{ objectId: 'target-1', damage: 25 }],
      };
      physicsService.applyEffect.mockResolvedValue(mockPhysicsResult);

      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', 5);

      expect(result.effects).toEqual({ physicsResult: mockPhysicsResult });
    });

    it('should create effect with all required fields', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'lightning', 'target-1', 8);

      expect(physicsService.applyEffect).toHaveBeenCalledWith('target-1', {
        type: 'lightning',
        intensity: 8,
        sourceId: 'player-1',
        description: 'powerful lightning bolt',
      });
    });

    it('should propagate physics service errors', async () => {
      physicsService.applyEffect.mockRejectedValue(
        new Error('Database connection lost'),
      );

      await expect(
        helper.castSpell(mockPlayer, 'fire', 'target-1', 5),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('castAreaSpell - basic functionality', () => {
    it('should cast area spell successfully', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: '3 targets hit!',
      });

      const result = await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Wizard casts Fireball');
      expect(result.message).toContain('3 targets hit!');
      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({
          type: 'fire',
          intensity: 5,
          sourceId: 'player-1',
        }),
      );
    });

    it('should use default intensity of 5 when not provided', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Area affected',
      });

      await helper.castAreaSpell(mockPlayer, 'ice', 'room-1');

      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ intensity: 5 }),
      );
    });

    it('should succeed even when no objects are affected (Bug Fix #2)', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: false,
        message: 'No targets in range',
      });

      const result = await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Wizard casts Fireball');
      expect(result.message).toContain('No targets in range');
    });

    it('should work with all spell types', async () => {
      const spellTypes: EffectType[] = [
        'fire',
        'lightning',
        'ice',
        'force',
        'poison',
        'acid',
        'magic',
      ];

      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      for (const spellType of spellTypes) {
        const result = await helper.castAreaSpell(
          mockPlayer,
          spellType,
          'room-1',
          5,
        );

        expect(result.success).toBe(true);
        expect(physicsService.applyAreaEffect).toHaveBeenLastCalledWith(
          'room-1',
          expect.objectContaining({ type: spellType }),
        );
      }
    });
  });

  describe('castAreaSpell - area spell descriptions', () => {
    it('should use "spreading" prefix for intensity <= 3', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 1);
      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ description: 'spreading fireball' }),
      );

      await helper.castAreaSpell(mockPlayer, 'poison', 'room-1', 3);
      expect(physicsService.applyAreaEffect).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({ description: 'spreading poison cloud' }),
      );
    });

    it('should use "area" prefix for intensity 4-6', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castAreaSpell(mockPlayer, 'lightning', 'room-1', 5);
      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ description: 'area lightning bolt' }),
      );

      await helper.castAreaSpell(mockPlayer, 'ice', 'room-1', 6);
      expect(physicsService.applyAreaEffect).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({ description: 'area ice shard' }),
      );
    });

    it('should use "devastating storm" suffix for intensity > 6', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 7);
      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        expect.objectContaining({ description: 'devastating fireball storm' }),
      );

      await helper.castAreaSpell(mockPlayer, 'acid', 'room-1', 10);
      expect(physicsService.applyAreaEffect).toHaveBeenLastCalledWith(
        'room-1',
        expect.objectContaining({ description: 'devastating acid splash storm' }),
      );
    });
  });

  describe('castAreaSpell - physics service integration', () => {
    it('should include physics result in effects', async () => {
      const mockPhysicsResult = {
        success: true,
        message: 'Multiple targets hit',
        objectsAffected: [
          { objectId: 'target-1', damage: 15 },
          { objectId: 'target-2', damage: 20 },
        ],
      };
      physicsService.applyAreaEffect.mockResolvedValue(mockPhysicsResult);

      const result = await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 5);

      expect(result.effects).toEqual({ physicsResult: mockPhysicsResult });
    });

    it('should create effect with all required fields', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castAreaSpell(mockPlayer, 'ice', 'room-1', 8);

      expect(physicsService.applyAreaEffect).toHaveBeenCalledWith('room-1', {
        type: 'ice',
        intensity: 8,
        sourceId: 'player-1',
        description: 'devastating ice shard storm',
      });
    });

    it('should handle empty room gracefully', async () => {
      physicsService.applyAreaEffect.mockResolvedValue({
        success: true,
        message: 'The spell fizzles harmlessly',
        objectsAffected: [],
      });

      const result = await helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('The spell fizzles harmlessly');
    });

    it('should propagate physics service errors', async () => {
      physicsService.applyAreaEffect.mockRejectedValue(
        new Error('Room not found'),
      );

      await expect(
        helper.castAreaSpell(mockPlayer, 'fire', 'room-1', 5),
      ).rejects.toThrow('Room not found');
    });
  });

  describe('edge cases', () => {
    it('should handle very small decimal intensities', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      const result = await helper.castSpell(mockPlayer, 'fire', 'target-1', 0.001);

      expect(result.success).toBe(true);
      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 0.001 }),
      );
    });

    it('should format player name correctly in message', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Target hit',
      });

      const playerWithLongName = {
        ...mockPlayer,
        name: 'Gandalf the Grey Wizard',
      };

      const result = await helper.castSpell(
        playerWithLongName,
        'fire',
        'target-1',
        5,
      );

      expect(result.message).toContain('Gandalf the Grey Wizard casts');
    });

    it('should not cap intensity at exactly 1000', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 1000);

      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 1000 }),
      );
    });

    it('should allow intensity below cap', async () => {
      physicsService.applyEffect.mockResolvedValue({
        success: true,
        message: 'Effect applied',
      });

      await helper.castSpell(mockPlayer, 'fire', 'target-1', 999);

      expect(physicsService.applyEffect).toHaveBeenCalledWith(
        'target-1',
        expect.objectContaining({ intensity: 999 }),
      );
    });
  });
});
