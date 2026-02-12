"use client";

import { motion } from "framer-motion";
import { TrustTier, TIER_BENEFITS, TrustScoreBreakdown } from "@/lib/trust-engine";
import { Shield, Zap, Clock, DollarSign, Crown, TrendingUp, Check } from "lucide-react";

interface TrustTierBadgeProps {
    tier: TrustTier;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
}

export function TrustTierBadge({ tier, size = "md", showLabel = true }: TrustTierBadgeProps) {
    const benefits = TIER_BENEFITS[tier];

    const sizeClasses = {
        sm: "px-2 py-1 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
    };

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`
        inline-flex items-center gap-2 rounded-full font-bold
        bg-gradient-to-r ${benefits.color}
        ${sizeClasses[size]}
        ${tier === 'diamond' ? 'text-white' : 'text-white'}
        shadow-lg
      `}
        >
            <span>{benefits.emoji}</span>
            {showLabel && <span>{benefits.name} Tier</span>}
        </motion.div>
    );
}

interface TrustScoreBarProps {
    score: number;
    animated?: boolean;
}

export function TrustScoreBar({ score, animated = true }: TrustScoreBarProps) {
    const tier = score >= 86 ? 'diamond' : score >= 61 ? 'gold' : score >= 31 ? 'silver' : 'bronze';
    const benefits = TIER_BENEFITS[tier];

    // Calculate tier thresholds for visual markers
    const thresholds = [
        { pos: 0, tier: 'bronze' },
        { pos: 31, tier: 'silver' },
        { pos: 61, tier: 'gold' },
        { pos: 86, tier: 'diamond' },
    ];

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-sm text-white/60">Trust Score</span>
                </div>
                <span className="text-sm font-bold">{score}/100</span>
            </div>

            {/* Progress bar */}
            <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                {/* Tier sections */}
                <div className="absolute inset-0 flex">
                    <div className="w-[31%] bg-amber-900/30" />
                    <div className="w-[30%] bg-gray-600/30" />
                    <div className="w-[25%] bg-yellow-500/30" />
                    <div className="w-[14%] bg-cyan-400/30" />
                </div>

                {/* Score fill */}
                <motion.div
                    initial={animated ? { width: 0 } : { width: `${score}%` }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`absolute inset-y-0 left-0 bg-gradient-to-r ${benefits.color}`}
                />

                {/* Threshold markers */}
                {thresholds.slice(1).map((t) => (
                    <div
                        key={t.tier}
                        className="absolute top-0 bottom-0 w-0.5 bg-white/20"
                        style={{ left: `${t.pos}%` }}
                    />
                ))}
            </div>

            {/* Tier labels */}
            <div className="flex justify-between text-xs text-white/30">
                <span>🥉 Bronze</span>
                <span>🥈 Silver</span>
                <span>🥇 Gold</span>
                <span>💎 Diamond</span>
            </div>
        </div>
    );
}

interface TrustBreakdownCardProps {
    breakdown: TrustScoreBreakdown;
}

export function TrustBreakdownCard({ breakdown }: TrustBreakdownCardProps) {
    const items = [
        { label: "Base Score", value: breakdown.base, icon: Shield },
        { label: "Email Verified", value: breakdown.emailVerified, icon: Check },
        { label: "Phone Verified", value: breakdown.phoneVerified, icon: Check },
        { label: "ID Verified", value: breakdown.idVerified, icon: Crown },
        { label: "Social Accounts", value: breakdown.socialConnected, icon: TrendingUp },
        { label: "Account Age", value: breakdown.accountAge, icon: Clock },
        { label: "Profile Complete", value: breakdown.profileComplete, icon: Check },
        { label: "Device Trust", value: breakdown.deviceTrust, icon: Shield },
        { label: "Fair Wins", value: breakdown.fairWins, icon: TrendingUp },
        { label: "Penalties", value: breakdown.penalties, icon: Zap },
    ];

    return (
        <div className="card-premium p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Score Breakdown
            </h3>

            <div className="space-y-2">
                {items.map((item) => {
                    if (item.value === 0) return null;
                    const isNegative = item.value < 0;

                    return (
                        <motion.div
                            key={item.label}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                        >
                            <div className="flex items-center gap-2">
                                <item.icon className={`w-4 h-4 ${isNegative ? 'text-red-400' : 'text-white/40'}`} />
                                <span className="text-sm text-white/60">{item.label}</span>
                            </div>
                            <span className={`text-sm font-bold ${isNegative ? 'text-red-400' : 'text-green-400'}`}>
                                {isNegative ? '' : '+'}{item.value}
                            </span>
                        </motion.div>
                    );
                })}

                {/* Total */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
                    <span className="font-bold">Total Score</span>
                    <span className="text-xl font-black text-primary">{breakdown.total}</span>
                </div>
            </div>
        </div>
    );
}

interface TierBenefitsCardProps {
    tier: TrustTier;
}

export function TierBenefitsCard({ tier }: TierBenefitsCardProps) {
    const benefits = TIER_BENEFITS[tier];

    const benefitItems = [
        {
            icon: DollarSign,
            label: "Withdrawal Limit",
            value: `$${benefits.withdrawalLimit.toLocaleString()}/day`
        },
        {
            icon: Clock,
            label: "Hold Time",
            value: benefits.withdrawalHoldHours === 0
                ? "Instant"
                : `${benefits.withdrawalHoldHours} hours`
        },
        {
            icon: Crown,
            label: "Can Host",
            value: benefits.canHost ? "Yes" : "No"
        },
        {
            icon: Zap,
            label: "Max Entry",
            value: `$${benefits.maxEventValue.toLocaleString()}`
        },
    ];

    return (
        <div className="card-premium p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Your Benefits</h3>
                <TrustTierBadge tier={tier} size="sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {benefitItems.map((item) => (
                    <div
                        key={item.label}
                        className="p-3 bg-white/5 rounded-xl border border-white/5"
                    >
                        <item.icon className="w-5 h-5 text-primary mb-2" />
                        <p className="text-xs text-white/40">{item.label}</p>
                        <p className="font-bold">{item.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface ImprovementTipsProps {
    tips: string[];
}

export function ImprovementTips({ tips }: ImprovementTipsProps) {
    if (tips.length === 0) {
        return (
            <div className="card-premium p-6">
                <div className="text-center py-4">
                    <Crown className="w-12 h-12 mx-auto mb-2 text-yellow-400" />
                    <p className="font-bold">You're maxed out!</p>
                    <p className="text-sm text-white/40">No improvements available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="card-premium p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Boost Your Score
            </h3>

            <div className="space-y-2">
                {tips.map((tip, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5"
                    >
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {i + 1}
                        </div>
                        <span className="text-sm">{tip}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
