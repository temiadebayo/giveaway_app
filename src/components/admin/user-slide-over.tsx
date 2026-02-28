"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, Shield, CheckCircle2, AlertCircle, History } from "lucide-react";

interface UserSlideOverProps {
    user: any;
    isOpen: boolean;
    onClose: () => void;
}

export function UserSlideOver({ user, isOpen, onClose }: UserSlideOverProps) {
    if (!user) return null;

    const initials = user.username?.substring(0, 2).toUpperCase() || "US";
    const balance = user.wallets?.balance || 0;
    const earned = user.wallets?.total_earned || 0;
    const deposited = user.wallets?.total_deposited || 0;
    const isVerified = user.id_verified;
    const trustTier = user.trust_tier || "bronze";

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-900 border-l border-slate-800 z-[70] flex flex-col shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-800">
                            <h2 className="text-xl font-bold">User Details</h2>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Profile Info */}
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-2xl border-2 border-slate-700">
                                    {initials}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-white mb-1">{user.username || 'No Username'}</h3>
                                    <p className="text-sm text-slate-400 mb-2">{user.email}</p>
                                    <div className="flex items-center gap-2">
                                        {isVerified ? (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> KYC Verified
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> Unverified
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 capitalize">
                                            {trustTier} Tier
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Wallet Summary */}
                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <Wallet className="w-4 h-4" />
                                    <h4 className="font-semibold text-white">Wallet Info</h4>
                                </div>
                                
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-sm text-slate-400 mb-1">Current Balance</p>
                                        <p className="text-2xl font-mono font-bold text-white">₦{balance.toLocaleString()}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700/50">
                                        <div>
                                            <p className="text-xs text-slate-400 mb-1">Total Earned</p>
                                            <p className="text-sm font-mono text-green-400">+₦{earned.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-400 mb-1">Total Deposited</p>
                                            <p className="text-sm font-mono text-slate-300">₦{deposited.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <History className="w-4 h-4" />
                                    <h4 className="font-semibold text-white">Account History</h4>
                                </div>
                                <div className="flex flex-col gap-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Joined Date</span>
                                        <span className="text-white">{new Date(user.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">User ID</span>
                                        <span className="text-slate-500 font-mono text-xs">{user.id}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
