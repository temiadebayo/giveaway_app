"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SocialAuthButtons, AuthDivider } from "@/components/auth/social-buttons";
import { useAuth } from "@/hooks/use-auth";
import { useFingerprint } from "@/hooks/use-fingerprint";
import { ArrowLeft, Mail, Lock, User, Loader2, Shield, CheckCircle, Sparkles } from "lucide-react";
import ZackMascot from "@/assets/Zack_GA_Mascot_1.svg";
import logoWhite from "@/assets/logo_white.png";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [signupComplete, setSignupComplete] = useState(false);

    const { signUp, loading, error, setError } = useAuth();
    const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        const result = await signUp(email, password, username);
        if (result?.needsConfirmation) {
            setSignupComplete(true);
        }
    };

    return (
        <main className="min-h-screen bg-aurora flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Mascot */}
            <motion.div
                initial={{ opacity: 0, x: -100 }}
                animate={{ opacity: 0.1, x: 0 }}
                transition={{ duration: 1 }}
                className="absolute left-0 bottom-0 w-[500px] h-[500px] pointer-events-none hidden lg:block"
            >
                <Image
                    src={ZackMascot}
                    alt=""
                    fill
                    className="object-contain"
                />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Back link */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to home
                </Link>

                {/* Card */}
                <div className="card-premium p-8">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex justify-center mb-4"
                        >
                            <Image
                                src={logoWhite}
                                alt="Giveaway App"
                                width={60}
                                height={60}
                                className="opacity-90"
                            />
                        </motion.div>
                        <h1 className="text-3xl font-black mb-2">
                            Join the Tribe<span className="text-primary">!</span>
                        </h1>
                        <p className="text-white/60">Create your account and start winning 🏆</p>
                    </div>

                    {/* Perks */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-wrap justify-center gap-2 mb-6"
                    >
                        {[
                            { icon: "🥉", text: "Bronze Start" },
                            { icon: "🛡️", text: "Device Secured" },
                            { icon: "⚡", text: "Fair Play" },
                        ].map((perk) => (
                            <span
                                key={perk.text}
                                className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium"
                            >
                                {perk.icon} {perk.text}
                            </span>
                        ))}
                    </motion.div>

                    {/* Fingerprint Status */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center gap-2 mb-6 py-2 px-4 rounded-full bg-primary/10 border border-primary/20 mx-auto w-fit"
                    >
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-sm">
                            {fingerprintLoading ? (
                                <span className="text-white/40">Securing device...</span>
                            ) : fingerprint ? (
                                <span className="text-green-400 font-medium">Device secured ✓</span>
                            ) : (
                                <span className="text-white/40">Verifying...</span>
                            )}
                        </span>
                    </motion.div>

                    {signupComplete ? (
                        // Signup complete confirmation
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-8"
                        >
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle className="w-10 h-10 text-green-400" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">You&apos;re In! 🎉</h2>
                            <p className="text-white/60 mb-4">
                                Check your inbox to confirm<br />
                                <span className="text-white font-medium">{email}</span>
                            </p>

                            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 mb-6">
                                <Sparkles className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                                <p className="text-sm">
                                    You&apos;ll start at <span className="text-amber-400 font-bold">Bronze Tier</span>
                                </p>
                                <p className="text-xs text-white/40 mt-1">Verify your phone to level up!</p>
                            </div>

                            <Link href="/login">
                                <Button className="bg-brand-gradient hover:opacity-90 text-white font-bold">
                                    Go to Login →
                                </Button>
                            </Link>
                        </motion.div>
                    ) : showEmailForm ? (
                        // Email signup form
                        <motion.form
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            onSubmit={handleSignup}
                            className="space-y-4"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setShowEmailForm(false);
                                    setError(null);
                                }}
                                className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to social signup
                            </button>

                            <div className="space-y-3">
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <Input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Username (optional)"
                                        className="pl-12 h-12 bg-white/5 border-white/10 focus:border-primary"
                                        autoComplete="username"
                                    />
                                </div>

                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Email address"
                                        className="pl-12 h-12 bg-white/5 border-white/10 focus:border-primary"
                                        required
                                        autoComplete="email"
                                    />
                                </div>

                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Password (min 6 characters)"
                                        className="pl-12 h-12 bg-white/5 border-white/10 focus:border-primary"
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            {error && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-red-400 text-sm text-center py-2 px-4 rounded-lg bg-red-500/10 border border-red-500/20"
                                >
                                    {error}
                                </motion.p>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-12 bg-brand-gradient hover:opacity-90 text-white font-bold rounded-xl"
                                disabled={loading || !email || !password}
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    "Create Account 🚀"
                                )}
                            </Button>

                            <p className="text-center text-white/40 text-xs">
                                By signing up, you agree to our Terms & Fair Play Policy
                            </p>
                        </motion.form>
                    ) : (
                        // Social signup options
                        <>
                            <SocialAuthButtons providers={["google", "discord"]} />

                            <AuthDivider />

                            <Button
                                variant="outline"
                                className="w-full h-12 border-white/20 hover:bg-white/5"
                                onClick={() => setShowEmailForm(true)}
                            >
                                <Mail className="w-5 h-5 mr-2" />
                                Sign up with Email
                            </Button>
                        </>
                    )}

                    {/* Footer */}
                    <p className="text-center text-white/40 text-sm mt-8">
                        Already have an account?{" "}
                        <Link href="/login" className="text-primary hover:underline font-medium">
                            Sign in
                        </Link>
                    </p>
                </div>

                {/* Security note */}
                <div className="flex items-center justify-center gap-2 mt-6 text-white/30 text-xs">
                    <Shield className="w-3 h-3" />
                    <span>Protected by Fair Play System™</span>
                </div>
            </motion.div>
        </main>
    );
}
