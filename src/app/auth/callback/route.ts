import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const error_param = requestUrl.searchParams.get('error')
    const error_description = requestUrl.searchParams.get('error_description')
    const fingerprint = requestUrl.searchParams.get('fingerprint')
    const origin = requestUrl.origin

    console.log('[Auth Callback] Origin:', origin)
    console.log('[Auth Callback] Has code:', !!code)
    console.log('[Auth Callback] Error param:', error_param)
    console.log('[Auth Callback] Error description:', error_description)

    // If Supabase/OAuth returned an error directly
    if (error_param) {
        const msg = encodeURIComponent(error_description || error_param)
        return NextResponse.redirect(`${origin}/login?error=${msg}`)
    }

    if (code) {
        try {
            const supabase = await createServerSupabaseClient()

            // Exchange code for session
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)

            console.log('[Auth Callback] Exchange result - error:', error?.message, 'user:', data?.user?.id)

            if (error) {
                console.error('[Auth Callback] Session exchange failed:', error.message)
                const msg = encodeURIComponent(error.message)
                return NextResponse.redirect(`${origin}/login?error=${msg}`)
            }

            if (data.user) {
                // Link guest participations to user account
                if (fingerprint) {
                    try {
                        const { data: linkResult } = await supabase
                            .rpc('link_guest_to_user', { p_fingerprint_id: fingerprint });

                        if (linkResult?.linked_count > 0) {
                            console.log(`Linked ${linkResult.linked_count} guest participation(s) to user ${data.user.id}`);
                            return NextResponse.redirect(`${origin}/dashboard?linked=${linkResult.linked_count}`);
                        }
                    } catch (err) {
                        console.error('[Auth Callback] Guest linking error:', err);
                    }
                }

                console.log('[Auth Callback] Success! Redirecting to dashboard for user:', data.user.id)
                return NextResponse.redirect(`${origin}/dashboard`)
            }
        } catch (err) {
            console.error('[Auth Callback] Unexpected error:', err)
            const msg = encodeURIComponent(err instanceof Error ? err.message : 'Unexpected error')
            return NextResponse.redirect(`${origin}/login?error=${msg}`)
        }
    }

    // No code provided
    console.error('[Auth Callback] No code provided in URL')
    return NextResponse.redirect(`${origin}/login?error=no_code_received`)
}
