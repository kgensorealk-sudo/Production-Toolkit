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
    CheckCircle2,
    Bookmark,
    ShieldAlert,
    Tag
} from 'lucide-react';
import Toast from '../components/Toast';
import {validateWordScannerCeFragment, type WordScannerDtdVersion} from '../utils/wordScannerDtd';
import {sanitizeWordScannerHtml} from '../utils/wordScannerHtml';

type NamespaceSchema = 'elsevier' | 'jats' | 'generic';

interface ConversionOptions {
    schema: NamespaceSchema;
    dtdVersion: WordScannerDtdVersion;
    outputScope: 'all' | 'captures';
    wrapInParagraphs: boolean;
    addParagraphIds: boolean;
    paraIdPrefix: string;
    sectionTitleIdPrefix: string;
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

const SAMPLE_WORD_HTML = `<p>This is a text example with Research & Development, <b>bold</b>, <i>italic</i>, <u>underline</u>, <sup>superscript</sup>, and <sub>subscript</sub> formatting.</p>
<p><b>1. Bulleted List with Nested Sub-List:</b></p>
<ul>
  <li>First main bullet item with <b>bold &amp; key</b> highlights
    <ul>
      <li>Sub-item A with <sup>superscript</sup> details</li>
      <li>Sub-item B with <sub>subscript</sub> reference</li>
    </ul>
  </li>
  <li>Second main bullet item with <i>italic</i> notes</li>
</ul>
<p><b>2. Numbered List (1, 2, 3) with Nested Lettered Sub-List:</b></p>
<ol type="1">
  <li>Primary research &amp; development objective
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
<div data-ce-type="acknowledgment" data-ce-title="Acknowledgements" class="ce-capture-box my-3 p-3.5 bg-amber-50/70 border-l-4 border-amber-500 rounded-r-2xl border border-amber-200/80 shadow-xs relative group select-text">
  <div contenteditable="false" class="ce-capture-badge flex items-center justify-between pb-1.5 mb-2 border-b border-amber-200/60 select-none">
    <span class="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
      Captured as: Acknowledgements
    </span>
    <span class="text-[9px] text-amber-600 font-bold uppercase tracking-wider">CE XML</span>
  </div>
  <p>The authors would like to thank BM Impianti S.r.l. for providing the real-world data of the PV-BESS systems, as well as the energy consumption profiles of their clients.</p>
</div>
<p>You can also use the toolbar buttons to switch list styles, indent/outdent nested items, or highlight text and use "Capture as..." to wrap sections.</p>`;

export const WordToXml: React.FC = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const savedCaptureRangeRef = useRef<Range | null>(null);
    const [editorHtml, setEditorHtml] = useState<string>('');
    const [isHtmlMode, setIsHtmlMode] = useState<boolean>(false);
    const [rawHtmlInput, setRawHtmlInput] = useState<string>('');
    
