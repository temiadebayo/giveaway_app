"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    X,
    Users,
    Gift,
    Wallet,
    Loader2,
    ArrowRight,
    User,
    Trophy,
    Receipt
} from "lucide-react";

interface SearchResults {
    users: Array<{
        id: string;
        username: string;
        display_name: string;
        email: string;
        trust_tier: string;
    }>;
    giveaways: Array<{
        id: string;
        title: string;
        status: string;
        prize_amount: number;
        profiles?: { username: string };
    }>;
    transactions: Array<{
        id: string;
        type: string;
        amount: number;
        status: string;
        reference_code: string;
        profiles?: { username: string; email: string };
    }>;
}

export function AdminCommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults>({ users: [], giveaways: [], transactions: [] });
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const debounceRef = useRef<NodeJS.Timeout>(undefined);

    // Keyboard shortcut: Cmd+K / Ctrl+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setQuery("");
            setResults({ users: [], giveaways: [], transactions: [] });
        }
    }, [isOpen]);

    // Debounced search
    const performSearch = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults({ users: [], giveaways: [], transactions: [] });
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/admin/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setResults(data);
        } catch {
            console.error("Search failed");
        } finally {
            setLoading(false);
        }
    }, []);

    const handleQueryChange = (value: string) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => performSearch(value), 300);
    };

    const navigate = (path: string) => {
        setIsOpen(false);
        router.push(path);
    };

    const totalResults = results.users.length + results.giveaways.length + results.transactions.length;
    const hasResults = totalResults > 0;

    const tierEmoji: Record<string, string> = {
        bronze: "🥉",
        silver: "🥈",
        gold: "🥇",
        diamond: "💎",
    };

    const statusColor: Record<string, string> = {
        live: "text-green-400",
        scheduled: "text-blue-400",
        ended: "text-slate-400",
        pending: "text-yellow-400",
        approved: "text-green-400",
        rejected: "text-red-400",
        completed: "text-green-400",
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
                        />

                        {/* Palette */}
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[101] px-4"
                        >
                            <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
                                {/* Search Input */}
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
                                    <Search className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                    <input
                                        ref={inputRef}
                                        value={query}
                                        onChange={(e) => handleQueryChange(e.target.value)}
                                        placeholder="Search users, giveaways, transactions..."
                                        className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
                                    />
                                    {loading && <Loader2 className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Results */}
                                <div className="max-h-[50vh] overflow-y-auto">
                                    {query.length >= 2 && !loading && !hasResults && (
                                        <div className="p-8 text-center text-slate-500">
                                            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            <p className="text-sm">No results for &ldquo;{query}&rdquo;</p>
                                        </div>
                                    )}

                                    {query.length < 2 && !loading && (
                                        <div className="p-6 text-center text-slate-600">
                                            <p className="text-sm">Type at least 2 characters to search</p>
                                        </div>
                                    )}

                                    {/* Users */}
                                    {results.users.length > 0 && (
                                        <div className="p-2">
                                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                                                <Users className="w-3 h-3 inline mr-1.5" />
                                                Users
                                            </p>
                                            {results.users.map((user) => (
                                                <button
                                                    key={user.id}
                                                    onClick={() => navigate("/admin/users")}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left group"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                        <User className="w-4 h-4 text-slate-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">
                                                            {user.display_name || user.username}
                                                            <span className="text-slate-500 ml-1.5">@{user.username}</span>
                                                        </p>
                                                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                                    </div>
                                                    <span className="text-sm">{tierEmoji[user.trust_tier] || "🥉"}</span>
                                                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Giveaways */}
                                    {results.giveaways.length > 0 && (
                                        <div className="p-2 border-t border-slate-800/50">
                                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                                                <Gift className="w-3 h-3 inline mr-1.5" />
                                                Giveaways
                                            </p>
                                            {results.giveaways.map((g) => (
                                                <button
                                                    key={g.id}
                                                    onClick={() => navigate("/admin/giveaways")}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left group"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                        <Trophy className="w-4 h-4 text-yellow-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{g.title}</p>
                                                        <p className="text-xs text-slate-500">
                                                            ₦{g.prize_amount.toLocaleString()} · by @{g.profiles?.username || "unknown"}
                                                        </p>
                                                    </div>
                                                    <span className={`text-[10px] font-bold uppercase ${statusColor[g.status] || "text-slate-500"}`}>
                                                        {g.status}
                                                    </span>
                                                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Transactions */}
                                    {results.transactions.length > 0 && (
                                        <div className="p-2 border-t border-slate-800/50">
                                            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                                                <Wallet className="w-3 h-3 inline mr-1.5" />
                                                Transactions
                                            </p>
                                            {results.transactions.map((tx) => (
                                                <button
                                                    key={tx.id}
                                                    onClick={() => navigate("/admin/finance")}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left group"
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                        <Receipt className="w-4 h-4 text-green-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">
                                                            {tx.reference_code}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {tx.type} · ₦{tx.amount.toLocaleString()} · @{tx.profiles?.username || "unknown"}
                                                        </p>
                                                    </div>
                                                    <span className={`text-[10px] font-bold uppercase ${statusColor[tx.status] || "text-slate-500"}`}>
                                                        {tx.status}
                                                    </span>
                                                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-600">
                                    <span>
                                        {hasResults ? `${totalResults} result${totalResults !== 1 ? "s" : ""}` : "Global Search"}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">↵</kbd>
                                        <span>select</span>
                                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">esc</kbd>
                                        <span>close</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
