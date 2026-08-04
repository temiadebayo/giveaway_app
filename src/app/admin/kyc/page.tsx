"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { BadgeCheck, Loader2, CheckCircle, XCircle, Search, ExternalLink, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface KycRequest {
    id: string;
    user_id: string;
    id_card_url: string;
    selfie_url: string;
    status: string;
    created_at: string;
    profiles?: {
        username: string;
        display_name: string;
        email: string;
        trust_tier: string;
        trust_score: number;
    } | null;
}

export default function AdminKycPage() {
    const supabase = createClient();
    const [requests, setRequests] = useState<KycRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Secure Signed URLs mapping for the current session
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    const generateSignedUrls = async (reqs: KycRequest[]) => {
        const newUrls: Record<string, string> = {};

        for (const req of reqs) {
            // Generate a 1-hour signed URL for the ID
            const { data: idData } = await supabase.storage
                .from('kyc_documents')
                .createSignedUrl(req.id_card_url, 3600);

            // Generate a 1-hour signed URL for the Selfie
            const { data: selfieData } = await supabase.storage
                .from('kyc_documents')
                .createSignedUrl(req.selfie_url, 3600);

            if (idData) newUrls[req.id_card_url] = idData.signedUrl;
            if (selfieData) newUrls[req.selfie_url] = selfieData.signedUrl;
        }

        setSignedUrls(newUrls);
    };

    const fetchPendingRequests = async () => {
        setLoading(true);

        try {
            // Use server-side API route to fetch pending requests (bypasses RLS)
            const res = await fetch('/api/admin/kyc');
            const json = await res.json();

            if (!res.ok) {
                console.error("Error fetching KYC requests:", json.error);
                setLoading(false);
                return;
            }

            const data = json.data || [];
            setRequests(data as KycRequest[]);
            generateSignedUrls(data as KycRequest[]);
        } catch (err) {
            console.error("Error fetching KYC requests:", err);
        }

        setLoading(false);
    };

    useEffect(() => {
        fetchPendingRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleApprove = async (requestId: string) => {
        if (!confirm("Are you sure you want to approve this identity and upgrade this user?")) return;

        setProcessingId(requestId);

        try {
            const res = await fetch('/api/admin/kyc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve', requestId }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                alert(`Approval Failed: ${json.error || 'Unknown error'}`);
            } else {
                // Remove from local state on success
                setRequests(prev => prev.filter(r => r.id !== requestId));
            }
        } catch (err: any) {
            alert(`Network Error: ${err.message}`);
        }

        setProcessingId(null);
    };

    const handleReject = async (requestId: string) => {
        const reason = prompt("Enter a reason for rejection (e.g. 'ID is blurry'):", "Documents are unclear or invalid.");
        if (reason === null) return; // User cancelled

        setProcessingId(requestId);

        try {
            const res = await fetch('/api/admin/kyc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject', requestId, reason }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                alert(`Rejection Failed: ${json.error || 'Unknown error'}`);
            } else {
                setRequests(prev => prev.filter(r => r.id !== requestId));
            }
        } catch (err: any) {
            alert(`Network Error: ${err.message}`);
        }

        setProcessingId(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <BadgeCheck className="w-8 h-8 text-primary" />
                        KYC Verification queue
                    </h1>
                    <p className="text-slate-400 mt-1">Review user IDs and selfies to grant Gold/Diamond trust tiers.</p>
                </div>

                <Button
                    variant="outline"
                    onClick={fetchPendingRequests}
                    disabled={loading}
                    className="border-slate-800 hover:bg-slate-800"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Queue
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64 border border-slate-800 border-dashed rounded-2xl">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-slate-800 border-dashed rounded-2xl bg-slate-900/50">
                    <Search className="w-12 h-12 text-slate-600 mb-4" />
                    <h3 className="text-xl font-medium text-slate-300">All caught up!</h3>
                    <p className="text-slate-500 mt-2">There are no pending KYC requests waiting for approval.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {requests.map((request) => (
                        <div key={request.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                            {/* Header Info */}
                            <div className="p-5 border-b border-slate-800 bg-slate-800/20 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg text-white">
                                            {request.profiles?.display_name || request.profiles?.username || 'Unknown User'}
                                        </h3>
                                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs font-medium text-slate-300">
                                            @{request.profiles?.username}
                                        </span>
                                    </div>
                                    <div className="text-sm text-slate-400 mt-1 flex items-center gap-4">
                                        <span>{request.profiles?.email}</span>
                                        <span>•</span>
                                        <span>Current Tier: <strong className="text-slate-300 capitalize">{request.profiles?.trust_tier}</strong></span>
                                        <span>•</span>
                                        <span>Submitted {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}</span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                                        disabled={processingId === request.id}
                                        onClick={() => handleReject(request.id)}
                                    >
                                        {processingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                                        Reject
                                    </Button>
                                    <Button
                                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                        disabled={processingId === request.id}
                                        onClick={() => handleApprove(request.id)}
                                    >
                                        {processingId === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                        Approve & Upgrade
                                    </Button>
                                </div>
                            </div>

                            {/* Document Viewer */}
                            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                                {/* Gov ID */}
                                <div className="p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-medium text-slate-300">Government ID</h4>
                                        <a
                                            href={signedUrls[request.id_card_url]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                                        >
                                            <ExternalLink className="w-3 h-3" /> View Full
                                        </a>
                                    </div>
                                    <div className="aspect-[4/3] bg-black rounded-lg border border-slate-800 overflow-hidden relative flex items-center justify-center">
                                        {signedUrls[request.id_card_url] ? (
                                            <img
                                                src={signedUrls[request.id_card_url]}
                                                alt="Government ID"
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                                        )}
                                    </div>
                                </div>

                                {/* Selfie */}
                                <div className="p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-medium text-slate-300">Selfie Verification</h4>
                                        <a
                                            href={signedUrls[request.selfie_url]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                                        >
                                            <ExternalLink className="w-3 h-3" /> View Full
                                        </a>
                                    </div>
                                    <div className="aspect-[4/3] bg-black rounded-lg border border-slate-800 overflow-hidden relative flex items-center justify-center">
                                        {signedUrls[request.selfie_url] ? (
                                            <img
                                                src={signedUrls[request.selfie_url]}
                                                alt="User Selfie"
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
