import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { emailService } from "@/lib/email-service";
import { fpsService } from "@/lib/fps-service";
import { getCurrentAdmin } from "@/lib/admin-auth";

// Service role client (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * GET /api/admin/kyc — Fetch pending KYC requests (using service role)
 */
export async function GET() {
    try {
        // Verify caller is admin
        if (!(await getCurrentAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Use service role to bypass RLS
        const { data, error } = await supabaseAdmin
            .from("kyc_requests")
            .select(`
                *,
                profiles (
                    username,
                    display_name,
                    email,
                    trust_tier,
                    trust_score
                )
            `)
            .eq("status", "pending")
            .order("created_at", { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
    }
}

/**
 * POST /api/admin/kyc — Approve or Reject a KYC request
 * Body: { action: "approve" | "reject", requestId: string, reason?: string }
 */
export async function POST(request: NextRequest) {
    try {
        // Verify caller is admin
        if (!(await getCurrentAdmin())) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await request.json();
        const { action, requestId, reason } = body;

        if (!action || !requestId) {
            return NextResponse.json({ error: "Missing action or requestId" }, { status: 400 });
        }

        if (action === "approve") {
            // Fetch user details before approving so we can email them
            const { data: kycRequest } = await supabaseAdmin
                .from("kyc_requests")
                .select("user_id, profiles(email, display_name)")
                .eq("id", requestId)
                .single();

            const { data, error } = await supabaseAdmin.rpc("approve_kyc_request", {
                p_request_id: requestId,
            });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            if (data && typeof data === "object" && !data.success) {
                return NextResponse.json({ error: data.error || "Approval failed" }, { status: 400 });
            }

            // Send approval email (non-blocking — don't fail the request if email fails)
            const profile = (kycRequest?.profiles as any);
            if (profile?.email) {
                emailService.sendKycApproved(profile.email, profile.display_name || "there").catch(() => {});
            }
            fpsService.logEvent({ event_name: 'kyc_approved', category: 'auth', user_id: kycRequest?.user_id, properties: { request_id: requestId } }).catch(() => {});

            return NextResponse.json({ success: true });
        }

        if (action === "reject") {
            const rejectionReason = reason || "Documents unclear or invalid.";

            const { data: kycRequest } = await supabaseAdmin
                .from("kyc_requests")
                .select("user_id, profiles(email, display_name)")
                .eq("id", requestId)
                .single();

            const { data, error } = await supabaseAdmin.rpc("reject_kyc_request", {
                p_request_id: requestId,
                p_reason: rejectionReason,
            });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            if (data && typeof data === "object" && !data.success) {
                return NextResponse.json({ error: data.error || "Rejection failed" }, { status: 400 });
            }

            const profile = (kycRequest?.profiles as any);
            if (profile?.email) {
                emailService.sendKycRejected(profile.email, profile.display_name || "there", rejectionReason).catch(() => {});
            }
            fpsService.logEvent({ event_name: 'kyc_rejected', category: 'auth', severity: 'warning', user_id: kycRequest?.user_id, properties: { request_id: requestId, reason: rejectionReason } }).catch(() => {});

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
    }
}
