
import { clerkClient } from "@clerk/express";
import 'dotenv/config';

const checkUsers = async () => {
    try {
        const response = await clerkClient.users.getUserList();
        const users = response.data;
        console.log(`Found ${users.length} users.`);
        users.forEach(user => {
            console.log(`User ID: ${user.id}`);
            console.log(`Email: ${user.emailAddresses[0].emailAddress}`);
            console.log(`Private Metadata:`, user.privateMetadata);
            console.log(`Public Metadata:`, user.publicMetadata);
            console.log(`Unsafe Metadata:`, user.unsafeMetadata);
            console.log("------------------------------------------------");
        });
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

checkUsers();
