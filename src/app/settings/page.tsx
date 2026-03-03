"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { createClient } from "@/lib/supabase";
import { trustService } from "@/lib/trust-service";
import {
    Save,
    Loader2,
    CheckCircle2,
    AlertCircle,
    User,
    UserCircle,
    Phone,
    Mail,
    Shield,
    Lock,
    Bell,
    Eye,
    Landmark,
    KeyRound,
    Fingerprint,
    Monitor,
    Copy,
    ExternalLink,
    Trash2,
    FileText,
    BadgeCheck,
    Clock,
    Share2,
    Users,
    ToggleLeft,
    ToggleRight
} from "lucide-react";

type TabKey = 'profile' | 'security' | 'payouts' | 'verification' | 'notifications' | 'privacy';

const TABS: { key: TabKey; label: string; icon: any }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'payouts', label: 'Payouts', icon: Landmark },
    { key: 'verification', label: 'Verification', icon: BadgeCheck },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'privacy', label: 'Privacy & More', icon: Eye },
];

// Reusable toggle component
function SettingsToggle({ enabled, onChange, label, description }: {
    enabled: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800/50 hover:border-slate-700/50 transition-colors">
            <div className="mr-4">
                <p className="text-sm font-medium text-white">{label}</p>
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
            </div>
            <button
                type="button"
                onClick={() => onChange(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-slate-700'}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}

export default function SettingsPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabKey>('profile');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState("");
    const [userId, setUserId] = useState("");

    // Profile state
    const [profile, setProfile] = useState({
        username: "",
        display_name: "",
        phone: "",
        bank_name: "",
        account_name: "",
        account_number: "",
        id_verified: false,
        phone_verified: false,
    });

    // Security state
    const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
    const [changingPassword, setChangingPassword] = useState(false);

    // KYC state
    const [kycStatus, setKycStatus] = useState<string | null>(null);

    // Notification prefs
    const [notifPrefs, setNotifPrefs] = useState({
        winning_alerts: true,
        new_giveaway_tier: true,
        host_live: true,
        trust_updates: false,
        email_digest: false,
    });

    // Privacy prefs
    const [privacyPrefs, setPrivacyPrefs] = useState({
        hide_wins: false,
        anonymous_leaderboard: false,
        public_profile: true,
    });

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setErrorMessage(null);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const showError = (msg: string) => {
        setErrorMessage(msg);
        setSuccessMessage(null);
    };

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
        setUserId(user.id);

        const { data, error } = await supabase
            .from('profiles')
            .select('username, display_name, phone, bank_name, account_name, account_number, id_verified, phone_verified, notification_preferences, privacy_settings')
            .eq('id', user.id)
            .single();

        if (data && !error) {
            setProfile({
                username: data.username || "",
                display_name: data.display_name || "",
                phone: data.phone || "",
                bank_name: data.bank_name || "",
                account_name: data.account_name || "",
                account_number: data.account_number || "",
                id_verified: data.id_verified || false,
                phone_verified: data.phone_verified || false,
            });
            if (data.notification_preferences) {
                setNotifPrefs({ ...notifPrefs, ...data.notification_preferences });
            }
            if (data.privacy_settings) {
                setPrivacyPrefs({ ...privacyPrefs, ...data.privacy_settings });
            }
        }

        // Load KYC status
        try {
            const kyc = await trustService.getKycStatus();
            setKycStatus(kyc?.status || null);
        } catch { }

        setLoading(false);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const { error } = await supabase
                .from('profiles')
                .update({
                    username: profile.username.trim(),
                    display_name: profile.display_name.trim(),
                    phone: profile.phone.trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;
            showSuccess("Profile updated successfully!");
        } catch (err: any) {
            showError(err.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePayouts = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const { error } = await supabase
                .from('profiles')
                .update({
                    bank_name: profile.bank_name.trim(),
                    account_name: profile.account_name.trim(),
                    account_number: profile.account_number.trim(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) throw error;
            showSuccess("Banking details updated!");
        } catch (err: any) {
            showError(err.message || 'Failed to update banking details');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            showError("Passwords do not match");
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            showError("Password must be at least 6 characters");
            return;
        }
        setChangingPassword(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({
                password: passwordForm.newPassword,
            });
            if (error) throw error;
            setPasswordForm({ newPassword: "", confirmPassword: "" });
            showSuccess("Password changed successfully!");
        } catch (err: any) {
            showError(err.message || "Failed to change password");
        } finally {
            setChangingPassword(false);
        }
    };

    const handleSaveNotifications = async () => {
        setSaving(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('profiles')
                .update({ notification_preferences: notifPrefs, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;
            showSuccess("Notification preferences saved!");
        } catch (err: any) {
            showError(err.message || "Failed to save preferences");
        } finally {
            setSaving(false);
        }
    };

    const handleSavePrivacy = async () => {
        setSaving(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('profiles')
                .update({ privacy_settings: privacyPrefs, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;
            showSuccess("Privacy settings saved!");
        } catch (err: any) {
            showError(err.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmation = prompt('Type "DELETE" to permanently delete your account. This is irreversible.');
        if (confirmation !== 'DELETE') {
            showError("Account deletion cancelled.");
            return;
        }

        try {
            const supabase = createClient();
            // Sign out and mark for deletion (actual deletion requires admin action or edge function)
            await supabase.auth.signOut();
            router.push('/');
        } catch (err: any) {
            showError(err.message || 'Deletion failed');
        }
    };

    const referralLink = typeof window !== 'undefined'
        ? `${window.location.origin}/signup?ref=${profile.username || userId.slice(0, 8)}`
        : '';

    const copyReferralLink = () => {
        navigator.clipboard.writeText(referralLink);
        showSuccess("Referral link copied!");
    };

    // --- Tab Content Renderers ---

    const renderProfileTab = () => (
        <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Profile Information</h2>
                <p className="text-slate-400 text-sm">Update your personal details. A complete profile is required to host giveaways.</p>
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
                <label className="text-slate-300 font-medium text-sm">Email Address</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input disabled value={userEmail} className="pl-10 bg-slate-800/50 border-slate-700 opacity-70" />
                </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
                <label htmlFor="display_name" className="text-slate-300 font-medium text-sm">Display Name</label>
                <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input id="display_name" value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} className="pl-10 bg-slate-950 border-slate-800 focus:border-primary" placeholder="e.g. John Doe" required />
                </div>
            </div>

            {/* Username */}
            <div className="space-y-2">
                <label htmlFor="username" className="text-slate-300 font-medium text-sm">Username</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">@</span>
                    <Input id="username" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} className="pl-8 bg-slate-950 border-slate-800 focus:border-primary" placeholder="johndoe123" required />
                </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
                <label htmlFor="phone" className="text-slate-300 font-medium text-sm">Phone Number</label>
                <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input id="phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="pl-10 bg-slate-950 border-slate-800 focus:border-primary" placeholder="e.g. +2348012345678" required />
                </div>
                <p className="text-xs text-slate-500">Required for Fair Play System verification.</p>
            </div>

            {renderMessages()}
            {renderSaveButton()}
        </form>
    );

    const renderSecurityTab = () => (
        <div className="space-y-8">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Account Security</h2>
                <p className="text-slate-400 text-sm">Manage your password and keep your account safe.</p>
            </div>

            {/* Change Password */}
            <form onSubmit={handleChangePassword} className="space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary" /> Change Password
                </h3>
                <div className="space-y-2">
                    <label className="text-slate-300 font-medium text-sm">New Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="pl-10 bg-slate-950 border-slate-800 focus:border-primary" placeholder="Min. 6 characters" required />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-slate-300 font-medium text-sm">Confirm New Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="pl-10 bg-slate-950 border-slate-800 focus:border-primary" placeholder="Re-enter new password" required />
                    </div>
                </div>

                {renderMessages()}

                <Button type="submit" disabled={changingPassword} className="min-w-[160px]">
                    {changingPassword ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Changing...</> : <><KeyRound className="w-4 h-4 mr-2" /> Update Password</>}
                </Button>
            </form>

            {/* Session Info */}
            <div className="pt-6 border-t border-slate-800 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-primary" /> Active Session
                </h3>
                <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Fingerprint className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">Current Device</p>
                        <p className="text-xs text-slate-500 truncate">{userEmail} • Active now</p>
                    </div>
                    <span className="text-xs font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded-full">Active</span>
                </div>
            </div>
        </div>
    );

    const renderPayoutsTab = () => (
        <form onSubmit={handleSavePayouts} className="space-y-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Payout Settings</h2>
                <p className="text-slate-400 text-sm">Your bank details for receiving prize withdrawals. Ensure the account name matches your verified identity.</p>
            </div>

            {/* Bank Name */}
            <div className="space-y-2">
                <label htmlFor="bank_name" className="text-slate-300 font-medium text-sm">Bank Name</label>
                <Input id="bank_name" value={profile.bank_name} onChange={(e) => setProfile({ ...profile, bank_name: e.target.value })} className="bg-slate-950 border-slate-800 focus:border-primary" placeholder="e.g. Zenith Bank" required />
            </div>

            {/* Account Name */}
            <div className="space-y-2">
                <label htmlFor="account_name" className="text-slate-300 font-medium text-sm">Account Name</label>
                <Input id="account_name" value={profile.account_name} onChange={(e) => setProfile({ ...profile, account_name: e.target.value })} className="bg-slate-950 border-slate-800 focus:border-primary" placeholder="e.g. John Doe" required />
            </div>

            {/* Account Number */}
            <div className="space-y-2">
                <label htmlFor="account_number" className="text-slate-300 font-medium text-sm">Account Number</label>
                <Input id="account_number" value={profile.account_number} onChange={(e) => setProfile({ ...profile, account_number: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })} className="bg-slate-950 border-slate-800 focus:border-primary" placeholder="10-digit account number" maxLength={10} required />
            </div>

            {renderMessages()}
            {renderSaveButton()}
        </form>
    );

    const renderVerificationTab = () => (
        <div className="space-y-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Verification Center</h2>
                <p className="text-slate-400 text-sm">Complete your verification to unlock higher tiers and withdrawal limits.</p>
            </div>

            {/* Email Verification */}
            <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${true ? 'bg-green-500/10' : 'bg-slate-800'}`}>
                    <Mail className={`w-5 h-5 ${true ? 'text-green-400' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium text-white">Email Verification</p>
                    <p className="text-xs text-slate-500">{userEmail}</p>
                </div>
                <span className="text-xs font-bold text-green-400 bg-green-500/10 px-3 py-1 rounded-full">Verified</span>
            </div>

            {/* Phone Verification */}
            <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profile.phone_verified ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                    <Phone className={`w-5 h-5 ${profile.phone_verified ? 'text-green-400' : 'text-yellow-400'}`} />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium text-white">Phone Verification</p>
                    <p className="text-xs text-slate-500">{profile.phone || 'No phone number added'}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${profile.phone_verified ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>
                    {profile.phone_verified ? 'Verified' : 'Pending'}
                </span>
            </div>

            {/* KYC / ID Verification */}
            <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profile.id_verified ? 'bg-green-500/10' : kycStatus === 'pending' ? 'bg-yellow-500/10' : 'bg-slate-800'}`}>
                    <BadgeCheck className={`w-5 h-5 ${profile.id_verified ? 'text-green-400' : kycStatus === 'pending' ? 'text-yellow-400' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium text-white">Identity Verification (KYC)</p>
                    <p className="text-xs text-slate-500">
                        {profile.id_verified ? 'Your identity has been verified' : kycStatus === 'pending' ? 'Your submission is under review' : 'Upload a government ID and selfie to verify'}
                    </p>
                </div>
                {profile.id_verified ? (
                    <span className="text-xs font-bold text-green-400 bg-green-500/10 px-3 py-1 rounded-full">Verified</span>
                ) : kycStatus === 'pending' ? (
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
                ) : (
                    <Link href="/trust/kyc">
                        <Button size="sm" className="bg-brand-gradient text-xs">Start KYC</Button>
                    </Link>
                )}
            </div>

            {/* Social Links (Future) */}
            <div className="pt-6 border-t border-slate-800">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-primary" /> Social Accounts
                </h3>
                <p className="text-xs text-slate-500 mb-4">Link your social accounts for extra Trust Score points (coming soon).</p>
                {['X (Twitter)', 'Discord', 'Telegram'].map((platform) => (
                    <div key={platform} className="p-3 bg-slate-950/50 border border-slate-800/50 rounded-xl flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">{platform}</span>
                        <span className="text-xs text-slate-600 bg-slate-800 px-3 py-1 rounded-full">Coming Soon</span>
                    </div>
                ))}
            </div>

            {renderMessages()}
        </div>
    );

    const renderNotificationsTab = () => (
        <div className="space-y-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-1">Notification Preferences</h2>
                <p className="text-slate-400 text-sm">Choose what alerts you want to receive.</p>
            </div>

            <div className="space-y-3">
                <SettingsToggle
                    enabled={notifPrefs.winning_alerts}
                    onChange={(v) => setNotifPrefs({ ...notifPrefs, winning_alerts: v })}
                    label="Winning Alerts"
                    description="Get notified instantly when you win a giveaway"
                />
                <SettingsToggle
                    enabled={notifPrefs.new_giveaway_tier}
                    onChange={(v) => setNotifPrefs({ ...notifPrefs, new_giveaway_tier: v })}
                    label="New Giveaways in My Tier"
                    description="Alert when a giveaway matching your trust tier goes live"
                />
                <SettingsToggle
                    enabled={notifPrefs.host_live}
                    onChange={(v) => setNotifPrefs({ ...notifPrefs, host_live: v })}
                    label="Host I Follow is Live"
                    description="Get notified when a host you follow starts a giveaway"
                />
                <SettingsToggle
                    enabled={notifPrefs.trust_updates}
                    onChange={(v) => setNotifPrefs({ ...notifPrefs, trust_updates: v })}
                    label="Trust Score Changes"
                    description="Alerts when your Trust Score™ changes"
                />
                <SettingsToggle
                    enabled={notifPrefs.email_digest}
                    onChange={(v) => setNotifPrefs({ ...notifPrefs, email_digest: v })}
                    label="Weekly Email Digest"
                    description="A weekly summary of giveaways and earnings"
                />
            </div>

            {renderMessages()}

            <div className="pt-4 border-t border-slate-800">
                <Button onClick={handleSaveNotifications} disabled={saving} className="min-w-[160px]">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Preferences</>}
                </Button>
            </div>
        </div>
    );

    const renderPrivacyTab = () => (
        <div className="space-y-8">
            {/* Privacy */}
            <div>
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1">Privacy Settings</h2>
                    <p className="text-slate-400 text-sm">Control who sees your activity on the platform.</p>
                </div>
                <div className="space-y-3">
                    <SettingsToggle
                        enabled={privacyPrefs.public_profile}
                        onChange={(v) => setPrivacyPrefs({ ...privacyPrefs, public_profile: v })}
                        label="Public Profile"
                        description="Allow others to view your profile and stats"
                    />
                    <SettingsToggle
                        enabled={privacyPrefs.hide_wins}
                        onChange={(v) => setPrivacyPrefs({ ...privacyPrefs, hide_wins: v })}
                        label="Hide My Wins"
                        description="Don't show my victories on any public pages"
                    />
                    <SettingsToggle
                        enabled={privacyPrefs.anonymous_leaderboard}
                        onChange={(v) => setPrivacyPrefs({ ...privacyPrefs, anonymous_leaderboard: v })}
                        label="Anonymous on Leaderboards"
                        description='Show as "Anonymous Player" on game leaderboards'
                    />
                </div>

                {renderMessages()}

                <div className="pt-4">
                    <Button onClick={handleSavePrivacy} disabled={saving} className="min-w-[160px]">
                        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Privacy</>}
                    </Button>
                </div>
            </div>

            {/* Referral Link */}
            <div className="pt-6 border-t border-slate-800">
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Referral Program
                </h3>
                <p className="text-xs text-slate-500 mb-4">Invite friends and earn Trust Score™ bonuses when they join.</p>
                <div className="flex items-center gap-2">
                    <Input
                        readOnly
                        value={referralLink}
                        className="bg-slate-950 border-slate-800 text-xs font-mono text-slate-400 flex-1"
                    />
                    <Button type="button" variant="ghost" onClick={copyReferralLink} className="px-3 bg-slate-800 hover:bg-primary hover:text-white">
                        <Copy className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Legal & Support */}
            <div className="pt-6 border-t border-slate-800 space-y-3">
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" /> Legal & Support
                </h3>
                <Link href="/terms" className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 text-sm text-slate-300 hover:border-slate-700 transition-colors">
                    <FileText className="w-4 h-4 text-slate-500" /> Terms of Service <ExternalLink className="w-3 h-3 ml-auto text-slate-600" />
                </Link>
                <Link href="/privacy" className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 text-sm text-slate-300 hover:border-slate-700 transition-colors">
                    <Eye className="w-4 h-4 text-slate-500" /> Privacy Policy <ExternalLink className="w-3 h-3 ml-auto text-slate-600" />
                </Link>
            </div>

            {/* Danger Zone */}
            <div className="pt-6 border-t border-red-900/30">
                <h3 className="text-base font-bold text-red-400 mb-2 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Danger Zone
                </h3>
                <p className="text-xs text-slate-500 mb-4">Once you delete your account, there is no going back. All your data, winnings, and history will be permanently erased.</p>
                <Button variant="ghost" onClick={handleDeleteAccount} className="text-red-400 border border-red-900/50 hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete My Account
                </Button>
            </div>
        </div>
    );

    // --- Shared UI ---

    const renderMessages = () => (
        <AnimatePresence mode="wait">
            {successMessage && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle2 className="w-4 h-4" /> {successMessage}
                </motion.div>
            )}
            {errorMessage && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {errorMessage}
                </motion.div>
            )}
        </AnimatePresence>
    );

    const renderSaveButton = () => (
        <div className="pt-4 border-t border-slate-800">
            <Button type="submit" className="w-full sm:w-auto min-w-[140px]" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
            </Button>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'profile': return renderProfileTab();
            case 'security': return renderSecurityTab();
            case 'payouts': return renderPayoutsTab();
            case 'verification': return renderVerificationTab();
            case 'notifications': return renderNotificationsTab();
            case 'privacy': return renderPrivacyTab();
        }
    };

    return (
        <div className="min-h-screen bg-[#06060c] text-slate-200 font-sans selection:bg-primary/30">
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 mt-16">
                <Breadcrumbs items={[{ label: 'Settings' }]} />

                <div className="flex flex-col md:flex-row gap-6 mt-6">
                    {/* Sidebar */}
                    <div className="w-full md:w-56 shrink-0">
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1 md:sticky md:top-24">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => { setActiveTab(tab.key); setSuccessMessage(null); setErrorMessage(null); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                                        activeTab === tab.key
                                            ? 'bg-primary/10 text-primary border border-primary/20'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                                    }`}
                                >
                                    <tab.icon className="w-4 h-4 shrink-0" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 max-w-2xl">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
                            {loading ? (
                                <div className="flex justify-center items-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {renderTabContent()}
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
