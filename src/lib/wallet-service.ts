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

// Default withdrawal fee percentage
export const WITHDRAWAL_FEE_PERCENT = 3;
export const WITHDRAWAL_HOLD_HOURS = 48;

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
     * Create wallet for current user
     */
    async createWallet(): Promise<Wallet | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await this.supabase
            .from('wallets')
            .insert({ user_id: user.id })
            .select()
            .single();

        if (error) {
            console.error('Error creating wallet:', error.message, error.code, error.details);
            return null;
        }

        return data;
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
     * Request a withdrawal
     */
    async requestWithdrawal(amount: number): Promise<{
        success: boolean;
        withdrawal_id?: string;
        net_amount?: number;
        fee?: number;
        hold_until?: string;
        error?: string;
    }> {
        const { data, error } = await this.supabase
            .rpc('request_withdrawal', {
                p_amount: amount,
                p_fee_percentage: WITHDRAWAL_FEE_PERCENT,
                p_hold_hours: WITHDRAWAL_HOLD_HOURS
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
        game_type?: 'tap' | 'quiz' | 'spin';
        duration_seconds?: number;
        min_trust_tier?: 'bronze' | 'silver' | 'gold' | 'diamond';
        max_participants?: number;
        scheduled_start?: Date | null;
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
                p_scheduled_start: params.scheduled_start?.toISOString() || null
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
    formatCurrency(amount: number, currency: string = 'USD'): string {
        return new Intl.NumberFormat('en-US', {
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
