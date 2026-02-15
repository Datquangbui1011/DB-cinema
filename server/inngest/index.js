import { Inngest } from "inngest";
import User from "../models/User.js";
import { Resend } from "resend";
import { clerkClient } from "@clerk/express";
import QRCode from 'qrcode';

// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// ========== EXISTING USER SYNC FUNCTIONS ==========

const syncUserCreation = inngest.createFunction(
    { id: 'sync-user-from-clerk' },
    { event: 'clerk/user.created' },
    async ({ event }) => {
        const { id, first_name, last_name, email_addresses, image_url } = event.data;
        const userData = {
            _id: id,
            email: email_addresses[0].email_address,
            name: first_name + ' ' + last_name,
            image: image_url
        }
        console.log("Creating user:", userData);
        await User.create(userData);
        console.log("User created in DB");
    }
)

const syncUserDeletion = inngest.createFunction(
    { id: 'delete-user-with-clerk' },
    { event: 'clerk/user.deleted' },
    async ({ event }) => {
        const { id } = event.data;
        await User.findByIdAndDelete(id);
    }
)

const syncUserUpdation = inngest.createFunction(
    { id: 'update-user-from-clerk' },
    { event: 'clerk/user.updated' },
    async ({ event }) => {
        const { id, first_name, last_name, email_addresses, image_url } = event.data;
        const userData = {
            _id: id,
            email: email_addresses[0].email_address,
            name: first_name + ' ' + last_name,
            image: image_url
        }
        console.log("Updating user:", userData);
        await User.findByIdAndUpdate(id, userData);
        console.log("User updated in DB");
    }
)

// ========== NEW: PAYMENT CONFIRMATION EMAIL ==========
// ========== NEW: PAYMENT CONFIRMATION EMAIL ==========
export const sendPaymentConfirmationEmail = inngest.createFunction(
    { id: 'send-payment-confirmation-email' },
    { event: 'booking/payment.confirmed' },
    async ({ event }) => {
        try {
            const { 
                userId,
                bookingId,
                movieTitle,
                seats,
                showDateTime,
                theaterType,
                amount,
                userName
            } = event.data;

            console.log("Processing email for booking:", bookingId);

            // Fetch user from Clerk
            const user = await clerkClient.users.getUser(userId);
            if (!user) {
                throw new Error("User not found in Clerk");
            }

            const email = user.emailAddresses[0]?.emailAddress;
            if (!email) {
                throw new Error("User has no email address");
            }

            // Generate QR Code
            const qrData = JSON.stringify({ bookingId, movieTitle, seats, showDateTime });
            const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 250,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            // Send email
            const { data, error } = await resend.emails.send({
                from: 'Movie Tickets <onboarding@resend.dev>',
                to: email,
                subject: `🎬 Confirmation: ${movieTitle}`,
                html: `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Booking Confirmation</title>
                    </head>
                    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fc; color: #1a1a1a;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f7f9fc; padding: 40px 0;">
                            <tr>
                                <td align="center">
                                    <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                                        <!-- Header -->
                                        <tr>
                                            <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px;">
                                                <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800;">Payment Successful!</h1>
                                                <div style="display: inline-block; margin-top: 12px; padding: 6px 16px; background: rgba(255,255,255,0.15); border-radius: 100px; color: #ffffff; font-size: 14px; font-weight: 600;">✓ Booking Confirmed</div>
                                            </td>
                                        </tr>

                                        <!-- Body -->
                                        <tr>
                                            <td style="padding: 40px 30px;">
                                                <p style="margin: 0 0 20px 0; font-size: 18px; font-weight: 500;">Hi ${userName || 'there'},</p>
                                                <p style="margin: 0 0 30px 0; font-size: 16px; color: #4b5563; line-height: 1.6;">Your payment has been processed and your movie tickets are ready. Show the QR code below at the theater entrance.</p>

                                                <!-- Ticket Section -->
                                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fbff; border: 2px solid #e2e8f0; border-radius: 12px; margin-bottom: 30px;">
                                                    <tr>
                                                        <td align="center" style="padding: 30px;">
                                                            <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #667eea;">🎟️ Your Digital Ticket</p>
                                                            <img src="${qrCodeDataURL}" alt="Ticket QR Code" width="200" style="display: block; border-radius: 8px;" />
                                                            <p style="margin: 16px 0 0 0; font-size: 14px; color: #718096; line-height: 1.4;">
                                                                <strong>Scanner needed at entrance</strong><br/>
                                                                Brightness should be at max when scanning
                                                            </p>
                                                        </td>
                                                    </tr>
                                                </table>

                                                <!-- Booking Details Card -->
                                                <div style="background-color: #ffffff; border: 1px solid #edf2f7; border-radius: 12px; padding: 24px; margin-bottom: 30px;">
                                                    <h2 style="margin: 0 0 20px 0; font-size: 22px; color: #667eea; font-weight: 700;">🎬 ${movieTitle}</h2>
                                                    
                                                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                                        <tr>
                                                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                                                <div style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Booking ID</div>
                                                                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 15px; font-weight: 700; color: #1a202c;">${bookingId}</div>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                                                <div style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Theater Type</div>
                                                                <div style="font-size: 16px; font-weight: 600; color: #1a202c;">${theaterType}</div>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                                                <div style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Show Date & Time</div>
                                                                <div style="font-size: 16px; font-weight: 600; color: #1a202c;">${new Date(showDateTime).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                                                <div style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Your Seats</div>
                                                                <div style="margin-top: 4px;">
                                                                    ${Array.isArray(seats) ? seats.map(seat => `<span style="display: inline-block; background: #667eea; color: #ffffff; padding: 4px 10px; border-radius: 6px; font-size: 14px; font-weight: 700; margin-right: 6px;">${seat}</span>`).join('') : seats}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 16px 0 0 0;">
                                                                <div style="font-size: 13px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600;">Amount Paid</div>
                                                                <div style="font-size: 24px; font-weight: 800; color: #667eea;">$${Number(amount).toFixed(2)}</div>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </div>

                                                <!-- Note Box -->
                                                <div style="background-color: #fffaf0; border-left: 4px solid #ed8936; border-radius: 6px; padding: 20px;">
                                                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #9c4221;">📱 Entry Requirements</p>
                                                    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #9c4221; line-height: 1.5;">
                                                        <li>Arrive 15 mins before showtime</li>
                                                        <li>Have this QR code ready on your phone</li>
                                                        <li>Carry a valid photo ID</li>
                                                    </ul>
                                                </div>
                                                
                                                <p style="margin: 40px 0 0 0; text-align: center; font-size: 20px; font-weight: 700;">Enjoy your movie! 🍿🎬</p>
                                            </td>
                                        </tr>

                                        <!-- Footer -->
                                        <tr>
                                            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #edf2f7;">
                                                <p style="margin: 0 0 10px 0; font-size: 14px; color: #718096;"><strong>Need support?</strong> Contact our theater team</p>
                                                <p style="margin: 0; font-size: 12px; color: #a0aec0;">This is an automated message. Please do not reply.</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </body>
                    </html>
                `
            });

            if (error) throw error;
            console.log("✅ Confirmation email sent to:", email);
            return { success: true, emailId: data.id };

        } catch (error) {
            console.error("❌ Email Function Error:", error.message);
            throw error;
        }
    }
);



// Export all functions
export const functions = [
    syncUserCreation, 
    syncUserDeletion, 
    syncUserUpdation,
    sendPaymentConfirmationEmail  // ← NEW FUNCTION
];