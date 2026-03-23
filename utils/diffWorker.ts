import { diffLines, diffWordsWithSpace, Change } from 'diff';

self.onmessage = (e: MessageEvent) => {
    const { origText, changedText } = e.data;
    
    try {
        const diff = diffLines(origText, changedText);
        let added = 0, deleted = 0;
        diff.forEach(part => {
            if (part.added) added += part.value.length;
            if (part.removed) deleted += part.value.length;
        });

        const stats = `${added} added, ${deleted} removed`;
        
        // We return the raw diff parts and let the main thread build the React nodes
        // because React nodes cannot be sent over postMessage.
        // However, we can pre-calculate the rows data.
        
        const escapeHtml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const buildLines = (diffParts: Change[], isLeft: boolean) => {
            let lines: string[] = [];
            let currentLine = "";
            let activeClass: string | null = null;

            const append = (text: string, cls: string | null) => {
                if (!text) return;
                for (let j = 0; j < text.length; j++) {
                    const char = text[j];
                    if (char === '\n') {
                        if (activeClass) currentLine += '</span>';
                        lines.push(currentLine);
                        currentLine = "";
                        if (activeClass) currentLine += `<span class="${activeClass}">`;
                    } else {
                        if (cls !== activeClass) {
                            if (activeClass) currentLine += '</span>';
                            activeClass = cls;
                            if (activeClass) currentLine += `<span class="${activeClass}">`;
                        }
                        currentLine += escapeHtml(char);
                    }
                }
            };

            diffParts.forEach(part => {
                if (part.removed && isLeft) append(part.value, 'bg-red-200 text-red-900 line-through decoration-red-900/50');
                else if (part.added && !isLeft) append(part.value, 'bg-emerald-200 text-emerald-900 font-bold');
                else if (!part.added && !part.removed) append(part.value, null);
            });

            if (activeClass) currentLine += '</span>';
            lines.push(currentLine);
            return lines;
        };

        const rowsData: any[] = [];
        let leftLineNum = 1;
        let rightLineNum = 1;

        let i = 0;
        while(i < diff.length) {
            const current = diff[i];
            let type = 'equal';
            let leftVal = '', rightVal = '';

            if (current.removed && diff[i+1]?.added) {
                type = 'replace';
                leftVal = current.value;
                rightVal = diff[i+1].value;
                i += 2;
            } else if (current.removed) {
                type = 'delete';
                leftVal = current.value;
                i++;
            } else if (current.added) {
                type = 'insert';
                rightVal = current.value;
                i++;
            } else {
                leftVal = rightVal = current.value;
                i++;
            }

            let leftLines: string[] = [];
            let rightLines: string[] = [];

            if (type === 'replace') {
                const wordDiff = diffWordsWithSpace(leftVal, rightVal);
                leftLines = buildLines(wordDiff, true);
                rightLines = buildLines(wordDiff, false);
            } else if (type === 'delete') {
                leftLines = buildLines([{removed: true, value: leftVal} as Change], true);
            } else if (type === 'insert') {
                rightLines = buildLines([{added: true, value: rightVal} as Change], false);
            } else {
                 const lines = leftVal.split('\n');
                 if (lines.length > 0 && lines[lines.length-1] === '') lines.pop(); 
                 leftLines = lines.map(escapeHtml);
                 rightLines = [...leftLines];
            }

            const isChange = type !== 'equal';
            const maxRows = Math.max(leftLines.length, rightLines.length);
            for (let r = 0; r < maxRows; r++) {
                 const lContent = leftLines[r];
                 const rContent = rightLines[r];
                 const lNum = lContent !== undefined ? leftLineNum++ : '';
                 const rNum = rContent !== undefined ? rightLineNum++ : '';
                 
                 rowsData.push({
                     id: `${i}-${r}`,
                     type,
                     lContent,
                     rContent,
                     lNum,
                     rNum,
                     isFirstInBlock: isChange && r === 0
                 });
            }
        }

        self.postMessage({ stats, rowsData });
    } catch (error: any) {
        self.postMessage({ error: error.message });
    }
};
