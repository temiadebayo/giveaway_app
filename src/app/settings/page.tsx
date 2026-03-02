"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { createClient } from "@/lib/supabase";
import {
    Save,
    Loader2,
    CheckCircle2,
    AlertCircle,
    User,
    UserCircle,
    Phone,
    Mail
} from "lucide-react";

export default function SettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState("");

    const [profile, setProfile] = useState({
        username: "",
        display_name: "",
        phone: "",
        bank_name: "",
        account_name: "",
        account_number: ""
    });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        setLoading(true);
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push('/login');
            return;
        }

        setUserEmail(user.email || 'No email provided');

        const { data, error } = await supabase
            .from('profiles')
            .select('username, display_name, phone, bank_name, account_name, account_number')
            .eq('id', user.id)
            .single();

        if (data && !error) {
            setProfile({
                username: data.username || "",
                display_name: data.display_name || "",
                phone: data.phone || "",
                bank_name: data.bank_name || "",
                account_name: data.account_name || "",
                account_number: data.account_number || ""
            });
        }
        setLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                throw new Error("User not authenticated");
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    username: profile.username.trim(),
                    display_name: profile.display_name.trim(),
                    phone: profile.phone.trim(),
                    bank_name: profile.bank_name.trim(),
                    account_name: profile.account_name.trim(),
                    account_number: profile.account_number.trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;

            setSuccessMessage("Profile updated successfully!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Error saving profile:', err);
            setErrorMessage(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#06060c] text-slate-200 font-sans selection:bg-primary/30">
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16">
                <Breadcrumbs
                    items={[
                        { label: 'Settings' }
                    ]}
                />

                <div className="flex flex-col md:flex-row gap-8 mt-6">
                    {/* Sidebar / Navigation (for future expansion) */}
                    <div className="w-full md:w-64 shrink-0">
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                            <Button variant="ghost" className="w-full justify-start gap-3 bg-slate-800 text-white">
                                <User className="w-4 h-4" />
                                Profile Settings
                            </Button>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 max-w-2xl">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
                            <div className="mb-8">
                                <h1 className="text-2xl font-bold text-white mb-2">Profile Information</h1>
                                <p className="text-slate-400">Update your personal details. A complete profile with a phone number is required to host giveaways.</p>
                            </div>

                            {loading ? (
                                <div className="flex justify-center items-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <form onSubmit={handleSave} className="space-y-6">
                                    {/* Email (Read-only) */}
                                    <div className="space-y-2">
                                        <label className="text-slate-300 font-medium text-sm">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                disabled
                                                value={userEmail}
                                                className="pl-10 bg-slate-800/50 border-slate-700 opacity-70"
                                            />
                                        </div>
                                    </div>

                                    {/* Display Name */}
                                    <div className="space-y-2">
                                        <label htmlFor="display_name" className="text-slate-300 font-medium text-sm">Display Name</label>
                                        <div className="relative">
                                            <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                id="display_name"
                                                value={profile.display_name}
                                                onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                                                className="pl-10 bg-slate-950 border-slate-800 focus:border-primary"
                                                placeholder="e.g. John Doe"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Username */}
                                    <div className="space-y-2">
                                        <label htmlFor="username" className="text-slate-300 font-medium text-sm">Username</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">@</span>
                                            <Input
                                                id="username"
                                                value={profile.username}
                                                onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                                className="pl-8 bg-slate-950 border-slate-800 focus:border-primary"
                                                placeholder="johndoe123"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Phone Number */}
                                    <div className="space-y-2">
                                        <label htmlFor="phone" className="text-slate-300 font-medium text-sm">Phone Number</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <Input
                                                id="phone"
                                                value={profile.phone}
                                                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                                className="pl-10 bg-slate-950 border-slate-800 focus:border-primary"
                                                placeholder="e.g. +2348012345678"
                                                required
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">Required for Fair Play System verification.</p>
                                    </div>

                                    {/* Banking Information Section */}
                                    <div className="pt-6 border-t border-slate-800">
                                        <h3 className="text-lg font-bold text-white mb-4">Banking Information</h3>
                                        <p className="text-slate-400 text-sm mb-6">Enter your bank details for prize withdrawals. Ensure the account name matches your profile.</p>
                                        
                                        <div className="space-y-4">
                                            {/* Bank Name */}
                                            <div className="space-y-2">
                                                <label htmlFor="bank_name" className="text-slate-300 font-medium text-sm">Bank Name</label>
                                                <Input
                                                    id="bank_name"
                                                    value={profile.bank_name}
                                                    onChange={(e) => setProfile({ ...profile, bank_name: e.target.value })}
                                                    className="bg-slate-950 border-slate-800 focus:border-primary"
                                                    placeholder="e.g. Zenith Bank"
                                                    required
                                                />
                                            </div>

                                            {/* Account Name */}
                                            <div className="space-y-2">
                                                <label htmlFor="account_name" className="text-slate-300 font-medium text-sm">Account Name</label>
                                                <Input
                                                    id="account_name"
                                                    value={profile.account_name}
                                                    onChange={(e) => setProfile({ ...profile, account_name: e.target.value })}
                                                    className="bg-slate-950 border-slate-800 focus:border-primary"
                                                    placeholder="e.g. John Doe"
                                                    required
                                                />
                                            </div>

                                            {/* Account Number */}
                                            <div className="space-y-2">
                                                <label htmlFor="account_number" className="text-slate-300 font-medium text-sm">Account Number</label>
                                                <Input
                                                    id="account_number"
                                                    value={profile.account_number}
                                                    onChange={(e) => setProfile({ ...profile, account_number: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })}
                                                    className="bg-slate-950 border-slate-800 focus:border-primary"
                                                    placeholder="10-digit account number"
                                                    maxLength={10}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Messages */}
                                    <AnimatePresence mode="wait">
                                        {successMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2 text-green-400 text-sm"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {successMessage}
                                            </motion.div>
                                        )}
                                        {errorMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm"
                                            >
                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                {errorMessage}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Submit */}
                                    <div className="pt-4 border-t border-slate-800">
                                        <Button
                                            type="submit"
                                            className="w-full sm:w-auto min-w-[140px]"
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-4 h-4 mr-2" />
                                                    Save Changes
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
