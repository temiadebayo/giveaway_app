import { adminService } from '@/lib/admin-service';
import { Search } from 'lucide-react';
import { PaginationControls } from '@/components/admin/pagination-controls';
import { UserTable } from '@/components/admin/user-table';

export default async function AdminUsersPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string }>
}) {
    const params = await searchParams;
    const q = params.q || '';
    const page = Number(params.page) || 1;

    const limit = 50;
    const { data: users, count } = await adminService.getUsers(page, limit, q);
    const totalPages = Math.ceil((count || 0) / limit);

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
                <UserTable users={users || []} />
                {users?.length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                        No users found.
                    </div>
                )}
                {users && users.length > 0 && (
                    <PaginationControls
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={count || 0}
                    />
                )}
            </div>
        </div>
    );
}
