import { adminService } from '@/lib/admin-service';
import { Search } from 'lucide-react';

export default async function AdminUsersPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string }>
}) {
    const params = await searchParams;
    const q = params.q || '';
    const page = Number(params.page) || 1;

    const { data: users, count } = await adminService.getUsers(page, 50, q);

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2">User Management</h1>
                    <p className="text-slate-400">View and manage registered users</p>
                </div>

                {/* Search - simplified for now */}
                <form className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        name="q"
                        defaultValue={q}
                        placeholder="Search users..."
                        className="pl-10 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:outline-none w-64 text-white"
                    />
                </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-slate-950 text-slate-400 text-sm font-medium">
                        <tr>
                            <th className="p-4 pl-6">User</th>
                            <th className="p-4">Wallet Balance</th>
                            <th className="p-4">Earned</th>
                            <th className="p-4">Deposited</th>
                            <th className="p-4">Joined</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {users?.map((user: any) => (
                            <tr key={user.id} className="hover:bg-slate-800/50 transition-colors">
                                <td className="p-4 pl-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-xs">
                                            {user.username?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{user.username || 'No Username'}</p>
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 font-mono font-medium text-white">
                                    ₦{(user.wallets?.balance || 0).toLocaleString()}
                                </td>
                                <td className="p-4 text-green-400 font-mono text-sm">
                                    +₦{(user.wallets?.total_earned || 0).toLocaleString()}
                                </td>
                                <td className="p-4 text-slate-400 font-mono text-sm">
                                    ₦{(user.wallets?.total_deposited || 0).toLocaleString()}
                                </td>
                                <td className="p-4 text-slate-500 text-sm">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {users?.length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                        No users found.
                    </div>
                )}
            </div>
        </div>
    );
}
