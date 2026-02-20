"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { walletService, Wallet } from "@/lib/wallet-service";
import { TrustTier } from "@/lib/trust-engine";
import {
    ArrowLeft,
    Trophy,
    Loader2,
    Zap,
    Sparkles,
    Crown,
    Gem,
    Star,
    ChevronRight,
    Settings,
    Clock,
    Users,
    Shield,
    Wallet as WalletIcon,
    AlertCircle
} from "lucide-react";

// Preset tiers (in dollars)
const PRESET_TIERS = [
    {
        amount: 100,
        label: "$100",
        icon: Star,
        color: "from-blue-500 to-cyan-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
        popular: false,
        description: "Starter Pack"
    },
    {
        amount: 500,
        label: "$500",
        icon: Trophy,
        color: "from-green-500 to-emerald-400",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/30",
        popular: false,
        description: "Community Boost"
    },
    {
        amount: 1000,
        label: "$1K",
        icon: Zap,
        color: "from-yellow-500 to-orange-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
        popular: true,
        description: "Mega Giveaway"
    },
    {
        amount: 5000,
        label: "$5K",
        icon: Crown,
        color: "from-pink-500 to-purple-400",
        bgColor: "bg-pink-500/10",
        borderColor: "border-pink-500/30",
        popular: false,
        description: "Premium Event"
    },
    {
        amount: 10000,
        label: "$10K",
        icon: Gem,
        color: "from-purple-500 to-indigo-400",
        bgColor: "bg-purple-500/10",
        borderColor: "border-purple-500/30",
        popular: false,
        description: "Ultimate Prize"
    },
];

