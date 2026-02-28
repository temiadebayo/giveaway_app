import { adminService } from '@/lib/admin-service';
import { CheckCircle, XCircle, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export default async function AdminFinancePage() {
    const [pendingDeposits, pendingWithdrawals, processingWithdrawals] = await Promise.all([
        adminService.getPendingDeposits(),
        adminService.getPendingWithdrawals(),
        adminService.getProcessingWithdrawals(),
    ]);

    // --- Deposit Server Actions ---
    async function approveDeposit(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.approveDeposit(id);
        revalidatePath('/admin/finance');
    }

    async function rejectDeposit(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.rejectDeposit(id);
        revalidatePath('/admin/finance');
    }

    // --- Withdrawal Server Actions ---
    async function processWithdrawalAction(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.processWithdrawal(id);
        revalidatePath('/admin/finance');
    }

    async function approveWithdrawal(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.approveWithdrawal(id);
        revalidatePath('/admin/finance');
    }

    async function rejectWithdrawal(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.rejectWithdrawal(id);
        revalidatePath('/admin/finance');
    }

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

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Financials</h1>
                    <p className="text-slate-400">Manage deposits and withdrawals</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Pending Deposits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ArrowDownLeft className="w-5 h-5 text-green-400" />
                            Pending Deposits
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-bold">
                            {pendingDeposits?.length || 0} Requests
                        </span>
                    </div>

                    <div className="divide-y divide-slate-800">
                        {(!pendingDeposits || pendingDeposits.length === 0) ? (
                            <div className="p-8 text-center text-slate-500">
                                No pending deposits.
                            </div>
                        ) : (
                            pendingDeposits.map((tx: any) => (
                                <div key={tx.id} className="p-6 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex justify-between items-start mb-3 gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xl font-bold text-white mb-1 truncate">
                                                {formatNGN(tx.amount)}
                                            </p>
                                            <p className="text-sm font-medium text-indigo-400 font-mono truncate">
                                                {tx.metadata?.reference_code || 'NO-REF'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0 max-w-[50%]">
                                            <p className="text-white font-medium truncate">@{tx.profiles?.username || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500 truncate">{tx.profiles?.email}</p>
                                            <p className="text-xs text-slate-600 mt-1">{formatDate(tx.created_at)}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <form action={approveDeposit} className="flex-1">
                                            <input type="hidden" name="id" value={tx.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Approve
                                            </button>
                                        </form>
                                        <form action={rejectDeposit} className="flex-1">
                                            <input type="hidden" name="id" value={tx.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold flex items-center justify-center gap-2 transition-colors border border-red-500/20"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Reject
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Pending Withdrawals */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ArrowUpRight className="w-5 h-5 text-orange-400" />
                            Pending Withdrawals
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold">
                            {pendingWithdrawals?.length || 0} Requests
                        </span>
                    </div>

                    <div className="divide-y divide-slate-800">
                        {(!pendingWithdrawals || pendingWithdrawals.length === 0) ? (
                            <div className="p-8 text-center text-slate-500">
                                No pending withdrawals.
                            </div>
                        ) : (
                            pendingWithdrawals.map((w: any) => (
                                <div key={w.id} className="p-6 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex justify-between items-start mb-3 gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xl font-bold text-white mb-1 truncate">
                                                {formatNGN(w.amount)}
                                            </p>
                                            <div className="space-y-0.5 text-xs truncate">
                                                <p className="text-orange-400">Fee: {formatNGN(w.fee)}</p>
                                                <p className="text-green-400 font-bold">Payout: {formatNGN(w.net_amount)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 max-w-[50%]">
                                            <p className="text-white font-medium truncate">@{w.profiles?.username || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500 truncate">{w.profiles?.email}</p>
                                            <p className="text-xs text-slate-600 mt-1">{formatDate(w.created_at)}</p>
                                        </div>
                                    </div>

                                    {w.profiles?.bank_name && (
                                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-3">
                                            <p className="text-xs text-slate-400 mb-1">Bank Information</p>
                                            <p className="text-sm font-medium text-white">{w.profiles.bank_name}</p>
                                            <p className="text-sm text-slate-300">
                                                {w.profiles.account_name} &bull; <span className="font-mono">{w.profiles.account_number}</span>
                                            </p>
                                        </div>
                                    )}

                                    {/* Hold status */}
                                    {w.hold_until && new Date(w.hold_until) > new Date() ? (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-3">
                                            <Clock className="w-3.5 h-3.5 text-yellow-400" />
                                            <p className="text-xs text-yellow-400">
                                                Hold until {formatDate(w.hold_until)}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 mb-3">
                                            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                                            <p className="text-xs text-green-400">
                                                Hold period expired — ready to process
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <form action={processWithdrawalAction} className="flex-1">
                                            <input type="hidden" name="id" value={w.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-black font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <Clock className="w-4 h-4" />
                                                Process
                                            </button>
                                        </form>
                                        <form action={rejectWithdrawal} className="flex-1">
                                            <input type="hidden" name="id" value={w.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold flex items-center justify-center gap-2 transition-colors border border-red-500/20"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Reject & Refund
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Processing Withdrawals */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Processing Withdrawals
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold">
                            {processingWithdrawals?.length || 0} Requests
                        </span>
                    </div>

                    <div className="divide-y divide-slate-800">
                        {(!processingWithdrawals || processingWithdrawals.length === 0) ? (
                            <div className="p-8 text-center text-slate-500">
                                No processing withdrawals.
                            </div>
                        ) : (
                            processingWithdrawals.map((w: any) => (
                                <div key={w.id} className="p-6 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex justify-between items-start mb-3 gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xl font-bold text-white mb-1 truncate">
                                                {formatNGN(w.amount)}
                                            </p>
                                            <div className="space-y-0.5 text-xs truncate">
                                                <p className="text-orange-400">Fee: {formatNGN(w.fee)}</p>
                                                <p className="text-green-400 font-bold">Payout: {formatNGN(w.net_amount)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 max-w-[50%]">
                                            <p className="text-white font-medium truncate">@{w.profiles?.username || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500 truncate">{w.profiles?.email}</p>
                                            <p className="text-xs text-slate-600 mt-1">{formatDate(w.created_at)}</p>
                                        </div>
                                    </div>

                                    {w.profiles?.bank_name && (
                                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-3">
                                            <p className="text-xs text-slate-400 mb-1">Bank Information</p>
                                            <p className="text-sm font-medium text-white">{w.profiles.bank_name}</p>
                                            <p className="text-sm text-slate-300">
                                                {w.profiles.account_name} &bull; <span className="font-mono">{w.profiles.account_number}</span>
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <form action={approveWithdrawal} className="flex-1">
                                            <input type="hidden" name="id" value={w.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Complete
                                            </button>
                                        </form>
                                        <form action={rejectWithdrawal} className="flex-1">
                                            <input type="hidden" name="id" value={w.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold flex items-center justify-center gap-2 transition-colors border border-red-500/20"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Reject & Refund
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
