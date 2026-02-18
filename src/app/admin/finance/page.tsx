import { adminService } from '@/lib/admin-service';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button'; // Assuming you have a button component, or use standard HTML

export default async function AdminFinancePage() {
    const pendingDeposits = await adminService.getPendingDeposits();

    // Server Action for Approval
    async function approve(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.approveDeposit(id);
        revalidatePath('/admin/finance');
    }

    // Server Action for Rejection
    async function reject(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.rejectDeposit(id);
        revalidatePath('/admin/finance');
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Financials</h1>
                    <p className="text-slate-400">Manage deposits and withdrawals</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Pending Deposits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Pending Deposits
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold">
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
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-xl font-bold text-white mb-1">
                                                ${tx.amount.toLocaleString()}
                                            </p>
                                            <p className="text-sm font-medium text-indigo-400 font-mono">
                                                {tx.metadata?.reference_code || 'NO-REF'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-white font-medium">{tx.profiles?.username || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500">{tx.profiles?.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <form action={approve} className="flex-1">
                                            <input type="hidden" name="id" value={tx.id} />
                                            <button
                                                type="submit"
                                                className="w-full py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Approve
                                            </button>
                                        </form>
                                        <form action={reject} className="flex-1">
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

                {/* Withdrawals Placeholder */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden opacity-50">
                    <div className="p-6 border-b border-slate-800">
                        <h2 className="text-xl font-bold">Withdrawals</h2>
                        <p className="text-sm text-slate-500 mt-1">Coming soon in next update</p>
                    </div>
                    <div className="p-8 text-center text-slate-500">
                        Withdrawal management module
                    </div>
                </div>
            </div>
        </div>
    );
}
