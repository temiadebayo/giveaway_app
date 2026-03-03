"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { useNotifications } from "@/hooks/use-notifications";
import {
    LogOut,
    User as UserIcon,
    Wallet,
    Settings,
    Trophy,
    ChevronDown,
    Menu,
    X,
    Home,
    Gift,
    Plus,
    Shield,
    Bell,
    CheckCheck
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";

interface Profile {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    trust_tier: string;
    accepted_tos?: boolean;
}

function formatTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

interface AppHeaderProps {
    transparent?: boolean;
    showBack?: boolean;
    backHref?: string;
    backLabel?: string;
    rightContent?: React.ReactNode;
}

export function AppHeader({
    transparent = false,
    showBack = false,
    backHref = "/dashboard",
    backLabel = "Back",
    rightContent
}: AppHeaderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const loadUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            if (user) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("username, display_name, avatar_url, trust_tier, accepted_tos")
                    .eq("id", user.id)
                    .single();
                setProfile(profile);

                // Enforce Terms of Service compliance
                if (profile && profile.accepted_tos === false && pathname !== '/terms') {
                    router.push('/terms');
                }
            }
        };
        loadUser();
    }, [pathname, router]);

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = "/login";
    };

    const getInitials = () => {
        if (profile?.display_name) {
            return profile.display_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        }
        if (profile?.username) {
            return profile.username.slice(0, 2).toUpperCase();
        }
        return "U";
    };

    const navLinks = [
        { href: "/dashboard", label: "Home", icon: Home },
        { href: "/giveaways", label: "Giveaways", icon: Gift },
        { href: "/giveaways/create", label: "Host", icon: Plus },
        { href: "/wallet", label: "Wallet", icon: Wallet },
    ];

    return (
        <>
            <nav className={`sticky top-0 z-50 px-4 sm:px-6 py-3 sm:py-4 ${transparent ? "" : "glass"}`}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* Left - Logo & Nav */}
                    <div className="flex items-center gap-4 sm:gap-8">
                        <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3">
                            <Image src={logoWhite} alt="Giveaway" width={32} height={32} className="sm:w-9 sm:h-9" />
                            <span className="font-bold text-base sm:text-lg hidden sm:inline">GIVEAWAY</span>
                        </Link>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-1">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Right - User & Actions */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {rightContent}

                        {/* Notification Bell */}
                        {user && (
                            <div className="relative">
                                <button
                                    onClick={() => { setIsNotifOpen(!isNotifOpen); setIsMenuOpen(false); }}
                                    className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
                                    aria-label="Notifications"
                                >
                                    <Bell className="w-5 h-5 text-white/70" />
                                    {unreadCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                <AnimatePresence>
                                    {isNotifOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 top-full mt-2 w-80 max-h-[400px] rounded-xl bg-gray-900 border border-white/10 shadow-2xl z-50 overflow-hidden flex flex-col"
                                            >
                                                <div className="p-3 border-b border-white/10 flex items-center justify-between">
                                                    <span className="text-sm font-bold text-white">Notifications</span>
                                                    {unreadCount > 0 && (
                                                        <button onClick={markAllRead} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                                                            <CheckCheck className="w-3 h-3" /> Mark all read
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="overflow-y-auto flex-1">
                                                    {notifications.length === 0 ? (
                                                        <div className="p-6 text-center">
                                                            <Bell className="w-8 h-8 text-white/20 mx-auto mb-2" />
                                                            <p className="text-xs text-white/40">No notifications yet</p>
                                                        </div>
                                                    ) : (
                                                        notifications.map((notif) => (
                                                            <Link
                                                                key={notif.id}
                                                                href={notif.link || '/dashboard'}
                                                                onClick={() => { markAsRead(notif.id); setIsNotifOpen(false); }}
                                                                className={`block p-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                                                                    !notif.is_read ? 'bg-primary/5' : ''
                                                                }`}
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    {!notif.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium text-white truncate">{notif.title}</p>
                                                                        <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{notif.message}</p>
                                                                        <p className="text-[10px] text-white/30 mt-1">{formatTimeAgo(notif.created_at)}</p>
                                                                    </div>
                                                                </div>
                                                            </Link>
                                                        ))
                                                    )}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {user ? (
                            <>
                                {/* User Menu (Desktop) */}
                                <div className="relative hidden sm:block">
                                    <button
                                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                                    >
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center overflow-hidden">
                                            {profile?.avatar_url ? (
                                                <img
                                                    src={profile.avatar_url}
                                                    alt={profile.username || ""}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        // Hide broken image, fallback to initials
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : null}
                                            {/* Always show initials behind image as fallback */}
                                            <span className="text-xs font-bold text-white absolute">{getInitials()}</span>
                                        </div>
                                        <span className="text-sm font-medium max-w-[100px] truncate">
                                            {profile?.display_name || profile?.username || "User"}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`} />
                                    </button>

                                    {/* Dropdown */}
                                    <AnimatePresence>
                                        {isMenuOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setIsMenuOpen(false)}
                                                />
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-gray-900 border border-white/10 shadow-xl z-50 overflow-hidden"
                                                >
                                                    {/* User Info */}
                                                    <div className="p-4 border-b border-white/10">
                                                        <p className="font-semibold truncate">
                                                            {profile?.display_name || profile?.username}
                                                        </p>
                                                        <p className="text-xs text-white/50 truncate">
                                                            @{profile?.username}
                                                        </p>
                                                    </div>

                                                    {/* Links */}
                                                    <div className="p-2">
                                                        <Link
                                                            href="/dashboard"
                                                            onClick={() => setIsMenuOpen(false)}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
                                                        >
                                                            <Home className="w-4 h-4 text-white/60" />
                                                            Dashboard
                                                        </Link>
                                                        <Link
                                                            href="/wallet"
                                                            onClick={() => setIsMenuOpen(false)}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
                                                        >
                                                            <Wallet className="w-4 h-4 text-white/60" />
                                                            Wallet
                                                        </Link>
                                                        <Link
                                                            href="/wins"
                                                            onClick={() => setIsMenuOpen(false)}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
                                                        >
                                                            <Trophy className="w-4 h-4 text-white/60" />
                                                            My Wins
                                                        </Link>
                                                        <Link
                                                            href="/trust"
                                                            onClick={() => setIsMenuOpen(false)}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
                                                        >
                                                            <Shield className="w-4 h-4 text-white/60" />
                                                            Trust Score
                                                        </Link>
                                                        <Link
                                                            href="/settings"
                                                            onClick={() => setIsMenuOpen(false)}
                                                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors"
                                                        >
                                                            <Settings className="w-4 h-4 text-white/60" />
                                                            Settings
                                                        </Link>
                                                    </div>

                                                    {/* Sign Out */}
                                                    <div className="p-2 border-t border-white/10">
                                                        <button
                                                            onClick={handleSignOut}
                                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <LogOut className="w-4 h-4" />
                                                            Sign Out
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Sign In
                            </Link>
                        )}

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="sm:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 z-50"
                            onClick={() => setIsMobileMenuOpen(false)}
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25 }}
                            className="fixed right-0 top-0 bottom-0 w-[280px] bg-gray-900 z-50 flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-white/10">
                                <span className="font-bold">Menu</span>
                                <button
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-2 rounded-lg hover:bg-white/10"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* User Info */}
                            {user && profile && (
                                <div className="p-4 border-b border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center overflow-hidden relative">
                                            {profile.avatar_url ? (
                                                <img
                                                    src={profile.avatar_url}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : null}
                                            <span className="text-sm font-bold text-white absolute">{getInitials()}</span>
                                        </div>
                                        <div>
                                            <p className="font-semibold">{profile.display_name || profile.username}</p>
                                            <p className="text-xs text-white/50">@{profile.username}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Nav Links */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors"
                                    >
                                        <link.icon className="w-5 h-5" />
                                        {link.label}
                                    </Link>
                                ))}

                                <hr className="border-white/10 my-4" />

                                <p className="px-4 text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Account</p>
                                <Link
                                    href="/wins"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors"
                                >
                                    <Trophy className="w-5 h-5" />
                                    My Wins
                                </Link>
                                <Link
                                    href="/trust"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors"
                                >
                                    <Shield className="w-5 h-5" />
                                    Trust Score
                                </Link>
                                <Link
                                    href="/settings"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 transition-colors"
                                >
                                    <Settings className="w-5 h-5" />
                                    Settings
                                </Link>
                            </div>

                            {/* Sign Out */}
                            {user && (
                                <div className="p-4 border-t border-white/10">
                                    <button
                                        onClick={handleSignOut}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

// Simple avatar component for inline use
export function UserAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const [profile, setProfile] = useState<Profile | null>(null);

    useEffect(() => {
        const load = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from("profiles")
                    .select("username, display_name, avatar_url, trust_tier")
                    .eq("id", user.id)
                    .single();
                setProfile(data);
            }
        };
        load();
    }, []);

    const sizeClasses = {
        sm: "w-6 h-6 text-[10px]",
        md: "w-8 h-8 text-xs",
        lg: "w-10 h-10 text-sm",
    };

    const getInitials = () => {
        if (profile?.display_name) {
            return profile.display_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        }
        if (profile?.username) {
            return profile.username.slice(0, 2).toUpperCase();
        }
        return "U";
    };

    if (!profile) return null;

    return (
        <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center overflow-hidden relative`}>
            {profile.avatar_url ? (
                <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            ) : null}
            <span className="font-bold text-white absolute">{getInitials()}</span>
        </div>
    );
}
