import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const error_param = requestUrl.searchParams.get('error')
    const error_description = requestUrl.searchParams.get('error_description')
    const origin = requestUrl.origin

    // NOTE: guest history is no longer linked here.
    //
    // This route used to accept a `fingerprint` query parameter and link every guest
    // record matching it. Two problems: a fingerprint is publicly observable (so it
    // authorised nothing), and putting a credential in a URL leaks it into browser
    // history, Referer headers and server access logs.
    //
    // The claim now happens client-side against the guest session token in localStorage,
    // which never leaves that browser except in a POST body. See GuestSessionClaimer.

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
