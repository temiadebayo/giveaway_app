import { createClient } from "@supabase/supabase-js";

import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key] = vals.join('=').trim();
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });

async function test() {
    console.log("Testing getPendingWithdrawals...");
    const { data: withdrawalsData, error: withdrawalsError } = await supabaseAdmin
        .from('withdrawal_requests')
        .select(`
            *,
            profiles (*)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (withdrawalsError) {
        console.error("WITHDRAWALS ERROR:", withdrawalsError);
    } else {
        console.log("WITHDRAWALS SUCCESS:", withdrawalsData?.length, "records");
    }
}

test();
