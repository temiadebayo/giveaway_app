"use client";

import { useState, useTransition } from "react";
import { CheckSquare, Square, Loader2, Clock } from "lucide-react";

interface ActionConfig {
    label: string;
    icon: React.ReactNode;
    colorClass: string;
    bgClass: string;
    onExecute: (id: string) => Promise<any>;
}

interface BulkActionConfig {
    label: string;
    icon: React.ReactNode;
    colorClass: string;
    bgClass: string;
    onExecute: (ids: string[]) => Promise<any>;
}

interface FinanceBulkListProps {
    items: any[];
    emptyMessage: string;
    primaryAction?: ActionConfig;
    secondaryAction?: ActionConfig;
    bulkPrimaryAction?: BulkActionConfig;
    bulkSecondaryAction?: BulkActionConfig;
}

export function FinanceBulkList({
    items,
    emptyMessage,
    primaryAction,
    secondaryAction,
    bulkPrimaryAction,
    bulkSecondaryAction
}: FinanceBulkListProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [executingId, setExecutingId] = useState<string | null>(null);

    const formatNGN = (amount: number) =>
        new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(amount);

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Invalid Date';
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleSingleAction = (action: ActionConfig, id: string) => {
        setExecutingId(id);
        startTransition(async () => {
            const result = await action.onExecute(id);
            if (result && !result.success) {
                alert(`Error: ${result.error}`);
            } else {
                // remove from selected if it was there
                const next = new Set(selectedIds);
                next.delete(id);
                setSelectedIds(next);
            }
            setExecutingId(null);
        });
    };

    const handleBulkAction = (action: BulkActionConfig) => {
        setExecutingId("bulk");
        startTransition(async () => {
            const result = await action.onExecute(Array.from(selectedIds));
            if (result && !result.success) {
                alert(`Bulk Error: ${result.error}`);
            } else {
                setSelectedIds(new Set());
            }
            setExecutingId(null);
        });
    };

    if (!items || items.length === 0) {
        return (
            <div className="p-8 text-center text-slate-500">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {/* Bulk Actions Bar */}
            {(bulkPrimaryAction || bulkSecondaryAction) && items.length > 0 && (
                <div className="p-3 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
                    <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        {selectedIds.size === items.length ? (
                            <CheckSquare className="w-4 h-4 text-brand-400" />
                        ) : (
                            <Square className="w-4 h-4" />
                        )}
                        Select All
                    </button>
                    
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <span className="text-sm text-slate-400 mr-2">{selectedIds.size} selected</span>
                        )}
                        {bulkSecondaryAction && (
                            <button
                                onClick={() => handleBulkAction(bulkSecondaryAction)}
                                disabled={selectedIds.size === 0 || isPending}
                                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                                    selectedIds.size === 0
                                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                        : `${bulkSecondaryAction.bgClass} ${bulkSecondaryAction.colorClass} border border-transparent`
                                }`}
                            >
                                {isPending && executingId === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : bulkSecondaryAction.icon}
                                {bulkSecondaryAction.label}
                            </button>
                        )}
                        {bulkPrimaryAction && (
                            <button
                                onClick={() => handleBulkAction(bulkPrimaryAction)}
                                disabled={selectedIds.size === 0 || isPending}
                                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                                    selectedIds.size === 0
                                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                        : `${bulkPrimaryAction.bgClass} ${bulkPrimaryAction.colorClass}`
                                }`}
                            >
                                {isPending && executingId === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : bulkPrimaryAction.icon}
                                {bulkPrimaryAction.label}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="divide-y divide-slate-800 flex-1 overflow-y-auto">
                {items.map((item) => (
                    <div key={item.id} className={`p-6 transition-colors ${selectedIds.has(item.id) ? 'bg-brand-500/5' : 'hover:bg-slate-800/50'} relative`}>
                        {(bulkPrimaryAction || bulkSecondaryAction) && (
                            <button 
                                onClick={() => toggleSelect(item.id)}
                                className="absolute top-6 left-4 text-slate-500 hover:text-white"
                            >
                                {selectedIds.has(item.id) ? (
                                    <CheckSquare className="w-5 h-5 text-brand-400" />
                                ) : (
                                    <Square className="w-5 h-5" />
                                )}
                            </button>
                        )}
                        
                        <div className={`flex justify-between items-start mb-3 gap-3 ${(bulkPrimaryAction || bulkSecondaryAction) ? 'pl-8' : ''}`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-xl font-bold text-white mb-1 truncate">
                                    {formatNGN(item.amount)}
                                </p>
                                {item.fee !== undefined && item.net_amount !== undefined ? (
                                    <div className="space-y-0.5 text-xs truncate">
                                        <p className="text-orange-400">Fee: {formatNGN(item.fee)}</p>
                                        <p className="text-green-400 font-bold">Payout: {formatNGN(item.net_amount)}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium text-indigo-400 font-mono truncate">
                                        {item.metadata?.reference_code || 'NO-REF'}
                                    </p>
                                )}
                            </div>
                            <div className="text-right flex-shrink-0 max-w-[50%]">
                                <p className="text-white font-medium truncate">@{item.profiles?.username || 'Unknown'}</p>
                                <p className="text-xs text-slate-500 truncate">{item.profiles?.email}</p>
                                <p className="text-xs text-slate-600 mt-1">{formatDate(item.created_at)}</p>
                            </div>
                        </div>

                        {item.profiles?.bank_name && (
                            <div className={`bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-3 ${(bulkPrimaryAction || bulkSecondaryAction) ? 'ml-8' : ''}`}>
                                <p className="text-xs text-slate-400 mb-1">Bank Information</p>
                                <p className="text-sm font-medium text-white">{item.profiles.bank_name}</p>
                                <p className="text-sm text-slate-300">
                                    {item.profiles.account_name} &bull; <span className="font-mono">{item.profiles.account_number}</span>
                                </p>
                            </div>
                        )}

                        {item.hold_until && (
                            <div className={`flex items-center gap-2 p-2 rounded-lg mb-3 ${(bulkPrimaryAction || bulkSecondaryAction) ? 'ml-8' : ''} ${new Date(item.hold_until) > new Date() ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                                {new Date(item.hold_until) > new Date() ? (
                                    <>
                                        <Clock className="w-3.5 h-3.5 text-yellow-400" />
                                        <p className="text-xs text-yellow-400">Hold until {formatDate(item.hold_until)}</p>
                                    </>
                                ) : (
                                    <>
                                        <CheckSquare className="w-3.5 h-3.5 text-green-400" />
                                        <p className="text-xs text-green-400">Hold period expired — ready to process</p>
                                    </>
                                )}
                            </div>
                        )}

                        <div className={`flex gap-3 ${(bulkPrimaryAction || bulkSecondaryAction) ? 'pl-8' : ''}`}>
                            {primaryAction && (
                                <button
                                    onClick={() => handleSingleAction(primaryAction, item.id)}
                                    disabled={isPending}
                                    className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${primaryAction.bgClass} ${primaryAction.colorClass}`}
                                >
                                    {isPending && executingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : primaryAction.icon}
                                    {primaryAction.label}
                                </button>
                            )}
                            {secondaryAction && (
                                <button
                                    onClick={() => handleSingleAction(secondaryAction, item.id)}
                                    disabled={isPending}
                                    className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors border ${secondaryAction.bgClass} ${secondaryAction.colorClass} border-current/20`}
                                >
                                    {isPending && executingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : secondaryAction.icon}
                                    {secondaryAction.label}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

