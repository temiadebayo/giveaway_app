"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface BalanceChartProps {
    transactions: Array<{
        balance_after: number;
        created_at: string;
        type: string;
        status: string;
    }>;
}

export function BalanceChart({ transactions }: BalanceChartProps) {
    // Filter completed transactions and sort oldest-first
    const completed = transactions
        .filter(tx => tx.status === "completed")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (completed.length < 2) {
        return (
            <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800/40 text-center">
                <p className="text-xs text-slate-500">Need at least 2 transactions for balance history</p>
            </div>
        );
    }

    // Take last 15 data points max
    const data = completed.slice(-15);
    const balances = data.map(tx => tx.balance_after);
    const minBal = Math.min(...balances);
    const maxBal = Math.max(...balances);
    const range = maxBal - minBal || 1;

    const width = 280;
    const height = 80;
    const paddingY = 8;
    const usableHeight = height - paddingY * 2;

    // Generate SVG path points
    const points = data.map((tx, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = paddingY + usableHeight - ((tx.balance_after - minBal) / range) * usableHeight;
        return { x, y };
    });

    // Build line path
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // Build area under the curve
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    // Determine trend
    const currentBalance = balances[balances.length - 1];
    const previousBalance = balances[0];
    const changePercent = previousBalance > 0
        ? ((currentBalance - previousBalance) / previousBalance * 100).toFixed(1)
        : "0.0";
    const trend = currentBalance > previousBalance ? "up" : currentBalance < previousBalance ? "down" : "flat";

    const gradientId = "balanceGradient";

    return (
        <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800/40">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Balance History</p>
                <div className={`flex items-center gap-1 text-xs font-bold ${
                    trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-slate-400"
                }`}>
                    {trend === "up" && <TrendingUp className="w-3 h-3" />}
                    {trend === "down" && <TrendingDown className="w-3 h-3" />}
                    {trend === "flat" && <Minus className="w-3 h-3" />}
                    {trend !== "flat" && `${trend === "up" ? "+" : ""}${changePercent}%`}
                </div>
            </div>

            <motion.svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-16"
                preserveAspectRatio="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={trend === "down" ? "#ef4444" : "#9506FA"} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={trend === "down" ? "#ef4444" : "#9506FA"} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Area fill */}
                <motion.path
                    d={areaPath}
                    fill={`url(#${gradientId})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8 }}
                />

                {/* Line */}
                <motion.path
                    d={linePath}
                    fill="none"
                    stroke={trend === "down" ? "#ef4444" : "#9506FA"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                />

                {/* Current point */}
                <motion.circle
                    cx={points[points.length - 1].x}
                    cy={points[points.length - 1].y}
                    r="3"
                    fill={trend === "down" ? "#ef4444" : "#9506FA"}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1.0 }}
                />
            </motion.svg>

            {/* Labels */}
            <div className="flex justify-between mt-1">
                <p className="text-[10px] text-slate-600">
                    {new Date(data[0].created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                </p>
                <p className="text-[10px] text-slate-600">
                    {new Date(data[data.length - 1].created_at).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                </p>
            </div>
        </div>
    );
}
