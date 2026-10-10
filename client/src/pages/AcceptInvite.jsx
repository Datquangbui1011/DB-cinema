import { SignIn, SignUp, useClerk, useUser } from '@clerk/clerk-react';
import { LogOut, MailWarning } from 'lucide-react';

/**
 * Landing page for team invitation emails. Clerk adds `__clerk_ticket` (and
 * `__clerk_status`) to the link; its SignUp/SignIn components use the ticket
 * to create or sign in the invited account. That only works while signed
 * out, so anyone signed in as someone else is asked to sign out first.
 */
const AcceptInvite = () => {
    const { isLoaded, isSignedIn, user } = useUser();
    const { signOut } = useClerk();
    const params = new URLSearchParams(window.location.search);
    const hasTicket = params.has('__clerk_ticket');
    const status = params.get('__clerk_status');

    const card = 'w-full max-w-md rounded-2xl border border-beige/10 bg-black/40 p-6 text-center';

    if (!isLoaded) return <div className="min-h-screen" />;

    return (
        <div className="flex min-h-screen items-center justify-center px-4 pt-24 pb-12">
            {!hasTicket ? (
                <div className={card}>
                    <MailWarning className="mx-auto w-8 h-8 text-primary" />
                    <h1 className="mt-3 text-lg font-semibold">This invitation link is incomplete</h1>
                    <p className="mt-2 text-sm text-gray-400">Open the link straight from the invitation email, or ask an admin to send a new one.</p>
                </div>
            ) : isSignedIn ? (
                <div className={card}>
                    <h1 className="text-lg font-semibold">Sign out to accept this invitation</h1>
                    <p className="mt-2 text-sm text-gray-400">
                        You're signed in as <span className="text-white">{user.primaryEmailAddress?.emailAddress}</span>.
                        The invitation is for a different account, so sign out first and then continue.
                    </p>
                    <button
                        onClick={() => signOut({ redirectUrl: window.location.href })}
                        className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dull"
                    >
                        <LogOut className="w-4 h-4" />Sign out and continue
                    </button>
                </div>
            ) : status === 'sign_in' ? (
                // The invited email already has an account
                <SignIn fallbackRedirectUrl="/" />
            ) : (
                <SignUp fallbackRedirectUrl="/" />
            )}
        </div>
    );
};

export default AcceptInvite;
