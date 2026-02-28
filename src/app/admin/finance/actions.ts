"use server";

import { adminService } from "@/lib/admin-service";
import { revalidatePath } from "next/cache";

export type ActionResult = { success: boolean; error?: string };

function handleError(e: any): ActionResult {
    return { success: false, error: e.message || "An unexpected error occurred." };
}

export async function bulkApproveDepositsAction(ids: string[]): Promise<ActionResult> {
    try {
        for (const id of ids) await adminService.approveDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkRejectDepositsAction(ids: string[]): Promise<ActionResult> {
    try {
        for (const id of ids) await adminService.rejectDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkProcessWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    try {
        for (const id of ids) await adminService.processWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkApproveWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    try {
        for (const id of ids) await adminService.approveWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkRejectWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    try {
        for (const id of ids) await adminService.rejectWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleApproveDepositAction(id: string): Promise<ActionResult> {
    try {
        await adminService.approveDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleRejectDepositAction(id: string): Promise<ActionResult> {
    try {
        await adminService.rejectDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleApproveWithdrawalAction(id: string): Promise<ActionResult> {
    try {
        await adminService.approveWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleRejectWithdrawalAction(id: string): Promise<ActionResult> {
    try {
        await adminService.rejectWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function processWithdrawalServerAction(id: string): Promise<ActionResult> {
    try {
        await adminService.processWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}
