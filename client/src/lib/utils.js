// Utility function to format dates
export const dateFormat = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);

    // Format: "Jun 30, 2025"
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
};

// Utility function to format time
export const timeFormat = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);

    // Format: "2:30 PM"
    const options = { hour: 'numeric', minute: '2-digit', hour12: true };
    return date.toLocaleTimeString('en-US', options);
};

// Utility function to format date and time together
export const dateTimeFormat = (dateString) => {
    if (!dateString) return 'N/A';

    return `${dateFormat(dateString)} at ${timeFormat(dateString)}`;
};
