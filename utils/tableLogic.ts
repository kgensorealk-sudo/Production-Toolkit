
export type TableFormat = 'csv' | 'markdown' | 'html' | 'json' | 'xml';

// --- Parsers (Input -> 2D Array) ---

const parseCSV = (text: string): string[][] => {
    // Basic CSV parser handling quotes
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentVal += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentVal += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentVal);
                currentVal = '';
            } else if (char === '\n' || char === '\r') {
                if (currentVal || currentRow.length > 0) {
                    currentRow.push(currentVal);
                    rows.push(currentRow);
                }
                currentRow = [];
                currentVal = '';
                if (char === '\r' && nextChar === '\n') i++;
            } else {
                currentVal += char;
            }
        }
    }
    if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal);
        rows.push(currentRow);
    }
    return rows;
};

const parseMarkdown = (text: string): string[][] => {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    const rows: string[][] = [];
    
    for (const line of lines) {
        // Skip separator lines (e.g., |---|---|)
        if (line.trim().match(/^\|?[\s-:|]+\|?$/)) continue;
        
        const cells = line.split('|').map(c => c.trim());
        // Remove empty first/last elements if pipe style is | a | b |
        if (line.trim().startsWith('|') && cells.length > 0 && cells[0] === '') cells.shift();
        if (line.trim().endsWith('|') && cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
        
        rows.push(cells);
    }
    return rows;
};

const parseHTML = (text: string): string[][] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const table = doc.querySelector('table');
    if (!table) throw new Error('No <table> tag found');
    
    const rows: string[][] = [];
    const trs = table.querySelectorAll('tr');
    
    trs.forEach(tr => {
        const cells: string[] = [];
        tr.querySelectorAll('td, th').forEach(cell => {
            cells.push(cell.textContent?.trim() || '');
        });
        if (cells.length > 0) rows.push(cells);
    });
    return rows;
};

const parseJSON = (text: string): string[][] => {
    try {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('JSON must be an array of objects/arrays');
        
        if (data.length === 0) return [];

        // Handle Array of Arrays
        if (Array.isArray(data[0])) {
            return data.map(row => row.map((cell: any) => String(cell ?? '')));
        }

        // Handle Array of Objects (Keys become headers)
        if (typeof data[0] === 'object') {
            const headers = Object.keys(data[0]);
            const rows = [headers];
            data.forEach((obj: any) => {
                rows.push(headers.map(h => String(obj[h] ?? '')));
            });
            return rows;
        }
        return [];
    } catch (e) {
        throw new Error('Invalid JSON format');
    }
};

// --- Formatters (2D Array -> Output) ---

const toCSV = (data: string[][]): string => {
    return data.map(row => 
        row.map(cell => {
            const needsQuotes = cell.includes(',') || cell.includes('"') || cell.includes('\n');
            return needsQuotes ? `"${cell.replace(/"/g, '""')}"` : cell;
        }).join(',')
    ).join('\n');
};

const toMarkdown = (data: string[][]): string => {
    if (data.length === 0) return '';
    
    const colWidths = new Array(data[0].length).fill(3);
    data.forEach(row => {
        row.forEach((cell, i) => {
            colWidths[i] = Math.max(colWidths[i], cell.length);
        });
    });

    const buildRow = (row: string[]) => 
        '| ' + row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |';
    
    const header = buildRow(data[0]);
    const separator = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';
    const body = data.slice(1).map(buildRow).join('\n');

    return `${header}\n${separator}\n${body}`;
};

const toHTML = (data: string[][]): string => {
    if (data.length === 0) return '';
    let html = '<table>\n';
    
    // Header
    html += '  <thead>\n    <tr>\n';
    data[0].forEach(cell => html += `      <th>${cell}</th>\n`);
    html += '    </tr>\n  </thead>\n';

    // Body
    html += '  <tbody>\n';
    data.slice(1).forEach(row => {
        html += '    <tr>\n';
        row.forEach(cell => html += `      <td>${cell}</td>\n`);
        html += '    </tr>\n';
    });
    html += '  </tbody>\n</table>';
    return html;
};

const toXML = (data: string[][]): string => {
    if (data.length === 0) return '<root></root>';
    
    // Sanitize tag names from header row
    const headers = data[0].map(h => h.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[^a-zA-Z]/, 'c$&') || 'col');
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n';
    data.slice(1).forEach(row => {
        xml += '  <row>\n';
        row.forEach((cell, i) => {
            const tagName = headers[i] || `col_${i}`;
            // Simple XML escape
            const safeContent = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            xml += `    <${tagName}>${safeContent}</${tagName}>\n`;
        });
        xml += '  </row>\n';
    });
    xml += '</root>';
    return xml;
};

const toJSON = (data: string[][]): string => {
    if (data.length === 0) return '[]';
    const headers = data[0];
    const result = data.slice(1).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
            obj[h] = row[i] || '';
        });
        return obj;
    });
    return JSON.stringify(result, null, 2);
};

// --- Main API ---

export const detectFormat = (text: string): TableFormat => {
    const trimmed = text.trim();
    if (trimmed.startsWith('<table') || trimmed.includes('</td>')) return 'html';
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<root>')) return 'xml';
    if (trimmed.includes('|') && trimmed.includes('---')) return 'markdown';
    return 'csv'; // Default fallback
};

export const convertTable = (text: string, from: 'auto' | TableFormat, to: TableFormat): string => {
    if (!text.trim()) return '';

    const inputFormat = from === 'auto' ? detectFormat(text) : from;
    let data: string[][] = [];

    // Parse
    switch (inputFormat) {
        case 'csv': data = parseCSV(text); break;
        case 'markdown': data = parseMarkdown(text); break;
        case 'html': data = parseHTML(text); break;
        case 'json': data = parseJSON(text); break;
        default: throw new Error(`Unsupported input format detected: ${inputFormat}`);
    }

    // Format
    switch (to) {
        case 'csv': return toCSV(data);
        case 'markdown': return toMarkdown(data);
        case 'html': return toHTML(data);
        case 'json': return toJSON(data);
        case 'xml': return toXML(data);
        default: return '';
    }
};
