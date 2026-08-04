import { fpsService, FPSEvent } from "@/lib/fps-service";
import { FPSLiveFeed } from "@/components/admin/fps-live-feed";
import {
    Shield, Activity, TrendingUp, AlertTriangle,
    Target, Zap, Users, BarChart3
} from "lucide-react";

export default async function FPSDashboard() {
    const [stats, funnel, securityEvents, recentEvents, breakdown, gameIntegrity] = await Promise.all([
        fpsService.getStats(24),
        fpsService.getFunnel(24 * 7),
        fpsService.getSecurityEvents(20),
        fpsService.getRecentEvents(40),
        fpsService.getCategoryBreakdown(24),
        fpsService.getGameIntegrityEvents(20),
    ]);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-white">FairPlay System</h1>
                    </div>
                    <p className="text-sm text-slate-500 ml-11">
                        Security · Analytics · Game Integrity · Monitoring — all in one place
                    </p>
                </div>
                <span className="text-xs text-slate-500 mt-2">Last 24h shown in stats</span>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <StatCard
                    label="Events (24h)"
                    value={stats.totalEvents.toLocaleString()}
                    icon={<Activity />}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                    accent="border-l-blue-500"
                />
                <StatCard
                    label="Security Alerts"
                    value={stats.securityAlerts.toLocaleString()}
                    icon={<AlertTriangle />}
                    color={stats.securityAlerts > 0 ? "text-red-400" : "text-slate-400"}
                    bg={stats.securityAlerts > 0 ? "bg-red-500/10" : "bg-slate-800/40"}
                    accent={stats.securityAlerts > 0 ? "border-l-red-500" : "border-l-slate-700"}
                />
                <StatCard
                    label="View→Join Rate"
                    value={`${stats.conversionRate}%`}
                    icon={<TrendingUp />}
                    color="text-green-400"
                    bg="bg-green-500/10"
                    accent="border-l-green-500"
                />
                <StatCard
                    label="Cheats Detected"
                    value={stats.cheatsDetected.toLocaleString()}
                    icon={<Target />}
                    color={stats.cheatsDetected > 0 ? "text-yellow-400" : "text-slate-400"}
                    bg={stats.cheatsDetected > 0 ? "bg-yellow-500/10" : "bg-slate-800/40"}
                    accent={stats.cheatsDetected > 0 ? "border-l-yellow-500" : "border-l-slate-700"}
                />
            </div>

            {/* Funnel */}
            <FunnelSection funnel={funnel} />

            {/* Main 3-col grid */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Security Center */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="font-bold flex items-center gap-2">
                            <Shield className="w-4 h-4 text-red-400" />
                            Security Center
                        </h2>
                        <span className="text-xs text-slate-500">{securityEvents.length} alerts</span>
                    </div>
                    {securityEvents.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">
                            <Shield className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            No security alerts. Platform is clean.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800/60 max-h-[400px] overflow-y-auto">
                            {securityEvents.map(e => (
                                <SecurityRow key={e.id} event={e} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Category Breakdown */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h2 className="font-bold flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                        Category Breakdown (24h)
                    </h2>
                    <div className="space-y-3">
                        {breakdown.map(({ category, count }) => {
                            const total = breakdown.reduce((s, b) => s + b.count, 0);
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                                <div key={category}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="capitalize font-medium text-white">{category}</span>
                                        <span className="text-slate-400">{count} ({pct}%)</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${CATEGORY_BAR[category] || 'bg-slate-600'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Bottom 2-col: Live Feed + Game Integrity */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Live Feed */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-[420px]">
                    <FPSLiveFeed initialEvents={recentEvents} />
                </div>

                {/* Game Integrity */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="font-bold flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            Game Integrity
                        </h2>
                        <span className="text-xs text-slate-500">{gameIntegrity.length} flagged sessions</span>
                    </div>
                    {gameIntegrity.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-sm">
                            <Zap className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            No flagged game sessions.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800/60 max-h-[360px] overflow-y-auto">
                            {gameIntegrity.map(e => (
                                <GameIntegrityRow key={e.id} event={e} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const CATEGORY_BAR: Record<string, string> = {
    analytics: "bg-blue-500",
    security:  "bg-red-500",
    game:      "bg-purple-500",
    financial: "bg-green-500",
    auth:      "bg-cyan-500",
};

function StatCard({ label, value, icon, color, bg, accent }: {
    label: string; value: string; icon: React.ReactElement;
    color: string; bg: string; accent: string;
}) {
    return (
        <div className={`p-4 md:p-5 rounded-xl bg-slate-900/80 border border-slate-800/60 border-l-2 ${accent}`}>
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <span className={`${color} [&>svg]:w-4 [&>svg]:h-4`}>{icon}</span>
            </div>
            <p className="text-xl md:text-2xl font-black text-white">{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
        </div>
    );
}

function FunnelSection({ funnel }: { funnel: { event: string; label: string; count: number; rate: number }[] }) {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-5">
                <Users className="w-4 h-4 text-purple-400" />
                <h2 className="font-bold">Conversion Funnel (7 days)</h2>
            </div>
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
                {funnel.map((step, i) => (
                    <div key={step.event} className="flex-1 min-w-[80px]">
                        <div className="flex items-center gap-1.5 mb-2">
                            <div
                                className="w-full bg-gradient-to-t from-purple-600/60 to-purple-400/40 rounded-t-lg transition-all"
                                style={{ height: `${Math.max(8, step.rate * 1.6)}px` }}
                            />
                        </div>
                        <div className="text-center">
                            <p className="text-base font-black text-white">{step.count.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{step.label}</p>
                            {i > 0 && (
                                <p className={`text-[10px] font-bold mt-0.5 ${step.rate >= 50 ? 'text-green-400' : step.rate >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {step.rate}%
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SecurityRow({ event }: { event: FPSEvent }) {
    const profile = event.profiles as any;
    const flags = (event.properties?.flags as string[]) || [];
    const confidence = event.properties?.confidence as number;

    return (
        <div className={`px-5 py-3 ${event.severity === 'critical' ? 'bg-red-500/5' : ''}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${event.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                        <span className="font-mono text-sm font-semibold text-white">{event.event_name}</span>
                        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-bold ${event.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {event.severity}
                        </span>
                    </div>
                    {flags.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1 ml-3.5">{flags.join(' · ')}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 ml-3.5 text-[10px] text-slate-500">
                        {profile?.email && <span>{profile.email}</span>}
                        {event.fingerprint_id && <span className="font-mono">fp:{event.fingerprint_id.slice(0, 12)}</span>}
                        {confidence !== undefined && <span>confidence: {confidence}%</span>}
                        <span>{new Date(event.created_at).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GameIntegrityRow({ event }: { event: FPSEvent }) {
    const profile = event.profiles as any;
    const giveaway = event.giveaways as any;
    const flags = (event.properties?.flags as string[]) || [];
    const confidence = event.properties?.confidence as number;

    return (
        <div className="px-5 py-3">
            <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                        {profile?.display_name || profile?.username || 'Guest'}
                    </p>
                    {giveaway?.title && (
                        <p className="text-xs text-slate-400 truncate">{giveaway.title}</p>
                    )}
                    {flags.length > 0 && (
                        <p className="text-xs text-yellow-400/70 mt-1">{flags.join(' · ')}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                        {confidence !== undefined && <span>confidence: {confidence}%</span>}
                        <span>{new Date(event.created_at).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
