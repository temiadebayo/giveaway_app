import { adminService } from '@/lib/admin-service';
import { Users, Gift, TrendingUp, DollarSign } from 'lucide-react';

export default async function AdminDashboard() {
    const stats = await adminService.getStats();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-2">Dashboard Overview</h1>
                <p className="text-slate-400">Welcome back, Admin. Here's what's happening.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Total Users"
                    value={stats.userCount}
                    icon={<Users className="w-6 h-6 text-blue-400" />}
                    trend="+12% this week"
                />
                <StatCard
                    label="Active Giveaways"
                    value={stats.activeGiveawayCount}
                    subValue={`of ${stats.giveawayCount} total`}
                    icon={<Gift className="w-6 h-6 text-purple-400" />}
                />
                <StatCard
                    label="Total Deposited"
                    value={`$${stats.totalDeposited.toLocaleString()}`}
                    icon={<TrendingUp className="w-6 h-6 text-green-400" />}
                />
                <StatCard
                    label="Total Withdrawn"
                    value={`$${stats.totalWithdrawn.toLocaleString()}`}
                    icon={<DollarSign className="w-6 h-6 text-orange-400" />}
                />
            </div>

            {/* Recent Activity Section could go here */}
            <div className="grid lg:grid-cols-2 gap-8">
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                    <h2 className="text-xl font-bold mb-4">System Health</h2>
                    <div className="space-y-4">
                        <HealthItem label="Database" status="Healthy" color="bg-green-500" />
                        <HealthItem label="Realtime Connections" status="Active" color="bg-green-500" />
                        <HealthItem label="Payments" status="Manual Mode" color="bg-yellow-500" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, subValue, icon, trend }: any) {
    return (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-lg bg-slate-800">
                    {icon}
                </div>
                {trend && <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-1 rounded-full">{trend}</span>}
            </div>
            <h3 className="text-3xl font-black text-white mb-1">{value}</h3>
            <p className="text-sm text-slate-400 font-medium">{label}</p>
            {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        </div>
    );
}

function HealthItem({ label, status, color }: any) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
            <span className="font-medium text-slate-300">{label}</span>
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-sm font-medium text-white">{status}</span>
            </div>
        </div>
    );
}
