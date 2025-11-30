import { Inngest } from "inngest";
import User from "../models/User.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// Inngest functions to save user data to database
const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk' },
    { event: 'clerk/user.created' },
    async ({ event }) => {
        const { id, first_name, last_name, email_address, image_url } = event.data;
        const userData = {
            _id: id,
            name: first_name + ' ' + last_name,
            email: email_address[0].email_address,
            image: image_url
        }
        await User.create(userData);
    }
)
// Inngest functions to delete user data from database
const syncUserDeletion = inngest.createFunction(
    { id: 'delete-user-with-clerk' },
    { event: 'clerk/user.deleted' },
    async ({ event }) => {
        const { id } = event.data;
        await User.findByIdAndDelete(id);
    }
)

// Inngest functions to update user data from database
const syncUserUpdate = inngest.createFunction(
    { id: 'sync-user-from-clerk' },
    { event: 'clerk/user.updated' },
    async ({ event }) => {
        const { id, first_name, last_name, email_address, image_url } = event.data;
        const userData = {
            _id: id,
            name: first_name + ' ' + last_name,
            email: email_address[0].email_address,
            image: image_url
        }
        await User.findByIdAndUpdate(id, userData);
    }
)

// Create an empty array where we'll export future Inngest functions
export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdate];