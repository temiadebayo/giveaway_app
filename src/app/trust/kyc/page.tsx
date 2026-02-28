"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { trustService, KycRequest } from '@/lib/trust-service';
import { Button } from '@/components/ui/button';
import { Shield, Upload, FileImage, CheckCircle, Clock, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function KycPage() {
    const router = useRouter();
    const [status, setStatus] = useState<KycRequest | null>(null);
    const [loading, setLoading] = useState(true);

    // File states
    const [idFile, setIdFile] = useState<File | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [bankName, setBankName] = useState("");
    const [accountName, setAccountName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        const kycStatus = await trustService.getKycStatus();
        setStatus(kycStatus);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            // Check file size (5MB max)
            if (e.target.files[0].size > 5 * 1024 * 1024) {
                setError("ID file size must be less than 5MB");
                return;
            }
            setIdFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            if (e.target.files[0].size > 5 * 1024 * 1024) {
                setError("Selfie file size must be less than 5MB");
                return;
            }
            setSelfieFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleSubmit = async () => {
        if (!idFile || !selfieFile) {
            setError("Please upload both your ID and a selfie.");
            return;
        }

        if (!bankName || !accountName || !accountNumber) {
            setError("Please provide your bank details for future withdrawals.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const result = await trustService.submitKycRequest(idFile, selfieFile, {
            bank_name: bankName,
            account_name: accountName,
            account_number: accountNumber
        });

        if (result.success) {
            // Reload status to show Pending state
            await loadData();
        } else {
            setError(result.error || "Failed to submit KYC request.");
        }
        setIsSubmitting(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#06060c] flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#06060c] text-white font-sans selection:bg-primary/30 pb-20">
            <AppHeader showBack backHref="/trust" backLabel="Back to Trust Score" />

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                <div className="mb-8">
                    <h1 className="text-2xl sm:text-3xl font-black mb-2 flex items-center gap-3">
                        <Shield className="w-8 h-8 text-primary" />
                        Identity Verification (KYC)
                    </h1>
                    <p className="text-slate-400">
                        Verify your identity to reach Gold and Diamond tiers, unlock faster withdrawals, and increase your trust score.
                    </p>
                </div>

                {error && (
                    <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {/* status rendering */}
                {status && status.status === 'pending' && (
                    <div className="p-8 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                        <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-amber-400 mb-2">Verification Pending</h2>
                        <p className="text-slate-300">
                            Your documents have been submitted and are currently under review by our team. This usually takes 24-48 hours.
                        </p>
                    </div>
                )}

                {status && status.status === 'approved' && (
                    <div className="p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-emerald-400 mb-2">Identity Verified</h2>
                        <p className="text-slate-300">
                            Congratulations! Your identity has been successfully verified. You now have access to premium trust tiers and faster withdrawals.
                        </p>
                        <Button className="mt-6" onClick={() => router.push('/trust')}>
                            Return to Trust Center
                        </Button>
                    </div>
                )}

                {(!status || status.status === 'rejected') && (
                    <div className="space-y-6">
                        {status?.status === 'rejected' && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                                <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-bold text-red-400">Previous Submission Rejected</h3>
                                    <p className="text-sm text-red-300 mt-1">
                                        Reason: {status.rejection_reason || "Documents unclear or could not be verified."}
                                    </p>
                                    <p className="text-sm text-slate-300 mt-2">
                                        Please submit new, clear photos below.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 sm:p-8">
                            <h3 className="text-xl font-bold mb-6">Upload Documents</h3>

                            <div className="space-y-8">
                                {/* Gov ID Upload */}
                                <div>
                                    <h4 className="font-semibold mb-2">1. Government Issued ID</h4>
                                    <p className="text-sm text-slate-400 mb-4">Upload a clear photo of your passport, driver&apos;s license, or national ID.</p>

                                    <label className="block w-full cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept="image/jpeg, image/png, image/webp"
                                            className="hidden"
                                            onChange={handleIdChange}
                                        />
                                        <div className={`p-8 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3
                                            ${idFile ? 'border-primary bg-primary/5' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}
                                        `}>
                                            {idFile ? (
                                                <>
                                                    <FileImage className="w-10 h-10 text-primary" />
                                                    <span className="text-sm font-medium text-primary">{idFile.name}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-10 h-10 text-slate-500" />
                                                    <span className="text-sm text-slate-400">Click to upload or drag and drop</span>
                                                    <span className="text-xs text-slate-500">PNG, JPG up to 5MB</span>
                                                </>
                                            )}
                                        </div>
                                    </label>
                                </div>

                                {/* Selfie Upload */}
                                <div>
                                    <h4 className="font-semibold mb-2">2. Selfie Photo</h4>
                                    <p className="text-sm text-slate-400 mb-4">Upload a clear, well-lit photo of your face directly looking at the camera.</p>

                                    <label className="block w-full cursor-pointer relative">
                                        <input
                                            type="file"
                                            accept="image/jpeg, image/png, image/webp"
                                            className="hidden"
                                            onChange={handleSelfieChange}
                                        />
                                        <div className={`p-8 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3
                                            ${selfieFile ? 'border-primary bg-primary/5' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}
                                        `}>
                                            {selfieFile ? (
                                                <>
                                                    <FileImage className="w-10 h-10 text-primary" />
                                                    <span className="text-sm font-medium text-primary">{selfieFile.name}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-10 h-10 text-slate-500" />
                                                    <span className="text-sm text-slate-400">Click to upload or drag and drop</span>
                                                    <span className="text-xs text-slate-500">PNG, JPG up to 5MB</span>
                                                </>
                                            )}
                                        </div>
                                    </label>
                                </div>

                                {/* Bank Details Upload */}
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold mb-2">3. Bank Account Details</h4>
                                        <p className="text-sm text-slate-400 mb-4">Provide the primary bank account where your future withdrawals should be sent to. The name must match your ID.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1.5 pl-1">Bank Name</label>
                                        <input
                                            type="text"
                                            value={bankName}
                                            onChange={(e) => setBankName(e.target.value)}
                                            placeholder="e.g. Access Bank"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1.5 pl-1">Account Number</label>
                                        <input
                                            type="text"
                                            value={accountNumber}
                                            onChange={(e) => setAccountNumber(e.target.value)}
                                            placeholder="e.g. 0123456789"
                                            maxLength={15}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1.5 pl-1">Account Name</label>
                                        <input
                                            type="text"
                                            value={accountName}
                                            onChange={(e) => setAccountName(e.target.value)}
                                            placeholder="As it appears on your ID"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <div className="pt-4 border-t border-slate-800">
                                    <Button
                                        className="w-full bg-brand-gradient py-6 text-lg font-bold"
                                        disabled={!idFile || !selfieFile || !bankName || !accountNumber || !accountName || isSubmitting}
                                        onClick={handleSubmit}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Encrypting & Uploading...
                                            </>
                                        ) : (
                                            "Submit for Verification"
                                        )}
                                    </Button>
                                    <p className="text-center text-xs text-slate-500 mt-4 flex items-center justify-center gap-1.5">
                                        <Shield className="w-3 h-3" />
                                        Your data is encrypted and securely stored.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