export default function CreateGiveawayPage() {
    const router = useRouter();
    const [mode, setMode] = useState<'quick' | 'advanced'>('quick');
    const [selectedTier, setSelectedTier] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingWallet, setLoadingWallet] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wallet, setWallet] = useState<Wallet | null>(null);

    // Advanced mode form
    const [form, setForm] = useState({
        title: '',
        description: '',
        prize_amount: 100,
        game_type: 'tap' as const,
        game_duration_seconds: 30,
        min_trust_tier: 'bronze' as TrustTier,
        max_participants: 1000,
    });

    // Load wallet balance on mount
    useEffect(() => {
        loadWallet();
    }, []);

    const loadWallet = async () => {
        setLoadingWallet(true);
        const walletData = await walletService.getWallet();
        setWallet(walletData);
        setLoadingWallet(false);
    };

    // Quick create with preset
    const handleQuickCreate = async (amount: number) => {
        // Check balance first
        if (!wallet || wallet.balance < amount) {
            setError(`Insufficient balance. You need $${amount.toLocaleString()} to create this giveaway.`);
            return;
        }

        setSelectedTier(amount);
        setLoading(true);
        setError(null);

        const tier = PRESET_TIERS.find(t => t.amount === amount);

        const result = await walletService.createGiveawayWithEscrow({
            title: `${tier?.label} Giveaway`,
            description: `Win big in this ${tier?.description?.toLowerCase()} giveaway!`,
            prize_amount: amount,
            game_type: 'tap',
            duration_seconds: 30,
            min_trust_tier: 'bronze',
            max_participants: 1000,
            scheduled_start: null, // Go live immediately
        });

        if (result.success && result.giveaway_id) {
            router.push(`/giveaways/${result.giveaway_id}`);
        } else {
            if (result.error?.includes('Insufficient balance')) {
                setError(`Insufficient balance. You have $${result.balance?.toLocaleString() || 0}, need $${result.required?.toLocaleString() || amount}`);
            } else {
                setError(result.error || 'Failed to create giveaway');
            }
            setLoading(false);
            setSelectedTier(null);
        }
    };

    // Advanced create
    const handleAdvancedCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check balance first
        if (!wallet || wallet.balance < form.prize_amount) {
            setError(`Insufficient balance. You need $${form.prize_amount.toLocaleString()} to create this giveaway.`);
            return;
        }

        setLoading(true);
        setError(null);

        const result = await walletService.createGiveawayWithEscrow({
            title: form.title,
            description: form.description,
            prize_amount: form.prize_amount,
            game_type: form.game_type,
            duration_seconds: form.game_duration_seconds,
            min_trust_tier: form.min_trust_tier,
            max_participants: form.max_participants,
            scheduled_start: null,
        });

        if (result.success && result.giveaway_id) {
            router.push(`/giveaways/${result.giveaway_id}`);
        } else {
            setError(result.error || 'Failed to create giveaway');
            setLoading(false);
        }
    };

    const tiers: { value: TrustTier; label: string; emoji: string }[] = [
        { value: 'bronze', label: 'Bronze', emoji: '🥉' },
        { value: 'silver', label: 'Silver', emoji: '🥈' },
        { value: 'gold', label: 'Gold', emoji: '🥇' },
        { value: 'diamond', label: 'Diamond', emoji: '💎' },
    ];

    const durations = [15, 30, 45, 60];

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0
        }).format(amount);
    };

    return (
        <main className="min-h-screen bg-aurora overflow-x-hidden">
            {/* App Header with User Avatar */}
            <AppHeader />

            <div className="max-w-4xl mx-auto px-3 py-4 sm:p-6">
                {/* Breadcrumbs */}
                <Breadcrumbs items={[
                    { label: 'Giveaways', href: '/giveaways' },
                    { label: 'Create' }
                ]} />

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-6"
                >
                    <h1 className="text-4xl md:text-5xl font-black mb-3">
                        <span className="text-gradient-primary">Host a Giveaway</span>
                    </h1>
                    <p className="text-white/60 text-lg">
                        Pick a prize tier and go live instantly! 🚀
                    </p>
                </motion.div>

                {/* Wallet Balance Banner */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6"
                >
                    {loadingWallet ? (
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                        </div>
                    ) : wallet && wallet.balance > 0 ? (
                        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <WalletIcon className="w-5 h-5 text-green-400" />
                                <div>
                                    <p className="text-sm text-white/60">Available Balance</p>
                                    <p className="text-xl font-bold text-green-400">{formatCurrency(wallet.balance)}</p>
                                </div>
                            </div>
                            <Link href="/wallet">
                                <Button variant="outline" size="sm">
                                    Add Funds
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="p-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                                <div>
                                    <p className="font-bold text-yellow-400 mb-1">Fund Your Wallet First</p>
                                    <p className="text-sm text-white/60 mb-4">
                                        You need funds in your wallet to host a giveaway. Prize money is held in escrow until the event ends.
                                    </p>
                                    <Link href="/wallet">
                                        <Button className="bg-yellow-500 hover:bg-yellow-600 text-black">
                                            <WalletIcon className="w-4 h-4 mr-2" />
                                            Go to Wallet
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Mode Toggle */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex justify-center gap-2 mb-8"
                >
                    <Button
                        variant={mode === 'quick' ? 'default' : 'outline'}
                        onClick={() => setMode('quick')}
                        className={mode === 'quick' ? 'bg-brand-gradient' : ''}
                    >
                        <Zap className="w-4 h-4 mr-2" />
                        Quick Start
                    </Button>
                    <Button
                        variant={mode === 'advanced' ? 'default' : 'outline'}
                        onClick={() => setMode('advanced')}
                    >
                        <Settings className="w-4 h-4 mr-2" />
                        Advanced
                    </Button>
                </motion.div>

                <AnimatePresence mode="wait">
                    {mode === 'quick' ? (
                        <motion.div
                            key="quick"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            {/* Quick Mode - Preset Tiers */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                {PRESET_TIERS.map((tier, index) => {
                                    const Icon = tier.icon;
                                    const isSelected = selectedTier === tier.amount;
                                    const isLoading = loading && isSelected;
                                    const canAfford = wallet && wallet.balance >= tier.amount;

                                    return (
                                        <motion.button
                                            key={tier.amount}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            whileHover={canAfford ? { scale: 1.03, y: -4 } : {}}
                                            whileTap={canAfford ? { scale: 0.98 } : {}}
                                            onClick={() => handleQuickCreate(tier.amount)}
                                            disabled={loading || !canAfford}
                                            className={`
                                                relative p-6 rounded-2xl border-2 text-left transition-all
                                                ${tier.bgColor} ${tier.borderColor}
                                                ${canAfford ? 'hover:border-white/40 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                                                ${isSelected ? 'ring-2 ring-white' : ''}
                                                ${loading && !isSelected ? 'opacity-50' : ''}
                                            `}
                                        >
                                            {/* Popular Badge */}
                                            {tier.popular && (
                                                <div className="absolute -top-2 -right-2 px-2 py-1 rounded-full bg-yellow-500 text-black text-xs font-bold">
                                                    ⭐ POPULAR
                                                </div>
                                            )}

                                            {/* Can't Afford Badge */}
                                            {!canAfford && (
                                                <div className="absolute -top-2 -left-2 px-2 py-1 rounded-full bg-red-500/80 text-white text-xs font-bold">
                                                    Insufficient Funds
                                                </div>
                                            )}

                                            {/* Icon */}
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center mb-4`}>
                                                {isLoading ? (
                                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                                ) : (
                                                    <Icon className="w-6 h-6 text-white" />
                                                )}
                                            </div>

                                            {/* Amount */}
                                            <p className={`text-3xl font-black bg-gradient-to-r ${tier.color} bg-clip-text text-transparent`}>
                                                {tier.label}
                                            </p>

                                            {/* Description */}
                                            <p className="text-white/60 text-sm mt-1">
                                                {tier.description}
                                            </p>

                                            {/* Quick Info */}
                                            <div className="flex items-center gap-3 mt-4 text-xs text-white/40">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> 30s game
                                                </span>
                                            </div>

                                            {/* Go Live indicator */}
                                            {canAfford && (
                                                <div className="flex items-center gap-2 mt-4 text-sm font-medium text-green-400">
                                                    <Sparkles className="w-4 h-4" />
                                                    Tap to Go Live
                                                    <ChevronRight className="w-4 h-4" />
                                                </div>
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* Error */}
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-center mb-4"
                                >
                                    {error}
                                    {error.includes('Insufficient') && (
                                        <Link href="/wallet" className="block mt-2">
                                            <Button size="sm" variant="outline" className="text-red-400 border-red-400/50">
                                                Fund Wallet
                                            </Button>
                                        </Link>
                                    )}
                                </motion.div>
                            )}

                            {/* Info */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="text-center text-white/40 text-sm"
                            >
                                <p>💡 Quick giveaways: 30s tap game, open to all trust tiers</p>
                                <p className="mt-1">Prize is held in escrow and released to winner automatically</p>
                                <p className="mt-1">
                                    Need more control? Switch to{' '}
                                    <button onClick={() => setMode('advanced')} className="text-primary underline">
                                        Advanced mode
                                    </button>
                                </p>
                            </motion.div>
                        </motion.div>
                    ) : (
                        <motion.form
                            key="advanced"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            onSubmit={handleAdvancedCreate}
                            className="space-y-6"
                        >
                            {/* Title */}
                            <div className="card-premium p-6">
                                <label className="block mb-2 font-medium">
                                    <Trophy className="w-4 h-4 inline mr-2 text-yellow-400" />
                                    Giveaway Title
                                </label>
                                <Input
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g., Epic $100 Tap Challenge!"
                                    required
                                />
                            </div>

                            {/* Description */}
                            <div className="card-premium p-6">
                                <label className="block mb-2 font-medium">Description (Optional)</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Tell players what this giveaway is about..."
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                                    rows={3}
                                />
                            </div>

                            {/* Prize */}
                            <div className="card-premium p-6">
                                <label className="block mb-2 font-medium">
                                    💰 Prize Amount (from wallet)
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={wallet?.balance || 0}
                                    value={form.prize_amount}
                                    onChange={(e) => setForm({ ...form, prize_amount: Number(e.target.value) })}
                                    required
                                />
                                <p className="text-xs text-white/40 mt-2">
                                    Available: {formatCurrency(wallet?.balance || 0)}
                                </p>
                            </div>

                            {/* Game Duration */}
                            <div className="card-premium p-6">
                                <label className="block mb-3 font-medium">
                                    <Clock className="w-4 h-4 inline mr-2 text-cyan-400" />
                                    Game Duration
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {durations.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setForm({ ...form, game_duration_seconds: d })}
                                            className={`
                                                p-3 rounded-xl border transition-all
                                                ${form.game_duration_seconds === d
                                                    ? 'bg-primary/20 border-primary'
                                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                                                }
                                            `}
                                        >
                                            <p className="text-lg font-bold">{d}s</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Min Trust Tier */}
                            <div className="card-premium p-6">
                                <label className="block mb-3 font-medium">
                                    <Shield className="w-4 h-4 inline mr-2 text-purple-400" />
                                    Minimum Trust Tier
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {tiers.map((tier) => (
                                        <button
                                            key={tier.value}
                                            type="button"
                                            onClick={() => setForm({ ...form, min_trust_tier: tier.value })}
                                            className={`
                                                p-3 rounded-xl border transition-all text-center
                                                ${form.min_trust_tier === tier.value
                                                    ? 'bg-primary/20 border-primary'
                                                    : 'bg-white/5 border-white/10 hover:border-white/20'
                                                }
                                            `}
                                        >
                                            <p className="text-2xl mb-1">{tier.emoji}</p>
                                            <p className="text-xs">{tier.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Max Participants */}
                            <div className="card-premium p-6">
                                <label className="block mb-2 font-medium">
                                    <Users className="w-4 h-4 inline mr-2 text-blue-400" />
                                    Max Participants
                                </label>
                                <Input
                                    type="number"
                                    min={2}
                                    max={10000}
                                    value={form.max_participants}
                                    onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                                    {error}
                                </div>
                            )}

                            {/* Submit */}
                            <Button
                                type="submit"
                                disabled={loading || !form.title || !wallet || wallet.balance < form.prize_amount}
                                className="w-full bg-brand-gradient py-6 text-lg"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5 mr-2" />
                                        Create Giveaway ({formatCurrency(form.prize_amount)})
                                    </>
                                )}
                            </Button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}
