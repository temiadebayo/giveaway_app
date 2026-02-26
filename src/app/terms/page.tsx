"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { LogOut, CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AppTermsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [alreadyAccepted, setAlreadyAccepted] = useState(false);

    const checkStatus = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            router.push('/login');
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('accepted_tos')
            .eq('id', user.id)
            .single();

        if (profile?.accepted_tos) {
            setAlreadyAccepted(true);
        }

        setLoading(false);
    };

    useEffect(() => {
        checkStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAccept = async () => {
        setSaving(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            await supabase
                .from('profiles')
                .update({ accepted_tos: true })
                .eq('id', user.id);

            router.push('/');
        }
    };

    const handleDecline = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#06060c] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#06060c] text-slate-300 py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-primary/30">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-10 text-center">
                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4">
                        Terms of Service & Privacy Policy
                    </h1>
                    <p className="text-slate-400 text-lg">Last Updated: February 2026</p>
                    {!alreadyAccepted && (
                        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm font-medium">
                            Please read and accept these terms to continue using the app.
                        </div>
                    )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-10 mb-8 space-y-10 text-base leading-relaxed h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* SECTION 1: TERMS OF SERVICE */}
                    <section className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-slate-800 pb-2 sticky top-0 bg-slate-900/90 backdrop-blur py-2">1. Terms of Service (ToS)</h2>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.1 The Platform</h3>
                            <p>
                                The Giveaway App is a skill-based competition platform where users participate in tap challenges and skill games to win real prizes.
                            </p>
                            <p>
                                The platform consists of free-to-enter and premium paid giveaways hosted by creators, brands, and individuals.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.2 Merit-Based Winner Selection</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li><strong className="text-slate-200">Skill-Based Completion:</strong> Users acknowledge that this platform does not utilize random draws, lotteries, or games of chance.</li>
                                <li><strong className="text-slate-200">Leaderboard Rankings:</strong> Winners are determined solely by measurable performance metrics in our skill-based games (e.g., completion time, tap speed, and accuracy).</li>
                                <li><strong className="text-slate-200">Fair Play Policy:</strong> Any use of autoclickers, macros, bots, or modifications to manipulate game scores is strictly prohibited and will result in an immediate ban and forfeiture of prizes.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.3 Wallet, Deposits, & Withdrawals</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>The platform provides a digital wallet to handle entry fees and prize distributions. All funds are held securely.</li>
                                <li><strong>Platform Fees:</strong> The Giveaway App charges processing fees to maintain the platform infrastructure, which include deposit fees and withdrawal fees as presented during these respective actions.</li>
                                <li>Users must meet minimum withdrawal thresholds and pass required identity verifications before processing a withdrawal.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.4 Host Responsibilities & Escrow</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>Hosts creating paid giveaways must fund the prize pool in advance. These funds are held in escrow by the platform until the giveaway concludes and winners are verified.</li>
                                <li>Hosts are responsible for ensuring their giveaways comply with local laws and regulations.</li>
                            </ul>
                        </div>
                    </section>

                    {/* SECTION 2: PRIVACY & KYC POLICY */}
                    <section className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-slate-800 pb-2 sticky top-0 bg-slate-900/90 backdrop-blur py-2">2. Privacy & KYC Policy</h2>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.1 Data Collection & Analytics</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>We collect gameplay metrics, device fingerprints, and account interaction data to ensure the integrity of the leaderboards and prevent fraud.</li>
                                <li>This data is used to verify legitimate winners and maintain a fair competitive environment.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.2 KYC (Know Your Customer) Verification</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>To prevent fraud, comply with anti-money laundering (AML) regulations, and ensure fair play, users may be required to complete identity verification (KYC).</li>
                                <li>KYC data (such as government-issued IDs and liveness selfies) is processed securely using our automated verification partners and is never sold to third parties.</li>
                                <li>Users acknowledge that they must verify their identity to withdraw accumulated winnings or access high-tier giveaway features.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.3 Security & Compliance</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>All user data is protected via end-to-end encryption and cloud-based hosting on secure infrastructures.</li>
                                <li>Our data practices are designed to comply with standard privacy regulations.</li>
                            </ul>
                        </div>
                    </section>

                    {/* SECTION 3: DISCLAIMERS */}
                    <section className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-slate-800 pb-2 sticky top-0 bg-slate-900/90 backdrop-blur py-2">3. Disclaimers</h2>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">3.1 Non-Affiliation Disclaimer</h3>
                            <p>
                                The Giveaway App is not affiliated with, sponsored by, or endorsed by Instagram, X (formerly Twitter), Facebook, or any other social media platform utilized for engagement.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">3.2 Professional Services Disclaimer</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>The platform is a strategic marketing and engagement tool.</li>
                                <li>It is not intended to function as a lottery, gambling service, or sweepstakes.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">3.3 Contact Information</h3>
                            <p>
                                For legal inquiries or partnership discussions, contact the team at{' '}
                                <a href="mailto:mail.giveawayapp@gmail.com" className="text-primary hover:text-primary/80 transition-colors">mail.giveawayapp@gmail.com</a>
                                {' '}or via WhatsApp at{' '}
                                <a href="https://wa.me/2347065964760" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">+2347065964760</a>.
                            </p>
                        </div>
                    </section>
                </div>

                {/* Accept / Decline Action Bar */}
                {!alreadyAccepted ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-slate-900 border border-t-primary/50 border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row gap-4 justify-between items-center shadow-2xl shadow-primary/5"
                    >
                        <p className="text-sm border-l-2 border-primary pl-4 text-slate-400 hidden sm:block max-w-xs">
                            By clicking accept, you acknowledge the terms of this platform.
                        </p>

                        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-3 sm:gap-4 shrink-0">
                            <Button
                                variant="outline"
                                size="lg"
                                onClick={handleDecline}
                                disabled={saving}
                                className="w-full sm:w-auto border-slate-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                Decline & Exit
                            </Button>

                            <Button
                                size="lg"
                                onClick={handleAccept}
                                disabled={saving}
                                className="w-full sm:w-auto min-w-[200px] bg-brand-gradient hover:opacity-90 transition-opacity"
                            >
                                {saving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5 mr-2" />
                                        I Accept These Terms
                                    </>
                                )}
                            </Button>
                        </div>
                    </motion.div>
                ) : (
                    <div className="text-center">
                        <Button variant="outline" onClick={() => router.push('/')}>
                            Return to Dashboard
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
