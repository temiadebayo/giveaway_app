"use client";

import { useState } from "react";
import { AlertTriangle, RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refundPrizeClaimAction } from "@/app/admin/finance/actions";

interface ClaimedGiveaway {
    id: string;
    title: string;
    prize_amount: number;
    prize_currency: string;
    prize_claimed_at: string | null;
    winner: { id: string; email: string; username: string; display_name: string } | null;
    host: { id: string; email: string; username: string; display_name: string } | null;
}

interface DisputePanelProps {
    giveaways: ClaimedGiveaway[];
}

function formatPrize(amount: number) {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        minimumFractionDigits: 0,
    }).format(amount);
}

export function DisputePanel({ giveaways }: DisputePanelProps) {
    const [expanded, setExpanded] = useState(false);
    const [pending, setPending] = useState<string | null>(null);
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

    const handleRefund = async (giveawayId: string) => {
        const reason = reasons[giveawayId]?.trim();
        if (!reason) {
            setResults(prev => ({ ...prev, [giveawayId]: { ok: false, msg: "Enter a reason before refunding." } }));
            return;
        }

        const confirmed = window.confirm(
            `Refund the prize for giveaway "${giveaways.find(g => g.id === giveawayId)?.title}"?\n\n` +
            `This will deduct the prize from the winner's wallet and credit it back to the host.\n\nReason: ${reason}`
        );
        if (!confirmed) return;

        setPending(giveawayId);
        const result = await refundPrizeClaimAction(giveawayId, reason);
        setPending(null);

        setResults(prev => ({
            ...prev,
            [giveawayId]: result.success
                ? { ok: true, msg: "Prize refunded successfully." }
                : { ok: false, msg: result.error || "Refund failed." }
        }));
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full p-6 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
            >
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Prize Disputes &amp; Refunds
                </h2>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-bold">
                        {giveaways.length} claimed prizes
                    </span>
                    {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-800">
                    {giveaways.length === 0 ? (
                        <p className="p-6 text-slate-500 text-sm">No claimed prizes found.</p>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {giveaways.map(g => {
                                const result = results[g.id];
                                const isPending = pending === g.id;
                                const isRefunded = result?.ok;

                                return (
                                    <div key={g.id} className="p-4 sm:p-6">
                                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold truncate">{g.title}</p>
                                                <p className="text-2xl font-black text-yellow-400 my-1">
                                                    {formatPrize(g.prize_amount)}
                                                </p>
                                                <p className="text-sm text-slate-400">
                                                    Winner: <span className="text-white">{g.winner?.display_name || g.winner?.username || "Unknown"}</span>
                                                    {g.winner?.email && (
                                                        <span className="text-slate-500 ml-1">({g.winner.email})</span>
                                                    )}
                                                </p>
                                                <p className="text-sm text-slate-400">
                                                    Host: <span className="text-white">{g.host?.display_name || g.host?.username || "Unknown"}</span>
                                                </p>
                                                {g.prize_claimed_at && (
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        Claimed: {new Date(g.prize_claimed_at).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>

                                            {!isRefunded && (
                                                <div className="flex flex-col sm:flex-row gap-2 sm:items-center min-w-0 sm:min-w-[320px]">
                                                    <Input
                                                        value={reasons[g.id] || ""}
                                                        onChange={e => setReasons(prev => ({ ...prev, [g.id]: e.target.value }))}
                                                        placeholder="Reason for refund (required)"
                                                        className="bg-slate-800 border-slate-700 text-sm flex-1"
                                                        disabled={isPending}
                                                    />
                                                    <Button
                                                        onClick={() => handleRefund(g.id)}
                                                        disabled={isPending}
                                                        size="sm"
                                                        className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 whitespace-nowrap"
                                                        variant="outline"
                                                    >
                                                        {isPending ? (
                                                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                                        ) : (
                                                            <RotateCcw className="w-4 h-4 mr-1" />
                                                        )}
                                                        Refund Prize
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {result && (
                                            <p className={`mt-2 text-sm font-medium ${result.ok ? "text-green-400" : "text-red-400"}`}>
                                                {result.msg}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
