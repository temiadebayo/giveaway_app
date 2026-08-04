import { describe, it, expect } from 'vitest';
import {
    calculateTrustScore,
    getTierFromScore,
    getScoreToNextTier,
    TIER_BENEFITS,
} from '../trust-engine';

describe('getTierFromScore', () => {
    it('returns bronze for scores 0-30', () => {
        expect(getTierFromScore(0)).toBe('bronze');
        expect(getTierFromScore(15)).toBe('bronze');
        expect(getTierFromScore(30)).toBe('bronze');
    });

    it('returns silver for scores 31-60', () => {
        expect(getTierFromScore(31)).toBe('silver');
        expect(getTierFromScore(45)).toBe('silver');
        expect(getTierFromScore(60)).toBe('silver');
    });

    it('returns gold for scores 61-85', () => {
        expect(getTierFromScore(61)).toBe('gold');
        expect(getTierFromScore(75)).toBe('gold');
        expect(getTierFromScore(85)).toBe('gold');
    });

    it('returns diamond for scores 86-100', () => {
        expect(getTierFromScore(86)).toBe('diamond');
        expect(getTierFromScore(100)).toBe('diamond');
    });
});

describe('calculateTrustScore', () => {
    it('starts with base score of 10 for empty factors', () => {
        const result = calculateTrustScore({});
        expect(result.base).toBe(10);
        expect(result.total).toBe(10);
        expect(result.tier).toBe('bronze');
    });

    it('adds correct points for each identity factor', () => {
        const result = calculateTrustScore({
            emailVerified: true,
            phoneVerified: true,
            idVerified: true,
        });
        expect(result.emailVerified).toBe(10);
        expect(result.phoneVerified).toBe(20);
        expect(result.idVerified).toBe(30);
        // base(10) + email(10) + phone(20) + id(30) = 70
        expect(result.total).toBe(70);
        expect(result.tier).toBe('gold');
    });

    it('caps social connections at 20 points', () => {
        const two = calculateTrustScore({ socialConnections: 2 });
        const ten = calculateTrustScore({ socialConnections: 10 });
        expect(two.socialConnected).toBe(20);
        expect(ten.socialConnected).toBe(20); // capped
    });

    it('awards account age bonus correctly', () => {
        const under7 = calculateTrustScore({ accountAgeDays: 3 });
        const over7 = calculateTrustScore({ accountAgeDays: 7 });
        const over30 = calculateTrustScore({ accountAgeDays: 30 });

        expect(under7.accountAge).toBe(0);
        expect(over7.accountAge).toBe(10);
        expect(over30.accountAge).toBe(20);
    });

    it('caps fair wins at 25 points (5 wins)', () => {
        const fiveWins = calculateTrustScore({ fairWins: 5 });
        const tenWins = calculateTrustScore({ fairWins: 10 });
        expect(fiveWins.fairWins).toBe(25);
        expect(tenWins.fairWins).toBe(25); // capped
    });

    it('applies VPN penalty correctly', () => {
        const result = calculateTrustScore({ emailVerified: true, vpnDetected: true });
        // base(10) + email(10) - vpn(20) = 0
        expect(result.total).toBe(0);
    });

    it('applies multiple accounts penalty', () => {
        const result = calculateTrustScore({ emailVerified: true, phoneVerified: true, multipleAccounts: true });
        // base(10) + email(10) + phone(20) - multipleAccounts(40) = 0 (clamped)
        expect(result.total).toBe(0);
    });

    it('clamps score to minimum 0 even with heavy penalties', () => {
        const result = calculateTrustScore({
            sameDeviceAsFlag: true,   // -50
            multipleAccounts: true,   // -40
            rapidAccountCreation: true, // -30
        });
        expect(result.total).toBe(0);
        expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('clamps score to maximum 100', () => {
        const result = calculateTrustScore({
            emailVerified: true,
            phoneVerified: true,
            idVerified: true,
            socialConnections: 2,
            accountAgeDays: 30,
            hasAvatar: true,
            hasBio: true,
            hasUsername: true,
            uniqueDevice: true,
            knownGoodDevice: true,
            fairWins: 10,
        });
        expect(result.total).toBeLessThanOrEqual(100);
    });

    it('reaches Silver tier with phone + email verified', () => {
        // base(10) + email(10) + phone(20) = 40 → Silver
        const result = calculateTrustScore({ emailVerified: true, phoneVerified: true });
        expect(result.tier).toBe('silver');
    });

    it('reaches Diamond tier with full verification', () => {
        // base(10) + email(10) + phone(20) + id(30) + social(20) + age(20) = 110 → clamped 100 → Diamond
        const result = calculateTrustScore({
            emailVerified: true,
            phoneVerified: true,
            idVerified: true,
            socialConnections: 2,
            accountAgeDays: 30,
        });
        expect(result.tier).toBe('diamond');
    });
});

describe('getScoreToNextTier', () => {
    it('returns correct points needed from bronze to silver', () => {
        const result = getScoreToNextTier(10);
        expect(result.nextTier).toBe('silver');
        expect(result.pointsNeeded).toBe(21); // 31 - 10
    });

    it('returns correct points needed from silver to gold', () => {
        const result = getScoreToNextTier(45);
        expect(result.nextTier).toBe('gold');
        expect(result.pointsNeeded).toBe(16); // 61 - 45
    });

    it('returns null nextTier for diamond', () => {
        const result = getScoreToNextTier(90);
        expect(result.nextTier).toBeNull();
        expect(result.pointsNeeded).toBe(0);
    });
});

describe('TIER_BENEFITS', () => {
    it('diamond never has zero withdrawal hold hours', () => {
        expect(TIER_BENEFITS.diamond.withdrawalHoldHours).toBeGreaterThan(0);
    });

    it('withdrawal limits increase with tier', () => {
        expect(TIER_BENEFITS.silver.withdrawalLimit).toBeGreaterThan(TIER_BENEFITS.bronze.withdrawalLimit);
        expect(TIER_BENEFITS.gold.withdrawalLimit).toBeGreaterThan(TIER_BENEFITS.silver.withdrawalLimit);
        expect(TIER_BENEFITS.diamond.withdrawalLimit).toBeGreaterThan(TIER_BENEFITS.gold.withdrawalLimit);
    });

    it('hold hours decrease with tier', () => {
        expect(TIER_BENEFITS.silver.withdrawalHoldHours).toBeLessThan(TIER_BENEFITS.bronze.withdrawalHoldHours);
        expect(TIER_BENEFITS.gold.withdrawalHoldHours).toBeLessThan(TIER_BENEFITS.silver.withdrawalHoldHours);
        expect(TIER_BENEFITS.diamond.withdrawalHoldHours).toBeLessThan(TIER_BENEFITS.gold.withdrawalHoldHours);
    });

    it('silver and above can host', () => {
        expect(TIER_BENEFITS.bronze.canHost).toBe(false);
        expect(TIER_BENEFITS.silver.canHost).toBe(true);
        expect(TIER_BENEFITS.gold.canHost).toBe(true);
        expect(TIER_BENEFITS.diamond.canHost).toBe(true);
    });
});
