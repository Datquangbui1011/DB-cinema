// Download rows as a CSV file. `columns` is [[header, row => value], ...]
export const downloadCsv = (filename, rows, columns) => {
    const cell = (value) => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
