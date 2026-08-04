import { createClient } from './supabase';

export interface Wallet {
    id: string;
    user_id: string;
    balance: number;
    escrow_balance: number;
    total_earned: number;
    total_withdrawn: number;
    total_deposited: number;
    currency: string;
    created_at: string;
    updated_at: string;
}

export interface WalletTransaction {
    id: string;
    wallet_id: string;
    user_id: string;
    type: 'deposit' | 'withdrawal' | 'withdrawal_fee' | 'prize_escrow' | 'prize_release' | 'prize_refund' | 'entry_fee' | 'platform_fee';
    amount: number;
    fee: number;
    net_amount: number;
    balance_before: number;
    balance_after: number;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    reference_type?: string;
    reference_id?: string;
    description?: string;
    created_at: string;
}

export interface WithdrawalRequest {
    id: string;
    user_id: string;
    wallet_id: string;
    amount: number;
    fee: number;
    net_amount: number;
    fee_percentage: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    payout_method?: string;
    hold_until?: string;
    processed_at?: string;
    created_at: string;
}

/**
 * Fee configuration — display values.
 *
 * The authoritative schedule lives in the database (`get_fee_schedule()`), and
 * request_withdrawal() derives the fee from it server-side. These constants exist only
 * so the UI can render a quote without a round-trip; they must be kept in step with the
 * SQL. `npm test` asserts they match.
 *
 * Previously this object also declared WITHDRAWAL_VAT_PERCENT (7.5) and
 * WITHDRAWAL_COMMISSION_PERCENT (3), which were never applied anywhere — not in the UI,
 * not in the RPC. They are removed rather than left to imply a charge that does not exist.
 * DEPOSIT_FEE_PERCENT is 0 for the same reason: the deposit path never charged the 5%
 * the /fees page advertised.
 */
export const FEES = {
    DEPOSIT_FEE_PERCENT: 0,
    WITHDRAWAL_FEE_PERCENT: 5,
    WITHDRAWAL_HOLD_HOURS: 48,
    MAX_DEPOSIT: 5_000_000,
    MAX_WITHDRAWAL: 500_000,
    DEFAULT_CURRENCY: 'NGN',
};

/**
 * Withdrawal hold/cooldown by trust tier, mirroring withdrawal_cooldown_hours() in SQL.
 */
export const WITHDRAWAL_COOLDOWN_HOURS: Record<string, number> = {
    bronze: 48,
    silver: 48,
    gold: 24,
    diamond: 6,
};

// Bank details for deposits
export const BANK_DETAILS = {
    bankName: 'Guaranty Trust Bank',
    accountName: 'Adebayo Temiloluwa Ryan',
    accountNumber: '0516446667',
    supportEmail: 'support@trygiveaway.app',
};

// Legacy exports for backward compat
export const WITHDRAWAL_FEE_PERCENT = FEES.WITHDRAWAL_FEE_PERCENT;
export const WITHDRAWAL_HOLD_HOURS = FEES.WITHDRAWAL_HOLD_HOURS;

class WalletService {
    private supabase = createClient();

