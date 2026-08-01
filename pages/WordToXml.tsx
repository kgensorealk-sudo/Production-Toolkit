import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Bold, 
    Italic, 
    Superscript, 
    Subscript, 
    Underline, 
    Code, 
    Copy, 
    Check, 
    Download, 
    Sparkles, 
    Eraser, 
    List, 
    ListOrdered,
    ListFilter,
    Indent,
    Outdent,
    FileCode, 
    Zap, 
    Layers, 
    Sliders, 
    Type,
    Hash,
    Settings,
    ChevronDown,
    ChevronUp,
    X,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import Toast from '../components/Toast';

type NamespaceSchema = 'elsevier' | 'jats' | 'generic';

interface ConversionOptions {
    schema: NamespaceSchema;
    addParagraphIds: boolean;
    paraIdPrefix: string;
    listIdPrefix: string;
    listItemIdPrefix: string;
    paraIdStart: number;
    paraIdStep: number;
    addListLabels: boolean;
    wrapInRoot: boolean;
    rootTag: string;
    trimInsideTags: boolean;
    mergeAdjacentTags: boolean;
    cleanEmptyTags: boolean;
    encodeEntities: boolean;
    prettyPrint: boolean;
    convertHeadings: boolean;
    embedListInPara: boolean;
}

const SAMPLE_WORD_HTML = `<p>This is a text example with <b>bold</b>, <i>italic</i>, <u>underline</u>, <sup>superscript</sup>, and <sub>subscript</sub> formatting.</p>
<p><b>1. Bulleted List with Nested Sub-List:</b></p>
<ul>
  <li>First main bullet item with <b>bold</b> highlight
    <ul>
      <li>Sub-item A with <sup>superscript</sup> details</li>
      <li>Sub-item B with <sub>subscript</sub> reference</li>
    </ul>
  </li>
  <li>Second main bullet item with <i>italic</i> notes</li>
</ul>
<p><b>2. Numbered List (1, 2, 3) with Nested Lettered Sub-List:</b></p>
<ol type="1">
  <li>Primary research objective
    <ol type="a">
      <li>First sub-objective analysis</li>
      <li>Second sub-objective evaluation</li>
    </ol>
  </li>
  <li>Secondary experimental procedure</li>
</ol>
<p><b>3. Unlabelled List (Plain):</b></p>
<ul class="unlabelled" type="unstyled" style="list-style-type: none;">
  <li>Plain item without label prefix</li>
  <li>Another plain item without label tags</li>
</ul>
<p>You can also use the toolbar buttons to switch list styles or indent/outdent nested items.</p>`;

