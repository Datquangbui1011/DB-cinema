const timeFormat = (dateString) => {
    const hours = Math.floor(dateString / 60);
    const minutesRemainder = dateString % 60;
    return `${hours}h ${minutesRemainder}m`;
}

export default timeFormat;