import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}

// Types for database tables
export type Profile = {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    phone_verified: boolean
    id_verified: boolean
    trust_score: number
    trust_tier: 'bronze' | 'silver' | 'gold' | 'diamond'
    total_wins: number
    total_winnings: number
    withdrawal_limit: number
    created_at: string
    updated_at: string
}

export type DeviceFingerprint = {
    id: string
    fingerprint_hash: string
    canvas_hash: string | null
    webgl_info: Record<string, unknown> | null
    audio_hash: string | null
    screen_info: string | null
    first_seen_at: string
    last_seen_at: string
    times_seen: number
    is_flagged: boolean
    flag_reason: string | null
}

export type UserDevice = {
    id: string
    user_id: string
    fingerprint_id: string
    ip_address: string | null
    user_agent: string | null
    is_primary: boolean
    created_at: string
    last_used_at: string
}

export type TrustEvent = {
    id: string
    user_id: string
    event_type: string
    score_change: number
    reason: string | null
    metadata: Record<string, unknown> | null
    created_at: string
}

export type Giveaway = {
    id: string
    host_id: string
    title: string
    description: string | null
    prize_amount: number
    prize_currency: string
    game_type: string
    min_trust_tier: string
    max_participants: number | null
    entry_fee: number
    status: 'draft' | 'active' | 'ended' | 'cancelled'
    starts_at: string
    ends_at: string
    created_at: string
}

export type GiveawayParticipant = {
    id: string
    giveaway_id: string
    user_id: string
    device_fingerprint_id: string | null
    score: number | null
    rank: number | null
    joined_at: string
    completed_at: string | null
}

export type Transaction = {
    id: string
    user_id: string
    type: 'deposit' | 'withdrawal' | 'prize_in' | 'prize_out' | 'entry_fee' | 'refund'
    amount: number
    currency: string
    status: 'pending' | 'completed' | 'failed' | 'on_hold'
    stripe_payment_id: string | null
    hold_until: string | null
    metadata: Record<string, unknown> | null
    created_at: string
    completed_at: string | null
}

// Database types
export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: Profile
                Insert: Partial<Profile> & { id: string }
                Update: Partial<Profile>
            }
            device_fingerprints: {
                Row: DeviceFingerprint
                Insert: Omit<DeviceFingerprint, 'id' | 'first_seen_at' | 'last_seen_at' | 'times_seen'>
                Update: Partial<DeviceFingerprint>
            }
            user_devices: {
                Row: UserDevice
                Insert: Omit<UserDevice, 'id' | 'created_at' | 'last_used_at'>
                Update: Partial<UserDevice>
            }
            trust_events: {
                Row: TrustEvent
                Insert: Omit<TrustEvent, 'id' | 'created_at'>
                Update: Partial<TrustEvent>
            }
            giveaways: {
                Row: Giveaway
                Insert: Omit<Giveaway, 'id' | 'created_at'>
                Update: Partial<Giveaway>
            }
            giveaway_participants: {
                Row: GiveawayParticipant
                Insert: Omit<GiveawayParticipant, 'id' | 'joined_at'>
                Update: Partial<GiveawayParticipant>
            }
            transactions: {
                Row: Transaction
                Insert: Omit<Transaction, 'id' | 'created_at'>
                Update: Partial<Transaction>
            }
        }
    }
}
