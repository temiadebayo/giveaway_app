import { adminService } from '@/lib/admin-service';
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle, XCircle } from 'lucide-react';
import { FinanceBulkList } from '@/components/admin/finance-bulk-list';
import {
    singleApproveDepositAction, singleRejectDepositAction,
    bulkApproveDepositsAction, bulkRejectDepositsAction,
    processWithdrawalServerAction, singleRejectWithdrawalAction,
    bulkProcessWithdrawalsAction, bulkRejectWithdrawalsAction,
    singleApproveWithdrawalAction, bulkApproveWithdrawalsAction
} from './actions';

export default async function AdminFinancePage() {
    const [pendingDeposits, pendingWithdrawals, processingWithdrawals] = await Promise.all([
        adminService.getPendingDeposits(),
        adminService.getPendingWithdrawals(),
        adminService.getProcessingWithdrawals(),
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-8 flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Financials</h1>
                    <p className="text-slate-400">Manage deposits and withdrawals</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 flex-1 min-h-0">
                {/* Pending Deposits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 flex-shrink-0">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ArrowDownLeft className="w-5 h-5 text-green-400" />
                            Pending Deposits
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-bold">
                            {pendingDeposits?.length || 0} Requests
                        </span>
                    </div>
                    <FinanceBulkList 
                        items={pendingDeposits || []}
                        emptyMessage="No pending deposits."
                        type="deposit"
                        primaryAction={{
                            label: "Approve",
                            icon: <CheckCircle className="w-4 h-4" />,
                            bgClass: "bg-green-500 hover:bg-green-600",
                            colorClass: "text-black",
                            onExecute: singleApproveDepositAction
                        }}
                        secondaryAction={{
                            label: "Reject",
                            icon: <XCircle className="w-4 h-4" />,
                            bgClass: "bg-red-500/10 hover:bg-red-500/20",
                            colorClass: "text-red-500",
                            onExecute: singleRejectDepositAction
                        }}
                        bulkPrimaryAction={{
                            label: "Approve Selected",
                            icon: <CheckCircle className="w-4 h-4" />,
                            bgClass: "bg-green-500 hover:bg-green-600",
                            colorClass: "text-black",
                            onExecute: bulkApproveDepositsAction
                        }}
                        bulkSecondaryAction={{
                            label: "Reject Selected",
                            icon: <XCircle className="w-4 h-4" />,
                            bgClass: "bg-red-500/10 hover:bg-red-500/20",
                            colorClass: "text-red-500",
                            onExecute: bulkRejectDepositsAction
                        }}
                    />
                </div>

                {/* Pending Withdrawals */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 flex-shrink-0">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ArrowUpRight className="w-5 h-5 text-orange-400" />
                            Pending Withdrawals
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-bold">
                            {pendingWithdrawals?.length || 0} Requests
                        </span>
                    </div>
                    <FinanceBulkList 
                        items={pendingWithdrawals || []}
                        emptyMessage="No pending withdrawals."
                        type="withdrawal"
                        primaryAction={{
                            label: "Process",
                            icon: <Clock className="w-4 h-4" />,
                            bgClass: "bg-yellow-500 hover:bg-yellow-600",
                            colorClass: "text-black",
                            onExecute: processWithdrawalServerAction
                        }}
                        secondaryAction={{
                            label: "Reject & Refund",
                            icon: <XCircle className="w-4 h-4" />,
                            bgClass: "bg-red-500/10 hover:bg-red-500/20",
                            colorClass: "text-red-500",
                            onExecute: singleRejectWithdrawalAction
                        }}
                        bulkPrimaryAction={{
                            label: "Process Selected",
                            icon: <Clock className="w-4 h-4" />,
                            bgClass: "bg-yellow-500 hover:bg-yellow-600",
                            colorClass: "text-black",
                            onExecute: bulkProcessWithdrawalsAction
                        }}
                    />
                </div>

                {/* Processing Withdrawals */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 flex-shrink-0">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            Processing Withdrawals
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold">
                            {processingWithdrawals?.length || 0} Requests
                        </span>
                    </div>
                    <FinanceBulkList 
                        items={processingWithdrawals || []}
                        emptyMessage="No processing withdrawals."
                        type="processing"
                        primaryAction={{
                            label: "Complete",
                            icon: <CheckCircle className="w-4 h-4" />,
                            bgClass: "bg-green-500 hover:bg-green-600",
                            colorClass: "text-black",
                            onExecute: singleApproveWithdrawalAction
                        }}
                        secondaryAction={{
                            label: "Reject & Refund",
                            icon: <XCircle className="w-4 h-4" />,
                            bgClass: "bg-red-500/10 hover:bg-red-500/20",
                            colorClass: "text-red-500",
                            onExecute: singleRejectWithdrawalAction
                        }}
                        bulkPrimaryAction={{
                            label: "Complete Selected",
                            icon: <CheckCircle className="w-4 h-4" />,
                            bgClass: "bg-green-500 hover:bg-green-600",
                            colorClass: "text-black",
                            onExecute: bulkApproveWithdrawalsAction
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
