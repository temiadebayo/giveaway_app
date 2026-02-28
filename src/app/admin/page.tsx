import { adminService } from '@/lib/admin-service';
import { Users, Gift, TrendingUp, Banknote, Activity, Database, Radio, CreditCard } from 'lucide-react';
import { AdminQuickStats } from './components/AdminQuickStats';
import { AdminLiveFeed } from '@/components/admin/admin-live-feed';
export default async function AdminDashboard() {
    const stats = await adminService.getStats();

    // Fetch initial data for the realtime widgets
    const [pendingDeposits, pendingWithdrawals] = await Promise.all([
        adminService.getPendingDeposits(),
        adminService.getPendingWithdrawals()
    ]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-black text-white mb-1">Dashboard</h1>
                <p className="text-sm text-slate-500">Overview of your platform&apos;s key metrics</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <StatCard
                    label="Total Users"
                    value={stats.userCount.toLocaleString()}
                    icon={<Users className="w-5 h-5" />}
                    iconColor="text-blue-400"
                    iconBg="bg-blue-500/10"
                    borderAccent="border-l-blue-500"
                />
                <StatCard
                    label="Active Giveaways"
                    value={stats.activeGiveawayCount.toLocaleString()}
                    subValue={`of ${stats.giveawayCount} total`}
                    icon={<Gift className="w-5 h-5" />}
                    iconColor="text-purple-400"
                    iconBg="bg-purple-500/10"
                    borderAccent="border-l-purple-500"
                />
                <StatCard
                    label="Total Deposited"
                    value={`₦${stats.totalDeposited.toLocaleString()}`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    iconColor="text-green-400"
                    iconBg="bg-green-500/10"
                    borderAccent="border-l-green-500"
                />
                <StatCard
                    label="Total Withdrawn"
                    value={`₦${stats.totalWithdrawn.toLocaleString()}`}
                    icon={<Banknote className="w-5 h-5" />}
                    iconColor="text-orange-400"
                    iconBg="bg-orange-500/10"
                    borderAccent="border-l-orange-500"
                />
            </div>

            {/* Main Grid */}
            <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
                {/* Live Feed */}
                <div className="col-span-1 h-[320px]">
                    <AdminLiveFeed />
                </div>

                {/* System Health */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/60 backdrop-blur-sm h-[320px]">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity className="w-4 h-4 text-green-400" />
                        <h2 className="text-base font-bold text-white">System Health</h2>
                    </div>
                    <div className="space-y-4">
                        <HealthItem label="Database" status="Healthy" color="bg-green-500" icon={<Database className="w-4 h-4 text-slate-500" />} />
                        <HealthItem label="Realtime" status="Active" color="bg-green-500" icon={<Radio className="w-4 h-4 text-slate-500" />} />
                        <HealthItem label="Payments" status="Manual Mode" color="bg-yellow-500" icon={<CreditCard className="w-4 h-4 text-slate-500" />} />
                    </div>
                </div>

                {/* Real-time Widget */}
                <div className="col-span-1">
                    <AdminQuickStats
                        initialDeposits={pendingDeposits || []}
                        initialWithdrawals={pendingWithdrawals || []}
                    />
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, subValue, icon, iconColor, iconBg, borderAccent }: {
    label: string;
    value: string | number;
    subValue?: string;
    icon: React.ReactElement;
    iconColor: string;
    iconBg: string;
    borderAccent: string;
}) {
    return (
        <div className={`p-4 md:p-5 rounded-xl bg-slate-900/80 border border-slate-800/60 border-l-2 ${borderAccent} backdrop-blur-sm`}>
            <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${iconBg}`}>
                    <span className={iconColor}>{icon}</span>
                </div>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-white mb-0.5 truncate">{value}</h3>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            {subValue && <p className="text-[10px] text-slate-600 mt-0.5">{subValue}</p>}
        </div>
    );
}

function HealthItem({ label, status, color, icon }: { label: string; status: string; color: string; icon: React.ReactElement }) {
    return (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/30 border border-slate-800/40">
            <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-sm font-medium text-slate-300">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${color} animate-pulse`} />
                <span className="text-xs font-medium text-white">{status}</span>
            </div>
        </div>
    );
}
