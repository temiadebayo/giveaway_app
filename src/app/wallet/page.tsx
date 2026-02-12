"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { walletService, Wallet, WalletTransaction, WithdrawalRequest, WITHDRAWAL_FEE_PERCENT } from "@/lib/wallet-service";
import {
    Wallet as WalletIcon,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    ChevronRight,
    Loader2,
    Plus,
    History,
    Shield,
    AlertCircle,
    CheckCircle2,
    XCircle,
    TrendingUp,
    Lock
} from "lucide-react";

export default function WalletPage() {
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState<string>("");
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    useEffect(() => {
        loadWalletData();
    }, []);

    const loadWalletData = async () => {
        setLoading(true);
        const [walletData, txData, withdrawalData] = await Promise.all([
            walletService.getWallet(),
            walletService.getTransactions(),
            walletService.getWithdrawalRequests()
        ]);
        setWallet(walletData);
        setTransactions(txData);
        setWithdrawals(withdrawalData);
        setLoading(false);
    };

    const handleWithdraw = async () => {
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) {
            setWithdrawError("Please enter a valid amount");
            return;
        }
        if (wallet && amount > wallet.balance) {
            setWithdrawError("Insufficient balance");
            return;
        }

        setWithdrawing(true);
        setWithdrawError(null);

        const result = await walletService.requestWithdrawal(amount);

        if (result.success) {
            setWithdrawSuccess(true);
            setShowWithdraw(false);
            setWithdrawAmount("");
            await loadWalletData();
        } else {
            setWithdrawError(result.error || "Failed to process withdrawal");
        }

        setWithdrawing(false);
    };

    const formatCurrency = (amount: number) => {
        return walletService.formatCurrency(amount, wallet?.currency || 'USD');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
            case 'completed':
                return <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
            case 'processing':
                return <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
            case 'failed':
            case 'cancelled':
                return <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs flex items-center gap-1"><XCircle className="w-3 h-3" /> {status}</span>;
            default:
                return null;
        }
    };

    const fee = withdrawAmount ? parseFloat(withdrawAmount) * (WITHDRAWAL_FEE_PERCENT / 100) : 0;
    const netAmount = withdrawAmount ? parseFloat(withdrawAmount) - fee : 0;

    if (loading) {
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-aurora">
            {/* App Header with User Avatar */}
            <AppHeader />

            <div className="max-w-4xl mx-auto p-4 sm:p-6">
                {/* Breadcrumbs */}
                <Breadcrumbs items={[
                    { label: 'Wallet' }
                ]} />

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <WalletIcon className="w-8 h-8 text-primary" />
                        My Wallet
                    </h1>
                    <p className="text-white/60">Manage your funds and withdrawals</p>
                </motion.div>

                {/* Balance Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid md:grid-cols-2 gap-4 mb-8"
                >
                    {/* Available Balance */}
                    <div className="card-premium p-6">
                        <div className="flex items-center gap-2 mb-2 text-white/60">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-sm">Available Balance</span>
                        </div>
                        <p className="text-4xl font-black text-gradient-primary">
                            {formatCurrency(wallet?.balance || 0)}
                        </p>
                        <div className="flex gap-2 mt-4">
                            <Button
                                onClick={() => setShowWithdraw(true)}
                                disabled={!wallet?.balance || wallet.balance <= 0}
                                className="flex-1 bg-brand-gradient"
                            >
                                <ArrowUpRight className="w-4 h-4 mr-2" />
                                Withdraw
                            </Button>
                            <Button variant="outline" className="flex-1">
                                <Plus className="w-4 h-4 mr-2" />
                                Deposit
                            </Button>
                        </div>
                    </div>

                    {/* Escrow / Held */}
                    <div className="card-premium p-6">
                        <div className="flex items-center gap-2 mb-2 text-white/60">
                            <Lock className="w-4 h-4" />
                            <span className="text-sm">Held in Escrow</span>
                        </div>
                        <p className="text-4xl font-black text-blue-400">
                            {formatCurrency(wallet?.escrow_balance || 0)}
                        </p>
                        <p className="text-sm text-white/40 mt-2">
                            Funds held for active giveaways
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
                            <div>
                                <p className="text-xs text-white/40">Total Earned</p>
                                <p className="font-bold text-green-400">{formatCurrency(wallet?.total_earned || 0)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-white/40">Total Withdrawn</p>
                                <p className="font-bold text-white/60">{formatCurrency(wallet?.total_withdrawn || 0)}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Pending Withdrawals */}
                {withdrawals.filter(w => w.status === 'pending').length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8"
                    >
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Pending Withdrawals
                        </h3>
                        <div className="space-y-3">
                            {withdrawals.filter(w => w.status === 'pending').map((w) => (
                                <div key={w.id} className="card-premium p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold">{formatCurrency(w.net_amount)}</p>
                                        <p className="text-sm text-white/40">
                                            Fee: {formatCurrency(w.fee)} • Hold until: {w.hold_until ? formatDate(w.hold_until) : 'N/A'}
                                        </p>
                                    </div>
                                    {getStatusBadge(w.status)}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Transaction History */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        Transaction History
                    </h3>

                    {transactions.length === 0 ? (
                        <div className="card-premium p-8 text-center">
                            <WalletIcon className="w-12 h-12 mx-auto mb-3 text-white/20" />
                            <p className="text-white/40">No transactions yet</p>
                            <p className="text-sm text-white/20">Win a giveaway or deposit funds to get started!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {transactions.map((tx) => {
                                const display = walletService.getTransactionDisplay(tx.type);
                                return (
                                    <motion.div
                                        key={tx.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="card-premium p-4 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{display.icon}</span>
                                            <div>
                                                <p className="font-medium">{display.label}</p>
                                                <p className="text-xs text-white/40">{formatDate(tx.created_at)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${display.color}`}>
                                                {display.sign}{formatCurrency(tx.amount)}
                                            </p>
                                            {tx.fee > 0 && (
                                                <p className="text-xs text-white/40">Fee: {formatCurrency(tx.fee)}</p>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Withdraw Modal */}
            <AnimatePresence>
                {showWithdraw && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
                        onClick={() => setShowWithdraw(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md card-premium p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <ArrowUpRight className="w-5 h-5 text-primary" />
                                Withdraw Funds
                            </h2>

                            {/* Available */}
                            <div className="p-4 rounded-xl bg-white/5 mb-4">
                                <p className="text-sm text-white/60">Available Balance</p>
                                <p className="text-2xl font-bold">{formatCurrency(wallet?.balance || 0)}</p>
                            </div>

                            {/* Amount Input */}
                            <div className="mb-4">
                                <label className="block text-sm text-white/60 mb-2">Amount to Withdraw</label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    max={wallet?.balance || 0}
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="text-2xl font-bold"
                                />
                            </div>

                            {/* Fee Breakdown */}
                            {parseFloat(withdrawAmount) > 0 && (
                                <div className="p-4 rounded-xl bg-white/5 mb-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Amount</span>
                                        <span>{formatCurrency(parseFloat(withdrawAmount) || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Fee ({WITHDRAWAL_FEE_PERCENT}%)</span>
                                        <span className="text-orange-400">-{formatCurrency(fee)}</span>
                                    </div>
                                    <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                                        <span>You'll Receive</span>
                                        <span className="text-green-400">{formatCurrency(netAmount)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Hold Notice */}
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-4">
                                <Shield className="w-4 h-4 text-yellow-400 mt-0.5" />
                                <p className="text-xs text-yellow-400">
                                    Withdrawals have a 48-hour hold period for security verification
                                </p>
                            </div>

                            {/* Error */}
                            {withdrawError && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                    <p className="text-sm text-red-400">{withdrawError}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setShowWithdraw(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 bg-brand-gradient"
                                    onClick={handleWithdraw}
                                    disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                                >
                                    {withdrawing ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <ArrowUpRight className="w-4 h-4 mr-2" />
                                    )}
                                    Withdraw
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Success Toast */}
            <AnimatePresence>
                {withdrawSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                    >
                        <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-green-500 text-white shadow-2xl">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-medium">Withdrawal request submitted!</span>
                            <button onClick={() => setWithdrawSuccess(false)} className="ml-2 text-white/80 hover:text-white">
                                ×
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
