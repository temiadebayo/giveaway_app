import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminService } from '@/lib/admin-service';
import Link from 'next/link';
import {
    LayoutDashboard,
    Users,
    Gift,
    Wallet,
    LogOut,
    ShieldCheck
} from 'lucide-react';

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
        redirect('/dashboard'); // Kick non-admins back to dashboard
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col fixed inset-y-0">
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <ShieldCheck className="w-8 h-8 text-indigo-500" />
                    <div>
                        <h1 className="font-black text-xl tracking-tight">ADMIN</h1>
                        <p className="text-xs text-slate-500">Superuser Access</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <NavLink href="/admin" icon={<LayoutDashboard />}>Dashboard</NavLink>
                    <NavLink href="/admin/users" icon={<Users />}>Users</NavLink>
                    <NavLink href="/admin/giveaways" icon={<Gift />}>Giveaways</NavLink>
                    <NavLink href="/admin/finance" icon={<Wallet />}>Finance</NavLink>
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/50">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                            {user.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">{user.email}</p>
                            <p className="text-xs text-slate-500">Admin</p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 mt-2 text-slate-400 hover:text-white transition-colors">
                        <LogOut className="w-5 h-5" />
                        <span className="text-sm">Exit to App</span>
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {children}
            </main>
        </div>
    );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactElement; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-medium"
        >
            {React.cloneElement(icon, { className: "w-5 h-5" } as React.HTMLAttributes<HTMLElement>)}
            {children}
        </Link>
    );
}

import React from 'react';
