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
                                The Giveaway App provides an automated system for social media engagement campaigns for businesses, influencers, NGOs, and government institutions.
                            </p>
                            <p>
                                Use of the platform is subject to the selection of a Freemium, Subscription, or Enterprise licensing model.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.2 Merit-Based Winner Selection (The &quot;Effort&quot; Clause)</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li><strong className="text-slate-200">No Random Selection:</strong> Users acknowledge that this platform does not utilize random draws or games of chance.</li>
                                <li><strong className="text-slate-200">Participant Effort:</strong> Winners are determined solely by measurable engagement and performance metrics tracked by the platform, such as likes, shares, comments, and registrations.</li>
                                <li><strong className="text-slate-200">The Referee’s Decision:</strong> The platform acts as a technical referee to validate participant effort based on real-time analytics.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.3 AI-Powered Fraud & Bot Detection</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>To ensure fairness, the platform utilizes AI-driven bot detection and machine learning to filter entries.</li>
                                <li>The Giveaway App reserves the right to disqualify any participant flagged for fraudulent activity or automated entry manipulation.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">1.4 Host Responsibilities</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>Hosts (Businesses, NGOs, Governments) are solely responsible for the legality and fulfillment of any prizes or rewards offered.</li>
                                <li>The Giveaway App is not responsible for the failure of a host to deliver prizes.</li>
                            </ul>
                        </div>
                    </section>

                    {/* SECTION 2: PRIVACY POLICY */}
                    <section className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-slate-800 pb-2 sticky top-0 bg-slate-900/90 backdrop-blur py-2">2. Privacy Policy</h2>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.1 Data Collection & Analytics</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>We collect engagement data (likes, shares, comments) and participant demographics to provide real-time insights for hosts.</li>
                                <li>This data is used to generate optimization recommendations for future campaigns.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.2 Security & Compliance</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>All user data is protected via end-to-end encryption and cloud-based hosting on secure infrastructures.</li>
                                <li>Our data practices are designed to comply with GDPR and CCPA regulations.</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xl font-semibold text-white">2.3 Third-Party Integrations</h3>
                            <ul className="list-disc pl-6 space-y-2 text-slate-400">
                                <li>The platform integrates with third-party social media APIs (Instagram, X/Twitter, Facebook, etc.).</li>
                                <li>We do not store sensitive account passwords for these third-party platforms.</li>
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
