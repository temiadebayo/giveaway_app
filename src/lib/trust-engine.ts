/**
 * Trust Score Engine
 * 
 * Calculates and manages user trust scores based on various factors.
 * Score range: 0-100
 * 
 * Tiers:
 * - Bronze: 0-30
 * - Silver: 31-60
 * - Gold: 61-85
 * - Diamond: 86-100
 */

export type TrustTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface TrustScoreBreakdown {
    base: number;
    emailVerified: number;
    phoneVerified: number;
    idVerified: number;
    socialConnected: number;
    accountAge: number;
    profileComplete: number;
    deviceTrust: number;
    fairWins: number;
    penalties: number;
    total: number;
    tier: TrustTier;
}

export interface TrustFactors {
    // Identity
    emailVerified?: boolean;
    phoneVerified?: boolean;
    idVerified?: boolean;
    socialConnections?: number; // 0-2 (Discord, X, etc.)

    // Account
    accountAgeDays?: number;
    hasAvatar?: boolean;
    hasBio?: boolean;
    hasUsername?: boolean;

    // Device
    uniqueDevice?: boolean;
    knownGoodDevice?: boolean;
    deviceConfidence?: number; // 0-100

    // History
    fairWins?: number;

    // Red flags
    sameDeviceAsFlag?: boolean;
    vpnDetected?: boolean;
    multipleAccounts?: boolean;
    rapidAccountCreation?: boolean;
    suspiciousWinPattern?: boolean;
    newDeviceBigWin?: boolean;
}

// Score weights for each factor
const SCORE_WEIGHTS = {
    // Positive factors
    base: 10,
    emailVerified: 10,
    phoneVerified: 20,
    idVerified: 30,
    socialConnected: 10, // per connection, max 20
    accountAge7Days: 10,
    accountAge30Days: 10,
    profileComplete: 5,
    uniqueDevice: 20,
    knownGoodDevice: 10,
    fairWin: 5, // per win, max 25

    // Negative factors (penalties)
    sameDeviceAsFlag: -50,
    vpnDetected: -20,
    multipleAccounts: -40,
    rapidAccountCreation: -30,
    suspiciousWinPattern: -25,
    newDeviceBigWin: -15,
} as const;

// Tier thresholds
const TIER_THRESHOLDS = {
    bronze: 0,
    silver: 31,
    gold: 61,
    diamond: 86,
} as const;

// Tier benefits
export const TIER_BENEFITS = {
    bronze: {
        name: 'Bronze',
        emoji: '🥉',
        color: 'from-amber-700 to-amber-900',
        withdrawalLimit: 50,
        withdrawalHoldHours: 168, // 7 days
        canHost: false,
        maxEventValue: 100,
    },
    silver: {
        name: 'Silver',
        emoji: '🥈',
        color: 'from-gray-400 to-gray-600',
        withdrawalLimit: 500,
        withdrawalHoldHours: 48,
        canHost: true,
        maxEventValue: 500,
    },
    gold: {
        name: 'Gold',
        emoji: '🥇',
        color: 'from-yellow-400 to-amber-500',
        withdrawalLimit: 2000,
        withdrawalHoldHours: 24,
        canHost: true,
        maxEventValue: 2000,
    },
    diamond: {
        name: 'Diamond',
        emoji: '💎',
        color: 'from-cyan-400 to-blue-500',
        withdrawalLimit: 10000,
        withdrawalHoldHours: 4,
        canHost: true,
        maxEventValue: 10000,
    },
} as const;

/**
 * Calculate trust score from factors
 */
