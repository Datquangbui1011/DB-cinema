import { useCallback, useEffect, useState } from 'react';
import { Clock, Mail, ShieldCheck, UserCheck, UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, Badge, EmptyState, Skeleton, ConfirmDialog, filterSelectClass } from '../../components/admin/ui';
import { formatRelative } from '../../lib/adminFormat';

const ROLE_INFO = {
    admin: { label: 'Admin', tone: 'danger', description: 'Full access: edit shows, prices, screens, content and the team' },
    staff: { label: 'Staff', tone: 'info', description: 'View operations, sales and analytics; cannot change anything' },
};

const Team = () => {
    const { axios, getToken } = useAppContext();
    const [data, setData] = useState(null);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('staff');
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [busy, setBusy] = useState(false);
    const [approveAs, setApproveAs] = useState({});      // userId -> role chosen for approval

    const auth = useCallback(async () => ({ headers: { Authorization: `Bearer ${await getToken()}` } }), [getToken]);

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/team', await auth());
            if (data.success) setData(data);
            else toast.error(data.message);
        } catch (error) {
            console.error(error);
            toast.error('Could not load the team');
        }
    }, [axios, auth]);

    useEffect(() => { load(); }, [load]);

    const add = async (e) => {
        e.preventDefault();
        setAdding(true);
        try {
            const { data } = await axios.post('/api/admin/team', { email, role }, await auth());
            if (data.success) {
                toast.success(data.message);
                setEmail('');
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Could not add the team member');
        } finally {
            setAdding(false);
        }
    };

    const revoke = async (invitation) => {
        setBusy(true);
        try {
            const { data } = await axios.delete(`/api/admin/team/invitations/${invitation.id}`, await auth());
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) load();
        } catch (error) {
            console.error(error);
            toast.error('Could not cancel the invitation');
        } finally {
            setBusy(false);
        }
    };

    const changeRole = async (member, newRole) => {
        setBusy(true);
        try {
            const { data } = await axios.patch(`/api/admin/team/${member.id}`, { role: newRole }, await auth());
            data.success ? toast.success(data.message) : toast.error(data.message);
            if (data.success) { setRemoving(null); load(); }
        } catch (error) {
            console.error(error);
            toast.error('Could not change the role');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <PageHeader title="Team" description="People who can open this admin console. Roles are stored in each person's Clerk account." />

            <div className="grid gap-4 xl:grid-cols-3">
                <Panel title="Add a team member" description="If they don't have an account yet, they'll get an email invitation. You approve them once they sign up." className="xl:order-2">
                    <form onSubmit={add} className="space-y-3">
                        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className={`${filterSelectClass} w-full py-2 text-sm`} />
                        <div className="space-y-2">
                            {Object.entries(ROLE_INFO).map(([value, info]) => (
                                <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${role === value ? 'border-primary bg-primary/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                                    <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="mt-0.5 accent-red-600" />
                                    <span>
                                        <span className="block text-sm font-medium text-zinc-100">{info.label}</span>
                                        <span className="block text-xs text-zinc-500">{info.description}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <button type="submit" disabled={adding} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dull disabled:opacity-60">
                            <UserPlus className="w-4 h-4" />{adding ? 'Sending…' : 'Add or invite'}
                        </button>
                    </form>
                </Panel>

                <Panel title="Members" description={data ? `${data.members.length} with access` : ''} className="xl:col-span-2 xl:order-1" bodyClassName="p-0">
                    {!data ? <div className="p-5"><Skeleton className="h-48 w-full" /></div> : data.members.length === 0 ? (
                        <EmptyState icon={Users} title="No team members found" />
                    ) : (
                        <ul className="divide-y divide-zinc-800/80">
                            {data.members.map(member => {
                                const isYou = member.id === data.currentUserId;
                                const info = ROLE_INFO[member.role];
                                return (
                                    <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                        {member.image ? <img src={member.image} alt="" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-zinc-800" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="flex items-center gap-2 text-sm text-zinc-100">
                                                <span className="truncate">{member.name}</span>
                                                {isYou && <span className="text-xs text-zinc-500">(you)</span>}
                                            </p>
                                            <p className="truncate text-xs text-zinc-500">
                                                {member.email}{member.lastSignInAt ? ` · signed in ${formatRelative(member.lastSignInAt)}` : ''}
                                            </p>
                                        </div>
                                        {isYou ? (
                                            <Badge tone={info.tone}><ShieldCheck className="w-3 h-3" />{info.label}</Badge>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <select value={member.role} disabled={busy} onChange={e => changeRole(member, e.target.value)} className={filterSelectClass}>
                                                    <option value="admin">Admin</option>
                                                    <option value="staff">Staff</option>
                                                </select>
                                                <button onClick={() => setRemoving(member)} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-400">Remove</button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            </div>

            {data && data.awaitingApproval.length > 0 && (
                <Panel className="mt-4" title="Waiting for approval" description="They signed up from an invitation. Nobody gets access until you approve them." bodyClassName="p-0">
                    <ul className="divide-y divide-zinc-800/80">
                        {data.awaitingApproval.map(person => {
                            const chosen = approveAs[person.id] || person.invitedAs || 'staff';
                            return (
                                <li key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                    {person.image ? <img src={person.image} alt="" className="h-8 w-8 rounded-full" /> : <span className="h-8 w-8 rounded-full bg-zinc-800" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-zinc-100">{person.name}</p>
                                        <p className="truncate text-xs text-zinc-500">{person.email} · invited as {ROLE_INFO[person.invitedAs]?.label.toLowerCase()}{person.createdAt ? ` · joined ${formatRelative(person.createdAt)}` : ''}</p>
                                    </div>
                                    <select value={chosen} disabled={busy} onChange={e => setApproveAs({ ...approveAs, [person.id]: e.target.value })} className={filterSelectClass}>
                                        <option value="admin">Admin</option>
                                        <option value="staff">Staff</option>
                                    </select>
                                    <button onClick={() => changeRole(person, chosen)} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                                        <UserCheck className="w-3.5 h-3.5" />Approve
                                    </button>
                                    <button onClick={() => changeRole(person, null)} disabled={busy} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-400">Decline</button>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            )}

            {data && data.invitations.length > 0 && (
                <Panel className="mt-4" title="Pending invitations" description="Sent, but not signed up yet" bodyClassName="p-0">
                    <ul className="divide-y divide-zinc-800/80">
                        {data.invitations.map(invitation => (
                            <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                <span className="rounded-full bg-zinc-800 p-2"><Mail className="w-4 h-4 text-zinc-400" /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-zinc-100">{invitation.email}</p>
                                    <p className="flex items-center gap-1 text-xs text-zinc-500">
                                        <Clock className="w-3 h-3" />Sent {formatRelative(invitation.createdAt)}{invitation.invitedAs ? ` · as ${ROLE_INFO[invitation.invitedAs]?.label.toLowerCase()}` : ''}
                                    </p>
                                </div>
                                <button onClick={() => revoke(invitation)} disabled={busy} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-400">Cancel invitation</button>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}

            {removing && (
                <ConfirmDialog
                    title={`Remove ${removing.name}'s access?`}
                    message="They keep their customer account but can no longer open the admin console."
                    confirmLabel="Remove access"
                    danger
                    busy={busy}
                    onConfirm={() => changeRole(removing, null)}
                    onCancel={() => setRemoving(null)}
                />
            )}
        </>
    );
};

export default Team;
