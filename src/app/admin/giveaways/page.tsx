import { adminService } from '@/lib/admin-service';
import { Gift, Calendar, DollarSign, Users, StopCircle, RefreshCw, Clock } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export default async function AdminGiveawaysPage() {
    const giveaways = await adminService.getGiveaways();

    async function forceEndGiveaway(formData: FormData) {
        "use server";
        const id = formData.get('id') as string;
        await adminService.endGiveaway(id);
        revalidatePath('/admin/giveaways');
    }

    const formatNGN = (amount: number) =>
        new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount);

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Group giveaways by status
    const liveGiveaways = giveaways.filter(g => g.status === 'live');
    const scheduledGiveaways = giveaways.filter(g => g.status === 'scheduled');
    const endedGiveaways = giveaways.filter(g => g.status === 'ended' || g.status === 'cancelled');

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Gift className="w-8 h-8 text-primary" />
                        Giveaways
                    </h1>
                    <p className="text-slate-400 mt-1">Manage and monitor platform giveaways</p>
                </div>
            </div>

            {/* Live Giveaways */}
            <div>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Now ({liveGiveaways.length})
                </h2>

                <div className="grid gap-4 lg:grid-cols-2">
                    {liveGiveaways.length === 0 ? (
                        <div className="lg:col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500">
                            No live giveaways at the moment.
                        </div>
                    ) : (
                        liveGiveaways.map((giveaway: any) => (
                            <div key={giveaway.id} className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4">
                                    <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/20">
                                        LIVE
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2 pr-16">{giveaway.title}</h3>
                                <p className="text-slate-400 text-sm mb-4 line-clamp-2">{giveaway.description}</p>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Prize Pool</p>
                                        <p className="text-lg font-bold text-primary flex items-center gap-1">
                                            <DollarSign className="w-4 h-4" />
                                            {formatNGN(giveaway.prize_amount)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Host</p>
                                        <p className="text-sm font-medium text-white truncate w-full block">
                                            @{giveaway.profiles?.username || 'Unknown'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <Clock className="w-4 h-4" />
                                        Ends: {formatDate(giveaway.ends_at)}
                                    </div>

                                    <form action={forceEndGiveaway}>
                                        <input type="hidden" name="id" value={giveaway.id} />
                                        <button
                                            type="submit"
                                            onClick={(e) => {
                                                if (!confirm("Are you sure you want to forcefully end this giveaway?")) e.preventDefault();
                                            }}
                                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <StopCircle className="w-4 h-4" />
                                            Force End
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Scheduled Giveaways */}
            <div>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    Scheduled ({scheduledGiveaways.length})
                </h2>

                <div className="grid gap-4 lg:grid-cols-2">
                    {scheduledGiveaways.length === 0 ? (
                        <div className="lg:col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500">
                            No scheduled giveaways.
                        </div>
                    ) : (
                        scheduledGiveaways.map((giveaway: any) => (
                            <div key={giveaway.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative">
                                <h3 className="text-lg font-bold text-white mb-2">{giveaway.title}</h3>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Prize Pool</p>
                                        <p className="font-bold text-white">
                                            {formatNGN(giveaway.prize_amount)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Starts At</p>
                                        <p className="text-sm text-blue-400 font-medium">
                                            {formatDate(giveaway.starts_at)}
                                        </p>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-slate-800 flex justify-end">
                                    <form action={forceEndGiveaway}>
                                        <input type="hidden" name="id" value={giveaway.id} />
                                        <button
                                            type="submit"
                                            className="text-xs text-red-500 hover:text-red-400 font-medium"
                                        >
                                            Cancel Giveaway
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Past Giveaways */}
            <div>
                <h2 className="text-xl font-bold mb-4 text-slate-400">Past Giveaways</h2>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                                <tr className="whitespace-nowrap">
                                    <th className="p-4 font-medium">Title</th>
                                    <th className="p-4 font-medium">Host</th>
                                    <th className="p-4 font-medium">Prize</th>
                                    <th className="p-4 font-medium">Status</th>
                                    <th className="p-4 font-medium min-w-[150px]">Ended At</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {endedGiveaways.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500">
                                            No past giveaways found.
                                        </td>
                                    </tr>
                                ) : (
                                    endedGiveaways.map((giveaway: any) => (
                                        <tr key={giveaway.id} className="hover:bg-slate-800/30 transition-colors whitespace-nowrap">
                                            <td className="p-4 font-medium text-white truncate max-w-[200px]">{giveaway.title}</td>
                                            <td className="p-4 text-slate-300">@{giveaway.profiles?.username || 'Unknown'}</td>
                                            <td className="p-4 text-white">{formatNGN(giveaway.prize_amount)}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${giveaway.status === 'ended'
                                                    ? 'bg-slate-800 text-slate-300'
                                                    : 'bg-red-500/10 text-red-500'
                                                    }`}>
                                                    {giveaway.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-400">{formatDate(giveaway.ends_at)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
