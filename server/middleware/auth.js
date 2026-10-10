import { clerkClient } from "@clerk/express";

// Roles live in Clerk private metadata: { "role": "admin" | "staff" }
export const ROLES = ['admin', 'staff'];

const getRole = async (req) => {
    const { userId } = req.auth();
    if (!userId) return null;
    const user = await clerkClient.users.getUser(userId);
    const role = user.privateMetadata?.role;
    return ROLES.includes(role) ? role : null;
};

// Only lets through signed-in users whose role is one of `allowed`; sets req.role
export const requireRole = (...allowed) => async (req, res, next) => {
    try {
        const role = await getRole(req);
        if (!role || !allowed.includes(role)) {
            return res.json({ success: false, message: 'not authorized' });
        }
        req.role = role;
        next();
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'not authorized' });
    }
};

// Full access: editing shows, prices, content, team
export const protectAdmin = requireRole('admin');

// Read-only access to operations, sales and analytics
export const protectStaff = requireRole('admin', 'staff');
