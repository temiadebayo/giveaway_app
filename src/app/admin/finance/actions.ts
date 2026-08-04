"use server";

import { adminService } from "@/lib/admin-service";
import { emailService } from "@/lib/email-service";
import { fpsService } from "@/lib/fps-service";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function getWithdrawalUserInfo(withdrawalId: string) {
    const { data } = await supabaseAdmin
        .from("withdrawal_requests")
        .select("amount, net_amount, profiles(email, display_name)")
        .eq("id", withdrawalId)
        .single();
    return data;
}

export type ActionResult = { success: boolean; error?: string };

function handleError(e: any): ActionResult {
    return { success: false, error: e.message || "An unexpected error occurred." };
}

/**
 * Every action in this file moves money using the service role key, which bypasses RLS
 * entirely. None of them previously checked who was calling.
 *
 * A "use server" action is a real POST endpoint — being rendered inside /admin does not
 * protect it. The admin layout's is_admin() check gates the *page*, not the actions the
 * page imports. Anyone who could invoke the action ID could approve withdrawals.
 *
 * The database functions also check authorization, but they accept the service role as
 * trusted (see is_admin_or_service()), so this is the check that actually identifies the
 * human operator. It runs before every privileged call below.
 */
async function guard(): Promise<ActionResult | null> {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return { success: false, error: "Unauthorized" };
    }
    return null;
}

export async function bulkApproveDepositsAction(ids: string[]): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        for (const id of ids) await adminService.approveDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkRejectDepositsAction(ids: string[]): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        for (const id of ids) await adminService.rejectDeposit(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkProcessWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        for (const id of ids) await adminService.processWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkApproveWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        for (const id of ids) await adminService.approveWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function bulkRejectWithdrawalsAction(ids: string[]): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        for (const id of ids) await adminService.rejectWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleApproveDepositAction(id: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        await adminService.approveDeposit(id);
        revalidatePath("/admin/finance");
        fpsService.logEvent({ event_name: 'deposit_approved', category: 'financial', properties: { transaction_id: id } }).catch(() => {});
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleRejectDepositAction(id: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        await adminService.rejectDeposit(id);
        revalidatePath("/admin/finance");
        fpsService.logEvent({ event_name: 'deposit_rejected', category: 'financial', properties: { transaction_id: id } }).catch(() => {});
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleApproveWithdrawalAction(id: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        const info = await getWithdrawalUserInfo(id);
        await adminService.approveWithdrawal(id);
        revalidatePath("/admin/finance");
        const profile = info?.profiles as any;
        if (profile?.email) {
            emailService.sendWithdrawalProcessed(
                profile.email,
                profile.display_name || "there",
                Number(info?.amount),
                Number(info?.net_amount)
            ).catch(() => {});
        }
        fpsService.logEvent({ event_name: 'withdrawal_approved', category: 'financial', properties: { withdrawal_id: id, amount: info?.amount } }).catch(() => {});
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function singleRejectWithdrawalAction(id: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        const info = await getWithdrawalUserInfo(id);
        await adminService.rejectWithdrawal(id);
        revalidatePath("/admin/finance");
        const profile = info?.profiles as any;
        if (profile?.email) {
            emailService.sendWithdrawalFailed(
                profile.email,
                profile.display_name || "there",
                Number(info?.amount),
                "Your withdrawal request could not be processed. Please contact support if you need assistance."
            ).catch(() => {});
        }
        fpsService.logEvent({ event_name: 'withdrawal_rejected', category: 'financial', properties: { withdrawal_id: id, amount: info?.amount } }).catch(() => {});
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function processWithdrawalServerAction(id: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        await adminService.processWithdrawal(id);
        revalidatePath("/admin/finance");
        return { success: true };
    } catch (e: any) { return handleError(e); }
}

export async function refundPrizeClaimAction(giveawayId: string, reason: string): Promise<ActionResult> {
    const denied = await guard();
    if (denied) return denied;

    try {
        await adminService.refundPrizeClaim(giveawayId, reason);
        revalidatePath("/admin/finance");
        revalidatePath("/admin/giveaways");
        fpsService.logEvent({ event_name: 'prize_refunded', category: 'financial', severity: 'warning', giveaway_id: giveawayId, properties: { reason } }).catch(() => {});
        return { success: true };
    } catch (e: any) { return handleError(e); }
}
