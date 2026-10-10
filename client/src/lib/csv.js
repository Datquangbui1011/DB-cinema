// Download rows as a CSV file. `columns` is [[header, row => value], ...]
export const downloadCsv = (filename, rows, columns) => {
    const cell = (value) => {
        // Text starting with = + - @ (or tab / CR) would run as a spreadsheet formula: prefix it
        const raw = value === null || value === undefined ? '' : String(value);
        const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [columns.map(([header]) => cell(header)).join(',')]
        .concat(rows.map(row => columns.map(([, get]) => cell(get(row))).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};
