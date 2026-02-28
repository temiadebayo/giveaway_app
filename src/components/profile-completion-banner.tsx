"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import {
    AlertTriangle,
    Shield,
    CheckCircle,
    ChevronRight,
    User,
    Phone,
    BadgeCheck,
    ImageIcon,
    X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfileStep {
    key: string;
    label: string;
    icon: React.ElementType;
    completed: boolean;
    href: string;
    points: number;
}

export function ProfileCompletionBanner() {
    const [steps, setSteps] = useState<ProfileStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    const [kycStatus, setKycStatus] = useState<string | null>(null);

    useEffect(() => {
        loadProfileStatus();
    }, []);

    const loadProfileStatus = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            // Fetch profile
            const { data: profile } = await supabase
                .from("profiles")
                .select("display_name, avatar_url, phone, phone_verified, id_verified")
                .eq("id", user.id)
                .single();

            // Fetch KYC status
            const { data: kyc } = await supabase
                .from("kyc_requests")
                .select("status")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

            setKycStatus(kyc?.status || null);

            const profileSteps: ProfileStep[] = [
                {
                    key: "display_name",
                    label: "Set display name",
                    icon: User,
                    completed: !!profile?.display_name && profile.display_name.trim() !== "",
                    href: "/settings",
                    points: 5,
                },
                {
                    key: "avatar",
                    label: "Upload profile photo",
                    icon: ImageIcon,
                    completed: !!profile?.avatar_url,
                    href: "/settings",
                    points: 5,
                },
                {
                    key: "phone",
                    label: "Verify phone number",
                    icon: Phone,
                    completed: !!profile?.phone_verified,
                    href: "/settings",
                    points: 20,
                },
                {
                    key: "kyc",
                    label: "Complete KYC verification",
                    icon: BadgeCheck,
                    completed: !!profile?.id_verified || kyc?.status === "approved",
                    href: "/trust/kyc",
                    points: 30,
                },
            ];

            setSteps(profileSteps);
        } catch (err) {
            console.error("Error loading profile status:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || dismissed) return null;

    const completedCount = steps.filter((s) => s.completed).length;
    const totalSteps = steps.length;
    const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

    // All steps complete — no banner needed
    if (completedCount === totalSteps) return null;

    const nextStep = steps.find((s) => !s.completed);
    const isKycPending = kycStatus === "pending";
    const isKycRejected = kycStatus === "rejected";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-900/30 via-amber-900/20 to-orange-900/30 backdrop-blur-sm"
            >
                {/* Dismiss button */}
                <button
                    onClick={() => setDismissed(true)}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors z-10"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4 text-white/40" />
                </button>

                <div className="p-4 sm:p-5">
                    {/* Header with icon */}
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-white mb-0.5">
                                Complete Your Profile
                            </h3>
                            <p className="text-sm text-white/50">
                                {completedCount}/{totalSteps} steps done • Unlock higher trust tiers & withdrawal limits
                            </p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                            />
                        </div>
                    </div>

                    {/* Steps checklist */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                        {steps.map((step) => (
                            <Link href={step.href} key={step.key}>
                                <div
                                    className={`
                                        flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer
                                        ${step.completed
                                            ? "bg-green-500/10 border border-green-500/20"
                                            : "bg-white/5 border border-white/10 hover:border-orange-500/30 hover:bg-orange-500/5"
                                        }
                                    `}
                                >
                                    <div
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            step.completed
                                                ? "bg-green-500/20"
                                                : "bg-white/10"
                                        }`}
                                    >
                                        {step.completed ? (
                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <step.icon className="w-4 h-4 text-white/40" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p
                                            className={`text-sm font-medium truncate ${
                                                step.completed
                                                    ? "text-green-400 line-through"
                                                    : "text-white"
                                            }`}
                                        >
                                            {step.label}
                                        </p>
                                        {!step.completed && (
                                            <p className="text-xs text-white/30">
                                                +{step.points} trust points
                                            </p>
                                        )}
                                    </div>
                                    {!step.completed && (
                                        <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* KYC status alerts */}
                    {isKycPending && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <p className="text-sm text-blue-300">
                                Your KYC verification is being reviewed. We&apos;ll notify you once it&apos;s approved.
                            </p>
                        </div>
                    )}

                    {isKycRejected && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-300">
                                Your KYC was rejected. Please re-submit with clearer documents.
                            </p>
                        </div>
                    )}

                    {/* CTA */}
                    {nextStep && (
                        <Link href={nextStep.href}>
                            <Button className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-lg shadow-orange-500/20">
                                <nextStep.icon className="w-4 h-4 mr-2" />
                                {nextStep.label}
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
