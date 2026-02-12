import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const fingerprint = requestUrl.searchParams.get('fingerprint')
    const origin = requestUrl.origin

    if (code) {
        const supabase = await createServerSupabaseClient()

        // Exchange code for session
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // Link guest participations to user account
            if (fingerprint) {
                try {
                    const { data: linkResult } = await supabase
                        .rpc('link_guest_to_user', { p_fingerprint_id: fingerprint });

                    if (linkResult?.linked_count > 0) {
                        console.log(`Linked ${linkResult.linked_count} guest participation(s) to user ${data.user.id}`);
                        // Redirect with linked count for success message
                        return NextResponse.redirect(`${origin}/dashboard?linked=${linkResult.linked_count}`);
                    }
                } catch (err) {
                    console.error('Error linking guest participations:', err);
                }
            }

            return NextResponse.redirect(`${origin}/dashboard`)
        }
    }

    // Return to login on error
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
