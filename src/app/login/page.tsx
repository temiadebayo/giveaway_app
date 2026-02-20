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
import { ArrowLeft, Mail, Lock, Loader2, Shield, CheckCircle } from "lucide-react";
import FredMascot from "@/assets/Fred_GA_Mascot.svg";
import logoWhite from "@/assets/logo_white.png";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    const { signInWithPassword, signInWithEmail, loading, error, setError } = useAuth();
    const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password) {
            await signInWithPassword(email, password);
        } else {
            const success = await signInWithEmail(email);
            if (success) {
                setMagicLinkSent(true);
            }
        }
    };

    return (
        <main className="min-h-screen bg-aurora flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Mascot */}
            <motion.div
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 0.1, x: 0 }}
                transition={{ duration: 1 }}
                className="absolute right-0 bottom-0 w-[500px] h-[500px] pointer-events-none hidden lg:block"
            >
                <Image
                    src={FredMascot}
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
                    <div className="text-center mb-8">
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
                            Welcome Back<span className="text-primary">!</span>
                        </h1>
                        <p className="text-white/60">Sign in to continue your journey 🚀</p>
                    </div>

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
                                <span className="text-green-400 font-medium">Device verified ✓</span>
                            ) : (
                                <span className="text-white/40">Verifying device...</span>
                            )}
                        </span>
                    </motion.div>

                    {magicLinkSent ? (
                        // Magic link sent confirmation
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center py-8"
                        >
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle className="w-10 h-10 text-green-400" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Check your inbox! 📬</h2>
                            <p className="text-white/60 mb-6">
                                We sent a magic link to<br />
                                <span className="text-white font-medium">{email}</span>
                            </p>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setMagicLinkSent(false);
                                    setEmail("");
                                }}
                            >
                                Use a different email
                            </Button>
                        </motion.div>
                    ) : showEmailForm ? (
                        // Email/Password form
                        <motion.form
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            onSubmit={handleEmailLogin}
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
                                Back to social login
                            </button>

                            <div className="space-y-3">
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
                                        placeholder="Password (optional for magic link)"
                                        className="pl-12 h-12 bg-white/5 border-white/10 focus:border-primary"
                                        autoComplete="current-password"
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
                                disabled={loading || !email}
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : password ? (
                                    "Sign In →"
                                ) : (
                                    "Send Magic Link ✨"
                                )}
                            </Button>

                            <p className="text-center text-white/40 text-xs">
                                {password
                                    ? "Enter your password to sign in"
                                    : "We'll send you a magic link to sign in instantly"
                                }
                            </p>
                        </motion.form>
                    ) : (
                        // Social login options
                        <>
                            <SocialAuthButtons providers={["google", "discord"]} />

                            <AuthDivider />

                            <Button
                                variant="outline"
                                className="w-full h-12 border-white/20 hover:bg-white/5"
                                onClick={() => setShowEmailForm(true)}
                            >
                                <Mail className="w-5 h-5 mr-2" />
                                Continue with Email
                            </Button>
                        </>
                    )}

                    {/* Footer */}
                    <p className="text-center text-white/40 text-sm mt-8">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className="text-primary hover:underline font-medium">
                            Sign up
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
