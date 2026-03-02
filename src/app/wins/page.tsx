"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { AppHeader } from "@/components/app-header";
import { giveawayService } from "@/lib/giveaway-service";
import { 
    Trophy, 
    ArrowLeft, 
    Calendar, 
    ExternalLink, 
    Loader2,
    Medal,
    TrendingUp,
    User as UserIcon
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";
import NatMascot from "@/assets/Nat_GA_Mascot.svg";

export default function WinsPage() {
    const [wins, setWins] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [profile, setProfile] = useState<any>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [winsData, profileData] = await Promise.all([
                    giveawayService.getUserWins(),
                    giveawayService.getProfile()
                ]);
                setWins(winsData || []);
                setProfile(profileData);
            } catch (err) {
                console.error("Failed to load wins:", err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const totalEarned = profile?.total_winnings || 0;

    return (
        <div className="min-h-screen bg-[#06060c] text-slate-200">
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16 w-full">
                {/* Back button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs font-bold uppercase tracking-wider mb-4"
                        >
                            <Trophy className="w-3 h-3" />
                            Winner Circle
                        </motion.div>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2">
                            My Victory <span className="text-primary">History</span>
                        </h1>
                        <p className="text-slate-400">Total Victories: {wins.length} • Total Earned: ₦{totalEarned.toLocaleString()}</p>
                    </div>
                    
                    <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-8">
                         <div className="text-center">
                            <p className="text-xs text-slate-500 font-medium uppercase mb-1">Total Wins</p>
                            <p className="text-2xl font-black text-white">{wins.length}</p>
                         </div>
                         <div className="w-px h-10 bg-slate-800" />
                         <div className="text-center">
                            <p className="text-xs text-slate-500 font-medium uppercase mb-1">Total Earned</p>
                            <p className="text-2xl font-black text-primary">₦{totalEarned.toLocaleString()}</p>
                         </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                        <p className="text-slate-500">Retrieving your victory records...</p>
                    </div>
                ) : wins.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center"
                        >
                            <Image src={NatMascot} alt="Nat" width={140} height={140} className="mb-6 opacity-60" />
                            <h3 className="text-2xl font-bold text-white mb-2">No wins yet?</h3>
                            <p className="text-slate-400 max-w-sm mx-auto mb-8">
                                Don&apos;t worry! Your first victory is just one giveaway away. Join an active event and show them what you&apos;ve got!
                            </p>
                            <Link href="/giveaways">
                                <button className="bg-brand-gradient px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:scale-105 transition-all">
                                    Browse Giveaways
                                </button>
                            </Link>
                        </motion.div>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {wins.map((win, idx) => (
                            <motion.div
                                key={`${win.giveaway.id}-${idx}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group relative overflow-hidden bg-slate-900 border border-slate-800 hover:border-primary/30 rounded-2xl p-4 sm:p-6 transition-all"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
                                
                                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
                                            <Medal className="w-7 h-7 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors mb-1 truncate max-w-[200px] sm:max-w-md">
                                                {win.giveaway.title}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-sm text-slate-500">
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(win.giveaway.ends_at).toLocaleDateString()}
                                                </span>
                                                <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-700" />
                                                <span className="flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                                                        {win.giveaway.host?.avatar_url ? (
                                                            <img src={win.giveaway.host.avatar_url} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <UserIcon className="w-3 h-3" />
                                                        )}
                                                    </div>
                                                    Hosted by @{win.giveaway.host?.username || 'Admin'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-slate-800 pt-4 sm:pt-0">
                                        <div className="text-left sm:text-right">
                                            <p className="text-xs text-slate-500 font-medium uppercase mb-1">Prize Claimed</p>
                                            <p className="text-xl font-black text-primary">₦{parseFloat(win.giveaway.prize_amount).toLocaleString()}</p>
                                        </div>
                                        <Link href={`/giveaways/${win.giveaway.id}`}>
                                            <button className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 hover:bg-primary hover:text-white transition-all text-slate-400">
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Footer Tip */}
                <p className="text-center text-sm text-slate-600 mt-12">
                    Winning consistently increases your <strong>Trust Score™</strong> and unlocks Diamond Tier benefits.
                </p>
            </main>
        </div>
    );
}
