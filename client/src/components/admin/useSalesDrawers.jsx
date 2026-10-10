import { useState } from 'react';
import { BookingDrawer, CustomerDrawer } from './SalesDrawers';
import ShowDetailsDialog from './ShowDetailsDialog';

/**
 * Booking, customer and show panels that link to each other.
 * Returns openers plus the element to render once on the page.
 */
export const useSalesDrawers = () => {
    const [panel, setPanel] = useState(null);       // { type: 'booking' | 'customer', id }
    const [showId, setShowId] = useState(null);

    const openBooking = (id) => setPanel({ type: 'booking', id });
    const openCustomer = (id) => setPanel({ type: 'customer', id });
    const close = () => setPanel(null);

    const element = (
        <>
            {panel?.type === 'booking' && (
                <BookingDrawer key={panel.id} bookingId={panel.id} onClose={close} onOpenCustomer={openCustomer} onOpenShow={setShowId} />
            )}
            {panel?.type === 'customer' && (
                <CustomerDrawer key={panel.id} customerId={panel.id} onClose={close} onOpenBooking={openBooking} />
            )}
            {showId && <ShowDetailsDialog showId={showId} onClose={() => setShowId(null)} />}
        </>
    );
    return { openBooking, openCustomer, element };
};