export const WordToXml: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [editorHtml, setEditorHtml] = useState<string>('');
    const [isHtmlMode, setIsHtmlMode] = useState<boolean>(false);
    const [rawHtmlInput, setRawHtmlInput] = useState<string>('');
    
    const [xmlOutput, setXmlOutput] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'code' | 'raw' | 'stats'>('code');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);

    const [options, setOptions] = useState<ConversionOptions>({
        schema: 'elsevier',
        addParagraphIds: true,
        paraIdPrefix: 'p',
        listIdPrefix: 'l',
        listItemIdPrefix: 'li',
        paraIdStart: 3005,
        paraIdStep: 5,
        addListLabels: true,
        wrapInRoot: false,
        rootTag: 'ce:sections',
        trimInsideTags: true,
        mergeAdjacentTags: true,
        cleanEmptyTags: true,
        encodeEntities: false,
        prettyPrint: true,
        convertHeadings: true,
        embedListInPara: true
    });

    // Synchronize contentEditable initial content
    useEffect(() => {
        if (editorRef.current && !isHtmlMode) {
            editorRef.current.innerHTML = editorHtml;
        }
    }, [isHtmlMode]);

    // Handle input change in contentEditable
    const handleEditorInput = () => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            setEditorHtml(html);
            setRawHtmlInput(html);
        }
    };

    // Format rich text commands
    const execCommand = (command: string, value: string | undefined = undefined) => {
        if (isHtmlMode) return;

        const getInnermostListContext = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return { li: null, list: null };

            let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
            let li: HTMLLIElement | null = null;
            let list: HTMLUListElement | HTMLOListElement | null = null;

            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    const tag = el.tagName.toLowerCase();
                    if (!li && tag === 'li') {
                        li = el as HTMLLIElement;
                    }
                    if (tag === 'ul' || tag === 'ol') {
                        list = el as HTMLUListElement | HTMLOListElement;
                        break; // STOP at innermost list
                    }
                }
                node = node.parentNode;
            }
            return { li, list };
        };

        const configureListElement = (el: HTMLUListElement | HTMLOListElement, cat: 'bullet' | 'number' | 'alpha' | 'unlabelled') => {
            if (cat === 'bullet') {
                el.removeAttribute('type');
                el.style.listStyleType = 'disc';
                el.classList.remove('unlabelled');
            } else if (cat === 'number') {
                el.setAttribute('type', '1');
                el.style.listStyleType = 'decimal';
                el.classList.remove('unlabelled');
            } else if (cat === 'alpha') {
                el.setAttribute('type', 'a');
                el.style.listStyleType = 'lower-alpha';
                el.classList.remove('unlabelled');
            } else if (cat === 'unlabelled') {
                el.setAttribute('type', 'unstyled');
                el.style.listStyleType = 'none';
                el.classList.add('unlabelled');
            }
        };

        const applyListCategory = (targetCat: 'bullet' | 'number' | 'alpha' | 'unlabelled') => {
            const { list } = getInnermostListContext();

            if (!list) {
                // Not in a list: create list first
                if (targetCat === 'bullet' || targetCat === 'unlabelled') {
                    document.execCommand('insertUnorderedList', false, undefined);
                } else {
                    document.execCommand('insertOrderedList', false, undefined);
                }
                // Configure newly created list
                const { list: newList } = getInnermostListContext();
                if (newList) {
                    configureListElement(newList, targetCat);
                }
                return;
            }

            // Already in a list: determine current category of the innermost list
            const isUnlabelled = list.classList.contains('unlabelled') || list.getAttribute('type') === 'unstyled';
            const tag = list.tagName.toLowerCase();
            const listType = (list.getAttribute('type') || '').toLowerCase();

            let currentCat: 'bullet' | 'number' | 'alpha' | 'unlabelled' = 'bullet';
            if (isUnlabelled) {
                currentCat = 'unlabelled';
            } else if (tag === 'ol') {
                if (listType === 'a' || listType === 'lower-alpha' || listType === 'upper-alpha') {
                    currentCat = 'alpha';
                } else {
                    currentCat = 'number';
                }
            } else {
                currentCat = 'bullet';
            }

            if (currentCat === targetCat) {
                // Toggling off list
                if (tag === 'ol') {
                    document.execCommand('insertOrderedList', false, undefined);
                } else {
                    document.execCommand('insertUnorderedList', false, undefined);
                }
            } else {
                // Change list style/type of THIS innermost list only
                const requiredTag = (targetCat === 'number' || targetCat === 'alpha') ? 'ol' : 'ul';
                let targetListEl = list;

                if (tag !== requiredTag) {
                    const convertedList = document.createElement(requiredTag);
                    while (list.firstChild) {
                        convertedList.appendChild(list.firstChild);
                    }
                    if (list.parentNode) {
                        list.parentNode.replaceChild(convertedList, list);
                    }
                    targetListEl = convertedList;
                }

                configureListElement(targetListEl, targetCat);
            }
        };

        if (command === 'indent') {
            const { list } = getInnermostListContext();
            if (!list) {
                document.execCommand('insertUnorderedList', false, undefined);
            } else {
                document.execCommand('indent', false, undefined);
            }
        } else if (command === 'insertUnorderedList') {
            applyListCategory('bullet');
        } else if (command === 'insertOrderedList') {
            applyListCategory('number');
        } else if (command === 'insertLetteredList') {
            applyListCategory('alpha');
        } else if (command === 'insertUnlabelledList') {
            applyListCategory('unlabelled');
        } else {
            document.execCommand(command, false, value);
        }

        if (editorRef.current) {
            editorRef.current.focus();
            handleEditorInput();
        }
    };

    // Clear all content
    const handleClear = () => {
        setEditorHtml('');
        setRawHtmlInput('');
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
        }
        setXmlOutput('');
        setToast({ msg: 'Editor cleared', type: 'info' });
    };

    // Load sample content
    const handleLoadSample = () => {
        setEditorHtml(SAMPLE_WORD_HTML);
        setRawHtmlInput(SAMPLE_WORD_HTML);
        if (editorRef.current) {
            editorRef.current.innerHTML = SAMPLE_WORD_HTML;
        }
        setToast({ msg: 'Sample snippet loaded', type: 'success' });
    };

    /**
     * MAIN PARSER ENGINE: Rich Text / HTML -> Clean XML
     */
    const convertHtmlToXml = useCallback((html: string, opts: ConversionOptions): string => {
        if (!html || !html.trim()) return '';

        // Tag mappings based on selected schema
        const tagMap = {
            elsevier: {
                para: 'ce:para',
                bold: 'ce:bold',
                italic: 'ce:italic',
                sup: 'ce:sup',
                inf: 'ce:inf',
                underline: 'ce:underline',
                smallCaps: 'ce:small-caps',
                title: 'ce:section-title',
                label: 'ce:label',
                list: 'ce:list',
                listItem: 'ce:list-item',
                table: 'ce:table',
                tbody: 'tbody',
                tr: 'row',
                td: 'entry',
                th: 'entry'
            },
            jats: {
                para: 'p',
                bold: 'bold',
                italic: 'italic',
                sup: 'sup',
                inf: 'sub',
                underline: 'u',
                smallCaps: 'sc',
                title: 'title',
                label: 'label',
                list: 'list',
                listItem: 'list-item',
                table: 'table',
                tbody: 'tbody',
                tr: 'tr',
                td: 'td',
                th: 'th'
            },
            generic: {
                para: 'p',
                bold: 'b',
                italic: 'i',
                sup: 'sup',
                inf: 'sub',
                underline: 'u',
                smallCaps: 'sc',
                title: 'heading',
                label: 'label',
                list: 'list',
                listItem: 'item',
                table: 'table',
                tbody: 'tbody',
                tr: 'tr',
                td: 'td',
                th: 'th'
            }
        }[opts.schema];

        let paraCounter = 0;
        const getNextParaIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.paraIdPrefix || 'p';
            const idVal = `${prefix}${opts.paraIdStart + paraCounter * opts.paraIdStep}`;
            paraCounter++;
            return ` id="${idVal}"`;
        };

        let listCounter = 0;
        const getNextListIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.listIdPrefix || 'l';
            const idVal = `${prefix}${opts.paraIdStart + listCounter * opts.paraIdStep}`;
            listCounter++;
            return ` id="${idVal}"`;
        };

        let listItemCounter = 0;
        const getNextListItemIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.listItemIdPrefix || 'li';
            const idVal = `${prefix}${opts.paraIdStart + listItemCounter * opts.paraIdStep}`;
            listItemCounter++;
            return ` id="${idVal}"`;
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const container = doc.body.firstElementChild || doc.body;

        const BLOCK_TAGS = new Set([
            'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'li', 'table', 'tbody', 'tr', 'td', 'th',
            'blockquote', 'section', 'article', 'header', 'footer', 'hr'
        ]);

        const hasBlockChildren = (el: HTMLElement): boolean => {
            return Array.from(el.children).some(child => 
                BLOCK_TAGS.has(child.tagName.toLowerCase())
            );
        };

        // Recursive processor for inline nodes (text, b, i, sup, sub, u, span, font, etc.)
        const processInlineNode = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent || '';
                text = text.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ');
                if (opts.encodeEntities) {
                    text = text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }
                return text;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const el = node as HTMLElement;
            const tagName = el.tagName.toLowerCase();

            // Ignore MS Word junk tags
            if (
                tagName === 'style' || 
                tagName === 'script' || 
                tagName === 'xml' || 
                tagName.startsWith('o:') || 
                tagName.startsWith('v:') || 
                tagName.startsWith('w:')
            ) {
                return '';
            }

            if (tagName === 'br') {
                return ' ';
            }

            const style = el.getAttribute('style') || '';
            const isBold = tagName === 'b' || tagName === 'strong' || /font-weight\s*:\s*(bold|[7-9]00)/i.test(style) || /mso-bidi-font-weight\s*:\s*bold/i.test(style);
            const isItalic = tagName === 'i' || tagName === 'em' || /font-style\s*:\s*italic/i.test(style) || /mso-bidi-font-style\s*:\s*italic/i.test(style);
            const isSup = tagName === 'sup' || /vertical-align\s*:\s*super/i.test(style) || /position\s*:\s*relative;\s*top\s*:/i.test(style);
            const isSub = tagName === 'sub' || tagName === 'inf' || /vertical-align\s*:\s*sub/i.test(style);
            const isUnderline = tagName === 'u' || /text-decoration\s*:\s*underline/i.test(style);
            const isSmallCaps = /font-variant\s*:\s*small-caps/i.test(style);

            let inner = Array.from(el.childNodes)
                .map(child => processInlineNode(child))
                .join('');

            if (!inner.trim()) return '';

            let wrapped = inner;
            if (isSmallCaps) wrapped = `<${tagMap.smallCaps}>${wrapped}</${tagMap.smallCaps}>`;
            if (isUnderline) wrapped = `<${tagMap.underline}>${wrapped}</${tagMap.underline}>`;
            if (isSub) wrapped = `<${tagMap.inf}>${wrapped}</${tagMap.inf}>`;
            if (isSup) wrapped = `<${tagMap.sup}>${wrapped}</${tagMap.sup}>`;
            if (isItalic) wrapped = `<${tagMap.italic}>${wrapped}</${tagMap.italic}>`;
            if (isBold) wrapped = `<${tagMap.bold}>${wrapped}</${tagMap.bold}>`;

            return wrapped;
        };

        const LIST_MARKER_REGEX = /^(\s*(?:<[^>]+>\s*)*)(?:[•\*\-\u2013\u2014]|\d+[\.\)]|\([0-9a-zA-Z]+\)|[a-zA-Z][\.\)])\s+/i;

        const isListParagraph = (el: HTMLElement, rawContent: string): boolean => {
            if (el.classList.contains('MsoListParagraph') || /mso-list/i.test(el.getAttribute('style') || '')) {
                return true;
            }
            return LIST_MARKER_REGEX.test(rawContent);
        };

        const extractLabel = (rawText: string): { labelVal: string; cleanText: string } => {
            const match = rawText.match(/^(\s*(?:<[^>]+>\s*)*)([•\*\-\u2013\u2014]|\d+[\.\)]|\([0-9a-zA-Z]+\)|[a-zA-Z][\.\)])\s*/i);
            if (!match) return { labelVal: '', cleanText: rawText };

            const rawMarker = match[2];
            const cleanText = rawText.replace(/^(\s*(?:<[^>]+>\s*)*)(?:[•\*\-\u2013\u2014]|\d+[\.\)]|\([0-9a-zA-Z]+\)|[a-zA-Z][\.\)])\s*/i, '$1').trim();

            let labelVal = rawMarker.replace(/^[\(\s]+|[\.\)\s]+$/g, '');
            if (!labelVal && rawMarker) labelVal = rawMarker;

            return { labelVal, cleanText };
        };

        const processListNode = (listEl: HTMLElement, listDepth = 0): string => {
            const listItemsXml: string[] = [];
            const children = Array.from(listEl.childNodes);

            const tagName = listEl.tagName.toLowerCase();
            const isOrdered = tagName === 'ol';
            const listTypeAttr = (listEl.getAttribute('type') || '').toLowerCase();
            const listStyle = (listEl.getAttribute('style') || '').toLowerCase();
            const isUnlabelledClass = listEl.classList.contains('unlabelled') || listEl.classList.contains('unstyled');

            // Determine base list category
            let baseCategory: 'bullet' | 'number' | 'alpha' | 'simple' = 'bullet';
            if (listTypeAttr === 'unstyled' || listTypeAttr === 'none' || isUnlabelledClass || listStyle.includes('list-style-type: none') || listStyle.includes('list-style: none')) {
                baseCategory = 'simple';
            } else if (isOrdered) {
                if (listTypeAttr === 'a' || listTypeAttr === 'lower-alpha' || listTypeAttr === 'upper-alpha' || listStyle.includes('alpha') || listStyle.includes('letter')) {
                    baseCategory = 'alpha';
                } else {
                    baseCategory = 'number';
                }
            } else {
                baseCategory = 'bullet';
            }

            let category = baseCategory;
            let itemIdx = 0;

            children.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const childEl = child as HTMLElement;
                    const childTag = childEl.tagName.toLowerCase();

                    if (childTag === 'li') {
                        let inlineText = '';
                        const nestedListElements: HTMLElement[] = [];

                        Array.from(childEl.childNodes).forEach(liChild => {
                            if (liChild.nodeType === Node.ELEMENT_NODE) {
                                const liChildTag = (liChild as HTMLElement).tagName.toLowerCase();
                                if (liChildTag === 'ul' || liChildTag === 'ol') {
                                    nestedListElements.push(liChild as HTMLElement);
                                    return;
                                }
                            }
                            inlineText += processInlineNode(liChild);
                        });

                        inlineText = inlineText.trim();

                        const { labelVal: extractedLabel, cleanText } = extractLabel(inlineText);

                        // If labelVal is present in text, refine category if not unlabelled
                        if (extractedLabel && baseCategory !== 'simple') {
                            if (/^\d+$/.test(extractedLabel)) {
                                category = 'number';
                            } else if (/^[a-zA-Z]$/.test(extractedLabel)) {
                                category = 'alpha';
                            } else if (['•', '*', '-', '–', '—'].includes(extractedLabel)) {
                                category = 'bullet';
                            }
                        }

                        let finalLabel = '';
                        if (opts.addListLabels && category !== 'simple') {
                            if (extractedLabel) {
                                finalLabel = extractedLabel;
                            } else {
                                if (category === 'number') {
                                    finalLabel = `${itemIdx + 1}`;
                                } else if (category === 'alpha') {
                                    if (listTypeAttr === 'a' || listTypeAttr === 'lower-alpha' || (!listTypeAttr && listDepth % 2 === 1)) {
                                        finalLabel = String.fromCharCode(97 + (itemIdx % 26));
                                    } else if (listTypeAttr === 'a') {
                                        finalLabel = String.fromCharCode(65 + (itemIdx % 26));
                                    } else {
                                        finalLabel = String.fromCharCode(97 + (itemIdx % 26));
                                    }
                                } else if (category === 'bullet') {
                                    finalLabel = '•';
                                }
                            }
                        }

                        itemIdx++;

                        const paraIdAttr = getNextParaIdAttr();
                        const listItemIdAttr = getNextListItemIdAttr();
                        const labelXml = (opts.addListLabels && finalLabel) ? `\n    <${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';

                        const nestedXmls = nestedListElements
                            .map(nl => processListNode(nl, listDepth + 1))
                            .filter(Boolean);

                        if (nestedXmls.length > 0) {
                            const combinedNested = nestedXmls.join('\n');
                            if (opts.embedListInPara) {
                                listItemsXml.push(
                                    `  <${tagMap.listItem}${listItemIdAttr}>${labelXml}\n    <${tagMap.para}${paraIdAttr}>${cleanText}\n${combinedNested}\n    </${tagMap.para}>\n  </${tagMap.listItem}>`
                                );
                            } else {
                                listItemsXml.push(
                                    `  <${tagMap.listItem}${listItemIdAttr}>${labelXml}\n    <${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>\n${combinedNested}\n  </${tagMap.listItem}>`
                                );
                            }
                        } else {
                            listItemsXml.push(
                                `  <${tagMap.listItem}${listItemIdAttr}>${labelXml}\n    <${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>\n  </${tagMap.listItem}>`
                            );
                        }
                    } else if (childTag === 'ul' || childTag === 'ol') {
                        const nestedXml = processListNode(childEl, listDepth + 1);
                        if (nestedXml) {
                            if (listItemsXml.length > 0) {
                                const lastIdx = listItemsXml.length - 1;
                                const lastItem = listItemsXml[lastIdx];
                                if (opts.embedListInPara) {
                                    const paraCloseRegex = new RegExp(`</${tagMap.para}>\n  </${tagMap.listItem}>$`, 'i');
                                    if (paraCloseRegex.test(lastItem)) {
                                        listItemsXml[lastIdx] = lastItem.replace(
                                            paraCloseRegex,
                                            `\n${nestedXml}\n    </${tagMap.para}>\n  </${tagMap.listItem}>`
                                        );
                                    } else {
                                        const listItemIdAttr = getNextListItemIdAttr();
                                        listItemsXml.push(`  <${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n  </${tagMap.listItem}>`);
                                    }
                                } else {
                                    const itemCloseRegex = new RegExp(`</${tagMap.listItem}>$`, 'i');
                                    if (itemCloseRegex.test(lastItem)) {
                                        listItemsXml[lastIdx] = lastItem.replace(
                                            itemCloseRegex,
                                            `\n${nestedXml}\n  </${tagMap.listItem}>`
                                        );
                                    } else {
                                        const listItemIdAttr = getNextListItemIdAttr();
                                        listItemsXml.push(`  <${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n  </${tagMap.listItem}>`);
                                    }
                                }
                            } else {
                                const listItemIdAttr = getNextListItemIdAttr();
                                listItemsXml.push(`  <${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n  </${tagMap.listItem}>`);
                            }
                        }
                    }
                }
            });

            if (listItemsXml.length === 0) return '';
            const listIdAttr = getNextListIdAttr();

            let listTypeAttrStr = '';
            if (opts.schema !== 'elsevier') {
                let listTypeAttrVal = 'bullet';
                if (category === 'simple') {
                    listTypeAttrVal = 'simple';
                } else if (category === 'number') {
                    listTypeAttrVal = opts.schema === 'jats' ? 'order' : 'number';
                } else if (category === 'alpha') {
                    listTypeAttrVal = opts.schema === 'jats' ? 'alpha-lower' : 'alpha';
                } else {
                    listTypeAttrVal = 'bullet';
                }
                listTypeAttrStr = ` list-type="${listTypeAttrVal}"`;
            }

            return `<${tagMap.list}${listIdAttr}${listTypeAttrStr}>\n${listItemsXml.join('\n')}\n</${tagMap.list}>`;
        };

        // Recursive processor for block containers (body, div, etc.)
        const processBlockContainer = (containerNode: Node): string[] => {
            const blocks: string[] = [];
            let inlineBuffer: string[] = [];
            let pendingListItems: { xml: string; category: 'bullet' | 'number' | 'alpha' | 'simple' }[] = [];

            const flushListItems = () => {
                if (pendingListItems.length > 0) {
                    const listIdAttr = getNextListIdAttr();
                    let listTypeAttrStr = '';
                    if (opts.schema !== 'elsevier') {
                        const cat = pendingListItems[0].category;
                        let listTypeAttrVal = 'bullet';
                        if (cat === 'simple') listTypeAttrVal = 'simple';
                        else if (cat === 'number') listTypeAttrVal = opts.schema === 'jats' ? 'order' : 'number';
                        else if (cat === 'alpha') listTypeAttrVal = opts.schema === 'jats' ? 'alpha-lower' : 'alpha';
                        else listTypeAttrVal = 'bullet';
                        listTypeAttrStr = ` list-type="${listTypeAttrVal}"`;
                    }

                    const itemXmls = pendingListItems.map(p => p.xml).join('\n');
                    blocks.push(`<${tagMap.list}${listIdAttr}${listTypeAttrStr}>\n${itemXmls}\n</${tagMap.list}>`);
                    pendingListItems = [];
                }
            };

            const flushInlineBuffer = () => {
                if (inlineBuffer.length === 0) return;
                const combined = inlineBuffer.join('').trim();
                inlineBuffer = [];
                if (!combined) return;

                // Split by newlines if raw plain text was inputted with multiple lines
                const textLines = combined.split(/\r?\n+/);
                textLines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine) {
                        if (LIST_MARKER_REGEX.test(trimmedLine)) {
                            const { labelVal: extractedLabel, cleanText } = extractLabel(trimmedLine);
                            let category: 'bullet' | 'number' | 'alpha' | 'simple' = 'bullet';
                            if (/^\d+$/.test(extractedLabel)) {
                                category = 'number';
                            } else if (/^[a-zA-Z]$/.test(extractedLabel)) {
                                category = 'alpha';
                            } else if (!extractedLabel) {
                                category = opts.addListLabels ? 'bullet' : 'simple';
                            }

                            let finalLabel = '';
                            if (opts.addListLabels && category !== 'simple') {
                                finalLabel = extractedLabel || '•';
                            }

                            const paraIdAttr = getNextParaIdAttr();
                            const listItemIdAttr = getNextListItemIdAttr();
                            const labelXml = (opts.addListLabels && finalLabel) ? `\n    <${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';
                            pendingListItems.push({
                                xml: `  <${tagMap.listItem}${listItemIdAttr}>${labelXml}\n    <${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>\n  </${tagMap.listItem}>`,
                                category
                            });
                        } else {
                            flushListItems();
                            const idAttr = getNextParaIdAttr();
                            blocks.push(`<${tagMap.para}${idAttr}>${trimmedLine}</${tagMap.para}>`);
                        }
                    }
                });
            };

            Array.from(containerNode.childNodes).forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child as HTMLElement;
                    const tagName = el.tagName.toLowerCase();

                    if (
                        tagName === 'style' || 
                        tagName === 'script' || 
                        tagName === 'xml' || 
                        tagName.startsWith('o:') || 
                        tagName.startsWith('v:') || 
                        tagName.startsWith('w:')
                    ) {
                        return;
                    }

                    if (tagName === 'br') {
                        flushInlineBuffer();
                        return;
                    }

                    if (BLOCK_TAGS.has(tagName)) {
                        flushInlineBuffer();

                        if ((tagName === 'p' || tagName === 'div') && !hasBlockChildren(el)) {
                            const content = processInlineNode(el).trim();
                            if (content) {
                                if (isListParagraph(el, content)) {
                                    const { labelVal: extractedLabel, cleanText } = extractLabel(content);
                                    let category: 'bullet' | 'number' | 'alpha' | 'simple' = 'bullet';
                                    if (/^\d+$/.test(extractedLabel)) {
                                        category = 'number';
                                    } else if (/^[a-zA-Z]$/.test(extractedLabel)) {
                                        category = 'alpha';
                                    } else if (!extractedLabel) {
                                        category = opts.addListLabels ? 'bullet' : 'simple';
                                    }

                                    let finalLabel = '';
                                    if (opts.addListLabels && category !== 'simple') {
                                        finalLabel = extractedLabel || '•';
                                    }

                                    const paraIdAttr = getNextParaIdAttr();
                                    const listItemIdAttr = getNextListItemIdAttr();
                                    const labelXml = (opts.addListLabels && finalLabel) ? `\n    <${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';
                                    pendingListItems.push({
                                        xml: `  <${tagMap.listItem}${listItemIdAttr}>${labelXml}\n    <${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>\n  </${tagMap.listItem}>`,
                                        category
                                    });
                                } else {
                                    flushListItems();
                                    const idAttr = getNextParaIdAttr();
                                    blocks.push(`<${tagMap.para}${idAttr}>${content}</${tagMap.para}>`);
                                }
                            }
                        } else if ((tagName === 'div' || tagName === 'p') && hasBlockChildren(el)) {
                            flushListItems();
                            const subBlocks = processBlockContainer(el);
                            blocks.push(...subBlocks);
                        } else if (/^h[1-6]$/.test(tagName)) {
                            flushListItems();
                            const content = processInlineNode(el).trim();
                            if (content) {
                                if (opts.convertHeadings) {
                                    blocks.push(`<${tagMap.title}>${content}</${tagMap.title}>`);
                                } else {
                                    const idAttr = getNextParaIdAttr();
                                    blocks.push(`<${tagMap.para}${idAttr}><${tagMap.bold}>${content}</${tagMap.bold}></${tagMap.para}>`);
                                }
                            }
                        } else if (tagName === 'ul' || tagName === 'ol') {
                            flushListItems();
                            const listXml = processListNode(el);
                            if (listXml) {
                                blocks.push(listXml);
                            }
                        } else if (tagName === 'table') {
                            flushListItems();
                            const rows: string[] = [];
                            const trElements = el.querySelectorAll('tr');
                            trElements.forEach(tr => {
                                const cells: string[] = [];
                                tr.querySelectorAll('td, th').forEach(td => {
                                    const cellContent = processInlineNode(td).trim();
                                    cells.push(`<${tagMap.td}>${cellContent}</${tagMap.td}>`);
                                });
                                if (cells.length > 0) {
                                    rows.push(`  <${tagMap.tr}>${cells.join('')}</${tagMap.tr}>`);
                                }
                            });
                            if (rows.length > 0) {
                                blocks.push(`<${tagMap.table}>\n<${tagMap.tbody}>\n${rows.join('\n')}\n</${tagMap.tbody}>\n</${tagMap.table}>`);
                            }
                        } else if (tagName === 'blockquote' || tagName === 'section' || tagName === 'article') {
                            flushListItems();
                            const subBlocks = processBlockContainer(el);
                            blocks.push(...subBlocks);
                        }
                        return;
                    }
                }

                // If not a block element, process as inline node
                const inlineXml = processInlineNode(child);
                if (inlineXml) {
                    inlineBuffer.push(inlineXml);
                }
            });

            flushInlineBuffer();
            flushListItems();
            return blocks;
        };

        const parsedBlocks = processBlockContainer(container);

        let mergedBlocks = parsedBlocks;
        if (opts.embedListInPara) {
            const finalBlocks: string[] = [];
            const paraCloseRegex = new RegExp(`</${tagMap.para}>$`, 'i');
            
            for (const block of parsedBlocks) {
                const isListBlock = block.startsWith(`<${tagMap.list}>`) || block.startsWith(`<${tagMap.list} `);
                if (isListBlock && finalBlocks.length > 0) {
                    const lastIdx = finalBlocks.length - 1;
                    const lastBlock = finalBlocks[lastIdx];
                    if (paraCloseRegex.test(lastBlock)) {
                        finalBlocks[lastIdx] = lastBlock.replace(paraCloseRegex, `\n${block}\n</${tagMap.para}>`);
                        continue;
                    }
                }
                finalBlocks.push(block);
            }
            mergedBlocks = finalBlocks;
        }

        let resultXml = mergedBlocks.join('\n');

        // Option: Trim whitespace inside inline tags: <ce:bold> term </ce:bold> -> <ce:bold>term</ce:bold>
        if (opts.trimInsideTags) {
            const inlineTags = [tagMap.bold, tagMap.italic, tagMap.sup, tagMap.inf, tagMap.underline];
            inlineTags.forEach(t => {
                const regex = new RegExp(`<${t}>\\s+([\\s\\S]*?)\\s+<\\/${t}>`, 'gi');
                resultXml = resultXml.replace(regex, ` <${t}>$1</${t}> `);

                const leftSpaceRegex = new RegExp(`<${t}>\\s+([\\s\\S]*?)<\\/${t}>`, 'gi');
                resultXml = resultXml.replace(leftSpaceRegex, ` <${t}>$1</${t}>`);

                const rightSpaceRegex = new RegExp(`<${t}>([\\s\\S]*?)\\s+<\\/${t}>`, 'gi');
                resultXml = resultXml.replace(rightSpaceRegex, `<${t}>$1</${t}> `);
            });
        }

        // Option: Merge adjacent identical inline tags
        if (opts.mergeAdjacentTags) {
            const inlineTags = [tagMap.bold, tagMap.italic, tagMap.sup, tagMap.inf, tagMap.underline];
            inlineTags.forEach(t => {
                const regex = new RegExp(`<\\/${t}>(\\s*)<${t}>`, 'gi');
                resultXml = resultXml.replace(regex, '$1');
            });
        }

        // Option: Clean empty tags
        if (opts.cleanEmptyTags) {
            resultXml = resultXml
                .replace(/<ce:bold>\s*<\/ce:bold>/gi, '')
                .replace(/<ce:italic>\s*<\/ce:italic>/gi, '')
                .replace(/<ce:sup>\s*<\/ce:sup>/gi, '')
                .replace(/<ce:inf>\s*<\/ce:inf>/gi, '')
                .replace(/<bold>\s*<\/bold>/gi, '')
                .replace(/<italic>\s*<\/italic>/gi, '')
                .replace(/<sup>\s*<\/sup>/gi, '')
                .replace(/<sub>\s*<\/sub>/gi, '')
                .replace(/<p>\s*<\/p>/gi, '')
                .replace(/<ce:para>\s*<\/ce:para>/gi, '');
        }

        // Clean multi-space artifacts
        resultXml = resultXml.replace(/ {2,}/g, ' ');

        // Option: Wrap in root container if requested
        if (opts.wrapInRoot && opts.rootTag) {
            const root = opts.rootTag.trim();
            resultXml = `<${root}>\n${resultXml.split('\n').map(l => '  ' + l).join('\n')}\n</${root}>`;
        }

        return resultXml.trim();
    }, []);

    // Perform scan & conversion whenever input or options change
    const handleScanAndConvert = useCallback(() => {
        const inputToUse = isHtmlMode ? rawHtmlInput : editorHtml;
        const xml = convertHtmlToXml(inputToUse, options);
        setXmlOutput(xml);
    }, [isHtmlMode, rawHtmlInput, editorHtml, options, convertHtmlToXml]);

    useEffect(() => {
        handleScanAndConvert();
    }, [handleScanAndConvert]);

    // Calculate tag statistics
    const stats = React.useMemo(() => {
        if (!xmlOutput) return { para: 0, bold: 0, italic: 0, sup: 0, inf: 0, totalTags: 0, chars: 0 };

        const paraMatch = xmlOutput.match(/<(ce:para|p)\b/gi) || [];
        const boldMatch = xmlOutput.match(/<(ce:bold|bold|b)\b/gi) || [];
        const italicMatch = xmlOutput.match(/<(ce:italic|italic|i)\b/gi) || [];
        const supMatch = xmlOutput.match(/<(ce:sup|sup)\b/gi) || [];
        const infMatch = xmlOutput.match(/<(ce:inf|sub)\b/gi) || [];
        const allTags = xmlOutput.match(/<[a-zA-Z0-9_:-]+\b/g) || [];

        return {
            para: paraMatch.length,
            bold: boldMatch.length,
            italic: italicMatch.length,
            sup: supMatch.length,
            inf: infMatch.length,
            totalTags: allTags.length,
            chars: xmlOutput.length
        };
    }, [xmlOutput]);

    // Copy XML to clipboard
    const handleCopy = () => {
        if (!xmlOutput) return;
        navigator.clipboard.writeText(xmlOutput);
        setIsCopied(true);
        setToast({ msg: 'XML copied to clipboard!', type: 'success' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Download XML file
    const handleDownload = () => {
        if (!xmlOutput) return;
        const blob = new Blob([xmlOutput], { type: 'text/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `word_converted_${options.schema}.xml`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ msg: 'XML file downloaded', type: 'success' });
    };

    // Safe Tokenizer for syntax highlighting without regex injection or broken HTML tags
    const highlightXml = (line: string) => {
        if (!line) return null;
        const tokens: React.ReactNode[] = [];
        const regex = /(<\/?[a-zA-Z0-9_:-]+(?:\s+[a-zA-Z0-9_:-]+="[^"]*")*\s*\/?>)|([^<]+)/g;
        let match;
        let key = 0;
        while ((match = regex.exec(line)) !== null) {
            if (match[1]) {
                tokens.push(
                    <span key={key++} className="text-indigo-400 font-bold">
                        {match[1]}
                    </span>
                );
            } else if (match[2]) {
                tokens.push(
                    <span key={key++} className="text-slate-100">
                        {match[2]}
                    </span>
                );
            }
        }
        return tokens;
    };

    return (
        <div className="max-w-[1700px] mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header Section */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
                            <FileCode size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
                                MS Word Rich Text to <span className="text-indigo-600">Elsevier CE XML Scanner</span>
                            </h1>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                Scan superscripts, subscripts, bold, italics, paragraphs & convert to Elsevier CE XML
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border shadow-xs active:scale-95 ${
                        showSettings
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/20'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                >
                    <Settings size={16} />
                    <span>XML Tagging & ID Settings</span>
                    {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {/* Collapsible Top Settings Drawer */}
            {showSettings && (
                <div className="mb-8 bg-white rounded-3xl border border-indigo-100 p-6 shadow-xl shadow-indigo-950/5 space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                <Sliders size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                                    XML Tagging & ID Configuration
                                </h3>
                                <p className="text-[11px] font-medium text-slate-400">
                                    Configure auto-generated element IDs and structural XML conversion rules
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowSettings(false)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                            title="Close Settings"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Paragraph & List ID Configuration */}
                        <div className="lg:col-span-5 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={options.addParagraphIds}
                                    onChange={(e) => setOptions(prev => ({ ...prev, addParagraphIds: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                                    <Hash size={14} className="text-indigo-600" />
                                    Auto-Add Element IDs (&lt;ce:para&gt;, &lt;ce:list&gt;, &lt;ce:list-item&gt;)
                                </span>
                            </label>

                            {options.addParagraphIds && (
                                <div className="space-y-3 pt-3 border-t border-indigo-100">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Para Prefix</label>
                                            <input
                                                type="text"
                                                value={options.paraIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">List Prefix</label>
                                            <input
                                                type="text"
                                                value={options.listIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, listIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Item Prefix</label>
                                            <input
                                                type="text"
                                                value={options.listItemIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, listItemIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Start ID</label>
                                            <input
                                                type="number"
                                                value={options.paraIdStart}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdStart: parseInt(e.target.value) || 0 }))}
                                                className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Step Increment</label>
                                            <input
                                                type="number"
                                                value={options.paraIdStep}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdStep: parseInt(e.target.value) || 1 }))}
                                                className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Structural & Tagging Toggles */}
                        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.wrapInRoot}
                                    onChange={(e) => setOptions(prev => ({ ...prev, wrapInRoot: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Wrap in Root Tag</span>
                            </label>

                            {options.wrapInRoot && (
                                <div className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 border border-slate-200/60">
                                    <span className="text-[10px] font-black uppercase text-slate-400 pl-2">Root:</span>
                                    <input
                                        type="text"
                                        value={options.rootTag}
                                        onChange={(e) => setOptions(prev => ({ ...prev, rootTag: e.target.value }))}
                                        className="flex-grow bg-white px-3 py-1 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800"
                                    />
                                </div>
                            )}

                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.addListLabels}
                                    onChange={(e) => setOptions(prev => ({ ...prev, addListLabels: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Generate List Item Labels (&lt;ce:label&gt;)</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.trimInsideTags}
                                    onChange={(e) => setOptions(prev => ({ ...prev, trimInsideTags: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Trim Trailing Spaces inside Tags</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.mergeAdjacentTags}
                                    onChange={(e) => setOptions(prev => ({ ...prev, mergeAdjacentTags: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Consolidate Duplicate Adjacent Tags</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.cleanEmptyTags}
                                    onChange={(e) => setOptions(prev => ({ ...prev, cleanEmptyTags: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Purge Empty Tags</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-all">
                                <input
                                    type="checkbox"
                                    checked={options.embedListInPara}
                                    onChange={(e) => setOptions(prev => ({ ...prev, embedListInPara: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">Nest Lists Inside Preceding Paragraph (&lt;ce:para&gt;)</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Workspace Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* LEFT COLUMN: Input & Rich Text Editor (6 Cols) */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
                        
                        {/* Editor Toolbar */}
                        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
                                <button
                                    onClick={() => execCommand('bold')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Bold (Ctrl+B)"
                                >
                                    <Bold size={16} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => execCommand('italic')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Italic (Ctrl+I)"
                                >
                                    <Italic size={16} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => execCommand('superscript')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Superscript"
                                >
                                    <Superscript size={16} strokeWidth={2.5} />
                                </button>
                                <button
                                    onClick={() => execCommand('subscript')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Subscript"
                                >
                                    <Subscript size={16} strokeWidth={2.5} />
                                </button>
                                <button
                                    onClick={() => execCommand('underline')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Underline"
                                >
                                    <Underline size={16} strokeWidth={2.5} />
                                </button>
                                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                                <button
                                    onClick={() => execCommand('formatBlock', 'p')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40 text-xs font-black uppercase"
                                    title="Paragraph"
                                >
                                    <Type size={16} />
                                </button>
                                <button
                                    onClick={() => execCommand('insertUnorderedList')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Bulleted List (•)"
                                >
                                    <List size={16} />
                                </button>
                                <button
                                    onClick={() => execCommand('insertOrderedList')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Numbered List (1, 2, 3)"
                                >
                                    <ListOrdered size={16} />
                                </button>
                                <button
                                    onClick={() => execCommand('insertLetteredList')}
                                    disabled={isHtmlMode}
                                    className="px-2 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40 text-xs font-black font-mono"
                                    title="Lettered List (a, b, c)"
                                >
                                    a.
                                </button>
                                <button
                                    onClick={() => execCommand('insertUnlabelledList')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Unlabelled List (Plain / Simple)"
                                >
                                    <ListFilter size={16} />
                                </button>
                                <button
                                    onClick={() => execCommand('indent')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Indent (Nest List)"
                                >
                                    <Indent size={16} />
                                </button>
                                <button
                                    onClick={() => execCommand('outdent')}
                                    disabled={isHtmlMode}
                                    className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-40"
                                    title="Outdent (Unnest List)"
                                >
                                    <Outdent size={16} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsHtmlMode(!isHtmlMode)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${isHtmlMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    title="Toggle Source Code / Rich Canvas"
                                >
                                    <Code size={12} />
                                    <span>{isHtmlMode ? 'HTML Source' : 'Rich Canvas'}</span>
                                </button>

                                <button
                                    onClick={handleLoadSample}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-indigo-200"
                                >
                                    <Sparkles size={12} />
                                    <span>Sample Word</span>
                                </button>

                                <button
                                    onClick={handleClear}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                    title="Clear Content"
                                >
                                    <Eraser size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Editor Canvas Body */}
                        <div className="flex-grow p-6 overflow-y-auto bg-white custom-scrollbar relative">
                            {!isHtmlMode ? (
                                <div
                                    ref={editorRef}
                                    contentEditable
                                    onInput={handleEditorInput}
                                    className="w-full h-full min-h-[400px] outline-none text-slate-800 font-serif text-base leading-relaxed select-text placeholder:text-slate-300 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ul.unlabelled]:list-none [&_ul[type=unstyled]]:list-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_ol[type=a]]:list-[lower-alpha] [&_ol[type=A]]:list-[upper-alpha] [&_ol[type=unstyled]]:list-none [&_li]:my-1"
                                    style={{ minHeight: '100%' }}
                                />
                            ) : (
                                <textarea
                                    value={rawHtmlInput}
                                    onChange={(e) => {
                                        setRawHtmlInput(e.target.value);
                                        setEditorHtml(e.target.value);
                                    }}
                                    className="w-full h-full min-h-[400px] outline-none font-mono text-xs text-slate-800 bg-slate-900/5 p-4 rounded-2xl resize-none leading-relaxed border border-slate-200"
                                    placeholder="Paste text or raw HTML here..."
                                />
                            )}
                        </div>

                        {/* Editor Footer Help Bar */}
                        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5 text-indigo-600">
                                <Zap size={12} />
                                Paste from MS Word or Plain Text directly
                            </span>
                            <span>{editorHtml.length} characters</span>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Scanned XML Output & Preview (6 Cols) */}
                <div className="lg:col-span-6 flex flex-col gap-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
                        
                        {/* Output Header Tabs & Actions */}
                        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200">
                                <button
                                    onClick={() => setActiveTab('code')}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'code' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <Code size={14} />
                                    <span>XML Highlighted</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('raw')}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'raw' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <Type size={14} />
                                    <span>Raw Text</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('stats')}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    <Layers size={14} />
                                    <span>Tag Audit</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopy}
                                    disabled={!xmlOutput}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs active:scale-95 ${isCopied ? 'bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
                                >
                                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                    <span>{isCopied ? 'Copied!' : 'Copy XML'}</span>
                                </button>

                                <button
                                    onClick={handleDownload}
                                    disabled={!xmlOutput}
                                    className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-all border border-indigo-200"
                                    title="Download XML File"
                                >
                                    <Download size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Output Panel Content */}
                        <div className="flex-grow p-6 overflow-y-auto bg-slate-950 text-slate-100 font-mono text-xs custom-scrollbar relative">
                            {activeTab === 'code' && (
                                <div className="space-y-1">
                                    {xmlOutput ? (
                                        <div className="font-mono text-xs leading-relaxed">
                                            {xmlOutput.split('\n').map((line, idx) => (
                                                <div key={idx} className="flex hover:bg-slate-900/80 px-2 py-1 rounded transition-colors">
                                                    <span className="w-12 text-slate-600 select-none text-[10px] pr-3 text-right flex-shrink-0 font-mono">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="whitespace-pre-wrap break-all">
                                                        {highlightXml(line)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-600 py-24">
                                            <AlertCircle size={32} className="mb-2 opacity-50" />
                                            <p className="text-xs uppercase font-bold tracking-widest">No Content to Convert</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'raw' && (
                                <textarea
                                    readOnly
                                    value={xmlOutput}
                                    className="w-full h-full min-h-[500px] bg-slate-900 text-emerald-400 p-4 font-mono text-xs rounded-2xl border border-slate-800 outline-none resize-none leading-relaxed select-all"
                                />
                            )}

                            {activeTab === 'stats' && (
                                <div className="space-y-6 font-sans">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Paragraphs</span>
                                            <span className="text-2xl font-black text-indigo-400">{stats.para}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Bold Tags</span>
                                            <span className="text-2xl font-black text-emerald-400">{stats.bold}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Italics Tags</span>
                                            <span className="text-2xl font-black text-amber-400">{stats.italic}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Superscripts</span>
                                            <span className="text-2xl font-black text-cyan-400">{stats.sup}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Subscripts</span>
                                            <span className="text-2xl font-black text-rose-400">{stats.inf}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Total XML Tags</span>
                                            <span className="text-2xl font-black text-purple-400">{stats.totalTags}</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                                            Structure & Entity Diagnostics
                                        </h4>
                                        <div className="space-y-2 text-xs text-slate-400">
                                            <div className="flex justify-between py-1 border-b border-slate-800">
                                                <span>Selected Namespace Schema:</span>
                                                <span className="font-bold text-slate-200 uppercase">{options.schema}</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-b border-slate-800">
                                                <span>Paragraph IDs Enabled:</span>
                                                <span className="font-bold text-slate-200">{options.addParagraphIds ? `Yes (${options.paraIdPrefix}${options.paraIdStart}, step ${options.paraIdStep})` : 'No'}</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-b border-slate-800">
                                                <span>Root Container:</span>
                                                <span className="font-bold text-slate-200">{options.wrapInRoot ? `<${options.rootTag}>` : 'None (Fragment)'}</span>
                                            </div>
                                            <div className="flex justify-between py-1">
                                                <span>Total Characters Output:</span>
                                                <span className="font-bold text-slate-200">{stats.chars}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Output Footer Status Bar */}
                        <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                                <CheckCircle2 size={12} />
                                XML Output Ready ({stats.totalTags} tags generated)
                            </span>
                            <span>Schema: {options.schema.toUpperCase()}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default WordToXml;