    /**
     * Get current user's wallet
     */
    async getWallet(): Promise<Wallet | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await this.supabase
            .from('wallets')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error) {
            // If no wallet exists, create one
            if (error.code === 'PGRST116') {
                return this.createWallet();
            }
            console.error('Error fetching wallet:', error);
            return null;
        }

        return data;
    }

    /**
     * Create the current user's wallet if it does not exist yet.
     *
     * Goes through ensure_wallet(), which also backfills a missing profile row in the
     * same transaction. The previous version INSERTed into wallets from the browser —
     * with the blanket INSERT grant that was in place, a new user could have opened
     * their account with a balance of their choosing.
     */
    async createWallet(): Promise<Wallet | null> {
        const { data, error } = await this.supabase.rpc('ensure_wallet');

        if (error) {
            console.error('Error creating wallet:', error.message);
            return null;
        }

        return data as Wallet;
    }

    /**
     * Get transaction history
     */
    async getTransactions(limit: number = 50): Promise<WalletTransaction[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('wallet_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Get withdrawal requests
     */
    async getWithdrawalRequests(): Promise<WithdrawalRequest[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('withdrawal_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching withdrawals:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Request a withdrawal.
     *
     * The fee percentage and hold period are NOT sent. They used to be RPC arguments,
     * which meant anyone could call the endpoint with
     * `{p_fee_percentage: 0, p_hold_hours: 0}` and withdraw with no fee and no
     * anti-fraud hold. The database now derives both from the caller's trust tier.
     */
    async requestWithdrawal(amount: number, payoutDetails?: { bank_name: string; account_name: string; account_number: string }): Promise<{
        success: boolean;
        withdrawal_id?: string;
        net_amount?: number;
        fee?: number;
        fee_percentage?: number;
        hold_until?: string;
        error?: string;
    }> {
        const { data, error } = await this.supabase
            .rpc('request_withdrawal', {
                p_amount: amount,
                p_payout_details: payoutDetails ?? null
            });

        if (error) {
            console.error('Error requesting withdrawal:', error);
            return { success: false, error: error.message };
        }

        return data;
    }

    /**
     * Check if user has enough balance for a giveaway
     */
    async hasBalanceForGiveaway(amount: number): Promise<boolean> {
        const wallet = await this.getWallet();
        if (!wallet) return false;
        return wallet.balance >= amount;
    }

    /**
     * Create giveaway with escrow (funds held)
     */
    async createGiveawayWithEscrow(params: {
        title: string;
        description?: string;
        prize_amount: number;
        game_type?: 'tap';
        duration_seconds?: number;
        min_trust_tier?: 'bronze' | 'silver' | 'gold' | 'diamond';
        max_participants?: number;
        scheduled_start?: Date | null;
        allow_sharing?: boolean;
        number_of_winners?: number;
        prevent_previous_winners_hours?: number;
    }): Promise<{
        success: boolean;
        giveaway_id?: string;
        starts_at?: string;
        ends_at?: string;
        error?: string;
        balance?: number;
        required?: number;
    }> {
        const { data, error } = await this.supabase
            .rpc('create_giveaway_with_escrow', {
                p_title: params.title,
                p_description: params.description || '',
                p_prize_amount: params.prize_amount,
                p_game_type: params.game_type || 'tap',
                p_duration_seconds: params.duration_seconds || 30,
                p_min_trust_tier: params.min_trust_tier || 'bronze',
                p_max_participants: params.max_participants || 1000,
                p_scheduled_start: params.scheduled_start?.toISOString() || null,
                p_allow_sharing: params.allow_sharing !== false,
                p_number_of_winners: params.number_of_winners || 1,
                p_prevent_previous_winners_hours: params.prevent_previous_winners_hours || 0
            });

        if (error) {
            console.error('Error creating giveaway with escrow:', error);
            return { success: false, error: error.message };
        }

        return data;
    }

    /**
     * Complete a giveaway (pick winner, release escrow)
     */
    async completeGiveaway(giveawayId: string): Promise<{
        success: boolean;
        status?: 'ended' | 'cancelled';
        winner_id?: string;
        winner_username?: string;
        winning_score?: number;
        prize_amount?: number;
        error?: string;
    }> {
        const { data, error } = await this.supabase
            .rpc('complete_giveaway', { p_giveaway_id: giveawayId });

        if (error) {
            console.error('Error completing giveaway:', error);
            return { success: false, error: error.message };
        }

        return data;
    }

    /**
     * Subscribe to wallet balance changes
     */
    subscribeToWallet(userId: string, callback: (wallet: Wallet) => void) {
        return this.supabase
            .channel(`wallet:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'wallets',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    callback(payload.new as Wallet);
                }
            )
            .subscribe();
    }

    /**
     * Format currency amount
     */
    formatCurrency(amount: number, currency: string = 'NGN'): string {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Get transaction type display info
     */
    getTransactionDisplay(type: WalletTransaction['type']): {
        label: string;
        color: string;
        icon: string;
        sign: '+' | '-';
    } {
        const displays: Record<WalletTransaction['type'], { label: string; color: string; icon: string; sign: '+' | '-' }> = {
            deposit: { label: 'Deposit', color: 'text-green-400', icon: '💰', sign: '+' },
            withdrawal: { label: 'Withdrawal', color: 'text-red-400', icon: '📤', sign: '-' },
            withdrawal_fee: { label: 'Withdrawal Fee', color: 'text-orange-400', icon: '💸', sign: '-' },
            prize_escrow: { label: 'Prize Held', color: 'text-blue-400', icon: '🔒', sign: '-' },
            prize_release: { label: 'Prize Won!', color: 'text-yellow-400', icon: '🏆', sign: '+' },
            prize_refund: { label: 'Prize Refund', color: 'text-cyan-400', icon: '↩️', sign: '+' },
            entry_fee: { label: 'Entry Fee', color: 'text-purple-400', icon: '🎟️', sign: '-' },
            platform_fee: { label: 'Platform Fee', color: 'text-gray-400', icon: '📊', sign: '-' }
        };

        return displays[type];
    }
}

export const walletService = new WalletService();