    const [xmlOutput, setXmlOutput] = useState<string>('');
    const [conversionError, setConversionError] = useState('');
    const [activeTab, setActiveTab] = useState<'code' | 'raw' | 'stats'>('code');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);

    const [options, setOptions] = useState<ConversionOptions>({
        schema: 'elsevier',
        dtdVersion: '5.7',
        outputScope: 'all',
        wrapInParagraphs: false,
        addParagraphIds: true,
        paraIdPrefix: 'p',
        sectionTitleIdPrefix: 'st',
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
        encodeEntities: true,
        prettyPrint: true,
        convertHeadings: true,
        embedListInPara: true
    });

    // Synchronize contentEditable initial content
    useEffect(() => {
        if (editorRef.current && !isHtmlMode) {
            editorRef.current.innerHTML = sanitizeWordScannerHtml(editorHtml);
        }
    }, [isHtmlMode]);

    // Handle input change in contentEditable
    const handleEditorInput = () => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            const text = (editorRef.current.textContent || '').replace(/\u00a0/g, ' ').trim();
            const hasMedia = editorRef.current.querySelector('img, table, iframe, svg') !== null;

            if (!text && !hasMedia) {
                setEditorHtml('');
                setRawHtmlInput('');
                if (html === '<br>' || html === '<p><br></p>' || html === '<div><br></div>') {
                    editorRef.current.innerHTML = '';
                }
            } else {
                setEditorHtml(html);
                setRawHtmlInput(html);
            }
        }
    };
    const handleEditorPaste = (event:React.ClipboardEvent<HTMLDivElement>) => {
        const html=event.clipboardData.getData('text/html');
        if(!html)return;
        event.preventDefault();
        const clean=sanitizeWordScannerHtml(html);
        if(!document.execCommand('insertHTML',false,clean)){
            const selection=window.getSelection();
            if(!selection?.rangeCount || !editorRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer))return;
            const range=selection.getRangeAt(0);range.deleteContents();
            const doc=new DOMParser().parseFromString(clean,'text/html');
            const text=document.createTextNode(event.clipboardData.getData('text/plain') || doc.body.textContent || '');
            range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
            setToast({msg:'Pasted as plain text because this browser could not insert formatted HTML.',type:'warn'});
        }
        handleEditorInput();
    };

    // Calculate accurate character count for empty or formatted editor state
    const getCharCount = () => {
        if (isHtmlMode) {
            if (!rawHtmlInput || rawHtmlInput === '<br>' || rawHtmlInput === '<p><br></p>') return 0;
            const cleanText = rawHtmlInput.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (!cleanText && !/<(img|table|iframe|svg)\b/i.test(rawHtmlInput)) return 0;
            return rawHtmlInput.length;
        }

        if (!editorHtml || editorHtml === '<br>' || editorHtml === '<p><br></p>' || editorHtml === '<div><br></div>') return 0;
        const content = editorRef.current?.cloneNode(true) as HTMLElement | undefined;
        content?.querySelectorAll('.ce-capture-badge').forEach(badge=>badge.remove());
        const text = content ? (content.textContent || '').replace(/\u00a0/g, ' ').trim() : editorHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        const hasMedia = /<(img|table|iframe|svg)\b/i.test(editorHtml);
        if (!text && !hasMedia) return 0;

        return text.length;
    };

    const [isCaptureMenuOpen, setIsCaptureMenuOpen] = useState<boolean>(false);
    useEffect(() => {
        const rememberSelection = () => {
            const selection=window.getSelection();
            if(selection?.rangeCount && editorRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer))
                savedCaptureRangeRef.current=selection.getRangeAt(0).cloneRange();
        };
        document.addEventListener('selectionchange',rememberSelection);
        return () => document.removeEventListener('selectionchange',rememberSelection);
    }, []);

    // Capture highlighted text or section block as specific CE XML section
    const captureSelectionAs = (type: string) => {
        if (isHtmlMode || !editorRef.current) return;

        const selection = window.getSelection();
        const current=selection?.rangeCount ? selection.getRangeAt(0) : null;
        const range=current && editorRef.current.contains(current.commonAncestorContainer) ? current : savedCaptureRangeRef.current;
        if (!range || !editorRef.current.contains(range.commonAncestorContainer)) {
            setToast({msg:'Select text in the rich-text editor before capturing it.',type:'warn'});return;
        }
        if(type==='highlights' && (range.collapsed || !range.toString().trim())) {
            setToast({msg:'Select the highlight text before choosing Highlights.',type:'warn'});return;
        }

        if (type === 'clear') {
            let node: Node | null = range.commonAncestorContainer;
            while (node && node !== editorRef.current) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    if (el.hasAttribute('data-ce-type')) {
                        const parent = el.parentNode;
                        if (parent) {
                            while (el.firstChild) {
                                if ((el.firstChild as HTMLElement).classList?.contains('ce-capture-badge')) {
                                    el.removeChild(el.firstChild);
                                    continue;
                                }
                                parent.insertBefore(el.firstChild, el);
                            }
                            parent.removeChild(el);
                        }
                        break;
                    }
                }
                node = node.parentNode;
            }
            handleEditorInput();
            setToast({ msg: 'Removed section wrapper', type: 'info' });
            return;
        }

        // Check if statement/selection is already tagged within any captured section/box
        let existingType: string | null = null;
        let checkNode: Node | null = range.commonAncestorContainer;
        while (checkNode && checkNode !== editorRef.current) {
            if (checkNode.nodeType === Node.ELEMENT_NODE) {
                const el = checkNode as HTMLElement;
                if (el.hasAttribute('data-ce-type') || el.classList.contains('ce-capture-box')) {
                    existingType = el.getAttribute('data-ce-type') || 'section';
                    break;
                }
            }
            checkNode = checkNode.parentNode;
        }

        if (!existingType && range.cloneContents) {
            try {
                const frag = range.cloneContents();
                if (frag.querySelector) {
                    const found = frag.querySelector('[data-ce-type], .ce-capture-box');
                    if (found) {
                        existingType = found.getAttribute('data-ce-type') || 'section';
                    }
                }
            } catch {
                // ignore range errors if any
            }
        }

        if (existingType) {
            const readableName = existingType === 'acknowledgment'
                ? 'Acknowledgement'
                : existingType === 'conflict-of-interest'
                ? 'Conflict of Interest'
                : existingType === 'highlights'
                ? 'Highlights'
                : existingType === 'jel' || existingType === 'jel-classifications'
                ? 'JEL Classifications'
                : existingType.charAt(0).toUpperCase() + existingType.slice(1);
            setToast({
                msg: `Statement is already tagged within ${readableName} and cannot be re-tagged with another tool.`,
                type: 'warn'
            });
            return;
        }

        let defaultTitle = 'Acknowledgements';
        let label = 'Acknowledgement';
        if (type === 'abstract') {
            defaultTitle = 'Abstract';
            label = 'Abstract';
        } else if (type === 'appendix') {
            defaultTitle = 'Appendix A';
            label = 'Appendix';
        } else if (type === 'section') {
            defaultTitle = 'Section Title';
            label = 'Section';
        } else if (type === 'conflict-of-interest') {
            defaultTitle = 'Declaration of competing interest';
            label = 'Conflict of Interest';
        } else if (type === 'highlights') {
            defaultTitle = 'Highlights';
            label = 'Highlights';
        } else if (type === 'jel' || type === 'jel-classifications') {
            defaultTitle = 'JEL classifications';
            label = 'JEL Classifications';
        } else if (type === 'data-availability') {
            defaultTitle = 'Data availability';
            label = 'Data Availability';
        }

        let targetBlock: HTMLElement | null = null;
        let currNode: Node | null = range.commonAncestorContainer;

        while (currNode && currNode !== editorRef.current) {
            if (currNode.nodeType === Node.ELEMENT_NODE) {
                const tag = (currNode as HTMLElement).tagName.toLowerCase();
                if (tag === 'p' || tag === 'div' || tag === 'li' || /^h[1-6]$/.test(tag)) {
                    targetBlock = currNode as HTMLElement;
                    break;
                }
            }
            currNode = currNode.parentNode;
        }

        const isHighlights = type === 'highlights';

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-ce-type', type);
        wrapper.setAttribute('data-ce-title', defaultTitle);
        wrapper.className = isHighlights
            ? 'ce-capture-box my-3 p-3.5 bg-emerald-50/80 border-l-4 border-emerald-500 rounded-r-2xl border border-emerald-200/90 shadow-xs relative group select-text'
            : 'ce-capture-box my-3 p-3.5 bg-amber-50/70 border-l-4 border-amber-500 rounded-r-2xl border border-amber-200/80 shadow-xs relative group select-text';

        const badge = document.createElement('div');
        badge.contentEditable = 'false';
        badge.className = isHighlights
            ? 'ce-capture-badge flex items-center justify-between pb-1.5 mb-2 border-b border-emerald-200/70 select-none'
            : 'ce-capture-badge flex items-center justify-between pb-1.5 mb-2 border-b border-amber-200/60 select-none';

        if (isHighlights) {
            badge.innerHTML = `<span class="text-[10px] font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"/></svg> Captured as: ${label}</span><span class="text-[9px] text-emerald-700 font-bold uppercase tracking-wider bg-emerald-100/90 px-1.5 py-0.5 rounded-md">CE XML</span>`;
        } else {
            badge.innerHTML = `<span class="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg> Captured as: ${label}</span><span class="text-[9px] text-amber-600 font-bold uppercase tracking-wider">CE XML</span>`;
        }
        wrapper.appendChild(badge);

        let pTarget: HTMLElement | null = null;

        if (!range.collapsed) {
            // Clone the three ranges independently. This splits boundary paragraphs
            // and lists without placing block elements inside a new paragraph.
            const before=document.createRange(),after=document.createRange();
            before.selectNodeContents(editorRef.current);before.setEnd(range.startContainer,range.startOffset);
            after.selectNodeContents(editorRef.current);after.setStart(range.endContainer,range.endOffset);
            const prefix=before.cloneContents(),suffix=after.cloneContents();
            let contents=range.cloneContents();
            let context=range.commonAncestorContainer.nodeType===Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
            while(context && context!==editorRef.current && context.nodeType===Node.ELEMENT_NODE &&
                !/^(p|div|li|ul|ol|h[1-6]|table|td|th|section|article|blockquote)$/i.test((context as HTMLElement).tagName)){
                const format=context.cloneNode(false);format.appendChild(contents);
                contents=document.createDocumentFragment();contents.appendChild(format);context=context.parentNode;
            }
            if(contents.querySelector('p,div,ul,ol,li,h1,h2,h3,h4,h5,h6,table,blockquote'))wrapper.appendChild(contents);
            else {const paragraph=document.createElement('p');paragraph.appendChild(contents);wrapper.appendChild(paragraph);}
            editorRef.current.replaceChildren(prefix,wrapper,suffix);
            pTarget=wrapper.querySelector('p,li') || wrapper;
        } else if (targetBlock && targetBlock.parentNode && !targetBlock.hasAttribute('data-ce-type')) {
            targetBlock.parentNode.replaceChild(wrapper, targetBlock);
            wrapper.appendChild(targetBlock);
            pTarget = targetBlock;
        } else {
            const contents = range.extractContents();
            const p = document.createElement('p');
            if (contents.childNodes.length > 0) {
                p.appendChild(contents);
            }
            wrapper.appendChild(p);
            range.insertNode(wrapper);
            pTarget = p;
        }

        if (pTarget) {
            const cleanText = (pTarget.textContent || '').replace(/\u00a0/g, ' ').trim();
            if (!cleanText && !pTarget.querySelector('br')) {
                pTarget.innerHTML = '<br>';
            }
            const sel = window.getSelection();
            if (sel) {
                try {
                    const r = document.createRange();
                    r.selectNodeContents(pTarget);
                    r.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(r);
                    savedCaptureRangeRef.current=r.cloneRange();
                } catch {
                    // ignore
                }
            }
        }

        handleEditorInput();
        setToast({ msg: `Captured content as ${label}`, type: 'success' });
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
        savedCaptureRangeRef.current=null;
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
        savedCaptureRangeRef.current=null;
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
        const escapeXmlText=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(html))throw new Error('The input contains characters that XML cannot represent. Remove them before converting.');
        if(opts.addParagraphIds && (!Number.isInteger(opts.paraIdStart) || opts.paraIdStart<0 || opts.paraIdStart>9999 || !Number.isInteger(opts.paraIdStep) || opts.paraIdStep<1))
            throw new Error('ID start must be between 0000 and 9999, and ID step must be a positive integer.');
        const usedIds=new Set<string>();
        const allocateIdAttr=(prefix:string,start:number)=>{
            if(!Number.isInteger(start) || start<0 || !Number.isInteger(opts.paraIdStep) || opts.paraIdStep<1)throw new Error('ID start and step must be valid positive-range integers.');
            if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(prefix))throw new Error('ID prefixes must start with a letter or underscore and contain only XML name characters.');
            let num=start;
            while(num<=9999 && usedIds.has(prefix+String(num).padStart(4,'0')))num+=opts.paraIdStep;
            if(num>9999)throw new Error('No four-digit IDs remain for this prefix. Choose a lower starting ID.');
            const id=prefix+String(num).padStart(4,'0');usedIds.add(id);return ` id="${id}"`;
        };
        if(opts.wrapInRoot && !/^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/.test(opts.rootTag.trim()))
            throw new Error('Root tag must be a valid XML element name.');

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
            const num = opts.paraIdStart + paraCounter * opts.paraIdStep;
            paraCounter++;
            return allocateIdAttr(prefix,num);
        };

        let listCounter = 0;
        const getNextListIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.listIdPrefix || 'l';
            const num = opts.paraIdStart + listCounter * opts.paraIdStep;
            listCounter++;
            return allocateIdAttr(prefix,num);
        };

        let listItemCounter = 0;
        const getNextListItemIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.listItemIdPrefix || 'li';
            const num = opts.paraIdStart + listItemCounter * opts.paraIdStep;
            listItemCounter++;
            return allocateIdAttr(prefix,num);
        };

        let secTitleCounter = 0;
        const getNextSectionTitleIdAttr = (): string => {
            if (!opts.addParagraphIds) return '';
            const prefix = opts.sectionTitleIdPrefix || 'st';
            const num = opts.paraIdStart + secTitleCounter * opts.paraIdStep;
            secTitleCounter++;
            return allocateIdAttr(prefix,num);
        };

        let ackCounter = 0;
        let abstractCounter = 0;
        let appendixCounter = 0;
        let coiCounter = 0;
        let daCounter = 0;
        let secCounter = 0;
        let asCounter = 0;
        let spCounter = 0;
        let ksCounter = 0;
        let kwCounter = 0;
        let txCounter = 0;
        let captionCounter = 0;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        let container:HTMLElement = doc.body;
        if(opts.outputScope==='captures'){
            const selected=doc.createElement('div');
            Array.from(container.querySelectorAll('[data-ce-type]')).filter(element=>!element.parentElement?.closest('[data-ce-type]')).forEach(element=>selected.appendChild(element.cloneNode(true)));
            if(!selected.children.length)throw new Error('Capture a section first, or choose All input to convert the pasted text.');
            container=selected;
        }
        const unsupported=Array.from(container.querySelectorAll('img,svg,math,object,embed,iframe,video,audio')).find(element=>!element.closest('.ce-capture-badge'));
        if(unsupported)throw new Error(`The selected input contains ${unsupported.tagName.toLowerCase()} content that this text scanner cannot preserve. Select text only or convert that object with its dedicated tool.`);

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
        const processInlineNode = (node: Node, lineBreakTag?:string): string => {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent || '';
                text = text.replace(/[\r\n\t]+/g, ' ').replace(/\u00a0/g, ' ');
                text = text.replace(/ {2,}/g, ' ');
                // DOM text has already been decoded: an entity-looking sequence
                // here is literal text and must be escaped again for XML.
                return escapeXmlText(text);
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
                tagName === 'xml'
            ) {
                return '';
            }

            if (tagName === 'br') {
                return lineBreakTag || ' ';
            }

            const style = el.getAttribute('style') || '';
            const isBold = tagName === 'b' || tagName === 'strong' || /font-weight\s*:\s*(bold|[7-9]00)/i.test(style) || /mso-bidi-font-weight\s*:\s*bold/i.test(style);
            const isItalic = tagName === 'i' || tagName === 'em' || /font-style\s*:\s*italic/i.test(style) || /mso-bidi-font-style\s*:\s*italic/i.test(style);
            const isSup = tagName === 'sup' || /vertical-align\s*:\s*super/i.test(style);
            const isSub = tagName === 'sub' || tagName === 'inf' || /vertical-align\s*:\s*sub/i.test(style);
            const isUnderline = tagName === 'u' || /text-decoration\s*:\s*underline/i.test(style);
            const isSmallCaps = /font-variant\s*:\s*small-caps/i.test(style);

            let inner = Array.from(el.childNodes)
                .map(child => processInlineNode(child,lineBreakTag))
                .join('');

            if (!inner.trim()) return '';

            let wrapped = inner;
            if (isSmallCaps) wrapped = `<${tagMap.smallCaps}>${wrapped}</${tagMap.smallCaps}>`;
            if (isUnderline) wrapped = `<${tagMap.underline}>${wrapped}</${tagMap.underline}>`;
            if (isSub) wrapped = `<${tagMap.inf}>${wrapped}</${tagMap.inf}>`;
            if (isSup) wrapped = `<${tagMap.sup}>${wrapped}</${tagMap.sup}>`;
            if (isItalic) wrapped = `<${tagMap.italic}>${wrapped}</${tagMap.italic}>`;
            if (isBold) wrapped = `<${tagMap.bold}>${wrapped}</${tagMap.bold}>`;

            return lineBreakTag && /^(p|div|h[1-6])$/.test(tagName) ? lineBreakTag+wrapped+lineBreakTag : wrapped;
        };

        const collectInlineSegments=(root:HTMLElement):string[]=>{
            const result:string[]=[];
            const segment=doc.createRange();segment.setStart(root,0);segment.collapse(true);
            const flush=(node:Node,offset:number)=>{
                const slice=doc.createRange();slice.setStart(segment.startContainer,segment.startOffset);slice.setEnd(node,offset);
                const text=Array.from(slice.cloneContents().childNodes).map(child=>processInlineNode(child)).join('').trim();
                if(text)result.push(text);segment.setStart(node,offset);segment.collapse(true);
            };
            const visit=(node:Node)=>{
                if(node.nodeType!==Node.ELEMENT_NODE)return;
                const element=node as HTMLElement,parent=element.parentNode!,tag=element.tagName.toLowerCase();
                const offset=Array.prototype.indexOf.call(parent.childNodes,element);
                if(tag==='br'){flush(parent,offset);segment.setStart(parent,offset+1);segment.collapse(true);return;}
                const block=BLOCK_TAGS.has(tag);
                if(block){flush(parent,offset);segment.setStart(element,0);segment.collapse(true);}
                Array.from(element.childNodes).forEach(visit);
                if(block){flush(element,element.childNodes.length);segment.setStart(parent,offset+1);segment.collapse(true);}
            };
            Array.from(root.childNodes).forEach(visit);flush(root,root.childNodes.length);return result;
        };

        const LIST_MARKER_REGEX = /^(\s*(?:<[^>]+>\s*)*)(?:[•\*\-\u2013\u2014]|\d{1,3}[\.\)]|\((?:\d{1,2}|[a-zA-Z]|i{1,3}|iv|v|vi{0,3}|ix|x)\)|[a-zA-Z][\.\)])\s+/i;

        const isListParagraph = (el: HTMLElement, rawContent: string): boolean => {
            if (el.classList.contains('MsoListParagraph') || /mso-list/i.test(el.getAttribute('style') || '')) {
                return true;
            }
            return LIST_MARKER_REGEX.test(rawContent);
        };

        const extractLabel = (rawText: string): { labelVal: string; cleanText: string } => {
            const match = rawText.match(/^(\s*(?:<[^>]+>\s*)*)([•\*\-\u2013\u2014]|\d{1,3}[\.\)]|\((?:\d{1,2}|[a-zA-Z]|i{1,3}|iv|v|vi{0,3}|ix|x)\)|[a-zA-Z][\.\)])\s*/i);
            if (!match) return { labelVal: '', cleanText: rawText };

            const rawMarker = match[2];
            const cleanText = rawText.replace(/^(\s*(?:<[^>]+>\s*)*)(?:[•\*\-\u2013\u2014]|\d{1,3}[\.\)]|\((?:\d{1,2}|[a-zA-Z]|i{1,3}|iv|v|vi{0,3}|ix|x)\)|[a-zA-Z][\.\)])\s*/i, '$1').trim();

            let labelVal = rawMarker.replace(/^[\(\s]+|[\.\)\s]+$/g, '');
            if (!labelVal && rawMarker) labelVal = rawMarker;

            return { labelVal, cleanText };
        };

        const processListNode = (listEl: HTMLElement, listDepth = 0, customGetParaIdAttr?: () => string): string => {
            const getParaId = opts.schema==='elsevier' ? getNextParaIdAttr : customGetParaIdAttr || getNextParaIdAttr;
            const listItemsXml: string[] = [];
            const children = Array.from(listEl.childNodes);

            const tagName = listEl.tagName.toLowerCase();
            const isOrdered = tagName === 'ol';
            const rawListType = listEl.getAttribute('type') || '';
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
            const reversed=listEl.hasAttribute('reversed');
            const parsedStart=Number(listEl.getAttribute('start'));
            let ordinal=listEl.hasAttribute('start') && Number.isInteger(parsedStart) ? parsedStart : reversed ? listEl.querySelectorAll(':scope > li').length : 1;
            const orderedLabel=(value:number)=>{
                if(value<1)return String(value);
                if(rawListType==='i' || rawListType==='I' || listStyle.includes('roman')){
                    if(value>3999)return String(value);
                    let n=value,result='';
                    for(const [amount,symbol] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']] as const)
                        while(n>=amount){result+=symbol;n-=amount;}
                    return rawListType==='I' || listStyle.includes('upper-roman') ? result : result.toLowerCase();
                }
                if(baseCategory==='alpha'){
                    let n=value,result='';while(n>0){n--;result=String.fromCharCode(97+n%26)+result;n=Math.floor(n/26);}
                    return rawListType==='A' || listStyle.includes('upper-alpha') ? result.toUpperCase() : result;
                }
                return String(value);
            };

            children.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const childEl = child as HTMLElement;
                    const childTag = childEl.tagName.toLowerCase();

                    if (childTag === 'li') {
                        const explicitValue=Number(childEl.getAttribute('value'));
                        if(isOrdered && childEl.hasAttribute('value') && Number.isInteger(explicitValue))ordinal=explicitValue;
                        if(opts.schema==='elsevier'){
                            const parts:({text:string}|{list:HTMLElement})[]=[];let buffer='';
                            const flush=()=>{if(buffer.trim())parts.push({text:buffer.trim()});buffer='';};
                            const collect=(parent:HTMLElement)=>Array.from(parent.childNodes).forEach(node=>{
                                if(node.nodeType===Node.ELEMENT_NODE){
                                    const element=node as HTMLElement,tag=element.tagName.toLowerCase();
                                    if(tag==='ul'||tag==='ol'){flush();parts.push({list:element});return;}
                                    if(tag==='table')throw new Error('Tables inside list items need the dedicated table tool.');
                                    if(['p','div'].includes(tag)){
                                        flush();if(hasBlockChildren(element))collect(element);else {const text=processInlineNode(element).trim();if(text)parts.push({text});}return;
                                    }
                                }
                                buffer+=processInlineNode(node);
                            });
                            collect(childEl);flush();
                            const first=parts[0] && 'text' in parts[0]?parts[0]:null;
                            let marker=first?extractLabel(first.text):{labelVal:'',cleanText:''};
                            if(baseCategory==='bullet' && marker.labelVal && !['•','*','-','–','—'].includes(marker.labelVal))marker={labelVal:'',cleanText:first!.text};
                            if(first && marker.labelVal)first.text=marker.cleanText;
                            const label=opts.addListLabels && baseCategory!=='simple' ? marker.labelVal || (baseCategory==='bullet'?'•':orderedLabel(ordinal)) : '';
                            const paragraphs:string[]=[];
                            for(const part of parts){
                                if('text' in part){if(part.text)paragraphs.push(`<ce:para${getParaId()}>${part.text}</ce:para>`);}
                                else {
                                    const nested=processListNode(part.list,listDepth+1,customGetParaIdAttr);if(!nested)continue;
                                    const index=paragraphs.length-1;
                                    if(opts.embedListInPara && index>=0)paragraphs[index]=paragraphs[index].replace(/<\/ce:para>$/,nested+'</ce:para>');
                                    else paragraphs.push(`<ce:para${getParaId()}>${nested}</ce:para>`);
                                }
                            }
                            if(!paragraphs.length)paragraphs.push(`<ce:para${getParaId()}/>`);
                            listItemsXml.push(`<ce:list-item${getNextListItemIdAttr()}>${label?`<ce:label>${label}</ce:label>`:''}${paragraphs.join('')}</ce:list-item>`);
                            ordinal+=reversed?-1:1;return;
                        }
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

                        let { labelVal: extractedLabel, cleanText } = extractLabel(inlineText);

                        // If in a bullet list (<ul>), non-bullet text at the start of a line (e.g. "(002)" or "1.") is part of the content and shouldn't be stripped as a label
                        if (baseCategory === 'bullet' && extractedLabel && !['•', '*', '-', '–', '—'].includes(extractedLabel)) {
                            extractedLabel = '';
                            cleanText = inlineText;
                        }

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
                                    finalLabel = orderedLabel(ordinal);
                                } else if (category === 'alpha') {
                                    finalLabel = orderedLabel(ordinal);
                                } else if (category === 'bullet') {
                                    finalLabel = '•';
                                }
                            }
                        }

                        itemIdx++;
                        ordinal+=reversed?-1:1;

                        const paraIdAttr = getParaId();
                        const listItemIdAttr = getNextListItemIdAttr();
                        const labelXml = (opts.addListLabels && finalLabel) ? `\n<${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';
                        const itemParaContent = (opts.wrapInParagraphs !== false)
                            ? `<${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>`
                            : cleanText;

                        const nestedXmls = nestedListElements
                            .map(nl => processListNode(nl, listDepth + 1, customGetParaIdAttr))
                            .filter(Boolean);

                        if (nestedXmls.length > 0) {
                            const combinedNested = nestedXmls.join('\n');
                            if (opts.embedListInPara && opts.wrapInParagraphs !== false) {
                                listItemsXml.push(
                                    `<${tagMap.listItem}${listItemIdAttr}>${labelXml}\n<${tagMap.para}${paraIdAttr}>${cleanText}\n${combinedNested}\n</${tagMap.para}>\n</${tagMap.listItem}>`
                                );
                            } else {
                                listItemsXml.push(
                                    `<${tagMap.listItem}${listItemIdAttr}>${labelXml}\n${itemParaContent}\n${combinedNested}\n</${tagMap.listItem}>`
                                );
                            }
                        } else {
                            listItemsXml.push(
                                `<${tagMap.listItem}${listItemIdAttr}>${labelXml}\n${itemParaContent}\n</${tagMap.listItem}>`
                            );
                        }
                    } else if (childTag === 'ul' || childTag === 'ol') {
                        const nestedXml = processListNode(childEl, listDepth + 1, customGetParaIdAttr);
                        if (nestedXml) {
                            if (listItemsXml.length > 0) {
                                const lastIdx = listItemsXml.length - 1;
                                const lastItem = listItemsXml[lastIdx];
                                if (opts.schema==='elsevier' || opts.embedListInPara) {
                                    const paraCloseRegex = new RegExp(`</${tagMap.para}>\n</${tagMap.listItem}>$`, 'i');
                                    if (paraCloseRegex.test(lastItem)) {
                                        listItemsXml[lastIdx] = lastItem.replace(
                                            paraCloseRegex,
                                            `\n${nestedXml}\n</${tagMap.para}>\n</${tagMap.listItem}>`
                                        );
                                    } else {
                                        const listItemIdAttr = getNextListItemIdAttr();
                                        listItemsXml.push(`<${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n</${tagMap.listItem}>`);
                                    }
                                } else {
                                    const itemCloseRegex = new RegExp(`</${tagMap.listItem}>$`, 'i');
                                    if (itemCloseRegex.test(lastItem)) {
                                        listItemsXml[lastIdx] = lastItem.replace(
                                            itemCloseRegex,
                                            `\n${nestedXml}\n</${tagMap.listItem}>`
                                        );
                                    } else {
                                        const listItemIdAttr = getNextListItemIdAttr();
                                        listItemsXml.push(`<${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n</${tagMap.listItem}>`);
                                    }
                                }
                            } else {
                                const listItemIdAttr = getNextListItemIdAttr();
                                listItemsXml.push(`<${tagMap.listItem}${listItemIdAttr}>\n${nestedXml}\n</${tagMap.listItem}>`);
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
        const processBlockContainer = (containerNode: Node, customGetParaIdAttr?: () => string, forceParagraphs=false): string[] => {
            const getParaId = customGetParaIdAttr || getNextParaIdAttr;
            const getItemParaId = opts.schema==='elsevier' ? getNextParaIdAttr : getParaId;
            const wrapParagraphs=forceParagraphs || opts.wrapInParagraphs!==false;
            const blocks: string[] = [];
            let inlineBuffer: string[] = [];
            type PendingItem={xml:string;category:'bullet'|'number'|'alpha'|'simple';level:number;listKey:string};
            let pendingListItems:PendingItem[]=[];

            const flushListItems = () => {
                if (pendingListItems.length > 0) {
                    type Group={level:number;listKey:string;category:PendingItem['category'];items:{xml:string;children:Group[]}[]};
                    const roots:Group[]=[],levels:Group[]=[];
                    for(const item of pendingListItems){
                        while(levels.length && levels[levels.length-1].level>item.level)levels.pop();
                        let group=levels[levels.length-1];
                        if(group && group.level===item.level && (group.listKey!==item.listKey || group.category!==item.category)){levels.pop();group=levels[levels.length-1];}
                        if(!group || group.level<item.level){
                            const next:Group={level:item.level,listKey:item.listKey,category:item.category,items:[]};
                            if(group?.items.length)group.items[group.items.length-1].children.push(next);else roots.push(next);
                            levels.push(next);group=next;
                        }
                        group.items.push({xml:item.xml,children:[]});
                    }
                    const render=(group:Group):string=>{
                        const items=group.items.map(item=>{
                            const nested=item.children.map(render).join('\n');
                            if(!nested)return item.xml;
                            if(opts.schema==='elsevier')return item.xml.replace(new RegExp(`</${tagMap.para}>\\s*</${tagMap.listItem}>$`),`${nested}</${tagMap.para}></${tagMap.listItem}>`);
                            return item.xml.replace(`</${tagMap.listItem}>`,`${nested}</${tagMap.listItem}>`);
                        }).join('\n');
                        const listType=group.category==='number' && opts.schema==='jats'?'order':group.category==='alpha' && opts.schema==='jats'?'alpha-lower':group.category;
                        return `<${tagMap.list}${getNextListIdAttr()}${opts.schema==='elsevier'?'':` list-type="${listType}"`}>${items}</${tagMap.list}>`;
                    };
                    for(const root of roots){const listXml=render(root);blocks.push(forceParagraphs?`<${tagMap.para}${getParaId()}>${listXml}</${tagMap.para}>`:listXml);}
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

                            const paraIdAttr = getItemParaId();
                            const listItemIdAttr = getNextListItemIdAttr();
                            const labelXml = (opts.addListLabels && finalLabel) ? `\n<${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';
                            const itemParaContent = (opts.schema==='elsevier' || wrapParagraphs)
                                ? `<${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>`
                                : cleanText;
                            pendingListItems.push({
                                xml: `<${tagMap.listItem}${listItemIdAttr}>${labelXml}\n${itemParaContent}\n</${tagMap.listItem}>`,
                                category,level:1,listKey:'plain'
                            });
                        } else {
                            flushListItems();
                            if (wrapParagraphs) {
                                const idAttr = getParaId();
                                blocks.push(`<${tagMap.para}${idAttr}>${trimmedLine}</${tagMap.para}>`);
                            } else {
                                blocks.push(trimmedLine);
                            }
                        }
                    }
                });
            };

            Array.from(containerNode.childNodes).forEach(child => {
                if(child.nodeType===Node.TEXT_NODE && /[\r\n]/.test(child.textContent || '')){
                    const lines=(child.textContent || '').split(/\r\n|\r|\n/);
                    lines.forEach((line,index)=>{inlineBuffer.push(processInlineNode(doc.createTextNode(line)));if(index<lines.length-1)flushInlineBuffer();});
                    return;
                }
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child as HTMLElement;
                    const tagName = el.tagName.toLowerCase();

                    if (
                        tagName === 'style' || 
                        tagName === 'script' || 
                        tagName === 'xml'
                    ) {
                        return;
                    }

                    if (tagName === 'br') {
                        flushInlineBuffer();
                        return;
                    }

                    if (el.hasAttribute('data-ce-type')) {
                        flushInlineBuffer();
                        flushListItems();

                        const ceType = (el.getAttribute('data-ce-type') || 'acknowledgment').toLowerCase();
                        if(!['highlights','acknowledgment','abstract','appendix','section','conflict-of-interest','data-availability','jel','jel-classifications'].includes(ceType))throw new Error('This capture type is not supported. Choose one of the Capture as options.');
                        const titleVal = el.getAttribute('data-ce-title') || (
                            ceType === 'acknowledgment' ? 'Acknowledgements' :
                            ceType === 'abstract' ? 'Abstract' :
                            ceType === 'appendix' ? 'Appendix' :
                            ceType === 'conflict-of-interest' ? 'Declaration of competing interest' :
                            ceType === 'data-availability' ? 'Data availability' :
                            ceType === 'highlights' ? 'Highlights' :
                            ceType === 'jel' || ceType === 'jel-classifications' ? 'JEL classifications' :
                            'Section'
                        );

                        const cleanEl = el.cloneNode(true) as HTMLElement;
                        cleanEl.querySelectorAll('.ce-capture-badge').forEach(badge=>badge.remove());
                        if(cleanEl.querySelector('[data-ce-type]'))throw new Error('Captured sections cannot overlap. Remove an existing section tag before creating a new capture.');
                        if(!cleanEl.textContent?.trim())throw new Error('This captured section has no text. Add content or remove its section tag.');

                        let outerTag = 'ce:section';
                        let titleTag = 'ce:section-title';
                        let wrapperIdAttr = '';
                        let titleIdAttr = '';
                        let wrapperExtraAttrs = '';

                        if (opts.schema === 'elsevier') {
                            if (ceType === 'acknowledgment') outerTag = 'ce:acknowledgment';
                            else if (ceType === 'abstract') outerTag = 'ce:abstract';
                            else if (ceType === 'highlights') {
                                outerTag = 'ce:abstract';
                                wrapperExtraAttrs = ' class="author-highlights" xml:lang="en"';
                            }
                            else if (ceType === 'jel' || ceType === 'jel-classifications') {
                                outerTag = 'ce:keywords';
                                wrapperExtraAttrs = ' class="jel"';
                            }
                            else if (ceType === 'appendix') outerTag = 'ce:section';
                            else if (ceType === 'conflict-of-interest') outerTag = 'ce:conflict-of-interest';
                            else if (ceType === 'data-availability') outerTag = 'ce:data-availability';
                            else outerTag = 'ce:section';
                            titleTag = 'ce:section-title';
                        } else if (opts.schema === 'jats') {
                            if (ceType === 'acknowledgment') outerTag = 'ack';
                            else if (ceType === 'abstract') outerTag = 'abstract';
                            else if (ceType === 'highlights') {
                                outerTag = 'abstract';
                                wrapperExtraAttrs = ' abstract-type="author-highlights"';
                            }
                            else if (ceType === 'jel' || ceType === 'jel-classifications') {
                                outerTag = 'kwd-group';
                                wrapperExtraAttrs = ' kwd-group-type="jel"';
                            }
                            else if (ceType === 'appendix') outerTag = 'app';
                            else outerTag = 'sec';
                            titleTag = 'title';
                        } else {
                            if (ceType === 'jel' || ceType === 'jel-classifications') {
                                outerTag = 'keywords';
                                wrapperExtraAttrs = ' class="jel"';
                                titleTag = 'heading';
                            } else {
                                outerTag = ceType;
                                titleTag = 'heading';
                            }
                        }

                        if (opts.addParagraphIds) {
                            titleIdAttr = getNextSectionTitleIdAttr();

                            if (ceType === 'acknowledgment') {
                                const ackNum = opts.paraIdStart + (ackCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('ac',ackNum);
                            } else if (ceType === 'abstract' || ceType === 'highlights') {
                                const abNum = opts.paraIdStart + (abstractCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('ab',abNum);
                            } else if (ceType === 'jel' || ceType === 'jel-classifications') {
                                const ksNum = opts.paraIdStart + (ksCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('ks',ksNum);
                            } else if (ceType === 'appendix') {
                                const apNum = opts.paraIdStart + (appendixCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('ap',apNum);
                            } else if (ceType === 'conflict-of-interest') {
                                const coiNum = opts.paraIdStart + (coiCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('coi',coiNum);
                            } else if (ceType === 'data-availability') {
                                wrapperIdAttr = allocateIdAttr('da',opts.paraIdStart+(daCounter++)*opts.paraIdStep);
                            } else {
                                const sNum = opts.paraIdStart + (secCounter++) * opts.paraIdStep;
                                wrapperIdAttr = allocateIdAttr('s',sNum);
                            }
                        }
                        if(opts.schema==='elsevier' && !wrapperIdAttr && ['conflict-of-interest','data-availability'].includes(ceType))
                            wrapperIdAttr=allocateIdAttr(ceType==='data-availability'?'da':'coi',opts.paraIdStart+(ceType==='data-availability'?daCounter++:coiCounter++)*opts.paraIdStep);

                        const abstractParaId=()=>opts.addParagraphIds?allocateIdAttr('sp',opts.paraIdStart+(spCounter++)*opts.paraIdStep):'';
                        const subBlocks = ['highlights','jel','jel-classifications'].includes(ceType) ? [] : processBlockContainer(cleanEl,ceType==='abstract' && opts.schema==='elsevier'?abstractParaId:undefined,opts.schema==='elsevier');
                        const titleXml = `<${titleTag}${titleIdAttr}>${escapeXmlText(titleVal)}</${titleTag}>`;
                        const innerXml = subBlocks.length > 0 
                            ? subBlocks.join('\n') 
                            : (wrapParagraphs ? `<${tagMap.para}${getParaId()}></${tagMap.para}>` : '');

                        if (ceType === 'highlights' && opts.schema === 'elsevier') {
                            let asIdAttr = '';
                            let spIdAttr = '';
                            let listIdAttr = '';
                            if (opts.addParagraphIds) {
                                const asNum = opts.paraIdStart + (asCounter++) * opts.paraIdStep;
                                asIdAttr = allocateIdAttr('as',asNum);
                                const spNum = opts.paraIdStart + (spCounter++) * opts.paraIdStep;
                                spIdAttr = allocateIdAttr('sp',spNum);
                                listIdAttr = getNextListIdAttr();
                            }

                            const highlightItems: string[] = [];
                            const addHighlightItem = (rawText: string) => {
                                const trimmed = rawText.trim();
                                if (!trimmed) return;

                                const { labelVal, cleanText } = extractLabel(trimmed);
                                const label = labelVal || '•';
                                const text = (cleanText || trimmed).trim();

                                const listItemIdAttr = getNextListItemIdAttr();
                                const paraIdAttr = getNextParaIdAttr();

                                highlightItems.push(`<ce:list-item${listItemIdAttr}><ce:label>${label}</ce:label><ce:para${paraIdAttr}>${text}</ce:para></ce:list-item>`);
                            };

                            // Split DOM ranges at block/line boundaries. Each cloned
                            // range retains balanced inline formatting, even when a
                            // <br> occurs inside bold/italic text. Mixed prose and lists
                            // are visited in source order rather than choosing one kind.
                            collectInlineSegments(cleanEl).forEach(addHighlightItem);
                            if(!highlightItems.length)return;

                            const bodyContent = `<ce:abstract-sec${asIdAttr}>\n<ce:simple-para${spIdAttr}><ce:list${listIdAttr}>\n${highlightItems.join('\n')}\n</ce:list></ce:simple-para>\n</ce:abstract-sec>`;
                            blocks.push(`<${outerTag}${wrapperIdAttr}${wrapperExtraAttrs}>\n${titleXml}\n${bodyContent}\n</${outerTag}>`);
                        } else if ((ceType === 'jel' || ceType === 'jel-classifications') && opts.schema === 'elsevier') {
                            const kwXml=collectInlineSegments(cleanEl).map(textVal=>{
                                const kwIdAttr=opts.addParagraphIds?allocateIdAttr('kw',opts.paraIdStart+(kwCounter++)*opts.paraIdStep):'';
                                const txIdAttr=opts.addParagraphIds?allocateIdAttr('tx',opts.paraIdStart+(txCounter++)*opts.paraIdStep):'';
                                return `<ce:keyword${kwIdAttr}><ce:text${txIdAttr}>${textVal}</ce:text></ce:keyword>`;
                            }).join('');
                            blocks.push(`<ce:keywords class="jel"${wrapperIdAttr}>${titleXml}${kwXml}</ce:keywords>`);
                        } else if ((ceType === 'jel' || ceType === 'jel-classifications') && opts.schema === 'jats') {
                            let textVal = escapeXmlText(cleanEl.textContent?.replace(/\u00a0/g, ' ').trim() || '');
                            blocks.push(`<kwd-group kwd-group-type="jel"${wrapperIdAttr}>${titleXml}<kwd>${textVal}</kwd></kwd-group>`);
                        } else if (ceType === 'jel' || ceType === 'jel-classifications') {
                            let textVal = escapeXmlText(cleanEl.textContent?.replace(/\u00a0/g, ' ').trim() || '');
                            blocks.push(`<keywords class="jel"${wrapperIdAttr}>${titleXml}<keyword>${textVal}</keyword></keywords>`);
                        } else if(ceType==='abstract' && opts.schema==='elsevier') {
                            const simpleParas=subBlocks.map(block=>{
                                return block.replace(/^<ce:para\b/,'<ce:simple-para').replace(/<\/ce:para>$/,'</ce:simple-para>');
                            }).join('\n');
                            const id=opts.addParagraphIds?allocateIdAttr('as',opts.paraIdStart+(asCounter++)*opts.paraIdStep):'';
                            blocks.push(`<ce:abstract${wrapperIdAttr}>${titleXml}<ce:abstract-sec${id}>${simpleParas}</ce:abstract-sec></ce:abstract>`);
                        } else if(ceType==='appendix' && opts.schema==='elsevier') {
                            blocks.push(`<ce:appendices><ce:section${wrapperIdAttr}>${titleXml}${innerXml}</ce:section></ce:appendices>`);
                        } else {
                            blocks.push(`<${outerTag}${wrapperIdAttr}${wrapperExtraAttrs}>\n${titleXml}\n${innerXml}\n</${outerTag}>`);
                        }
                        return;
                    }

                    if (BLOCK_TAGS.has(tagName)) {
                        flushInlineBuffer();

                        if ((tagName === 'p' || tagName === 'div') && !hasBlockChildren(el)) {
                            const content = processInlineNode(el).trim();
                            if (content) {
                                if (isListParagraph(el, content)) {
                                    let { labelVal: extractedLabel, cleanText } = extractLabel(content);
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

                                    const paraIdAttr = getItemParaId();
                                    const listItemIdAttr = getNextListItemIdAttr();
                                    const labelXml = (opts.addListLabels && finalLabel) ? `\n<${tagMap.label}>${finalLabel}</${tagMap.label}>` : '';
                                    const itemParaContent = (opts.schema==='elsevier' || wrapParagraphs)
                                        ? `<${tagMap.para}${paraIdAttr}>${cleanText}</${tagMap.para}>`
                                        : cleanText;
                                    pendingListItems.push({
                                        xml: `<${tagMap.listItem}${listItemIdAttr}>${labelXml}\n${itemParaContent}\n</${tagMap.listItem}>`,
                                        category,
                                        level:Number((el.getAttribute('style') || '').match(/\blevel(\d+)/i)?.[1] || 1),
                                        listKey:(el.getAttribute('style') || '').match(/mso-list\s*:\s*([^\s;]+)/i)?.[1] || 'plain'
                                    });
                                } else {
                                    flushListItems();
                                    if (wrapParagraphs) {
                                        const idAttr = getParaId();
                                        blocks.push(`<${tagMap.para}${idAttr}>${content}</${tagMap.para}>`);
                                    } else {
                                        blocks.push(content);
                                    }
                                }
                            }
                        } else if ((tagName === 'div' || tagName === 'p') && hasBlockChildren(el)) {
                            flushListItems();
                            const subBlocks = processBlockContainer(el, getParaId, forceParagraphs);
                            blocks.push(...subBlocks);
                        } else if (/^h[1-6]$/.test(tagName)) {
                            flushListItems();
                            const content = processInlineNode(el).trim();
                            if (content) {
                                if (opts.convertHeadings && !forceParagraphs) {
                                    const titleIdAttr = getNextSectionTitleIdAttr();
                                    blocks.push(`<${tagMap.title}${titleIdAttr}>${content}</${tagMap.title}>`);
                                } else {
                                    if (wrapParagraphs) {
                                        const idAttr = getParaId();
                                        blocks.push(`<${tagMap.para}${idAttr}><${tagMap.bold}>${content}</${tagMap.bold}></${tagMap.para}>`);
                                    } else {
                                        blocks.push(`<${tagMap.bold}>${content}</${tagMap.bold}>`);
                                    }
                                }
                            }
                        } else if (tagName === 'ul' || tagName === 'ol') {
                            flushListItems();
                            const listXml = processListNode(el, 0, getParaId);
                            if (listXml) {
                                blocks.push(forceParagraphs ? `<${tagMap.para}${getParaId()}>${listXml}</${tagMap.para}>` : listXml);
                            }
                        } else if (tagName === 'table') {
                            flushListItems();
                            if(opts.schema==='elsevier'){
                                if(el.querySelector('table'))throw new Error('Nested tables need the dedicated table tool. Your input is preserved; no partial XML was generated.');
                                const rowRank=(row:Element)=>row.parentElement?.tagName.toLowerCase()==='thead'?0:row.parentElement?.tagName.toLowerCase()==='tfoot'?2:1;
                                const sourceRows=Array.from(el.querySelectorAll('tr')).filter(row=>row.closest('table')===el).sort((a,b)=>rowRank(a)-rowRank(b));
                                const occupied:number[]=[],rendered:{head:boolean;xml:string}[]=[];
                                let columns=0;
                                sourceRows.forEach((row,rowIndex)=>{
                                    let column=0;const entries:string[]=[];
                                    Array.from(row.children).filter(cell=>['td','th'].includes(cell.tagName.toLowerCase())).forEach(cell=>{
                                        while((occupied[column] || 0)>rowIndex)column++;
                                        const width=Number(cell.getAttribute('colspan') || 1),rawHeight=Number(cell.getAttribute('rowspan') || 1);
                                        const height=rawHeight===0 ? sourceRows.filter((candidate,index)=>index>=rowIndex && candidate.parentElement===row.parentElement).length : rawHeight;
                                        if(!Number.isInteger(width)||width<1||width>1000||!Number.isInteger(height)||height<1||height>sourceRows.length-rowIndex)
                                            throw new Error('This table has invalid or unsupported merged-cell spans. Review its row and column structure.');
                                        if(height>sourceRows.filter((candidate,index)=>index>=rowIndex && candidate.parentElement===row.parentElement).length)throw new Error('Merged cells cannot cross table header, body or footer groups. Review this table span.');
                                        for(let offset=0;offset<width;offset++){
                                            if((occupied[column+offset] || 0)>rowIndex)throw new Error('Merged table cells overlap. Review the table before converting.');
                                            occupied[column+offset]=rowIndex+height;
                                        }
                                        let attributes=width>1?` namest="c${column+1}" nameend="c${column+width}"`:` colname="c${column+1}"`;
                                        if(height>1)attributes+=` morerows="${height-1}"`;
                                        const body=processInlineNode(cell,'<ce:br/>').trim().replace(/(?:<ce:br\/>\s*){2,}/g,'<ce:br/>').replace(/^(?:<ce:br\/>\s*)+|(?:\s*<ce:br\/>)+$/g,'');
                                        entries.push(`<entry xmlns="http://www.elsevier.com/xml/common/dtd"${attributes}>${body}</entry>`);
                                        column+=width;columns=Math.max(columns,column);
                                    });
                                    if(!entries.length)throw new Error('Empty or fully spanned table rows need review before conversion.');
                                    rendered.push({head:row.parentElement?.tagName.toLowerCase()==='thead',xml:`<row>${entries.join('')}</row>`});
                                });
                                if(!rendered.length)throw new Error('This table contains no rows to convert.');
                                const bodyRows=rendered.filter(row=>!row.head),headRows=rendered.filter(row=>row.head);
                                const head=bodyRows.length && headRows.length?`<thead>${headRows.map(row=>row.xml).join('')}</thead>`:'';
                                const body=(bodyRows.length?bodyRows:rendered).map(row=>row.xml).join('');
                                const colspecs=Array.from({length:columns},(_,index)=>`<colspec colname="c${index+1}"/>`).join('');
                                const caption=el.querySelector(':scope > caption');
                                const captionParts=caption?collectInlineSegments(caption as HTMLElement):[];
                                const captionId=captionParts.length && opts.addParagraphIds?allocateIdAttr('ca',opts.paraIdStart+(captionCounter++)*opts.paraIdStep):'';
                                const captionXml=captionParts.length?`<ce:caption${captionId}>${captionParts.map(text=>`<ce:simple-para${opts.addParagraphIds?allocateIdAttr('sp',opts.paraIdStart+(spCounter++)*opts.paraIdStep):''}>${text}</ce:simple-para>`).join('')}</ce:caption>`:'';
                                const table=`<ce:table xmlns="http://www.elsevier.com/xml/common/cals/dtd">${captionXml}<tgroup cols="${columns}">${colspecs}${head}<tbody>${body}</tbody></tgroup></ce:table>`;
                                if(forceParagraphs)throw new Error('A table cannot be inserted directly into this captured text section. Convert it separately with the table tool.');
                                blocks.push(table);return;
                            }
                            const rows: string[] = [];
                            const trElements = Array.from(el.querySelectorAll('tr')).filter(tr=>tr.closest('table')===el);
                            trElements.forEach(tr => {
                                const cells: string[] = [];
                                Array.from(tr.children).filter(td=>['td','th'].includes(td.tagName.toLowerCase())).forEach(td => {
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
                        } else if (tagName === 'blockquote' || tagName === 'section' || tagName === 'article' || tagName === 'header' || tagName === 'footer') {
                            flushListItems();
                            const subBlocks = processBlockContainer(el, getParaId, forceParagraphs);
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

        const parsedBlocks = processBlockContainer(container,undefined,opts.schema==='elsevier' && opts.wrapInRoot && opts.rootTag==='ce:sections');

        let mergedBlocks = parsedBlocks;
        if (opts.embedListInPara && opts.wrapInParagraphs !== false) {
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
                .replace(/<sub>\s*<\/sub>/gi, '');
        }

        // Clean carriage returns completely (\r\n -> \n, \r -> '')
        resultXml = resultXml.replace(/\r\n/g, '\n').replace(/\r/g, '');

        // Guarantee no ce:para or p element begins or ends with whitespace
        resultXml = resultXml.replace(/<(ce:para|p)(\b[^>]*)>\s+/gi, '<$1$2>');
        resultXml = resultXml.replace(/\s+<\/(ce:para|p)>/gi, '</$1>');

        // Clean multi-space artifacts
        resultXml = resultXml.replace(/ {2,}/g, ' ');

        // Final XML validation pass: guarantee no unescaped ampersands remain in text nodes
        resultXml = resultXml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, '&amp;');

        // Option: Wrap in root container if requested
        if (opts.wrapInRoot && opts.rootTag) {
            const root = opts.rootTag.trim();
            const mixedRoot=[tagMap.para,tagMap.bold,tagMap.italic,tagMap.sup,tagMap.inf,tagMap.underline,tagMap.smallCaps,tagMap.title,tagMap.label,'ce:simple-para','ce:text'].includes(root);
            resultXml = mixedRoot ? `<${root}>${resultXml}</${root}>` : `<${root}>\n${resultXml.split('\n').map(l => '  ' + l).join('\n')}\n</${root}>`;
        }

        const output=resultXml.trim();
        if(opts.schema==='elsevier')validateWordScannerCeFragment(output,opts.dtdVersion);
        return output;
    }, []);

    // Perform scan & conversion whenever input or options change
    const handleScanAndConvert = useCallback(() => {
        const inputToUse = isHtmlMode ? rawHtmlInput : editorHtml;
        try {setXmlOutput(convertHtmlToXml(inputToUse, options));setConversionError('');}
        catch(error){setXmlOutput('');setConversionError(error instanceof Error ? error.message : 'Unable to convert this input safely.');}
    }, [isHtmlMode, rawHtmlInput, editorHtml, options, convertHtmlToXml]);

    useEffect(() => {
        handleScanAndConvert();
    }, [handleScanAndConvert]);

    // Calculate tag statistics
    const stats = React.useMemo(() => {
        if (!xmlOutput) return { para: 0, bold: 0, italic: 0, sup: 0, inf: 0, totalTags: 0, chars: 0 };

        const paraMatch = xmlOutput.match(/<(ce:para|ce:simple-para|p)\b/gi) || [];
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
    const handleCopy = async () => {
        if (!xmlOutput) return;
        try {
            await navigator.clipboard.writeText(xmlOutput);
            setIsCopied(true);
            setToast({ msg: 'XML copied to clipboard!', type: 'success' });
            setTimeout(() => setIsCopied(false), 2000);
        } catch {
            setIsCopied(false);setToast({msg:'Clipboard access failed. Copy the snippet from Raw Text instead.',type:'error'});
        }
    };

    // Download XML file
    const handleDownload = () => {
        if (!xmlOutput) return;
        const blob = new Blob([xmlOutput], { type: 'text/xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `word_converted_${options.schema==='elsevier'?'ce':options.schema}.xml`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setToast({ msg: 'XML file downloaded', type: 'success' });
    };

    // Safe Tokenizer for syntax highlighting with unique entry colors for each captured highlight text
    const renderHighlightedXmlOutput = (xml: string) => {
        if (!xml) return null;
        const lines = xml.split('\n');
        let itemIndex = 0;
        let inListItem = false;
        let inLabel = false;

        const uniqueEntryColors = [
            'text-emerald-300 font-semibold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-700/60 shadow-xs',
            'text-cyan-300 font-semibold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-700/60 shadow-xs',
            'text-amber-300 font-semibold bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/60 shadow-xs',
            'text-rose-300 font-semibold bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-700/60 shadow-xs',
            'text-purple-300 font-semibold bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-700/60 shadow-xs',
            'text-sky-300 font-semibold bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-700/60 shadow-xs',
            'text-teal-300 font-semibold bg-teal-950/80 px-1.5 py-0.5 rounded border border-teal-700/60 shadow-xs',
            'text-fuchsia-300 font-semibold bg-fuchsia-950/80 px-1.5 py-0.5 rounded border border-fuchsia-700/60 shadow-xs',
        ];

        return lines.map((line, idx) => {
            const tokens: React.ReactNode[] = [];
            const regex = /(<\/?[a-zA-Z0-9_:-]+(?:\s+[a-zA-Z0-9_:-]+="[^"]*")*\s*\/?>)|([^<]+)/g;
            let match;
            let key = 0;

            while ((match = regex.exec(line)) !== null) {
                if (match[1]) {
                    const tag = match[1];
                    if (tag.startsWith('<ce:list-item')) {
                        inListItem = true;
                        itemIndex++;
                    } else if (tag.startsWith('</ce:list-item>')) {
                        inListItem = false;
                    } else if (tag.startsWith('<ce:label')) {
                        inLabel = true;
                    } else if (tag.startsWith('</ce:label>')) {
                        inLabel = false;
                    }

                    tokens.push(
                        <span key={`line-${idx}-tok-${key++}`} className="text-indigo-400 font-bold">
                            {tag}
                        </span>
                    );
                } else if (match[2]) {
                    const text = match[2];
                    if (inListItem && !inLabel && text.trim()) {
                        const currentColor = uniqueEntryColors[(itemIndex - 1) % uniqueEntryColors.length];
                        tokens.push(
                            <span key={`line-${idx}-tok-${key++}`} className={currentColor}>
                                {text}
                            </span>
                        );
                    } else if (inLabel && text.trim()) {
                        tokens.push(
                            <span key={`line-${idx}-tok-${key++}`} className="text-slate-200 font-black bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-[11px] mr-1">
                                {text}
                            </span>
                        );
                    } else {
                        tokens.push(
                            <span key={`line-${idx}-tok-${key++}`} className="text-slate-100">
                                {text}
                            </span>
                        );
                    }
                }
            }

            return (
                <div key={idx} className="flex hover:bg-slate-900/80 px-2 py-1 rounded transition-colors">
                    <span className="w-12 text-slate-600 select-none text-[10px] pr-3 text-right flex-shrink-0 font-mono">
                        {idx + 1}
                    </span>
                    <span className="whitespace-pre-wrap break-all">
                        {tokens}
                    </span>
                </div>
            );
        });
    };

    return (
        <div className="max-w-[1700px] mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {conversionError && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{conversionError}</div>}

            {/* Header Section */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
                            <FileCode size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
                                MS Word Rich Text to <span className="text-indigo-600">CE XML Scanner</span>
                            </h1>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                Scan superscripts, subscripts, bold, italics, paragraphs & convert to CE XML
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

            <div className="mb-5 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <label className="text-xs font-bold text-slate-700">CE DTD version
                    <select aria-label="CE DTD version" value={options.dtdVersion} onChange={event=>setOptions(previous=>({...previous,dtdVersion:event.target.value as WordScannerDtdVersion}))} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                        <option value="5.7">5.7</option><option value="5.6">5.6</option>
                    </select>
                </label>
                <label className="text-xs font-bold text-slate-700">Output content
                    <select aria-label="Output content" value={options.outputScope} onChange={event=>setOptions(previous=>({...previous,outputScope:event.target.value as 'all'|'captures'}))} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                        <option value="all">All input</option><option value="captures">Captured sections only</option>
                    </select>
                </label>
                <p className="text-xs text-slate-500">Captures include their required paragraph structure. No full article is needed.</p>
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
                                    Auto-Add Optional Element IDs
                                </span>
                            </label>

                            {options.addParagraphIds && (
                                <div className="space-y-3 pt-3 border-t border-indigo-100">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Para Prefix</label>
                                            <input
                                                type="text"
                                                value={options.paraIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Title Prefix</label>
                                            <input
                                                type="text"
                                                value={options.sectionTitleIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, sectionTitleIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">List Prefix</label>
                                            <input
                                                type="text"
                                                value={options.listIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, listIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Item Prefix</label>
                                            <input
                                                type="text"
                                                value={options.listItemIdPrefix}
                                                onChange={(e) => setOptions(prev => ({ ...prev, listItemIdPrefix: e.target.value }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Start ID</label>
                                            <input
                                                type="number"
                                                value={options.paraIdStart}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdStart: parseInt(e.target.value) || 0 }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">Step Increment</label>
                                            <input
                                                type="number"
                                                value={options.paraIdStep}
                                                onChange={(e) => setOptions(prev => ({ ...prev, paraIdStep: parseInt(e.target.value) || 1 }))}
                                                className="w-full bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200 text-xs font-mono font-bold text-slate-800 focus:outline-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Structural & Tagging Toggles */}
                        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-indigo-50/90 border border-indigo-200/90 cursor-pointer hover:bg-indigo-100/90 transition-all sm:col-span-2 shadow-2xs">
                                <input
                                    type="checkbox"
                                    checked={options.wrapInParagraphs}
                                    onChange={(e) => setOptions(prev => ({ ...prev, wrapInParagraphs: e.target.checked }))}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                                            Enclose Inputted Text in &lt;ce:para&gt; Tags
                                        </span>
                                        {!options.wrapInParagraphs && (
                                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                                                No &lt;ce:para&gt; Wrapper Active
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-medium text-slate-600 mt-0.5">
                                        When checked, paragraphs are wrapped in <code className="font-mono text-indigo-700 bg-indigo-100/80 px-1 py-0.5 rounded">&lt;ce:para&gt;...&lt;/ce:para&gt;</code>. Uncheck this option so words and text inputted will NOT be enclosed with <code className="font-mono text-indigo-700 bg-indigo-100/80 px-1 py-0.5 rounded">&lt;ce:para&gt;</code>.
                                    </span>
                                </div>
                            </label>

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
                                    checked={true}
                                    disabled
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-xs font-bold text-slate-700">XML Special Characters Are Always Escaped</span>
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
                                <div className="h-4 w-px bg-slate-200 mx-1"></div>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsCaptureMenuOpen(!isCaptureMenuOpen)}
                                        disabled={isHtmlMode}
                                        className="px-2.5 py-1 rounded-lg text-amber-900 bg-amber-50 hover:bg-amber-100 hover:text-amber-950 transition-colors disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 border border-amber-200/80 shadow-2xs"
                                        title="Capture highlighted text or block as a specific CE XML section"
                                        onMouseDown={(event)=>event.preventDefault()}
                                    >
                                        <Bookmark size={14} className="text-amber-600 fill-amber-500/20" />
                                        <span>Capture as...</span>
                                        <ChevronDown size={12} className="text-amber-600" />
                                    </button>

                                    {isCaptureMenuOpen && (
                                        <div onMouseDown={(event)=>event.preventDefault()} className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-30 space-y-1">
                                            <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                                                <span>Section Tagging</span>
                                                <span className="text-amber-600 font-mono">CE XML</span>
                                            </div>
                                             <button
                                                type="button"
                                                onClick={() => { captureSelectionAs('highlights'); setIsCaptureMenuOpen(false); }}
                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 text-xs font-semibold flex items-center justify-between transition-colors group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Sparkles size={14} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                                                    <span>Highlights</span>
                                                </div>
                                                <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">&lt;ce:abstract&gt;</span>
                                            </button>
                                            {[
                                                {type:'abstract',name:'Abstract',tag:'ce:abstract'},
                                                {type:'section',name:'Article Section',tag:'ce:section'},
                                                {type:'appendix',name:'Appendix',tag:'ce:appendices'},
                                                {type:'data-availability',name:'Data Availability',tag:'ce:data-availability'}
                                            ].map(capture=><button key={capture.type} type="button" onClick={()=>{captureSelectionAs(capture.type);setIsCaptureMenuOpen(false);}} className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-indigo-50 text-slate-800 text-xs font-semibold flex items-center justify-between gap-2">
                                                <span>{capture.name}</span><span className="text-[9px] font-mono text-indigo-700">&lt;{capture.tag}&gt;</span>
                                            </button>)}
                                            <button
                                                type="button"
                                                onClick={() => { captureSelectionAs('acknowledgment'); setIsCaptureMenuOpen(false); }}
                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-amber-50 text-slate-800 hover:text-amber-900 text-xs font-semibold flex items-center justify-between transition-colors group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Bookmark size={14} className="text-amber-600 group-hover:scale-110 transition-transform" />
                                                    <span>Acknowledgement</span>
                                                </div>
                                                <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">&lt;ce:acknowledgment&gt;</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { captureSelectionAs('conflict-of-interest'); setIsCaptureMenuOpen(false); }}
                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-rose-50 text-slate-800 hover:text-rose-900 text-xs font-semibold flex items-center justify-between transition-colors group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <ShieldAlert size={14} className="text-rose-600 group-hover:scale-110 transition-transform" />
                                                    <span>Conflict of Interest</span>
                                                </div>
                                                <span className="text-[9px] font-mono font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded">&lt;ce:conflict-of-interest&gt;</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { captureSelectionAs('jel'); setIsCaptureMenuOpen(false); }}
                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-blue-50 text-slate-800 hover:text-blue-900 text-xs font-semibold flex items-center justify-between transition-colors group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Tag size={14} className="text-blue-600 group-hover:scale-110 transition-transform" />
                                                    <span>JEL Classifications</span>
                                                </div>
                                                <span className="text-[9px] font-mono font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded">&lt;ce:keywords&gt;</span>
                                            </button>
                                            <div className="pt-1 border-t border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={() => { captureSelectionAs('clear'); setIsCaptureMenuOpen(false); }}
                                                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors"
                                                >
                                                    <Eraser size={14} />
                                                    <span>Remove Section Tag</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextVal = !options.wrapInParagraphs;
                                        setOptions(prev => ({ ...prev, wrapInParagraphs: nextVal }));
                                        setToast({
                                            msg: nextVal ? 'Enabled <ce:para> paragraph wrapping' : 'Disabled <ce:para> (outputting raw words / text)',
                                            type: nextVal ? 'info' : 'warn'
                                        });
                                    }}
                                    className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border shadow-2xs ${
                                        options.wrapInParagraphs
                                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                                            : 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                                    }`}
                                    title={options.wrapInParagraphs ? 'Click to omit <ce:para> tags' : 'Click to enclose in <ce:para> tags'}
                                >
                                    <Type size={12} className={options.wrapInParagraphs ? 'text-indigo-600' : 'text-amber-700'} />
                                    <span>{options.wrapInParagraphs ? '<ce:para> ON' : '<ce:para> OFF'}</span>
                                </button>

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
                                    onPaste={handleEditorPaste}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement;
                                        const box = target.closest('.ce-capture-box') as HTMLElement;
                                        if (box) {
                                            const isBadge = target.classList.contains('ce-capture-badge') || !!target.closest('.ce-capture-badge');
                                            if (isBadge || target === box) {
                                                const para = (box.querySelector('p') || box.querySelector('div:not(.ce-capture-badge)') || box) as HTMLElement;
                                                if (para && para !== box) {
                                                    const cleanText = (para.textContent || '').replace(/\u00a0/g, ' ').trim();
                                                    if (!cleanText && !para.querySelector('br')) {
                                                        para.innerHTML = '<br>';
                                                    }
                                                    const sel = window.getSelection();
                                                    if (sel) {
                                                        try {
                                                            const r = document.createRange();
                                                            r.selectNodeContents(para);
                                                            r.collapse(false);
                                                            sel.removeAllRanges();
                                                            sel.addRange(r);
                                                        } catch {
                                                            // ignore
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }}
                                    data-placeholder="Paste text or type content here..."
                                    className="w-full h-full min-h-[400px] outline-none text-slate-800 font-serif text-base leading-relaxed select-text empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300 empty:before:pointer-events-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ul.unlabelled]:list-none [&_ul[type=unstyled]]:list-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_ol[type=a]]:list-[lower-alpha] [&_ol[type=A]]:list-[upper-alpha] [&_ol[type=unstyled]]:list-none [&_li]:my-1"
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
                            <span>{getCharCount()} characters</span>
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
                                            {renderHighlightedXmlOutput(xmlOutput)}
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
                                                <span className="font-bold text-slate-200 uppercase">{options.schema==='elsevier'?'CE':options.schema}</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-b border-slate-800">
                                                <span>Enclose in &lt;ce:para&gt;:</span>
                                                <span className={`font-bold ${options.wrapInParagraphs ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {options.wrapInParagraphs ? 'Enabled (<ce:para>)' : 'Disabled (Raw Words / Plain Text)'}
                                                </span>
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
                            <span className={`flex items-center gap-1.5 ${conversionError?'text-rose-400':xmlOutput?'text-emerald-400':'text-slate-400'}`}>
                                {xmlOutput?<CheckCircle2 size={12}/>:<AlertCircle size={12}/>}
                                {conversionError?'Output blocked — review the message above':xmlOutput?`CE ${options.dtdVersion} snippet structure checked (${stats.totalTags} tags)`:'Waiting for text or a capture'}
                            </span>
                            <span>Schema: {options.schema==='elsevier'?'CE':options.schema.toUpperCase()}</span>
                        </div>
                        <p className="border-t border-slate-800 bg-slate-900 px-6 py-2 text-xs text-slate-400">Checks cover the generated snippet. Check article placement and existing IDs after insertion.</p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default WordToXml;
