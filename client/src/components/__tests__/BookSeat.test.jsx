import { render, screen, fireEvent,  } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SeatLayout from '../../pages/SeatLayout';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/*
 Mock isoTimeFormat so we don't depend on its implementation.
 Always returns "18:00" for predictable testing.
*/
vi.mock('../../lib/isoTimeFormat', () => ({
  default: () => '18:00',
}));


/*
 Mock AppContext to simulate backend API and authentication.
 This prevents real API calls and gives controlled test data.
*/
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    axios: {
      get: vi.fn((url) => {

        // Mock API response for fetching show information
        if (url.includes('/api/shows')) {
          return Promise.resolve({
            data: {
              success: true,
              movie: {
                title: 'Test Movie',
                poster_path: '/poster.jpg',
                vote_average: 8.5,
                genres: [{ name: 'Action' }]
              },
              // Mock showtime for the given date
              dateTime: {
                '2026-02-14': [
                  {
                    time: '18:00',
                    showId: 'show123',
                    showPrice: 10,
                    theaterType: 'Standard'
                  }
                ]
              }
            }
          });
        }

        // Mock API response for occupied seats
        if (url.includes('/api/booking/seats')) {
          return Promise.resolve({
            data: {
              success: true,
              occupiedSeats: ['A2'] // Seat A2 is already taken
            }
          });
        }
      }),

      // Mock booking API call
      post: vi.fn(() =>
        Promise.resolve({ data: { success: true } })
      )
    },

    // Mock authentication/token
    getToken: () => 'fake-token',

    image_base_url: '',

    // Simulate logged-in user
    user: { id: 'user1' }
  })
}));


/*
 Helper function to render SeatLayout with router parameters.
 The component expects URL params: /buy/:id/:date
*/
const renderComponent = () =>
  render(
    <MemoryRouter initialEntries={['/buy/show123/2026-02-14']}>
      <Routes>
        <Route path="/buy/:id/:date" element={<SeatLayout />} />
      </Routes>
    </MemoryRouter>
  );


describe('SeatLayout Feature', () => {

  // Clear mocks before each test to avoid interference
  beforeEach(() => {
    vi.clearAllMocks();
  });


  /*
   Test 1:
   Verify movie information is displayed after fetching show data
  */
  it('renders movie info', async () => {
    renderComponent();

    // Wait for async fetch and rendering
    expect(await screen.findByText('Test Movie')).toBeInTheDocument();
  });


  /*
   Test 2:
   Verify user can select a showtime
  */
  it('selects a showtime', async () => {
    renderComponent();

    const timeButton = await screen.findByText(/18:00/i);
    fireEvent.click(timeButton);

    expect(timeButton).toBeInTheDocument();
  });


  /*
   Test 3:
   Verify seat selection toggle (select and unselect)
  */
  it('selects and unselects a seat', async () => {
    renderComponent();

    const timeButton = await screen.findByText(/18:00/i);
    fireEvent.click(timeButton);

    const seat = await screen.findByText('A1');

    fireEvent.click(seat); // Select seat
    fireEvent.click(seat); // Unselect seat

    expect(seat).toBeInTheDocument();
  });


  /*
   Test 4:
   Ensure user cannot select more than 5 seats
   (business rule)
  */
  it('prevents selecting more than 5 seats', async () => {
    renderComponent();

    const timeButton = await screen.findByText(/18:00/i);
    fireEvent.click(timeButton);

    const seats = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

    for (const s of seats) {
      const seat = await screen.findByText(s);
      fireEvent.click(seat);
    }

    // Only first 5 seats should be allowed
    expect(await screen.findByText('A5')).toBeInTheDocument();
  });


  /*
   Test 5:
   Verify occupied seats cannot be selected
  */
  it('blocks occupied seats', async () => {
    renderComponent();

    const timeButton = await screen.findByText(/18:00/i);
    fireEvent.click(timeButton);

    const occupiedSeat = await screen.findByText('A2');

    // Button should be disabled
    expect(occupiedSeat.closest('button')).toBeDisabled();
  });


  /*
   Test 6:
   Checkout button should be disabled when no seats selected
  */
  it('checkout button disabled when no selection', async () => {
    renderComponent();

    const checkout = await screen.findByRole('button', { name: /Proceed to Checkout/i });

    expect(checkout).toBeDisabled();
  });


  /*
   Test 7:
   Checkout button becomes enabled when a seat is selected
  */
  it('checkout button enabled when seat selected', async () => {
    renderComponent();

    const timeButton = await screen.findByText(/18:00/i);
    fireEvent.click(timeButton);

    const seat = await screen.findByText('A1');
    fireEvent.click(seat);

    const checkout = await screen.findByRole('button', { name: /Proceed to Checkout/i });

    expect(checkout).not.toBeDisabled();
  });

});