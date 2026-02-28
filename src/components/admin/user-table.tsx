"use client";

import { useState } from "react";
import { UserSlideOver } from "./user-slide-over";

export function UserTable({ users }: { users: any[] }) {
    const [selectedUser, setSelectedUser] = useState<any>(null);

    return (
        <>
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
                    {users.map((user) => (
                        <tr 
                            key={user.id} 
                            onClick={() => setSelectedUser(user)}
                            className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        >
                            <td className="p-4 pl-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-xs group-hover:bg-brand-gradient group-hover:text-white transition-colors">
                                        {user.username?.substring(0, 2).toUpperCase() || 'US'}
                                    </div>
                                    <div>
                                        <p className="font-medium text-white group-hover:text-purple-400 transition-colors">{user.username || 'No Username'}</p>
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

            <UserSlideOver 
                user={selectedUser} 
                isOpen={!!selectedUser} 
                onClose={() => setSelectedUser(null)} 
            />
        </>
    );
}