export function calculateTrustScore(factors: TrustFactors): TrustScoreBreakdown {
    let breakdown: TrustScoreBreakdown = {
        base: SCORE_WEIGHTS.base,
        emailVerified: 0,
        phoneVerified: 0,
        idVerified: 0,
        socialConnected: 0,
        accountAge: 0,
        profileComplete: 0,
        deviceTrust: 0,
        fairWins: 0,
        penalties: 0,
        total: 0,
        tier: 'bronze',
    };

    // Email verified
    if (factors.emailVerified) {
        breakdown.emailVerified = SCORE_WEIGHTS.emailVerified;
    }

    // Phone verified
    if (factors.phoneVerified) {
        breakdown.phoneVerified = SCORE_WEIGHTS.phoneVerified;
    }

    // ID verified
    if (factors.idVerified) {
        breakdown.idVerified = SCORE_WEIGHTS.idVerified;
    }

    // Social connections (max 20)
    const socialPoints = Math.min((factors.socialConnections || 0) * SCORE_WEIGHTS.socialConnected, 20);
    breakdown.socialConnected = socialPoints;

    // Account age
    if (factors.accountAgeDays !== undefined) {
        if (factors.accountAgeDays >= 30) {
            breakdown.accountAge = SCORE_WEIGHTS.accountAge7Days + SCORE_WEIGHTS.accountAge30Days;
        } else if (factors.accountAgeDays >= 7) {
            breakdown.accountAge = SCORE_WEIGHTS.accountAge7Days;
        }
    }

    // Profile completeness
    let profilePoints = 0;
    if (factors.hasAvatar) profilePoints += 2;
    if (factors.hasBio) profilePoints += 2;
    if (factors.hasUsername) profilePoints += 1;
    breakdown.profileComplete = Math.min(profilePoints, SCORE_WEIGHTS.profileComplete);

    // Device trust
    if (factors.uniqueDevice) {
        breakdown.deviceTrust += SCORE_WEIGHTS.uniqueDevice;
    }
    if (factors.knownGoodDevice) {
        breakdown.deviceTrust += SCORE_WEIGHTS.knownGoodDevice;
    }

    // Fair wins (max 25)
    const winPoints = Math.min((factors.fairWins || 0) * SCORE_WEIGHTS.fairWin, 25);
    breakdown.fairWins = winPoints;

    // Penalties
    let penalties = 0;
    if (factors.sameDeviceAsFlag) penalties += SCORE_WEIGHTS.sameDeviceAsFlag;
    if (factors.vpnDetected) penalties += SCORE_WEIGHTS.vpnDetected;
    if (factors.multipleAccounts) penalties += SCORE_WEIGHTS.multipleAccounts;
    if (factors.rapidAccountCreation) penalties += SCORE_WEIGHTS.rapidAccountCreation;
    if (factors.suspiciousWinPattern) penalties += SCORE_WEIGHTS.suspiciousWinPattern;
    if (factors.newDeviceBigWin) penalties += SCORE_WEIGHTS.newDeviceBigWin;
    breakdown.penalties = penalties;

    // Calculate total
    const rawTotal =
        breakdown.base +
        breakdown.emailVerified +
        breakdown.phoneVerified +
        breakdown.idVerified +
        breakdown.socialConnected +
        breakdown.accountAge +
        breakdown.profileComplete +
        breakdown.deviceTrust +
        breakdown.fairWins +
        breakdown.penalties;

    // Clamp between 0-100
    breakdown.total = Math.max(0, Math.min(100, rawTotal));

    // Determine tier
    breakdown.tier = getTierFromScore(breakdown.total);

    return breakdown;
}

/**
 * Get tier from score
 */
export function getTierFromScore(score: number): TrustTier {
    if (score >= TIER_THRESHOLDS.diamond) return 'diamond';
    if (score >= TIER_THRESHOLDS.gold) return 'gold';
    if (score >= TIER_THRESHOLDS.silver) return 'silver';
    return 'bronze';
}

/**
 * Get tier benefits
 */
export function getTierBenefits(tier: TrustTier) {
    return TIER_BENEFITS[tier];
}

/**
 * Get score needed for next tier
 */
export function getScoreToNextTier(currentScore: number): { nextTier: TrustTier | null; pointsNeeded: number } {
    const currentTier = getTierFromScore(currentScore);

    switch (currentTier) {
        case 'bronze':
            return { nextTier: 'silver', pointsNeeded: TIER_THRESHOLDS.silver - currentScore };
        case 'silver':
            return { nextTier: 'gold', pointsNeeded: TIER_THRESHOLDS.gold - currentScore };
        case 'gold':
            return { nextTier: 'diamond', pointsNeeded: TIER_THRESHOLDS.diamond - currentScore };
        case 'diamond':
            return { nextTier: null, pointsNeeded: 0 };
    }
}

/**
 * Get tips to improve trust score
 */
export function getImprovementTips(factors: TrustFactors): string[] {
    const tips: string[] = [];

    if (!factors.emailVerified) {
        tips.push('Verify your email address (+10 points)');
    }
    if (!factors.phoneVerified) {
        tips.push('Verify your phone number (+20 points)');
    }
    if (!factors.idVerified) {
        tips.push('Complete ID verification (+30 points)');
    }
    if ((factors.socialConnections || 0) < 2) {
        tips.push('Connect more social accounts (+10 points each)');
    }
    if (!factors.hasAvatar) {
        tips.push('Add a profile picture (+2 points)');
    }
    if (!factors.hasBio) {
        tips.push('Add a bio to your profile (+2 points)');
    }
    if ((factors.accountAgeDays || 0) < 7) {
        tips.push('Account age bonus unlocks after 7 days');
    }

    return tips;
}
