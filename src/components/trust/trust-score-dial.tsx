"use client";

import { motion } from "framer-motion";

interface TrustScoreDialProps {
    score: number; // 0-100
    tier: string;
    className?: string;
}

const tierConfig: Record<string, { color: string; label: string; emoji: string }> = {
    bronze: { color: "#CD7F32", label: "Bronze", emoji: "🥉" },
    silver: { color: "#C0C0C0", label: "Silver", emoji: "🥈" },
    gold: { color: "#FFD700", label: "Gold", emoji: "🥇" },
    diamond: { color: "#00BFFF", label: "Diamond", emoji: "💎" },
};

// Tier threshold markers on the dial
const tierThresholds = [
    { score: 0, tier: "bronze" },
    { score: 25, tier: "silver" },
    { score: 50, tier: "gold" },
    { score: 75, tier: "diamond" },
];

export function TrustScoreDial({ score, tier, className = "" }: TrustScoreDialProps) {
    const config = tierConfig[tier] || tierConfig.bronze;
    const clampedScore = Math.max(0, Math.min(100, score));

    // SVG arc params — semicircle from 135° to 405° (270° sweep)
    const radius = 60;
    const cx = 75;
    const cy = 75;
    const strokeWidth = 10;
    const circumference = (270 / 360) * 2 * Math.PI * radius;
    const progress = (clampedScore / 100) * circumference;

    // Convert angle to SVG coordinates
    const polarToCartesian = (angleDeg: number) => {
        const angleRad = ((angleDeg - 90) * Math.PI) / 180;
        return {
            x: cx + radius * Math.cos(angleRad),
            y: cy + radius * Math.sin(angleRad),
        };
    };

    // Background arc path (135° to 405°)
    const startAngle = 135;
    const endAngle = 405;
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(endAngle);

    const bgArcPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;

    return (
        <div className={`flex flex-col items-center ${className}`}>
            <div className="relative w-[150px] h-[120px]">
                <svg viewBox="0 0 150 130" className="w-full h-full">
                    {/* Background arc */}
                    <path
                        d={bgArcPath}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />

                    {/* Progress arc */}
                    <motion.path
                        d={bgArcPath}
                        fill="none"
                        stroke={config.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - progress }}
                        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                        style={{
                            filter: `drop-shadow(0 0 6px ${config.color}60)`,
                        }}
                    />

                    {/* Tier threshold markers */}
                    {tierThresholds.map((t) => {
                        const angle = startAngle + (t.score / 100) * 270;
                        const pos = polarToCartesian(angle);
                        const tc = tierConfig[t.tier];
                        return (
                            <circle
                                key={t.tier}
                                cx={pos.x}
                                cy={pos.y}
                                r="2.5"
                                fill={tc.color}
                                opacity={0.4}
                            />
                        );
                    })}
                </svg>

                {/* Center score */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                    <motion.p
                        className="text-3xl font-black text-white leading-none"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5, type: "spring", bounce: 0.3 }}
                    >
                        {clampedScore}
                    </motion.p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Trust Score</p>
                </div>
            </div>

            {/* Tier badge */}
            <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border mt-1"
                style={{
                    borderColor: `${config.color}40`,
                    background: `${config.color}10`,
                }}
            >
                <span className="text-sm">{config.emoji}</span>
                <span className="text-xs font-bold" style={{ color: config.color }}>
                    {config.label} Tier
                </span>
            </motion.div>
        </div>
    );
}
