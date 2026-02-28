"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    Menu,
    X,
    LayoutDashboard,
    Users,
    Gift,
    Wallet,
    LogOut,
    BadgeCheck,
    Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logoWhite from "@/assets/logo_white.png";

interface AdminMobileNavProps {
    userEmail: string;
}

export function AdminMobileNav({ userEmail }: AdminMobileNavProps) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    const navItems = [
        { href: "/admin", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
        { href: "/admin/users", icon: <Users className="w-5 h-5" />, label: "Users" },
        { href: "/admin/giveaways", icon: <Gift className="w-5 h-5" />, label: "Giveaways" },
        { href: "/admin/finance", icon: <Wallet className="w-5 h-5" />, label: "Finance" },
        { href: "/admin/kyc", icon: <BadgeCheck className="w-5 h-5" />, label: "KYC Verifications" }
    ];

    return (
        <>
            {/* Mobile Header Bar */}
            <div className="md:hidden flex items-center justify-between p-3 bg-gradient-to-r from-slate-900 to-slate-900/95 border-b border-slate-800/60 sticky top-0 z-40 backdrop-blur-sm">
                <Link href="/admin" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9506FA] to-[#5708EF] flex items-center justify-center shadow-md shadow-purple-500/20">
                        <Image src={logoWhite} alt="Giveaway" width={18} height={18} />
                    </div>
                    <div>
                        <h1 className="font-black text-base tracking-tight text-white leading-none">GIVEAWAY</h1>
                        <p className="text-[8px] uppercase tracking-[0.15em] text-purple-400 font-semibold">Admin Panel</p>
                    </div>
                </Link>
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2 -mr-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 md:hidden"
                        />

                        {/* Sidebar Drawer */}
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                            className="fixed inset-y-0 left-0 w-72 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-slate-800/60 z-50 flex flex-col md:hidden"
                        >
                            {/* Header */}
                            <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
                                <Link href="/admin" className="flex items-center gap-2.5" onClick={() => setIsOpen(false)}>
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9506FA] to-[#5708EF] flex items-center justify-center shadow-lg shadow-purple-500/20">
                                        <Image src={logoWhite} alt="Giveaway" width={20} height={20} />
                                    </div>
                                    <div>
                                        <h1 className="font-black text-lg tracking-tight text-white leading-none">GIVEAWAY</h1>
                                        <p className="text-[9px] uppercase tracking-[0.15em] text-purple-400 font-semibold">Admin Panel</p>
                                    </div>
                                </Link>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Search (placeholder for now) */}
                            <div className="px-4 pt-3 pb-1">
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-slate-500 text-sm">
                                    <Search className="w-4 h-4" />
                                    <span>Search...</span>
                                </div>
                            </div>

                            {/* Navigation */}
                            <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
                                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                                    Management
                                </p>
                                {navItems.map((item) => {
                                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin');
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsOpen(false)}
                                            className={`
                                                flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all
                                                ${isActive
                                                    ? 'bg-gradient-to-r from-[#9506FA]/15 to-[#5708EF]/10 text-white border border-purple-500/20'
                                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                }
                                            `}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                isActive
                                                    ? 'bg-gradient-to-br from-[#9506FA]/30 to-[#5708EF]/30'
                                                    : 'bg-slate-800/60'
                                            }`}>
                                                <span className={isActive ? 'text-purple-400' : ''}>{item.icon}</span>
                                            </div>
                                            <span className="text-sm">{item.label}</span>
                                            {isActive && (
                                                <motion.div
                                                    layoutId="admin-mobile-active"
                                                    className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400"
                                                />
                                            )}
                                        </Link>
                                    );
                                })}
                            </nav>

                            {/* Footer */}
                            <div className="p-3 border-t border-slate-800/60 bg-slate-900/50">
                                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/30 border border-slate-700/30 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9506FA] to-[#5708EF] flex items-center justify-center text-xs font-bold text-white shadow-sm flex-shrink-0">
                                        {userEmail.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="overflow-hidden flex-1">
                                        <p className="text-xs font-medium truncate text-white">{userEmail}</p>
                                        <p className="text-[9px] text-purple-400 uppercase tracking-widest font-semibold">Admin</p>
                                    </div>
                                </div>
                                <Link
                                    href="/dashboard"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center gap-3 px-3 py-2.5 text-slate-500 hover:text-white transition-all rounded-xl hover:bg-slate-800/40"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="text-sm">Exit to App</span>
                                </Link>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
