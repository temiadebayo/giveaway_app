"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { giveawayService, Giveaway } from "@/lib/giveaway-service";
import { GiveawayCard } from "@/components/giveaway/giveaway-components";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
    Gamepad2,
    Plus,
    Loader2,
    Trophy,
    RefreshCw,
    Play,
    Crown,
    Eye
} from "lucide-react";

export default function GiveawaysPage() {
    const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
    const [myGiveaways, setMyGiveaways] = useState<Giveaway[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'live' | 'scheduled'>('all');
    const [startingId, setStartingId] = useState<string | null>(null);

    const loadGiveaways = async () => {
        setLoading(true);
        const [activeData, myData] = await Promise.all([
            giveawayService.getActiveGiveaways(),
            giveawayService.getMyGiveaways()
        ]);
        setGiveaways(activeData);
        setMyGiveaways(myData);
        setLoading(false);
    };

    useEffect(() => {
        loadGiveaways();
    }, []);

    const handleStartGiveaway = async (id: string) => {
        setStartingId(id);
        const result = await giveawayService.startGiveaway(id);
        if (result.success) {
            await loadGiveaways();
        }
        setStartingId(null);
    };

    const filteredGiveaways = giveaways.filter(g => {
        if (filter === 'all') return true;
        return g.status === filter;
    });

    const liveCount = giveaways.filter(g => g.status === 'live').length;
    const scheduledCount = giveaways.filter(g => g.status === 'scheduled').length;
    const draftCount = myGiveaways.filter(g => g.status === 'draft').length;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'draft':
                return <span className="px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs font-medium">Draft</span>;
            case 'scheduled':
                return <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">Scheduled</span>;
            case 'live':
                return <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-medium animate-pulse">🔴 Live</span>;
            case 'ended':
                return <span className="px-2 py-1 rounded-full bg-white/10 text-white/60 text-xs font-medium">Ended</span>;
            default:
                return null;
        }
    };

    const formatPrize = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <main className="min-h-screen bg-aurora">
            {/* App Header with User Avatar */}
            <AppHeader
                rightContent={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadGiveaways}
                            disabled={loading}
                            className="hidden sm:flex"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Link href="/giveaways/create">
                            <Button className="bg-brand-gradient" size="sm">
                                <Plus className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Host</span>
                            </Button>
                        </Link>
                    </div>
                }
            />

            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                {/* Breadcrumbs */}
                <Breadcrumbs items={[
                    { label: 'Giveaways' }
                ]} />

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-3xl md:text-4xl font-black mb-2 flex items-center gap-3">
                        <Gamepad2 className="w-8 h-8 text-primary" />
                        Giveaways
                    </h1>
                    <p className="text-white/60">Join live giveaways and win real prizes!</p>
                </motion.div>

                {/* My Giveaways Section */}
                {myGiveaways.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <Crown className="w-5 h-5 text-yellow-400" />
                            <h2 className="text-xl font-bold">My Giveaways</h2>
                            {draftCount > 0 && (
                                <span className="text-sm text-white/40">({draftCount} draft{draftCount > 1 ? 's' : ''})</span>
                            )}
                        </div>
                        <div className="space-y-3">
                            {myGiveaways.map((g) => (
                                <motion.div
                                    key={g.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                                >
                                    {/* Prize */}
                                    <div className="flex-shrink-0">
                                        <p className="text-xl font-black text-gradient-primary">
                                            {formatPrize(g.prize_amount, g.prize_currency)}
                                        </p>
                                    </div>

                                    {/* Title & Status */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold truncate">{g.title}</p>
                                            {getStatusBadge(g.status)}
                                        </div>
                                        <p className="text-sm text-white/40">
                                            {g.participant_count || 0} participants • {g.game_duration_seconds}s game
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {g.status === 'draft' && (
                                            <Button
                                                size="sm"
                                                className="bg-green-500 hover:bg-green-600"
                                                onClick={() => handleStartGiveaway(g.id)}
                                                disabled={startingId === g.id}
                                            >
                                                {startingId === g.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Play className="w-4 h-4 mr-1" />
                                                        Go Live
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                        <Link href={`/giveaways/${g.id}`}>
                                            <Button variant="outline" size="sm">
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </Link>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                >
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-sm text-white/60">Live Now</span>
                        </div>
                        <p className="text-2xl font-black">{liveCount}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-white/60">Scheduled</span>
                        </div>
                        <p className="text-2xl font-black">{scheduledCount}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 col-span-2 md:col-span-2">
                        <div className="flex items-center gap-2 mb-1">
                            <Trophy className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm text-white/60">Total Prize Pool</span>
                        </div>
                        <p className="text-2xl font-black">
                            ${giveaways.reduce((sum, g) => sum + g.prize_amount, 0).toLocaleString()}
                        </p>
                    </div>
                </motion.div>

                {/* Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex gap-2 mb-6"
                >
                    <Button
                        variant={filter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('all')}
                    >
                        All ({giveaways.length})
                    </Button>
                    <Button
                        variant={filter === 'live' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('live')}
                        className={filter === 'live' ? 'bg-red-500' : ''}
                    >
                        🔴 Live ({liveCount})
                    </Button>
                    <Button
                        variant={filter === 'scheduled' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter('scheduled')}
                    >
                        Scheduled ({scheduledCount})
                    </Button>
                </motion.div>

                {/* Active Giveaways */}
                <h2 className="text-xl font-bold mb-4">Active Giveaways</h2>

                {/* Giveaway List */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : filteredGiveaways.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-white/20" />
                        <h3 className="text-xl font-bold mb-2">No Active Giveaways</h3>
                        <p className="text-white/60 mb-4">
                            {filter === 'all'
                                ? "Be the first to host a giveaway!"
                                : `No ${filter} giveaways right now.`}
                        </p>
                        <Link href="/giveaways/create">
                            <Button className="bg-brand-gradient">
                                <Plus className="w-4 h-4 mr-2" />
                                Host a Giveaway
                            </Button>
                        </Link>
                    </motion.div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredGiveaways.map((giveaway, i) => (
                            <GiveawayCard key={giveaway.id} giveaway={giveaway} index={i} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
