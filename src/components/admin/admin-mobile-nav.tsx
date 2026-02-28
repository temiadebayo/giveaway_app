"use client";

import { useState } from "react";
import Link from "next/link";
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
    ShieldCheck 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
            <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-indigo-500" />
                    <h1 className="font-black text-lg tracking-tight text-white">ADMIN</h1>
                </div>
                <button 
                    onClick={() => setIsOpen(true)}
                    className="p-2 -mr-2 text-slate-400 hover:text-white"
                >
                    <Menu className="w-6 h-6" />
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
                            className="fixed inset-0 bg-black/80 z-50 md:hidden"
                        />

                        {/* Sidebar Drawer */}
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                            className="fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 z-50 flex flex-col md:hidden"
                        >
                            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="w-6 h-6 text-indigo-500" />
                                    <h1 className="font-black text-lg tracking-tight text-white">ADMIN</h1>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 -mr-2 text-slate-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                                {navItems.map((item) => {
                                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin');
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsOpen(false)}
                                            className={`
                                                flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all
                                                ${isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                                            `}
                                        >
                                            {item.icon}
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </nav>

                            <div className="p-4 border-t border-slate-800 bg-slate-900">
                                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0">
                                        {userEmail.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-xs font-medium truncate text-white">{userEmail}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Admin</p>
                                    </div>
                                </div>
                                <Link
                                    href="/dashboard"
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
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
