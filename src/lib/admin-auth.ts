/**
 * Admin authorization — the single client-side entry point.
 *
 * Before Phase 0, "admin" meant three different things:
 *   1. a hardcoded ADMIN_EMAILS array, duplicated in admin-service.ts and the KYC route
 *   2. profiles.is_host — which users could set on themselves, because profiles had a
 *      blanket UPDATE grant. That flag gated KYC approval and access to uploaded ID documents.
 *   3. a hardcoded email inside the fps_events RLS policy
 *
 * It now means exactly one thing: a row in public.admin_users. That table is not
 * writable through PostgREST at all — membership changes go through service_role.
 *
 * Adding an admin:
 *   insert into public.admin_users (user_id, email, role)
 *   select id, email, 'admin' from auth.users where email = 'someone@example.com';
 */

import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface AdminUser {
    id: string;
    email: string;
    role: "admin" | "superadmin";
}

/**
 * Resolve the currently signed-in user and confirm they are an admin.
 * Returns null when there is no session or the user is not on the roster.
 *
 * Server-side only — it reads the auth cookie and uses the service role key.
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabaseAdmin
        .from("admin_users")
        .select("user_id, email, role")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error || !data) return null;

    return { id: data.user_id, email: data.email, role: data.role };
}

/**
 * Boolean form, for layouts and conditional rendering.
 */
export async function isAdmin(): Promise<boolean> {
    return (await getCurrentAdmin()) !== null;
}

/**
 * Guard for API route handlers.
 *
 *   const admin = await requireAdmin();
 *   if (admin instanceof NextResponse) return admin;
 *
 * Returns the admin on success, or a 403 response to return directly.
 */
export async function requireAdmin(): Promise<AdminUser | Response> {
    const admin = await getCurrentAdmin();

    if (!admin) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
        });
    }

    return admin;
}
