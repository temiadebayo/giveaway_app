"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { FEES, BANK_DETAILS } from "@/lib/wallet-service";
import {
    ArrowLeft,
    Wallet,
    ArrowDownLeft,
    ArrowUpRight,
    Shield,
    Clock,
    Mail,
    HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FeesPage() {
    return (
        <main className="min-h-screen bg-aurora overflow-x-hidden">
            <AppHeader />

            <div className="max-w-3xl mx-auto px-4 py-6 sm:p-8">
                <Breadcrumbs items={[
                    { label: 'Wallet', href: '/wallet' },
                    { label: 'Fees & Policies' }
                ]} />

                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
                        <Shield className="w-8 h-8 text-primary" />
                        Fees & Policies
                    </h1>
                    <p className="text-white/60">
                        Transparent breakdown of all charges on TryGiveaway
                    </p>
                </motion.div>

                <div className="space-y-6">
                    {/* Deposit Fees */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="card-premium p-6"
                    >
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <ArrowDownLeft className="w-5 h-5 text-green-400" />
                            Deposit Fees
                        </h2>
                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-white/60">Processing Fee</span>
                                    <span className="font-bold text-lg">{FEES.DEPOSIT_FEE_PERCENT}%</span>
                                </div>
                                <p className="text-sm text-white/40">
                                    Applied on top of your desired wallet credit. For example, to credit ₦10,000 to your wallet, you transfer ₦10,500.
                                </p>
                            </div>

                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-sm font-medium mb-2">Example Breakdown</p>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Wallet Credit</span>
                                        <span>₦10,000</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Processing Fee ({FEES.DEPOSIT_FEE_PERCENT}%)</span>
                                        <span className="text-orange-400">+₦500</span>
                                    </div>
                                    <div className="border-t border-white/10 pt-1 flex justify-between font-bold">
                                        <span>You Transfer</span>
                                        <span className="text-green-400">₦10,500</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                                <HelpCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-yellow-400">
                                    You must include your <strong>username</strong> in the transfer narration/remarks for verification. Deposits are manually verified and credited within 24 hours.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Withdrawal Fees */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="card-premium p-6"
                    >
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <ArrowUpRight className="w-5 h-5 text-primary" />
                            Withdrawal Fees
                        </h2>
                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-white/60">Processing Fee</span>
                                    <span className="font-bold text-lg">{FEES.WITHDRAWAL_FEE_PERCENT}%</span>
                                </div>
                                <p className="text-sm text-white/40">
                                    Deducted from your withdrawal amount before payout.
                                </p>
                            </div>

                            <div className="bg-white/5 rounded-xl p-4">
                                <p className="text-sm font-medium mb-2">Example Breakdown</p>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Withdrawal Amount</span>
                                        <span>₦10,000</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Processing Fee ({FEES.WITHDRAWAL_FEE_PERCENT}%)</span>
                                        <span className="text-orange-400">-₦500</span>
                                    </div>
                                    <div className="border-t border-white/10 pt-1 flex justify-between font-bold">
                                        <span>You Receive</span>
                                        <span className="text-green-400">₦9,500</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Hold Policy */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="card-premium p-6"
                    >
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Hold & Processing Times
                        </h2>
                        <div className="space-y-3">
                            <div className="bg-white/5 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">Deposits</p>
                                    <p className="text-sm text-white/40">Manual bank transfer verification</p>
                                </div>
                                <span className="text-sm font-bold text-white/60">Up to 24 hours</span>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">Withdrawals</p>
                                    <p className="text-sm text-white/40">Security hold before processing</p>
                                </div>
                                <span className="text-sm font-bold text-white/60">{FEES.WITHDRAWAL_HOLD_HOURS} hours</span>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">Giveaway Prizes</p>
                                    <p className="text-sm text-white/40">Winner claims prize, funds released instantly</p>
                                </div>
                                <span className="text-sm font-bold text-green-400">Instant</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Refund Policy */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="card-premium p-6"
                    >
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Wallet className="w-5 h-5 text-cyan-400" />
                            Giveaway & Refund Policy
                        </h2>
                        <ul className="space-y-3 text-sm text-white/60">
                            <li className="flex items-start gap-2">
                                <span className="text-green-400 mt-0.5">•</span>
                                <span>Prize funds are held in escrow until the giveaway ends and the winner claims.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-400 mt-0.5">•</span>
                                <span>If a giveaway has zero participants, the full amount is refunded to the host.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-400 mt-0.5">•</span>
                                <span>No fees are charged on giveaway prizes — winnings are credited in full.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-400 mt-0.5">•</span>
                                <span>Cancelled giveaways are fully refunded to the host&apos;s wallet.</span>
                            </li>
                        </ul>
                    </motion.div>

                    {/* Contact */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="card-premium p-6 text-center"
                    >
                        <Mail className="w-8 h-8 text-primary mx-auto mb-3" />
                        <h3 className="font-bold mb-1">Questions about fees?</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Reach out to our support team and we&apos;ll be happy to help.
                        </p>
                        <a href={`mailto:${BANK_DETAILS.supportEmail}`}>
                            <Button className="bg-brand-gradient">
                                <Mail className="w-4 h-4 mr-2" />
                                {BANK_DETAILS.supportEmail}
                            </Button>
                        </a>
                    </motion.div>

                    {/* Back to wallet */}
                    <div className="text-center pb-8">
                        <Link href="/wallet">
                            <Button variant="ghost" className="text-white/40 hover:text-white">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Wallet
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
