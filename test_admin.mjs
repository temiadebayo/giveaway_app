import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

// Load env from .env.local
import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key] = vals.join('=').trim();
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("URL:", url);
console.log("KEY prefix:", key?.substring(0, 10));

const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });

async function test() {
    const { data, error } = await supabaseAdmin.from('wallet_transactions').select('*').limit(1);
    if (error) {
        console.error("ERROR:", error);
    } else {
        console.log("SUCCESS, data:", data);
    }
}

test();
