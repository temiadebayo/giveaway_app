import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminService } from '@/lib/admin-service';
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav';
import { AdminCommandPalette } from '@/components/admin/admin-command-palette';
import Link from 'next/link';
import Image from 'next/image';
import React from 'react';
import {
    LayoutDashboard,
    Users,
    Gift,
    Wallet,
    LogOut,
    BadgeCheck,
    Search
} from 'lucide-react';
import logoWhite from '@/assets/logo_white.png';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createServerSupabaseClient();

    // 1. Check Authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect('/login');
    }

    // 2. Check Admin Whitelist
    const isAdmin = await adminService.checkIsAdmin(user.email);
    if (!isAdmin) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col md:flex-row">
            <AdminMobileNav userEmail={user.email || 'Admin'} />
            <AdminCommandPalette />

            {/* Desktop Sidebar */}
            <aside className="w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-r border-slate-800/60 flex-col fixed inset-y-0 hidden md:flex z-40">
                {/* Brand Header */}
                <div className="p-5 border-b border-slate-800/60">
                    <Link href="/admin" className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9506FA] to-[#5708EF] flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow">
                            <Image src={logoWhite} alt="Giveaway" width={24} height={24} />
                        </div>
                        <div>
                            <h1 className="font-black text-lg tracking-tight bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                                GIVEAWAY
                            </h1>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-semibold">
                                Admin Panel
                            </p>
                        </div>
                    </Link>
                </div>

                {/* Search Hint */}
                <div className="px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-slate-500 text-sm cursor-pointer hover:bg-slate-800/60 hover:border-slate-600/50 transition-all">
                        <Search className="w-4 h-4" />
                        <span className="flex-1">Search...</span>
                        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-700/50 text-[10px] font-mono text-slate-400 border border-slate-600/40">
                            ⌘K
                        </kbd>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-2 space-y-1">
                    <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                        Management
                    </p>
                    <NavLink href="/admin" icon={<LayoutDashboard />}>Dashboard</NavLink>
                    <NavLink href="/admin/users" icon={<Users />}>Users</NavLink>
                    <NavLink href="/admin/giveaways" icon={<Gift />}>Giveaways</NavLink>
                    <NavLink href="/admin/finance" icon={<Wallet />}>Finance</NavLink>
                    <NavLink href="/admin/kyc" icon={<BadgeCheck />}>KYC Verifications</NavLink>
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-slate-800/60">
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/30 border border-slate-700/30">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9506FA] to-[#5708EF] flex items-center justify-center text-xs font-bold text-white shadow-sm">
                            {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden flex-1">
                            <p className="text-sm font-medium truncate">{user.email}</p>
                            <p className="text-[10px] text-purple-400 uppercase tracking-widest font-semibold">Admin</p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 mt-1 text-slate-500 hover:text-white transition-all rounded-xl hover:bg-slate-800/40">
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">Exit to App</span>
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-x-hidden">
                {children}
            </main>
        </div>
    );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactElement; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all font-medium group"
        >
            <div className="w-8 h-8 rounded-lg bg-slate-800/60 group-hover:bg-gradient-to-br group-hover:from-[#9506FA]/20 group-hover:to-[#5708EF]/20 flex items-center justify-center transition-all">
                {React.cloneElement(icon, { className: "w-4 h-4 text-slate-400 group-hover:text-purple-400 transition-colors" } as React.HTMLAttributes<HTMLElement>)}
            </div>
            <span className="text-sm">{children}</span>
        </Link>
    );
}
