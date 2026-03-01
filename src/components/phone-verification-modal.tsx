"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { X, Phone, ShieldCheck, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPhone?: string;
}

export function PhoneVerificationModal({ isOpen, onClose, onSuccess, currentPhone }: PhoneVerificationModalProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState(currentPhone || "+234");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  
  const supabase = createClient();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setOtpCode("");
      setError(null);
      if (currentPhone && currentPhone.length > 4) {
        setPhoneNumber(currentPhone);
      } else {
        setPhoneNumber("+234");
      }
    }
  }, [isOpen, currentPhone]);

  if (!isOpen) return null;

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. Format phone number (ensure + prefix, remove spaces)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const cleanPhone = formattedPhone.replace(/\s+/g, '');

      // 2. Call Supabase auth to update user phone and trigger OTP
      const { error: otpError } = await supabase.auth.updateUser({
        phone: cleanPhone,
      });

      if (otpError) {
        throw otpError;
      }

      // Success
      setStep("otp");
      setCountdown(60);
    } catch (err: any) {
      console.error("OTP Send Error:", err);
      // Catch common Twilio unconfigured error
      if (err.message?.includes("Twilio") || err.message?.includes("provider")) {
        setError("SMS provider is not configured in Supabase. Please check your Dashboard settings.");
      } else {
        setError(err.message || "Failed to send verification code. Check number format.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otpCode.length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const cleanPhone = phoneNumber.replace(/\s+/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;

      // 1. Verify the OTP against the phone number change request
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otpCode,
        type: 'phone_change'
      });

      if (verifyError) throw verifyError;

      // 2. IMPORTANT: Supabase handles auth.users, but we must manually sync public.profiles!
      // In a real production app, this is often better handled by an auth.users UPDATE database trigger,
      // but doing it client-side explicitly ensures our UI updates instantly contextually.
      
      const sessionData = await supabase.auth.getSession();
      const userId = sessionData.data.session?.user.id;

      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ 
            phone_verified: true,
            phone: formattedPhone,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
          
        if (profileError) {
           console.error("Profile sync error, but auth succeeded:", profileError);
           // We don't throw here because technically the verification succeeded
        }
      }

      // 3. Success callback to refresh parent banner
      onSuccess();
    } catch (err: any) {
      console.error("OTP Verify Error:", err);
      setError(err.message || "Invalid verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Security Verification</h2>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === "phone" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="text-center mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
                  <Phone className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Verify your Phone</h3>
                <p className="text-sm text-slate-400">
                  Protect your account and unlock higher trust tiers by verifying your mobile number.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">Phone Number (with country code)</label>
                <Input
                  type="tel"
                  placeholder="+2348012345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-lg py-6"
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full py-6 text-base font-semibold mt-4 bg-indigo-600 hover:bg-indigo-700" 
                disabled={isLoading || phoneNumber.length < 10}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  <>
                    Send SMS Code
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-6">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Enter Verification Code</h3>
                <p className="text-sm text-slate-400">
                  We sent a 6-digit code to <span className="font-semibold text-white">{phoneNumber}</span>.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <Input
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="bg-slate-800 border-slate-700 text-center text-3xl tracking-[0.5em] h-16 font-mono font-bold"
                  required
                />
              </div>

              <Button 
                type="submit" 
                className="w-full py-6 text-base font-semibold mt-4 bg-emerald-600 hover:bg-emerald-700" 
                disabled={isLoading || otpCode.length < 6}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Continue"
                )}
              </Button>

              <div className="text-center mt-6">
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  disabled={countdown > 0 || isLoading}
                  className="text-sm text-indigo-400 hover:text-indigo-300 disabled:text-slate-500 disabled:hover:text-slate-500 font-medium transition-colors"
                >
                  {countdown > 0 
                    ? `Resend code in ${countdown}s` 
                    : "Didn't receive a code? Send again"}
                </button>
              </div>
              
              <div className="text-center mt-2">
                 <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Change phone number
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
