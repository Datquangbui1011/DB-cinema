import 'dotenv/config';
import { clerkClient } from "@clerk/express";

const userId = "user_36Lbd3jeyIoFphcebZMM9PWJ2fN";

try {
    const user = await clerkClient.users.getUser(userId);
    console.log("User found:", user.firstName, user.lastName);
    console.log("Emails:", user.emailAddresses.map(e => e.emailAddress));
} catch (err) {
    console.error("Error fetching user:", err);
}
