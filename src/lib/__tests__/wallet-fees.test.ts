import { describe, it, expect, vi } from 'vitest';

// Prevent wallet-service from instantiating a real Supabase client at import time
vi.mock('../supabase', () => ({
    createClient: () => ({}),
}));

import { FEES, WITHDRAWAL_COOLDOWN_HOURS } from '../wallet-service';

// Pure fee calculation logic extracted for testing
function calcDepositNet(amount: number): { fee: number; net: number } {
    const fee = Math.round(amount * (FEES.DEPOSIT_FEE_PERCENT / 100) * 100) / 100;
    return { fee, net: amount - fee };
}

function calcWithdrawalNet(amount: number): { fee: number; net: number } {
    const fee = Math.round(amount * (FEES.WITHDRAWAL_FEE_PERCENT / 100) * 100) / 100;
    return { fee, net: amount - fee };
}

/**
 * These constants are display values. The authoritative schedule is get_fee_schedule()
 * in 20260802120200_phase0_secure_functions.sql, and request_withdrawal() derives the
 * fee from it server-side.
 *
 * If you change a number here, change it there too — these assertions are the reminder.
 */
describe('FEES config parity with get_fee_schedule() in SQL', () => {
    it('deposit fee is 0% — no deposit fee is actually charged by request_deposit()', () => {
        // The UI previously advertised 5% while the RPC credited the full amount.
        // Charging it means implementing it in request_deposit(), then changing both.
        expect(FEES.DEPOSIT_FEE_PERCENT).toBe(0);
    });

    it('withdrawal fee is 5%', () => {
        expect(FEES.WITHDRAWAL_FEE_PERCENT).toBe(5);
    });

    it('withdrawal hold is 48 hours (bronze/silver baseline)', () => {
        expect(FEES.WITHDRAWAL_HOLD_HOURS).toBe(48);
    });

    it('max deposit is ₦5,000,000', () => {
        expect(FEES.MAX_DEPOSIT).toBe(5_000_000);
    });

    it('max withdrawal is ₦500,000', () => {
        expect(FEES.MAX_WITHDRAWAL).toBe(500_000);
    });

    it('currency is NGN', () => {
        expect(FEES.DEFAULT_CURRENCY).toBe('NGN');
    });
});

describe('withdrawal cooldown ladder parity with withdrawal_cooldown_hours() in SQL', () => {
    it('matches the tier ladder', () => {
        expect(WITHDRAWAL_COOLDOWN_HOURS).toEqual({
            bronze: 48,
            silver: 48,
            gold: 24,
            diamond: 6,
        });
    });
});

describe('deposit fee calculation', () => {
    it('credits the full amount while the deposit fee is 0', () => {
        const { fee, net } = calcDepositNet(10000);
        expect(fee).toBe(0);
        expect(net).toBe(10000);
    });

    it('fee + net always equals gross amount', () => {
        [100, 500, 1000, 5000, 100000].forEach(amount => {
            const { fee, net } = calcDepositNet(amount);
            expect(fee + net).toBeCloseTo(amount, 2);
        });
    });
});

describe('withdrawal fee calculation', () => {
    it('calculates 5% fee on ₦10,000', () => {
        const { fee, net } = calcWithdrawalNet(10000);
        expect(fee).toBe(500);
        expect(net).toBe(9500);
    });

    it('calculates 5% fee on ₦100,000', () => {
        const { fee, net } = calcWithdrawalNet(100000);
        expect(fee).toBe(5000);
        expect(net).toBe(95000);
    });

    it('net amount is always positive', () => {
        [100, 500, 1000, 50000].forEach(amount => {
            const { net } = calcWithdrawalNet(amount);
            expect(net).toBeGreaterThan(0);
        });
    });

    it('fee + net always equals gross amount', () => {
        [100, 500, 1000, 50000].forEach(amount => {
            const { fee, net } = calcWithdrawalNet(amount);
            expect(fee + net).toBeCloseTo(amount, 2);
        });
    });

    it('never produces negative net', () => {
        const { net } = calcWithdrawalNet(1);
        expect(net).toBeGreaterThanOrEqual(0);
    });
});
