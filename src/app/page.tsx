"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Shield, Gamepad2, Trophy, Users, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import FredMascot from "@/assets/Fred_GA_Mascot.svg";
import ZackMascot from "@/assets/Zack_GA_Mascot_1.svg";
import logoWhite from "@/assets/logo_white.png";

export default function Home() {
  return (
    <main className="min-h-screen bg-aurora relative overflow-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src={logoWhite} alt="Giveaway" width={40} height={40} />
            <span className="font-bold text-xl hidden sm:inline">GIVEAWAY</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-white/80 hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-brand-gradient hover:opacity-90 text-white font-bold">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center min-h-screen px-4 text-center relative pt-20">
        {/* Floating Mascots */}
        <motion.div
          initial={{ opacity: 0, x: -100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute left-0 bottom-0 w-[300px] h-[400px] pointer-events-none hidden lg:block animate-float"
        >
          <Image src={FredMascot} alt="Fred" fill className="object-contain" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="absolute right-0 bottom-0 w-[300px] h-[400px] pointer-events-none hidden lg:block animate-float"
          style={{ animationDelay: "1s" }}
        >
          <Image src={ZackMascot} alt="Zack" fill className="object-contain" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl relative z-10"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30 mb-8"
          >
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Fair Play System™ Enabled</span>
          </motion.div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            Skill-Based{" "}
            <span className="text-gradient-primary">Giveaways</span>
            <br />
            For The Real Ones
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-white/60 mb-10 max-w-2xl mx-auto">
            No more random draws. No more bots winning. Just you, your skills, and your W&apos;s. 🏆
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/signup">
              <Button className="bg-brand-gradient hover:opacity-90 text-white font-bold h-14 px-8 text-lg rounded-xl glow-primary">
                <Gamepad2 className="w-5 h-5 mr-2" />
                Start Playing
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" className="h-14 px-8 text-lg rounded-xl border-white/20 hover:bg-white/5">
                <Sparkles className="w-5 h-5 mr-2" />
                Host a Giveaway
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-3 gap-8 max-w-md mx-auto"
          >
            {[
              { icon: Trophy, label: "Prizes Won", value: "$50K+" },
              { icon: Users, label: "Active Players", value: "10K+" },
              { icon: Shield, label: "Fair Games", value: "100%" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-primary/20 flex items-center justify-center">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-white/40">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}
