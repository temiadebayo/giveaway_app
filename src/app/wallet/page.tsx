"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { walletService, Wallet, WalletTransaction, WithdrawalRequest, FEES, BANK_DETAILS } from "@/lib/wallet-service";
import { ProfileCompletionBanner } from "@/components/profile-completion-banner";
import { createClient } from "@/lib/supabase";
import NatMascot from "@/assets/Nat_GA_Mascot.svg";
import { BalanceChart } from "@/components/wallet/balance-chart";
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

    // Withdraw State
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState<string>("");
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    // Deposit State
    const [showDeposit, setShowDeposit] = useState(false);
    const [depositAmount, setDepositAmount] = useState("");
    const [depositResult, setDepositResult] = useState<{ reference_code: string; amount: number } | null>(null);
    const [depositError, setDepositError] = useState<string | null>(null);
    const [username, setUsername] = useState<string>("");

    // Bank Details State
    const [bankName, setBankName] = useState("");
    const [accountName, setAccountName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [hasBankDetails, setHasBankDetails] = useState(false);

    const loadWalletData = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Fetch username & bank details
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, bank_name, account_name, account_number')
                .eq('id', user.id)
                .single();
            if (profile?.username) setUsername(profile.username);
            if (profile?.bank_name && profile?.account_name && profile?.account_number) {
                setBankName(profile.bank_name);
                setAccountName(profile.account_name);
                setAccountNumber(profile.account_number);
                setHasBankDetails(true);
            }
        }

        const walletData = await walletService.getWallet();
        const txData = await walletService.getTransactions();
        const withdrawalData = await walletService.getWithdrawalRequests();

        setWallet(walletData);
        setTransactions(txData);
        setWithdrawals(withdrawalData);
        setLoading(false);
    };

    useEffect(() => {
        loadWalletData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

        if (!hasBankDetails && (!bankName || !accountName || !accountNumber)) {
            setWithdrawError("Please provide your bank details");
            return;
        }

        setWithdrawing(true);
        setWithdrawError(null);

        // Define payout details payload
        const payoutDetails = {
            bank_name: bankName,
            account_name: accountName,
            account_number: accountNumber
        };

        // If user didn't have bank details, update their profile too
        if (!hasBankDetails) {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase
                    .from('profiles')
                    .update(payoutDetails)
                    .eq('id', user.id);
                setHasBankDetails(true);
            }
        }

        const result = await walletService.requestWithdrawal(amount, payoutDetails);

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

    const handleDeposit = async () => {
        const amount = parseFloat(depositAmount);
        if (isNaN(amount) || amount <= 0) return;

        setLoading(true);
        setDepositError(null);
        const supabase = createClient();

        const { data, error } = await supabase.rpc('request_deposit', { p_amount: amount });

        setLoading(false);

        if (error) {
            console.error(error);
            setDepositError(error.message || "Failed to initiate deposit");
        } else if (data && data.success) {
            setDepositResult({
                reference_code: data.reference_code,
                amount: data.amount
            });
            // Keep modal open to show instructions
        } else if (data && !data.success) {
            setDepositError(data.error || "Deposit request failed");
        }
    };

    const formatCurrency = (amount: number) => {
        return walletService.formatCurrency(amount, wallet?.currency || 'NGN');
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

    // Deposit fee calculation
    const depositAmountNum = parseFloat(depositAmount) || 0;
    const depositFee = depositAmountNum * (FEES.DEPOSIT_FEE_PERCENT / 100);
    const depositTotal = depositAmountNum + depositFee;

    // Withdrawal fee calculation
    const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
    const withdrawFee = withdrawAmountNum * (FEES.WITHDRAWAL_FEE_PERCENT / 100);
    const withdrawNet = withdrawAmountNum - withdrawFee;

    if (loading && !depositResult) { // Don't show full loader if just depositing
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-aurora overflow-x-hidden">
            {/* App Header with User Avatar */}
            <AppHeader />

            <div className="max-w-4xl mx-auto px-3 py-4 sm:p-6">
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

                {/* Profile Completion Reminder */}
                <div className="mb-6">
                    <ProfileCompletionBanner />
                </div>

                {/* Balance Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid md:grid-cols-2 gap-3 sm:gap-4 mb-8"
                >
                    {/* Available Balance */}
                    <div className="card-premium p-6">
                        <div className="flex items-center gap-2 mb-2 text-white/60">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-sm">Available Balance</span>
                        </div>
                        <p className="text-3xl sm:text-4xl font-black text-gradient-primary">
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
                            <Button variant="outline" className="flex-1" onClick={() => setShowDeposit(true)}>
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
                        <p className="text-3xl sm:text-4xl font-black text-blue-400">
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

                {/* Balance History Chart */}
                {transactions.length >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8"
                    >
                        <BalanceChart transactions={transactions} />
                    </motion.div>
                )}

                {/* Active Withdrawals */}
                {withdrawals.filter(w => ['pending', 'processing'].includes(w.status)).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8"
                    >
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Active Withdrawals
                        </h3>
                        <div className="space-y-4">
                            {withdrawals.filter(w => ['pending', 'processing'].includes(w.status)).map((w) => (
                                <div key={w.id} className="card-premium p-4 flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-lg">{formatCurrency(w.net_amount)}</p>
                                            <p className="text-sm text-white/40">
                                                Fee: {formatCurrency(w.fee)} • Hold until: {w.hold_until ? formatDate(w.hold_until) : 'N/A'}
                                            </p>
                                        </div>
                                        {getStatusBadge(w.status)}
                                    </div>

                                    {/* Progress tracking */}
                                    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                                        <div
                                            className={`h-1.5 rounded-full transition-all duration-500 ease-out ${w.status === 'processing' ? 'bg-blue-500 w-2/3'
                                                    : w.status === 'completed' ? 'bg-green-500 w-full'
                                                        : 'bg-yellow-500 w-1/3'
                                                }`}
                                        />
                                    </div>
                                    <div className="text-[10px] sm:text-xs flex justify-between px-1 mt-1 font-medium">
                                        <span className={w.status === 'pending' ? 'text-yellow-400' : 'text-slate-500'}>Requested</span>
                                        <span className={w.status === 'processing' ? 'text-blue-400' : w.status === 'completed' ? 'text-slate-500' : 'text-slate-600'}>Processing</span>
                                        <span className={w.status === 'completed' ? 'text-green-400' : 'text-slate-600'}>Completed</span>
                                    </div>
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
                            <Image src={NatMascot} alt="Nat" width={80} height={80} className="mx-auto mb-3 drop-shadow-md" />
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

            {/* Deposit Modal */}
            <AnimatePresence>
                {showDeposit && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
                        onClick={() => setShowDeposit(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md card-premium p-6 max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {!depositResult ? (
                                <>
                                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <Plus className="w-5 h-5 text-green-400" />
                                        Add Funds
                                    </h2>
                                    <p className="text-white/60 mb-6 text-sm">
                                        Enter the amount you want credited to your wallet. A {FEES.DEPOSIT_FEE_PERCENT}% processing fee applies.
                                    </p>

                                    {/* Amount Input */}
                                    <div className="mb-4">
                                        <label className="block text-sm text-white/60 mb-2">Amount to Credit (NGN)</label>
                                        <Input
                                            type="number"
                                            value={depositAmount}
                                            onChange={(e) => setDepositAmount(e.target.value)}
                                            placeholder="10,000"
                                            autoFocus
                                            className="text-2xl font-bold bg-white/5 border-white/10"
                                        />
                                    </div>

                                    {/* Fee Breakdown */}
                                    {depositAmountNum > 0 && (
                                        <div className="p-4 rounded-xl bg-white/5 mb-4 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/60">Wallet Credit</span>
                                                <span>{formatCurrency(depositAmountNum)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-white/60">Processing Fee ({FEES.DEPOSIT_FEE_PERCENT}%)</span>
                                                <span className="text-orange-400">+{formatCurrency(depositFee)}</span>
                                            </div>
                                            <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                                                <span>Total to Transfer</span>
                                                <span className="text-green-400">{formatCurrency(depositTotal)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Bank Details */}
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 mb-4 space-y-3">
                                        <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Transfer to</p>
                                        <div>
                                            <p className="text-xs text-white/40">Bank</p>
                                            <p className="font-medium">{BANK_DETAILS.bankName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-white/40">Account Name</p>
                                            <p className="font-medium">{BANK_DETAILS.accountName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-white/40">Account Number</p>
                                            <div className="flex items-center gap-2">
                                                <p className="font-mono font-bold text-lg">{BANK_DETAILS.accountNumber}</p>
                                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigator.clipboard.writeText(BANK_DETAILS.accountNumber)}>
                                                    Copy
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Username Narration Warning */}
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-4">
                                        <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm text-yellow-400 font-bold">Include your username in the transfer narration/remarks:</p>
                                            <p className="text-lg font-mono font-black text-yellow-300 mt-1">{username ? `@${username}` : 'Loading...'}</p>
                                            <p className="text-xs text-yellow-400/70 mt-1">Without this, we cannot verify your transfer.</p>
                                        </div>
                                    </div>

                                    {/* Error */}
                                    {depositError && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
                                            <p className="text-sm text-red-500 font-medium">{depositError}</p>
                                        </div>
                                    )}

                                    {/* Support */}
                                    <p className="text-xs text-white/30 mb-4 text-center">
                                        Issues? Contact <a href={`mailto:${BANK_DETAILS.supportEmail}`} className="text-primary underline">{BANK_DETAILS.supportEmail}</a>
                                    </p>

                                    <div className="flex gap-3">
                                        <Button variant="outline" className="flex-1" onClick={() => setShowDeposit(false)}>
                                            Cancel
                                        </Button>
                                        <Button
                                            className="flex-1 bg-green-500 hover:bg-green-600 text-black font-bold"
                                            onClick={handleDeposit}
                                            disabled={!depositAmount || depositAmountNum <= 0 || loading}
                                        >
                                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Continue
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle2 className="w-8 h-8 text-green-500" />
                                        </div>
                                        <h2 className="text-2xl font-bold mb-2">Deposit Requested!</h2>
                                        <p className="text-white/60">
                                            Transfer <span className="text-white font-bold">{formatCurrency(depositTotal)}</span> to the bank details shown above.
                                        </p>
                                    </div>

                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 mb-4">
                                        <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Your Reference Code</p>
                                        <div className="bg-black/30 p-3 rounded-lg flex justify-between items-center">
                                            <code className="text-xl font-black text-yellow-400 tracking-wider">
                                                {depositResult.reference_code}
                                            </code>
                                            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(depositResult.reference_code)}>
                                                Copy
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
                                        <Shield className="w-4 h-4 text-blue-400 mt-0.5" />
                                        <p className="text-xs text-blue-400">
                                            Once you complete the transfer, your deposit will be verified by our team. Funds will appear in your wallet after confirmation.
                                        </p>
                                    </div>

                                    <Button
                                        className="w-full bg-green-500 hover:bg-green-600 text-black font-bold"
                                        onClick={() => {
                                            setShowDeposit(false);
                                            setDepositResult(null);
                                            setDepositAmount("");
                                            setDepositError(null);
                                            loadWalletData();
                                        }}
                                    >
                                        I&apos;ve Sent the Money
                                    </Button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                            {withdrawAmountNum > 0 && (
                                <div className="p-4 rounded-xl bg-white/5 mb-4 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Withdrawal Amount</span>
                                        <span>{formatCurrency(withdrawAmountNum)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60">Processing Fee ({FEES.WITHDRAWAL_FEE_PERCENT}%)</span>
                                        <span className="text-orange-400">-{formatCurrency(withdrawFee)}</span>
                                    </div>
                                    <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                                        <span>You&apos;ll Receive</span>
                                        <span className="text-green-400">{formatCurrency(withdrawNet)}</span>
                                    </div>
                                    <p className="text-xs text-white/40 pt-1">
                                        <Link href="/fees" className="text-primary underline">View fee policy</Link>
                                    </p>
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
                                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    <p className="text-sm text-red-400">{withdrawError}</p>
                                </div>
                            )}

                            {/* Bank Details Collection */}
                            {withdrawAmountNum > 0 && withdrawAmountNum <= (wallet?.balance || 0) && (
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6 space-y-3">
                                    <p className="text-sm font-bold text-white mb-2 flex items-center justify-between">
                                        Where should we send your money?
                                        {hasBankDetails && (
                                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Saved locally</span>
                                        )}
                                    </p>
                                    
                                    <div>
                                        <label className="block text-xs text-white/60 mb-1">Bank Name</label>
                                        <Input
                                            type="text"
                                            value={bankName}
                                            onChange={(e) => setBankName(e.target.value)}
                                            placeholder="e.g. Guarantee Trust Bank"
                                            className="bg-black/20"
                                            disabled={hasBankDetails}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-white/60 mb-1">Account Name</label>
                                        <Input
                                            type="text"
                                            value={accountName}
                                            onChange={(e) => setAccountName(e.target.value)}
                                            placeholder="e.g. John Doe"
                                            className="bg-black/20"
                                            disabled={hasBankDetails}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-white/60 mb-1">Account Number</label>
                                        <Input
                                            type="text"
                                            value={accountNumber}
                                            onChange={(e) => setAccountNumber(e.target.value)}
                                            placeholder="e.g. 0123456789"
                                            className="bg-black/20"
                                            disabled={hasBankDetails}
                                        />
                                    </div>
                                    
                                    {hasBankDetails && (
                                        <p className="text-xs text-white/40 italic pt-1 text-right">
                                            Update via <Link href="/settings" className="text-primary underline">Settings</Link>
                                        </p>
                                    )}
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
                                    disabled={!withdrawAmount || withdrawAmountNum <= 0 || withdrawAmountNum > (wallet?.balance || 0) || withdrawing || (!hasBankDetails && (!bankName || !accountName || !accountNumber))}
                                >
                                    {withdrawing ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <ArrowUpRight className="w-4 h-4 mr-2" />
                                    )}
                                    Withdraw Now
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
