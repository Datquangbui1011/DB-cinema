import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendPaymentConfirmationEmail } from '../inngest/index.js';
import { clerkClient } from '@clerk/express';
import { Resend } from 'resend';

// Mock Clerk
vi.mock('@clerk/express', () => ({
    clerkClient: {
        users: {
            getUser: vi.fn()
        }
    }
}));

// Mock Resend
vi.mock('resend', () => {
    const mockSend = vi.fn();
    return {
        Resend: function() {
            return {
                emails: {
                    send: mockSend
                }
            };
        }
    };
});

// Mock environment variables
process.env.RESEND_API_KEY = 'test_key';

describe('Inngest: sendPaymentConfirmationEmail', () => {
    let mockResendSend;

    beforeEach(() => {
        vi.clearAllMocks();
        // Since Resend is initialized at the top of index.js, we need to mock its instance
        // Our mock implementation above handles the constructor, but we need the instance's send method
        const resendInstance = new Resend();
        mockResendSend = resendInstance.emails.send;
    });

    it('should successfully send an email when voter data is valid', async () => {
        const event = {
            data: {
                userId: 'user_123',
                bookingId: 'book_456',
                movieTitle: 'Inception',
                seats: ['A1', 'A2'],
                showDateTime: '2026-02-14T18:00:00.000Z',
                theaterType: 'IMAX',
                amount: 30,
                userName: 'John Doe'
            }
        };

        // Mock Clerk response
        clerkClient.users.getUser.mockResolvedValue({
            firstName: 'John',
            emailAddresses: [{ emailAddress: 'john@example.com' }]
        });

        // Mock Resend response
        mockResendSend.mockResolvedValue({ data: { id: 'email_id' }, error: null });

        // Get the handler from the inngest function
        // Note: Inngest stores the handler in the 'fn' property or we can call it if we mock the context
        const result = await sendPaymentConfirmationEmail.fn({ event });

        expect(result.success).toBe(true);
        expect(result.emailId).toBe('email_id');
        expect(clerkClient.users.getUser).toHaveBeenCalledWith('user_123');
        expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({
            to: 'john@example.com',
            subject: expect.stringContaining('Inception')
        }));
    });

    it('should throw an error if user is not found in Clerk', async () => {
        const event = {
            data: { userId: 'invalid_user' }
        };

        clerkClient.users.getUser.mockResolvedValue(null);

        await expect(sendPaymentConfirmationEmail.fn({ event }))
            .rejects.toThrow('User not found');
    });

    it('should throw an error if Resend fails', async () => {
        const event = {
            data: {
                userId: 'user_123',
                bookingId: 'book_456',
                movieTitle: 'Inception',
                seats: ['A1'],
                showDateTime: '2026-02-14T18:00:00.000Z',
                theaterType: 'IMAX',
                amount: 15,
                userName: 'John Doe'
            }
        };

        clerkClient.users.getUser.mockResolvedValue({
            firstName: 'John',
            emailAddresses: [{ emailAddress: 'john@example.com' }]
        });

        mockResendSend.mockResolvedValue({ 
            data: null, 
            error: { message: 'API Key invalid' } 
        });

        await expect(sendPaymentConfirmationEmail.fn({ event }))
            .rejects.toEqual({ message: 'API Key invalid' });
    });
});
