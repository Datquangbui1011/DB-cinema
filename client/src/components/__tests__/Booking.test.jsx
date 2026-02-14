// MyBookings.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyBookings from '../../pages/Mybooking';           // adjust path as needed
import axios from 'axios';
import { useAppContext } from '../../context/AppContext';

// Mock axios
vi.mock('axios');

// Mock context (minimal version – only what's used in MyBookings)
vi.mock('../../context/AppContext', () => ({
  useAppContext: vi.fn(),
}));

describe('MyBookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy context
    useAppContext.mockReturnValue({
      axios: axios,
      getToken: vi.fn().mockResolvedValue('fake-jwt-token-xyz'),
      image_base_url: 'https://images.example.com/',
      user: { id: 'u123', email: 'test@example.com' }, // logged in by default
    });

    // Default mock response to avoid crash in useEffect
    axios.get.mockResolvedValue({ data: { success: true, bookings: [] } });
  });

  it('renders loading state initially', () => {
    render(<MyBookings />);
    // If your <Loading /> has text, an alt, or data-testid — use that
    // Otherwise you can check for absence of content + presence of spinner
    expect(screen.queryByText('My Bookings')).not.toBeInTheDocument();
    // Alternative: add data-testid="loading" to <Loading /> and test:
    // expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows sign-in message when user is not logged in', async () => {
    useAppContext.mockReturnValue({
      user: null,
      getToken: vi.fn(),
      axios: axios,
      image_base_url: '',
    });

    render(<MyBookings />);

    await waitFor(() => {
      expect(screen.getByText(/Please sign in to view your bookings/i)).toBeInTheDocument();
    });

    // No API call should happen
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('shows "No Bookings Found" message when user has no bookings', async () => {
    axios.get.mockResolvedValueOnce({
      data: { success: true, bookings: [] },
    });

    render(<MyBookings />);

    await waitFor(() => {
      expect(screen.getByText(/No Bookings Found/i)).toBeInTheDocument();
      expect(screen.getByText(/You haven't booked any movies yet/i)).toBeInTheDocument();
    });

    expect(axios.get).toHaveBeenCalledWith(
      '/api/user/bookings',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-jwt-token-xyz' },
      })
    );
  });

  it('renders booking items correctly when data is available', async () => {
    const mockBookings = [
      {
        _id: 'bk001',
        show: {
          movie: { title: 'Dune: Part Two', poster_path: '/dune.jpg', runtime: 166 },
          showDateTime: '2026-03-20T19:30:00Z',
        },
        bookedSeat: ['G14', 'G15'],
        amount: 42,
        isPaid: true,
      },
      {
        _id: 'bk002',
        show: {
          movie: { title: 'Poor Things', poster_path: null, runtime: 141 },
          showDateTime: '2026-04-05T20:15:00Z',
        },
        bookedSeat: ['D8'],
        amount: 18.5,
        isPaid: false,
      },
    ];

    axios.get.mockResolvedValueOnce({
      data: { success: true, bookings: mockBookings },
    });

    render(<MyBookings />);

    await waitFor(() => {
      expect(screen.getByText('Dune: Part Two')).toBeInTheDocument();
      expect(screen.getByText('Poor Things')).toBeInTheDocument();

      expect(screen.getByText('G14, G15')).toBeInTheDocument();
      expect(screen.getByText('D8')).toBeInTheDocument();

      // amounts with currency
      expect(screen.getByText('$42')).toBeInTheDocument();
      expect(screen.getByText('$18.5')).toBeInTheDocument();

      // paid status
      expect(screen.getByText(/Paid/i)).toBeInTheDocument();

      // unpaid → should show action buttons
      expect(screen.getByRole('button', { name: /Pay Now/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('shows correct poster fallback when poster_path is missing', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        success: true,
        bookings: [
          {
            _id: 'bk777',
            show: {
              movie: { title: 'No Poster Movie', poster_path: null },
              showDateTime: new Date().toISOString(),
            },
            bookedSeat: ['A1'],
            amount: 15,
            isPaid: false,
          },
        ],
      },
    });

    render(<MyBookings />);

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://via.placeholder.com/150');
    });
  });

});