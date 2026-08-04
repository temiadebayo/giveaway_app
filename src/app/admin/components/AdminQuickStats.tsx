"use client";

import { useEffect, useMemo } from 'react';
import { Clock, ArrowDownLeft, ArrowUpRight, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PendingRow {
    id: string;
    amount: number | null;
    profiles?: { username?: string | null } | null;
}

/**
 * Deposits and withdrawals are rendered straight from props.
 *
 * They were previously copied into local state and re-synced by a second effect that
 * called setState during the effect — which triggers a cascading re-render on every
 * parent update, and is what `react-hooks/set-state-in-effect` was flagging. The state
 * served no purpose: router.refresh() re-runs the parent server component, which passes
 * fresh props down anyway. Deriving directly from props is both correct and simpler.
 */
export function AdminQuickStats({
    initialDeposits,
    initialWithdrawals,
}: {
    initialDeposits: PendingRow[];
    initialWithdrawals: PendingRow[];
}) {
    const deposits = initialDeposits;
    const withdrawals = initialWithdrawals;
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        // Subscribe to real-time changes for wallet transactions (deposits)
        const depositSubscription = supabase
            .channel('admin-deposits')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'wallet_transactions',
                filter: "type=eq.deposit"
            }, () => {
                router.refresh();
            })
            .subscribe();

        // Subscribe to real-time changes for withdrawal requests
        const withdrawalSubscription = supabase
            .channel('admin-withdrawals')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'withdrawal_requests'
            }, () => {
                router.refresh();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(depositSubscription);
            supabase.removeChannel(withdrawalSubscription);
        };
    }, [router, supabase]);

    return (
        <div className="grid lg:grid-cols-2 gap-8 mt-8">
            {/* Pending Deposits Widget */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-full">
                <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <ArrowDownLeft className="w-5 h-5 text-green-400" />
                        Pending Deposits
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs font-bold">
                        {deposits?.length || 0}
                    </span>
                </div>

                <div className="flex-grow divide-y divide-slate-800/50">
                    {!deposits || deposits.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                            No pending deposits.
                        </div>
                    ) : (
                        deposits.slice(0, 3).map((tx) => (
                            <div key={tx.id} className="p-4 flex justify-between items-center text-sm">
                                <div>
                                    <p className="font-bold text-white">₦{tx.amount?.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400">@{tx.profiles?.username || 'Unknown'}</p>
                                </div>
                                <div className="text-right">
                                    <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
                                        <Clock className="w-3 h-3" /> Pending
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                    <Link href="/admin/finance" className="flex items-center justify-center gap-2 w-full py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors">
                        View All <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Pending Withdrawals Widget */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-full">
                <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <ArrowUpRight className="w-5 h-5 text-orange-400" />
                        Pending Withdrawals
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold">
                        {withdrawals?.length || 0}
                    </span>
                </div>

                <div className="flex-grow divide-y divide-slate-800/50">
                    {!withdrawals || withdrawals.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                            No pending withdrawals.
                        </div>
                    ) : (
                        withdrawals.slice(0, 3).map((w) => (
                            <div key={w.id} className="p-4 flex justify-between items-center text-sm">
                                <div>
                                    <p className="font-bold text-white">₦{w.amount?.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400">@{w.profiles?.username || 'Unknown'}</p>
                                </div>
                                <div className="text-right">
                                    <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
                                        <Clock className="w-3 h-3" /> Pending
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                    <Link href="/admin/finance" className="flex items-center justify-center gap-2 w-full py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors">
                        View All <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
