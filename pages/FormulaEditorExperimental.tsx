import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Sigma, Sparkles, Copy, Check, RotateCcw, RotateCw, Wand2, FileCode, Sliders, 
    CheckCircle2, AlertTriangle, Eye, EyeOff, Plus, Trash2, Edit3, X,
    ArrowRight, Layers, HelpCircle, Code, RefreshCw, Box, Tag, ArrowUp, ArrowDown,
    Split, LayoutGrid, Calculator
} from 'lucide-react';
import Toast from '../components/Toast';
import { formulaFences, updateFormulaFence, setFormulaTokenText, updateFormulaSpaceWidth, formulaSymbolTag, insertFormulaSymbol, expandFormulaFences, insertFormulaSnippet, insertFormulaTokenAfter, removeFormulaToken, exportFormulaXml, formatFormulaXml, formulaMetadata, editFormulaToken, formulaTokens, parseFormula, renderFormulaPreview, texToMathML, updateFormulaMetadata } from '../utils/formulaStudio';
import { SmartSuggestion } from '../types';
import {validateFormulaDtd, validatedFormulaXml, formulaAttributeIssues, formulaDtdAttributes, type FormulaDtdVersion} from '../utils/formulaDtd';

interface MathNode {
    id: string;
    tag: string; // e.g. 'ce:display', 'ce:formula', 'mml:math', 'mml:mi', 'mml:mfrac', 'mml:msub', 'mml:mo', 'mml:mspace', etc.
    attributes: Record<string, string>;
    text?: string;
    children?: MathNode[];
}

const PRESET_SAMPLES = [
    {
        name: "User Request Sample (Reaction Kinetics)",
        id: "kinetics",
        desc: "ce:display formula with fractions, subscripts, operators and spaces",
        xml: `<ce:display>
<ce:formula id="fo0010">
<mml:math altimg="si3.svg">
<mml:mi>ln</mml:mi>
<mml:mfrac>
<mml:msub>
<mml:mi>C</mml:mi>
<mml:mn>0</mml:mn>
</mml:msub>
<mml:msub>
<mml:mi>C</mml:mi>
<mml:mn>t</mml:mn>
</mml:msub>
</mml:mfrac>
<mml:mo linebreak="goodbreak">=</mml:mo>
<mml:msub>
<mml:mi mathvariant="italic">K</mml:mi>
<mml:mi>app</mml:mi>
</mml:msub>
<mml:mspace width="0.25em"/>
<mml:mi>t</mml:mi>
</mml:math>
</ce:formula>
</ce:display>`
    },
    {
        name: "Quadratic Formula",
        id: "quadratic",
        desc: "Complex fraction with square root, plus-minus operator and exponents",
        xml: `<ce:display><ce:formula id="fo0020"><mml:math altimg="si4.svg"><mml:mi>x</mml:mi><mml:mo>=</mml:mo><mml:mfrac><mml:mrow><mml:mo>−</mml:mo><mml:mi>b</mml:mi><mml:mo>±</mml:mo><mml:msqrt><mml:msup><mml:mi>b</mml:mi><mml:mn>2</mml:mn></mml:msup><mml:mo>−</mml:mo><mml:mn>4</mml:mn><mml:mi>a</mml:mi><mml:mi>c</mml:mi></mml:msqrt></mml:mrow><mml:mrow><mml:mn>2</mml:mn><mml:mi>a</mml:mi></mml:mrow></mml:mfrac></mml:math></ce:formula></ce:display>`
    },
    {
        name: "Mass-Energy Equivalence",
        id: "einstein",
        desc: "Clean formula with superscript exponent",
        xml: `<ce:display><ce:formula id="fo0030"><mml:math altimg="si5.svg"><mml:mi>E</mml:mi><mml:mo>=</mml:mo><mml:mi>m</mml:mi><mml:msup><mml:mi>c</mml:mi><mml:mn>2</mml:mn></mml:msup></mml:math></ce:formula></ce:display>`
    },
    {
        name: "Integral Equation",
        id: "integral",
        desc: "Definite integral with limits, exponential power, and differentials",
        xml: `<ce:display><ce:formula id="fo0040"><mml:math altimg="si6.svg"><mml:msubsup><mml:mo>∫</mml:mo><mml:mn>0</mml:mn><mml:mo>∞</mml:mo></mml:msubsup><mml:msup><mml:mi>e</mml:mi><mml:mrow><mml:mo>−</mml:mo><mml:mi>x</mml:mi></mml:mrow></mml:msup><mml:mi>d</mml:mi><mml:mi>x</mml:mi><mml:mo>=</mml:mo><mml:mn>1</mml:mn></mml:math></ce:formula></ce:display>`
    },
    {
        name: "Fenced Expression (mml:mfenced)",
        id: "mfenced_sample",
        desc: "mml:mfenced with open/close bracket attributes and nested fractions",
        xml: `<ce:display><ce:formula id="fo0050"><mml:math altimg="si7.svg"><mml:mi>f</mml:mi><mml:mfenced open="(" close=")"><mml:mi>x</mml:mi></mml:mfenced><mml:mo>=</mml:mo><mml:mfenced open="[" close="]"><mml:mrow><mml:mfrac><mml:mrow><mml:mi>a</mml:mi><mml:mo>+</mml:mo><mml:mi>b</mml:mi></mml:mrow><mml:mrow><mml:mi>c</mml:mi><mml:mo>−</mml:mo><mml:mi>d</mml:mi></mml:mrow></mml:mfrac></mml:mrow></mml:mfenced></mml:math></ce:formula></ce:display>`
    }
];

const FormulaEditorExperimental: React.FC = () => {
    const navigate = useNavigate();
    const dtdVersion: FormulaDtdVersion = '5.7';
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [texError, setTexError] = useState<string | null>(null);
    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error('Choose an XML file smaller than 2 MB.');
            const xml = await file.text();
            const doc = parseFormula(xml);
            if (!Array.from(doc.querySelectorAll('*')).some(el => el.localName === 'math')) throw new Error('This file has no MathML formula. Choose a file containing a <math> element.');
            setXmlInput(xml);
            setToast({msg: 'Opened ' + file.name + '. Undo restores your previous formula.', type: 'success'});
        } catch (error) { setToast({msg: error instanceof Error ? error.message : 'Could not open this file.', type: 'error'}); }
    };
    const downloadXml = () => {
        try {
        const url = URL.createObjectURL(new Blob([exportFormulaXml(validatedFormulaXml(xmlInput, dtdVersion))], {type: 'application/xml;charset=utf-8'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = (formulaId || 'formula').replace(/[^a-zA-Z0-9_-]/g, '_') + '.xml';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { setToast({msg: error instanceof Error ? error.message : 'Could not download XML.', type: 'error'}); }
    };

    // Default XML set to the user's sample
    const [xmlInput, setXmlInputState] = useState<string>(PRESET_SAMPLES[0].xml);
    const [history, setHistory] = useState<string[]>([PRESET_SAMPLES[0].xml]);
    const [historyIndex, setHistoryIndex] = useState<number>(0);

    const setXmlInput = (newXml: string | ((prev: string) => string)) => {
        const val = typeof newXml === 'function' ? newXml(xmlInput) : newXml;
        if (val !== xmlInput) {
            const nextHistory = history.slice(0, historyIndex + 1);
            nextHistory.push(val);
            setHistory(nextHistory);
            setHistoryIndex(nextHistory.length - 1);
            setXmlInputState(val);
            setSelectedCanvasToken(null);
            setSelectedFence(null);
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            setXmlInputState(history[prevIndex]);
            setSelectedCanvasToken(null);
            setSelectedFence(null);
            setToast({ msg: 'Undo XML edit', type: 'info' });
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            setXmlInputState(history[nextIndex]);
            setSelectedCanvasToken(null);
            setSelectedFence(null);
            setToast({ msg: 'Redo XML edit', type: 'info' });
        }
    };

    // Keyboard Shortcuts for Undo & Redo (Ctrl+Z / Cmd+Z / Ctrl+Y / Cmd+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]') && !target.hasAttribute('data-formula-xml') && !target.hasAttribute('data-formula-editor')) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [historyIndex, history]);

    // TeX / LaTeX Quick Importer
    const [showTexImporter, setShowTexImporter] = useState<boolean>(false);
    const [texInput, setTexInput] = useState<string>('\\ln \\frac{C_0}{C_t} = K_{app} t');

    const handleConvertTex = () => {
        try {
            setTexError(null);
            const converted = texToMathML(texInput);
            setXmlInput(converted);
            setSelectedCanvasToken(null);
            setSelectedFence(null);
            setToast({ msg: 'Converted TeX to MathML XML.', type: 'success' });
            setShowTexImporter(false);
        } catch (error) {
            setTexError(error instanceof Error ? error.message : 'Could not convert TeX.');
        }
    };

    const [viewMode, setViewMode] = useState<'split' | 'rendered' | 'code'>('split');
    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [showInfo, setShowInfo] = useState(false);

    // Node selection for visual inspector
    const [selectedNodePath, setSelectedNodePath] = useState<number[] | null>(null);
    const [editingNodeValue, setEditingNodeValue] = useState<string>('');

    // Canvas Selection & Direct WYSIWYG Editing
    const [selectedCanvasToken, setSelectedCanvasToken] = useState<{
        text: string;
        tagName: string;
        mathvariant?: string;
        width?: string;
        nodeIndex?: number;
    } | null>(null);
    const [selectedFence, setSelectedFence] = useState<number | null>(null);
    const [fenceDraft, setFenceDraft] = useState<Record<string, string>>({});
    const [fenceError, setFenceError] = useState<string | null>(null);
    const [newFenceAttribute, setNewFenceAttribute] = useState('');
    const [newFenceValue, setNewFenceValue] = useState('');
    const fenceOpeningRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (selectedFence !== null) fenceOpeningRef.current?.focus({preventScroll:true}); }, [selectedFence]);
    const selectFence = (index: number) => {
        if (selectedFence === index) { fenceOpeningRef.current?.focus({preventScroll:true}); return; }
        try {
            const fence = formulaFences(parseFormula(xmlInput))[index];
            if (!fence) throw new Error('Select a fence in the current formula.');
            const attributes = Object.fromEntries(Array.from(fence.attributes).filter(attr => attr.namespaceURI !== 'http://www.w3.org/2000/xmlns/').map(attr => [attr.name, attr.value]));
            setFenceDraft({open:'(', close:')', separators:',', ...attributes});
            setSelectedCanvasToken(null);
            setSelectedFence(index);
            setFenceError(null);
            setNewFenceAttribute('');
            setNewFenceValue('');
            fenceOpeningRef.current?.focus({preventScroll:true});
        } catch (error) { setToast({msg:error instanceof Error ? error.message : 'Could not select fence.',type:'error'}); }
    };
    const applyFenceAttributes = () => {
        if (selectedFence === null) return;
        try {
            if (dtdVersion) {
                const issues = formulaAttributeIssues(dtdVersion, 'mml:mfenced', fenceDraft);
                if (issues.length) throw new Error(issues[0]);
            }
            setXmlInput(updateFormulaFence(xmlInput, selectedFence, fenceDraft));
            setSelectedFence(null);
            setToast({msg:'Fence attributes updated. Undo restores the previous values.',type:'success'});
        } catch (error) { setFenceError(error instanceof Error ? error.message : 'Could not update fence attributes.'); }
    };
    const symbolEditorRef = useRef<HTMLTextAreaElement>(null);
    const spaceEditorRef = useRef<HTMLInputElement>(null);
    const [spaceWidth, setSpaceWidth] = useState('');
    const [spaceError, setSpaceError] = useState<string | null>(null);
    useEffect(() => {
        if (!selectedCanvasToken) return;
        if (selectedCanvasToken.tagName === 'mspace') {
            setSpaceWidth(selectedCanvasToken.width || '');
            setSpaceError(null);
            spaceEditorRef.current?.focus({preventScroll: true});
        } else symbolEditorRef.current?.focus({preventScroll: true});
    }, [selectedCanvasToken?.nodeIndex, selectedCanvasToken?.tagName, viewMode]);
    const applySpaceWidth = () => {
        if (selectedCanvasToken?.nodeIndex === undefined) return;
        try {
            const updated = updateFormulaSpaceWidth(xmlInput, selectedCanvasToken.nodeIndex, spaceWidth);
            setXmlInput(updated);
            setSelectedCanvasToken({...selectedCanvasToken, text: '', width: spaceWidth.trim()});
            setSpaceWidth(spaceWidth.trim());
            setSpaceError(null);
        } catch (error) { setSpaceError(error instanceof Error ? error.message : 'Could not update spacing.'); }
    };
    const [directCanvasTyping, setDirectCanvasTyping] = useState<boolean>(true);
    const [splitTargetType, setSplitTargetType] = useState<'sub' | 'super' | 'frac' | 'over' | 'under'>('sub');

    // Metadata controls
    const [formulaId, setFormulaId] = useState<string>('fo0010');
    const [altImg, setAltImg] = useState<string>('si3.svg');
    const [isDisplay, setIsDisplay] = useState<boolean>(true);

    // Error detection
    const [xmlError, setXmlError] = useState<string | null>(null);

    // Helper to wrap raw XML with standard Elsevier/MathML namespace declarations in memory
    const wrapWithNamespaces = (rawXml: string): string => {
        return new XMLSerializer().serializeToString(parseFormula(rawXml));
    };

    // Insert snippet into MathML body
    const insertMathSnippet = (snippet: string, label: string) => {
        try {
            setXmlInput(insertFormulaSnippet(xmlInput, snippet));
            setToast({ msg: 'Inserted ' + label + ' into formula.', type: 'success' });
        } catch (error) {
            setToast({ msg: error instanceof Error ? error.message : 'Could not insert symbol.', type: 'error' });
        }
    };

    // Apply changes to one source token, including repeated symbols and unprefixed MathML.
    const editToken = (text: string, tag: string, index: number | undefined, edit: (el: Element, doc: Document) => void) => {
        try {
            setXmlInput(editFormulaToken(xmlInput, text, tag, index ?? selectedCanvasToken?.nodeIndex, edit));
            setSelectedCanvasToken(null);
            setSelectedFence(null);
        } catch (error) {
            setToast({ msg: error instanceof Error ? error.message : 'Could not edit symbol.', type: 'error' });
        }
    };
    const wrapToken = (text: string, tag: string, structure: string, suffix: string, index?: number) => {
        editToken(text, tag, index, (el, doc) => {
            const wrapper = doc.createElementNS('http://www.w3.org/1998/Math/MathML', 'mml:' + structure);
            el.replaceWith(wrapper);
            wrapper.appendChild(el);
            const fragment = parseFormula(suffix);
            for (const child of Array.from(fragment.documentElement.childNodes)) wrapper.appendChild(doc.importNode(child, true));
        });
    };
    const wrapTokenSubscript = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'msub', '<mml:mn>0</mml:mn>', index);
    const wrapTokenSuperscript = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'msup', '<mml:mn>2</mml:mn>', index);
    const wrapTokenSubSuperscript = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'msubsup', '<mml:mn>0</mml:mn><mml:mi>t</mml:mi>', index);
    const wrapTokenFraction = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'mfrac', '<mml:mn>1</mml:mn>', index);
    const wrapTokenSqrt = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'msqrt', '', index);
    const wrapTokenUnder = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'munder', '<mml:mo>∀</mml:mo>', index);
    const wrapTokenOver = (text: string, tag: string, index?: number) => wrapToken(text, tag, 'mover', '<mml:mo>‾</mml:mo>', index);

    const splitTokenAtPosition = (text: string, tag: string, splitIdx: number, structure: 'sub' | 'super' | 'frac' | 'over' | 'under' = splitTargetType, index?: number) => {
        const chars = Array.from(text);
        if (chars.length < 2) return;
        const position = Math.max(1, Math.min(splitIdx, chars.length - 1));
        const base = chars.slice(0, position).join('');
        const suffix = chars.slice(position).join('');
        editToken(text, tag, index, (el, doc) => {
            const wrapper = doc.createElementNS('http://www.w3.org/1998/Math/MathML', 'mml:' + ({sub:'msub',super:'msup',frac:'mfrac',over:'mover',under:'munder'}[structure]));
            el.replaceWith(wrapper);
            el.textContent = base;
            wrapper.appendChild(el);
            const attached = doc.createElementNS('http://www.w3.org/1998/Math/MathML', /^\d+$/.test(suffix) ? 'mml:mn' : 'mml:mi');
            attached.textContent = suffix;
            wrapper.appendChild(attached);
        });
    };
    const splitTokenSubscript = (text: string, tag: string, index?: number) => splitTokenAtPosition(text, tag, 1, 'sub', index);
    const deleteToken = (text: string, tag: string, index?: number) => editToken(text, tag, index, removeFormulaToken);
    const addTokenAfter = (text: string, tag: string, index?: number) => editToken(text, tag, index, insertFormulaTokenAfter);
    const changeTokenTagType = (text: string, tag: string, newTag: string, index?: number) => editToken(text, tag, index, (el, doc) => {
        const next = doc.createElementNS('http://www.w3.org/1998/Math/MathML', 'mml:' + newTag);
        for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
        next.textContent = newTag === 'mspace' ? '' : el.textContent;
        el.replaceWith(next);
    });
    const changeTokenMathvariant = (text: string, tag: string, value: string, index?: number) => editToken(text, tag, index, el => {
        if (value === 'none') el.removeAttribute('mathvariant'); else el.setAttribute('mathvariant', value);
    });

    const convertMfencesToMrow = (xml: string): string => {
        try { return expandFormulaFences(xml); }
        catch { return xml; }
    };

    // Auto-fix mismatched tag & mfenced helper
    const autoFixXml = (input: string): string => {
        let fixed = input;
        // Expand any mfenced open/close attributes into standard mrow + mo tags
        if (fixed.includes('mfenced')) {
            fixed = convertMfencesToMrow(fixed);
        }
        // Fix unclosed </mml:close> -> replace with appropriate tag or </mml:msub>
        fixed = fixed.replace(/<\/mml:close>/gi, '</mml:msub>');
        // Fix missing closing tags if simple
        if (!fixed.includes('</ce:display>') && fixed.includes('<ce:display>')) {
            fixed = fixed + '</ce:display>';
        }
        if (!fixed.includes('</ce:formula>') && fixed.includes('<ce:formula')) {
            fixed = fixed.replace(/(<mml:math.*<\/mml:math>)/, '$1</ce:formula>');
        }
        return fixed;
    };

    // Parse XML to DOM & extract properties
    useEffect(() => {
        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            const parserError = doc.querySelector('parsererror');
            
            if (parserError) {
                setXmlError(parserError.textContent || 'XML syntax error detected');
            } else {
                setXmlError(null);
                const metadata = formulaMetadata(xmlInput);
                setFormulaId(metadata.id);
                setAltImg(metadata.altimg);
                setIsDisplay(metadata.display);
            }
        } catch (e: any) {
            setXmlError(e.message || 'Failed to parse XML');
        }
    }, [xmlInput]);

    // Handle attribute change from controls bar
    const handleUpdateMetadata = (newId: string, newAltImg: string, newIsDisplay: boolean) => {
        try {
            setXmlInput(updateFormulaMetadata(xmlInput, newId, newAltImg, newIsDisplay));
        } catch (error) {
            setToast({ msg: error instanceof Error ? error.message : 'Could not update formula metadata.', type: 'error' });
        }
    };

    // Format / Format XML (tag per line)
    const formatXml = () => {
        try {
            const formatted = formatFormulaXml(xmlInput, true);
            setXmlInput(formatted);
            setToast({ msg: "XML formatted for easier reading.", type: 'success' });
        } catch (e) {
            setToast({ msg: "Could not format XML.", type: 'warn' });
        }
    };

    // Compact XML (single line)
    const linearizeXml = () => {
        try {
            const compressed = formatFormulaXml(xmlInput, false);
            setXmlInput(compressed);
            setToast({ msg: "XML compacted without changing formula text.", type: 'info' });
        } catch (e) {
            setToast({ msg: "Could not compact XML.", type: 'warn' });
        }
    };

    // Copy to clipboard
    const handleCopy = async () => {
        try {
        await navigator.clipboard.writeText(validatedFormulaXml(xmlInput, dtdVersion));
        setCopied(true);
        setToast({ msg: "Formula XML copied to clipboard!", type: 'success' });
        setTimeout(() => setCopied(false), 2000);
        } catch (error) { setToast({ msg: error instanceof Error ? error.message : 'Clipboard access failed.', type: 'error' }); }
    };

    const renderableHtmlMathML = useMemo(() => renderFormulaPreview(xmlInput, selectedCanvasToken?.nodeIndex), [xmlInput, selectedCanvasToken]);

    const handleInlineContentEdit = (text: string, value: string, index?: number) => {
        if (text === value) return;
        editToken(text, parsedNodesList[index ?? selectedCanvasToken?.nodeIndex ?? -1]?.tag || selectedCanvasToken?.tagName || 'mi', index, el => setFormulaTokenText(el, value));
    };

    // Handle Direct Clicks on the Rendered Canvas
    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // Try to find closest leaf element with data-token-index
        const tokenEl = target.closest('[data-token-index]') as HTMLElement | null;
        if (tokenEl) {
            const idxAttr = tokenEl.getAttribute('data-token-index');
            if (idxAttr !== null) {
                const idx = parseInt(idxAttr, 10);
                if (!isNaN(idx) && parsedNodesList[idx]) {
                    const node = parsedNodesList[idx];
                    setSelectedFence(null);
                    setSelectedCanvasToken({
                        text: node.text,
                        tagName: node.tag,
                        mathvariant: node.mathvariant,
                        width: node.width,
                        nodeIndex: idx
                    });
                    if (node.tag === 'mspace') spaceEditorRef.current?.focus({preventScroll: true});
                    else symbolEditorRef.current?.focus({preventScroll: true});
                    setToast({
                        msg: `Selected symbol #${idx + 1} "${node.text}" (<${node.tag}>${node.mathvariant ? ` mathvariant="${node.mathvariant}"` : ''})`,
                        type: 'info'
                    });
                    return;
                }
            }
        }

        const fence = target.closest('[data-fence-index]');
        if (fence) selectFence(Number(fence.getAttribute('data-fence-index')));
    };

    // Extract interactive nodes from XML for visual node editor
    const parsedNodesList = useMemo(() => {
        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) return [];

            const nodes: { id: string; index: number; tag: string; text: string; fullTag: string; mathvariant?: string; width?: string }[] = [];
            const allTokens = formulaTokens(doc);
            
            let idx = 0;
            allTokens.forEach((el) => {
                const text = el.textContent || '';
                const tag = el.tagName.replace(/^.*:/, '').toLowerCase();
                // Preserve the source variant; the selected DTD checks whether it is declared.
                const mathvariant = el.getAttribute('mathvariant') || undefined;
                {
                    nodes.push({
                        id: `node-${idx}`,
                        index: idx,
                        tag,
                        text,
                        mathvariant,
                        width: el.getAttribute('width') || undefined,
                        fullTag: el.outerHTML
                    });
                    idx++;
                }
            });

            return nodes;
        } catch (e) {
            return [];
        }
    }, [xmlInput]);

    const renderedFences = useMemo(() => {
        try { return formulaFences(parseFormula(xmlInput)).map((el,index) => ({index, id:el.getAttribute('id')})); }
        catch { return []; }
    }, [xmlInput]);

    const dtdReport = useMemo(() => validateFormulaDtd(xmlInput, dtdVersion), [xmlInput, dtdVersion]);
    const fenceDtdAttributes = formulaDtdAttributes(dtdVersion, 'mml:mfenced');

    // Smart Suggestions on Completion
    const suggestions: SmartSuggestion[] = [
        {
            id: 'xmlRenumber',
            toolName: 'XML Normalizer',
            description: 'Renumber citations and equations sequentially across the document.',
            path: '/xmlRenumber',
            icon: <RefreshCw size={15} className="text-blue-600" />,
            condition: 'Always available'
        },
        {
            id: 'citationLinker',
            toolName: 'Citation Linker Pro MAX',
            description: 'Link inline citation tags to target bibliography nodes and formulas.',
            path: '/citationLinkerExp',
            icon: <Sigma size={15} className="text-indigo-600" />,
            condition: 'Always available'
        },
        {
            id: 'wordToXml',
            toolName: 'MS Word Rich Text to CE XML Scanner',
            description: 'Convert MS Word formula structures into standardized XML.',
            path: '/wordToXml',
            icon: <FileCode size={15} className="text-purple-600" />,
            condition: 'Always available'
        }
    ];

    return (
        <div className="max-w-[1600px] mx-auto px-2 py-5 sm:px-4 lg:px-6 [&_button]:min-h-9 [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-purple-600">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Title Header Bar */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100 shadow-xs">
                        <Sigma size={28} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                                Formula Studio Pro
                            </h1>
                        </div>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                            Paste XML or import LaTeX, then select a symbol in the preview to edit it.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={handleUndo}
                        disabled={historyIndex <= 0}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center gap-1 active:scale-95 ${
                            historyIndex > 0 
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 cursor-pointer' 
                                : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        }`}
                        title="Undo last XML edit"
                    >
                        <RotateCcw size={14} />
                        <span>Undo</span>
                    </button>

                    <button
                        onClick={handleRedo}
                        disabled={historyIndex >= history.length - 1}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center gap-1 active:scale-95 ${
                            historyIndex < history.length - 1 
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 cursor-pointer' 
                                : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        }`}
                        title="Redo XML edit"
                    >
                        <RotateCw size={14} />
                        <span>Redo</span>
                    </button>

                    <button
                        aria-expanded={showTexImporter}
                        aria-controls="formula-tex-import"
                        onClick={() => setShowTexImporter(!showTexImporter)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                            showTexImporter 
                                ? 'bg-purple-100 text-purple-800 border-purple-300' 
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                        }`}
                        title="Convert TeX / LaTeX to MathML XML"
                    >
                        <Calculator size={14} className="text-purple-600" />
                        <span>Import LaTeX</span>
                    </button>

                    <input ref={fileInputRef} type="file" accept=".xml,.mml,application/xml,text/xml" onChange={handleImportFile} className="hidden" aria-label="Open XML file" />
                    <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">Open XML file</button>
                    <button onClick={downloadXml} disabled={!dtdReport?.valid} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40">Download XML</button>

                    <button
                        disabled={!dtdReport?.valid}
                        onClick={handleCopy}
                        className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copied ? 'Copied!' : 'Copy XML'}</span>
                    </button>
                </div>
            </div>

            <p className="mb-4 text-sm text-slate-600 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />Check your formula and XML before using them in a publication.</p>

            {/* TeX / LaTeX Quick Importer Drawer */}
            {showTexImporter && (
                <div id="formula-tex-import" className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 mb-6 border border-purple-700 shadow-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-purple-800">
                        <div className="flex items-center gap-2">
                            <Calculator size={18} className="text-purple-300" />
                            <span className="text-xs font-black uppercase tracking-wider text-purple-100">
                                Import a LaTeX formula
                            </span>
                        </div>
                        <button
                            aria-label="Close LaTeX import"
                            onClick={() => setShowTexImporter(false)}
                            className="text-purple-300 hover:text-white p-1 rounded-lg hover:bg-purple-800 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <p className="text-xs text-purple-200 mb-3">
                        Paste a supported LaTeX expression (e.g. <code className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded font-mono">\ln \frac&#123;C_0&#125;&#123;C_t&#125; = K_&#123;app&#125; t</code> or <code className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded font-mono">x = \frac&#123;-b \pm \sqrt&#123;b^2 - 4ac&#125;&#125;&#123;2a&#125;</code>) to generate MathML XML. Quick import supports fractions, square roots, scripts, common symbols, and text. Unsupported commands leave the current formula unchanged.
                    </p>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                            type="text"
                            value={texInput}
                            onChange={(e) => { setTexInput(e.target.value); setTexError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConvertTex(); }}
                            aria-label="LaTeX formula"
                            aria-invalid={!!texError}
                            aria-describedby={texError ? 'formula-tex-error' : undefined}
                            className="flex-1 bg-purple-950 border border-purple-700 rounded-xl px-4 py-2.5 text-xs font-mono text-purple-100 outline-none focus:border-purple-400 placeholder-purple-400/60"
                            placeholder="Type or paste LaTeX..."
                        />
                        <button
                            onClick={handleConvertTex}
                            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-1.5 active:scale-95"
                        >
                            <Sparkles size={14} />
                            <span>Use this formula</span>
                        </button>
                    </div>
                </div>
            )}

            {showTexImporter && texError && <p id="formula-tex-error" role="alert" className="-mt-3 mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{texError} Your current formula is unchanged.</p>}

            {/* Info Collapsible Banner */}
            <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-slate-50 border border-purple-200/80 rounded-2xl p-4 mb-6 transition-all">
                <button type="button" aria-expanded={showInfo} aria-controls="formula-help" className="w-full flex items-center justify-between text-left" onClick={() => setShowInfo(!showInfo)}>
                    <div className="flex items-center gap-2 text-xs font-black text-purple-900 uppercase tracking-wider">
                        <HelpCircle size={15} className="text-purple-600" />
                        <span>How to edit a formula</span>
                    </div>
                    <span className="text-xs font-bold text-purple-600 hover:text-purple-800">
                        {showInfo ? 'Hide help' : 'Show help'}
                    </span>
                </button>

                {showInfo && (
                    <div id="formula-help" className="mt-3 text-sm text-slate-700 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-purple-200/50">
                        <div className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-600 mt-1.5 shrink-0"></div>
                            <div>
                                <span className="font-bold text-slate-900">Live Two-Way Sync:</span> Edits in raw XML reflect instantly in the rendered MathML canvas, and editing math variables or text inline in the rendered formula updates the XML in real-time.
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0"></div>
                            <div>
                                <span className="font-bold text-slate-900">Tag Auto-Repair:</span> Automatically detects syntax errors (like mismatched <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded">&lt;/mml:close&gt;</code> tags) and corrects them with a single click.
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0"></div>
                            <div>
                                <span className="font-bold text-slate-900">Attribute & Preset Control:</span> Manage formula <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded">id</code>, <code className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded">altimg</code>, and display modes directly from the toolbar.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Presets & View Mode Toolbar */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="formula-sample" className="text-sm font-semibold text-slate-600">Try an example</label>
                    <select id="formula-sample" value="" onChange={(event) => {
                        const sample = PRESET_SAMPLES.find(item => item.id === event.target.value);
                        if (sample) { setXmlInput(sample.xml); setToast({msg: 'Example loaded. Undo restores your previous formula.', type: 'info'}); }
                    }} className="max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <option value="" disabled>Choose a formula…</option>
                        {PRESET_SAMPLES.map(sample => <option key={sample.id} value={sample.id}>{sample.name.replace('User Request Sample (Reaction Kinetics)', 'Reaction kinetics')}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        aria-pressed={viewMode === 'split'}
                        onClick={() => setViewMode('split')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'split' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Split size={14} />
                        <span>Preview + XML</span>
                    </button>
                    <button
                        aria-pressed={viewMode === 'rendered'}
                        onClick={() => setViewMode('rendered')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'rendered' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Eye size={14} />
                        <span>Preview</span>
                    </button>
                    <button
                        aria-pressed={viewMode === 'code'}
                        onClick={() => setViewMode('code')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'code' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Code size={14} />
                        <span>XML</span>
                    </button>
                </div>
            </div>

            {/* Formula Attribute Control Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={13} className="text-purple-600" /> Formula ID:
                        </label>
                        <input
                            type="text"
                            aria-label="Formula ID"
                            value={formulaId}
                            onChange={(e) => handleUpdateMetadata(e.target.value, altImg, isDisplay)}
                            className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 w-28 outline-none focus:ring-2 focus:ring-purple-200"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                            <Layers size={13} className="text-indigo-600" /> Alt Reference:
                        </label>
                        <input
                            type="text"
                            aria-label="Alt Reference"
                            value={altImg}
                            onChange={(e) => handleUpdateMetadata(formulaId, e.target.value, isDisplay)}
                            className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 w-28 outline-none focus:ring-2 focus:ring-purple-200"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Layout Type:</label>
                        <button
                            onClick={() => handleUpdateMetadata(formulaId, altImg, !isDisplay)}
                            className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all ${
                                isDisplay 
                                    ? 'bg-purple-100 text-purple-800 border-purple-200' 
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                        >
                            {isDisplay ? 'Display equation' : 'Inline equation'}
                        </button>
                    </div>
                </div>

                {xmlError && (
                    <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-1.5 rounded-xl border border-amber-200">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        <span className="font-semibold">Syntax Warning Detected</span>
                        <button
                            onClick={() => {
                                const fixed = autoFixXml(xmlInput);
                                setXmlInput(fixed);
                                setToast({ msg: "Auto-repaired XML tags!", type: 'success' });
                            }}
                            className="ml-2 font-bold text-amber-900 underline hover:text-amber-950"
                        >
                            Auto-Fix XML
                        </button>
                    </div>
                )}
            </div>

            <section aria-label="Elsevier formula validation" className="mb-6 rounded-2xl border border-purple-200 bg-white p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">Elsevier CE article 5.7</span>
                    <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">Automatic DTD validation</span>
                </div>
                <p className="text-sm text-slate-600">Formulas are checked against Elsevier CE article 5.7 before copying or downloading. Checks cover elements, child order, attributes, enumerations, and local IDs.</p>
                <div role="status" aria-label="Elsevier DTD status" aria-live="polite" className={dtdReport?.valid ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-amber-800'}>
                    {dtdReport.valid ? 'CE '+dtdVersion+' DTD-derived formula checks passed.' : 'Resolve the CE '+dtdVersion+' formula issues below before export.'}
                </div>
                {dtdReport && !dtdReport.valid && <ul aria-label="DTD validation errors" className="list-disc pl-5 space-y-1 text-sm text-red-700 break-words">{dtdReport.errors.map((error,index) => <li key={index}>{error}</li>)}</ul>}
                {dtdReport && dtdReport.warnings.length > 0 && <ul aria-label="Article-context checks" className="list-disc pl-5 text-sm text-amber-800">{dtdReport.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>}
                <p className="text-xs text-slate-500">These are formula-fragment checks, not complete-article validation. Final article placement, document-wide IDs/references, and journal rules still require validation in the destination article. Export uses canonical ce: and mml: prefixes.</p>
            </section>

            {/* Main Interactive Editor Grid */}
            <div className={`grid gap-6 ${
                viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}>
                
                {/* Panel 1: Rendered View & Interactive Canvas */}
                {(viewMode === 'split' || viewMode === 'rendered') && (
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 flex flex-col min-h-[460px]">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <Eye size={16} className="text-purple-600" /> Formula preview
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Select a symbol to edit
                                </span>
                            </div>
                        </div>

                        {/* Quick Greek & Special Symbol Insertion Palette */}
                        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                                <Tag size={12} className="text-purple-600" /> Insert symbol:
                            </span>
                            {['α', 'β', 'γ', 'δ', 'θ', 'λ', 'μ', 'π', 'σ', 'ω', 'Δ', '±', '≤', '≥', '≠', '≈', '∞', '∂', '∫', '∑', '→'].map(sym => (
                                <button
                                    key={sym}
                                    onClick={() => {
                                        try {
                                            const selected = selectedCanvasToken;
                                            const updated = insertFormulaSymbol(xmlInput, sym, selected || undefined);
                                            setXmlInput(updated);
                                            if (selected && selected.nodeIndex !== undefined) {
                                                const replacesEmpty = selected.tagName !== 'mspace' && !selected.text.trim();
                                                setSelectedCanvasToken({text: sym, tagName: formulaSymbolTag(sym), nodeIndex: selected.nodeIndex + (replacesEmpty ? 0 : 1)});
                                            }
                                        } catch (error) {
                                            setToast({msg: error instanceof Error ? error.message : 'Could not insert symbol.', type: 'error'});
                                        }
                                    }}
                                    className="w-7 h-7 text-xs font-serif font-bold text-slate-800 bg-white hover:bg-purple-600 hover:text-white border border-slate-200 hover:border-purple-600 rounded-lg shadow-2xs transition-all flex items-center justify-center active:scale-95"
                                    title={`Insert symbol ${sym}`}
                                >
                                    {sym}
                                </button>
                            ))}
                        </div>

                        {renderedFences.length > 0 && <label className="mb-4 flex items-center gap-2 flex-wrap text-sm text-slate-600">Edit fence
                            <select aria-label="Edit fence" value={selectedFence ?? ''} onChange={event => selectFence(Number(event.target.value))} className="border border-purple-200 rounded-lg px-3 py-2 bg-white max-w-full">
                                <option value="" disabled>Click a bracket or choose a fence…</option>
                                {renderedFences.map(fence => <option key={fence.index} value={fence.index}>Fence {fence.index+1}{fence.id ? ' — '+fence.id : ''}</option>)}
                            </select>
                        </label>}

                        {/* MathML Display Container with Direct Canvas Click Listener & Hover Highlighting */}
                        <div className="flex-1 bg-slate-50/80 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[240px] overflow-x-auto relative group">
                            
                            {selectedFence !== null && (
                                <section aria-label="Fence attributes" className="w-full mb-4 p-4 bg-purple-900 text-white rounded-xl border border-purple-700">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <h3 className="text-sm font-bold">Edit fence {selectedFence + 1} attributes</h3>
                                        <button aria-label="Close fence editor" onClick={() => setSelectedFence(null)} className="p-2 rounded hover:bg-purple-800"><X size={16}/></button>
                                    </div>
                                    <p className="text-xs text-purple-200 mb-3">Blank opening or closing brackets hide that side. Blank separators remove separators.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {([{name:'open',label:'Opening bracket'},{name:'close',label:'Closing bracket'},{name:'separators',label:'Separators'}]).map(({name,label}) => (
                                            <label key={name} className="text-sm">{label}<input ref={name === 'open' ? fenceOpeningRef : undefined} value={fenceDraft[name] ?? ''} onChange={event => setFenceDraft({...fenceDraft,[name]:event.target.value})} className="mt-1 w-full bg-purple-950 border border-purple-600 rounded p-2 text-white" /></label>
                                        ))}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {Object.entries(fenceDraft).filter(([name]) => !['open','close','separators'].includes(name)).map(([name,value]) => (
                                            <div key={name} className="flex gap-2 items-end">
                                                <label className="flex-1 text-sm">{name}<input value={value} onChange={event => setFenceDraft({...fenceDraft,[name]:event.target.value})} className="mt-1 w-full bg-purple-950 border border-purple-600 rounded p-2 text-white" /></label>
                                                <button aria-label={'Remove fence attribute '+name} onClick={() => {const next={...fenceDraft};delete next[name];setFenceDraft(next);}} className="p-2 rounded hover:bg-purple-800"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                    <details className="mt-3"><summary className="cursor-pointer text-sm">Add another attribute</summary>
                                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <label className="text-sm">Attribute name<input value={newFenceAttribute} onChange={event => setNewFenceAttribute(event.target.value)} placeholder="mathsize" list="mfenced-dtd-attributes" className="mt-1 w-full bg-purple-950 border border-purple-600 rounded p-2 text-white" /></label>
                                            <label className="text-sm">Attribute value<input value={newFenceValue} onChange={event => setNewFenceValue(event.target.value)} placeholder="1.2em" className="mt-1 w-full bg-purple-950 border border-purple-600 rounded p-2 text-white" /></label>
                                        </div>
                                        <datalist id="mfenced-dtd-attributes">{Object.keys(fenceDtdAttributes).filter(name => !name.startsWith('xmlns')).map(name => <option key={name} value={name}/>)}</datalist>
                                        <button onClick={() => {const name=newFenceAttribute.trim();if (!name || Object.hasOwn(fenceDraft,name)) {setFenceError('Enter a new, unique attribute name.');return;}setFenceDraft({...fenceDraft,[name]:newFenceValue});setNewFenceAttribute('');setNewFenceValue('');setFenceError(null);}} className="mt-2 px-3 py-2 border border-purple-500 rounded">Add attribute</button>
                                    </details>
                                    {fenceError && <p role="alert" className="mt-3 text-sm text-amber-200">{fenceError}</p>}
                                    <div className="mt-4 flex gap-2"><button onClick={applyFenceAttributes} className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded font-semibold">Apply fence attributes</button><button onClick={() => setSelectedFence(null)} className="px-3 py-2 border border-purple-600 rounded">Cancel</button></div>
                                </section>
                            )}

                            {/* In-Canvas Floating Quick Editor Overlay (When a symbol on canvas is clicked) */}
                            {selectedCanvasToken && (
                                <div className="w-full mb-4 p-3 bg-purple-900 text-white rounded-xl shadow-lg border border-purple-700 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-purple-800/80">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={14} className="text-purple-300" />
                                            <span className="text-xs font-bold text-purple-100">
                                                Edit selected symbol
                                            </span>
                                            <span className="text-xs font-mono font-black bg-purple-800 text-purple-200 px-2 py-0.5 rounded border border-purple-700">
                                                &lt;{selectedCanvasToken.tagName}&gt;{selectedCanvasToken.text}&lt;/{selectedCanvasToken.tagName}&gt;
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setSelectedCanvasToken(null)}
                                            className="text-purple-300 hover:text-white p-1 rounded-lg hover:bg-purple-800 transition-colors"
                                            title="Close floating editor"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                        {/* Real-time Text Input */}
                                        <div className="sm:col-span-5 flex items-center gap-1.5 bg-purple-950 p-1.5 rounded-lg border border-purple-700">
                                            <Edit3 size={13} className="text-purple-400 shrink-0 ml-1" />
                                            {selectedCanvasToken.tagName === 'mspace' ? (
                                                <div className="w-full space-y-2">
                                                    <label htmlFor="formula-space-width" className="text-xs font-semibold text-purple-100">Space width</label>
                                                    <input id="formula-space-width" ref={spaceEditorRef} data-formula-editor value={spaceWidth}
                                                        onChange={event => {setSpaceWidth(event.target.value); setSpaceError(null);}}
                                                        onKeyDown={event => {if (event.key === 'Enter') applySpaceWidth(); if (event.key === 'Escape') setSelectedCanvasToken(null);}}
                                                        aria-invalid={!!spaceError} aria-describedby="formula-space-help"
                                                        className="w-full bg-purple-950 border border-purple-600 rounded p-2 text-sm text-white" placeholder="0.5em" />
                                                    <p id="formula-space-help" className="text-xs text-purple-200">Use a length such as 0.5em or 8px. Leave blank for the default.</p>
                                                    {spaceError && <p role="alert" className="text-xs text-amber-200">{spaceError}</p>}
                                                    <button onClick={applySpaceWidth} className="px-3 py-1 rounded bg-purple-600 text-sm text-white">Apply spacing</button>
                                                </div>
                                            ) : (
                                            <textarea
                                                ref={symbolEditorRef}
                                                data-formula-editor
                                                rows={selectedCanvasToken.tagName === 'mtext' ? 2 : 1}
                                                value={selectedCanvasToken.text}
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    const source = parsedNodesList[selectedCanvasToken.nodeIndex ?? -1];
                                                    if (source) handleInlineContentEdit(source.text, newVal, source.index);
                                                    setSelectedCanvasToken({ ...selectedCanvasToken, text: newVal });
                                                }}
                                                className="w-full text-xs font-mono font-black text-white bg-transparent outline-none"
                                                aria-label="Selected symbol value"
                                                onKeyDown={(event) => { if (event.key === 'Escape') setSelectedCanvasToken(null); }}
                                                placeholder="Symbol value..."
                                            />
                                            )}
                                        </div>

                                        {/* Quick Structural Wrappers Bar */}
                                        <div className="sm:col-span-7 flex items-center gap-1 flex-wrap">
                                            <button
                                                onClick={() => wrapTokenSubscript(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-mono font-bold px-2 py-1 bg-purple-800 hover:bg-purple-600 text-purple-100 rounded border border-purple-700 transition-all"
                                                title="Subscript <mml:msub>"
                                            >
                                                x<sub>0</sub> Sub
                                            </button>
                                            <button
                                                onClick={() => wrapTokenSuperscript(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-mono font-bold px-2 py-1 bg-purple-800 hover:bg-purple-600 text-purple-100 rounded border border-purple-700 transition-all"
                                                title="Superscript <mml:msup>"
                                            >
                                                x<sup>2</sup> Super
                                            </button>
                                            <button
                                                onClick={() => wrapTokenSubSuperscript(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-mono font-bold px-2 py-1 bg-purple-800 hover:bg-purple-600 text-purple-100 rounded border border-purple-700 transition-all"
                                                title="Sub & Super <mml:msubsup>"
                                            >
                                                x<sub>0</sub><sup>t</sup>
                                            </button>
                                            <button
                                                onClick={() => wrapTokenFraction(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-mono font-bold px-2 py-1 bg-purple-800 hover:bg-purple-600 text-purple-100 rounded border border-purple-700 transition-all"
                                                title="Fraction <mml:mfrac>"
                                            >
                                                a/b Frac
                                            </button>
                                            <button
                                                onClick={() => wrapTokenSqrt(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-mono font-bold px-2 py-1 bg-purple-800 hover:bg-purple-600 text-purple-100 rounded border border-purple-700 transition-all"
                                                title="Square Root <mml:msqrt>"
                                            >
                                                √x Sqrt
                                            </button>
                                            <button
                                                onClick={() => deleteToken(selectedCanvasToken.text, selectedCanvasToken.tagName)}
                                                className="text-[10px] font-bold px-2 py-1 bg-rose-900/80 hover:bg-rose-700 text-rose-200 rounded border border-rose-700 transition-all ml-auto"
                                                title="Delete token"
                                            >
                                                Delete
                                            </button>
                                        </div>

                                         {/* Multi-position Custom Split Chooser for multi-character identifiers */}
                                        {Array.from(selectedCanvasToken.text).length >= 2 && (
                                            <div className="sm:col-span-12 mt-2 pt-2 border-t border-purple-800/80 flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 shrink-0">
                                                    <Split size={13} className="text-amber-400" /> Choose Split & Structure:
                                                </span>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {Array.from({ length: Array.from(selectedCanvasToken.text).length - 1 }).map((_, idx) => {
                                                        const pos = idx + 1;
                                                        const base = Array.from(selectedCanvasToken.text).slice(0, pos).join('');
                                                        const sub = Array.from(selectedCanvasToken.text).slice(pos).join('');
                                                        return (
                                                            <div key={pos} className="inline-flex rounded-lg border border-amber-500/80 overflow-hidden shadow-2xs bg-purple-950/80">
                                                                <button
                                                                    onClick={() => splitTokenAtPosition(selectedCanvasToken.text, selectedCanvasToken.tagName, pos, 'sub')}
                                                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-mono text-[11px] font-bold transition-colors flex items-center gap-0.5"
                                                                    title={`Split "${selectedCanvasToken.text}" into Subscript: <mml:msub><mml:${selectedCanvasToken.tagName}>${base}</mml:${selectedCanvasToken.tagName}><mml:mi>${sub}</mml:mi></mml:msub>`}
                                                                >
                                                                    <span>{base}</span>
                                                                    <sub className="text-[9px] text-amber-200">{sub}</sub>
                                                                </button>
                                                                <button
                                                                    onClick={() => splitTokenAtPosition(selectedCanvasToken.text, selectedCanvasToken.tagName, pos, 'super')}
                                                                    className="px-1.5 py-1 bg-purple-900 hover:bg-purple-700 text-purple-200 font-mono text-[10px] font-bold transition-colors border-l border-amber-500/40"
                                                                    title={`Split into Superscript: ${base}^${sub}`}
                                                                >
                                                                    <span>{base}</span>
                                                                    <sup>{sub}</sup>
                                                                </button>
                                                                <button
                                                                    onClick={() => splitTokenAtPosition(selectedCanvasToken.text, selectedCanvasToken.tagName, pos, 'frac')}
                                                                    className="px-1.5 py-1 bg-indigo-900 hover:bg-indigo-700 text-indigo-200 font-mono text-[10px] font-bold transition-colors border-l border-amber-500/40"
                                                                    title={`Split into Fraction: <mml:mfrac>`}
                                                                >
                                                                    <span>{base}</span>
                                                                    <span className="text-[9px] text-indigo-300">/{sub}</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => splitTokenAtPosition(selectedCanvasToken.text, selectedCanvasToken.tagName, pos, 'over')}
                                                                    className="px-1.5 py-1 bg-slate-900 hover:bg-slate-700 text-slate-200 font-mono text-[10px] font-bold transition-colors border-l border-amber-500/40"
                                                                    title={`Split into Overscript: <mml:mover>`}
                                                                >
                                                                    <span>{base}</span>
                                                                    <span className="text-[9px] text-slate-400">̄{sub}</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => splitTokenAtPosition(selectedCanvasToken.text, selectedCanvasToken.tagName, pos, 'under')}
                                                                    className="px-1.5 py-1 bg-emerald-950 hover:bg-emerald-800 text-emerald-200 font-mono text-[10px] font-bold transition-colors border-l border-amber-500/40"
                                                                    title={`Split into Underscript: <mml:munder>`}
                                                                >
                                                                    <span>{base}</span>
                                                                    <span className="text-[9px] text-emerald-400">_{sub}</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                                      {/* Math Variant (mathvariant) Font Attribute Chooser */}
                                        <div className="sm:col-span-12 mt-2 pt-2 border-t border-purple-800/80 flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-[11px] font-bold text-purple-200 flex items-center gap-1.5 shrink-0">
                                                <Tag size={13} className="text-amber-400" /> Font Variant (mathvariant):
                                            </span>
                                            {['mi','mn','mo','mtext','mspace'].includes(selectedCanvasToken.tagName.replace(/^.*:/, '').toLowerCase()) ? (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    {[
                                                        { id: 'italic', label: 'italic (Italic)' },
                                                        { id: 'normal', label: 'normal (Upright)' },
                                                        { id: 'none', label: 'Clear' }
                                                    ].map(v => (
                                                        <button
                                                            key={v.id}
                                                            onClick={() => changeTokenMathvariant(selectedCanvasToken.text, selectedCanvasToken.tagName, v.id)}
                                                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded transition-all border ${
                                                                (selectedCanvasToken.mathvariant === v.id) || (v.id === 'none' && !selectedCanvasToken.mathvariant)
                                                                    ? 'bg-amber-400 text-purple-950 border-amber-300 shadow-2xs font-black'
                                                                    : 'bg-purple-950 hover:bg-purple-700 text-purple-200 border-purple-700'
                                                            }`}
                                                            title={`Apply mathvariant="${v.id}" to <${selectedCanvasToken.tagName}>`}
                                                        >
                                                            {v.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-mono text-purple-300/80 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/80">
                                                    Check the selected DTD for this element’s allowed attributes
                                                </span>
                                            )}
                                        </div>
                                        </div>
                                    </div>
                            )}

                            {renderableHtmlMathML ? (
                                <div className="text-center w-full my-auto">
                                    <div 
                                        onClick={handleCanvasClick}
                                        className="text-2xl sm:text-3xl font-serif text-slate-900 select-none p-6 rounded-2xl inline-block max-w-full overflow-x-auto cursor-pointer [&_[data-token-index]]:hover:bg-purple-100"
                                        dangerouslySetInnerHTML={{ __html: renderableHtmlMathML }}
                                        title="Click any formula symbol to edit directly on canvas!"
                                    />
                                    <p className="text-[11px] font-semibold text-slate-400 mt-4 flex items-center justify-center gap-1.5">
                                        <Sparkles size={12} className="text-purple-500" />
                                        Select a symbol above, or expand “Edit all symbols” below.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-8">
                                    <AlertTriangle size={32} className="mx-auto mb-2 text-amber-500" />
                                    <p className="text-xs font-bold text-slate-600">Your preview will appear here</p>
                                    <p className="text-[11px] text-slate-400 mt-1">Paste a MathML formula in the XML editor, import LaTeX, or choose an example.</p>
                                </div>
                            )}
                        </div>

                        {/* MathML Structural Elements Quick Palette */}
                        <details className="mt-4 p-4 bg-purple-50/60 border border-purple-100 rounded-2xl"><summary className="cursor-pointer text-sm font-semibold text-purple-900">Insert a fraction, script, or other structure</summary>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-purple-600" /> MathML Structure Palette (1-Click Insert)
                                </span>
                                <span className="text-[10px] text-purple-600 font-bold">Appends to formula XML</span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    onClick={() => insertMathSnippet('<mml:msub><mml:mi>x</mml:mi><mml:mn>0</mml:mn></mml:msub>', 'Subscript (x₀)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Subscript: <mml:msub>"
                                >
                                    <span>x<sub>0</sub></span>
                                    <span className="text-[9px] opacity-75 font-sans">(Sub)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:msup><mml:mi>x</mml:mi><mml:mn>2</mml:mn></mml:msup>', 'Superscript (x²)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Superscript: <mml:msup>"
                                >
                                    <span>x<sup>2</sup></span>
                                    <span className="text-[9px] opacity-75 font-sans">(Super)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:msubsup><mml:mi>x</mml:mi><mml:mn>0</mml:mn><mml:mi>t</mml:mi></mml:msubsup>', 'Sub-Superscript (x₀ᵗ)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Sub & Superscript: <mml:msubsup>"
                                >
                                    <span>x<sub>0</sub><sup>t</sup></span>
                                    <span className="text-[9px] opacity-75 font-sans">(Sub/Super)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mfrac><mml:mi>a</mml:mi><mml:mi>b</mml:mi></mml:mfrac>', 'Fraction (a/b)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Fraction: <mml:mfrac>"
                                >
                                    <span>a/b</span>
                                    <span className="text-[9px] opacity-75 font-sans">(Frac)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:msqrt><mml:mi>x</mml:mi></mml:msqrt>', 'Square Root (√x)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Square Root: <mml:msqrt>"
                                >
                                    <span>√x</span>
                                    <span className="text-[9px] opacity-75 font-sans">(Sqrt)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:munder><mml:mo>lim</mml:mo><mml:mrow><mml:mi>x</mml:mi><mo>→</mo><mn>0</mn></mrow></mml:munder>', 'Underscript (Lim)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Underscript: <mml:munder>"
                                >
                                    <span>Under (lim)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mover><mml:mi>x</mml:mi><mml:mo>&#x203E;</mml:mo></mml:mover>', 'Overscript (x̄)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Overscript: <mml:mover>"
                                >
                                    <span>Over (x̄)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:munderover><mml:mo>∫</mml:mo><mn>0</mn><mo>∞</mo></mml:munderover>', 'Definite Integral')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Under/Over: <mml:munderover>"
                                >
                                    <span>∫₀<sup>∞</sup></span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mspace width="0.25em"/>', 'Space Token')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Space: <mml:mspace>"
                                >
                                    <span>Space</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mfenced open="(" close=")"><mml:mi>x</mml:mi></mml:mfenced>', 'Parentheses Fenced (x)')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Fenced: <mml:mfenced open='(' close=')'>"
                                >
                                    <span>(x)</span>
                                    <span className="text-[9px] opacity-75 font-sans">(mfenced)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mfenced open="[" close="]"><mml:mi>x</mml:mi></mml:mfenced>', 'Bracket Fenced [x]')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Fenced: <mml:mfenced open='[' close=']'>"
                                >
                                    <span>[x]</span>
                                    <span className="text-[9px] opacity-75 font-sans">(mfenced)</span>
                                </button>

                                <button
                                    onClick={() => insertMathSnippet('<mml:mfenced open="{" close="}"><mml:mi>x</mml:mi></mml:mfenced>', 'Brace Fenced {x}')}
                                    className="px-2.5 py-1 text-xs font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded-lg border border-purple-200 transition-all shadow-2xs flex items-center gap-1"
                                    title="Fenced: <mml:mfenced open='{' close='}'>"
                                >
                                    <span>{"{x}"}</span>
                                    <span className="text-[9px] opacity-75 font-sans">(mfenced)</span>
                                </button>
                            </div>

                            {/* mathvariant Identifier Quick Snippets & mfenced Normalize */}
                            <div className="mt-3 pt-2.5 border-t border-purple-200/60 flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-bold text-purple-950 uppercase tracking-tight mr-1 flex items-center gap-1">
                                        <Tag size={11} className="text-purple-600" /> mathvariant Snippets:
                                    </span>
                                    <button
                                        onClick={() => insertMathSnippet('<mml:mi mathvariant="italic">x</mml:mi>', 'Italic Identifier')}
                                        className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded border border-purple-200 transition-all shadow-2xs"
                                        title="Insert <mml:mi mathvariant='italic'>x</mml:mi>"
                                    >
                                        &lt;mi mathvariant="italic"&gt;x&lt;/mi&gt;
                                    </button>
                                    <button
                                        onClick={() => insertMathSnippet('<mml:mi mathvariant="normal">t</mml:mi>', 'Upright Normal Identifier')}
                                        className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white hover:bg-purple-600 hover:text-white text-purple-900 rounded border border-purple-200 transition-all shadow-2xs"
                                        title="Insert <mml:mi mathvariant='normal'>t</mml:mi>"
                                    >
                                        &lt;mi mathvariant="normal"&gt;t&lt;/mi&gt;
                                    </button>
                                </div>

                                {xmlInput.includes('mfenced') && (
                                    <button
                                        onClick={() => {
                                            const converted = convertMfencesToMrow(xmlInput);
                                            if (converted !== xmlInput) {
                                                setXmlInput(converted);
                                                setToast({ msg: "Expanded <mml:mfenced> open/close attributes into explicit <mml:mrow><mml:mo> tags!", type: 'success' });
                                            }
                                        }}
                                        className="px-2.5 py-1 text-[11px] font-mono font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all shadow-2xs flex items-center gap-1 active:scale-95"
                                        title="Expand <mml:mfenced open='...' close='...'> into <mml:mrow><mml:mo>...</mml:mo></mrow>"
                                    >
                                        <Wand2 size={12} />
                                        <span>Expand &lt;mml:mfenced&gt; open/close</span>
                                    </button>
                                )}
                            </div>
                        </details>

                        {/* Interactive Node Token List with Full Structural Controls */}
                        <details className="mt-5 pt-4 border-t border-slate-100"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Edit all symbols ({parsedNodesList.length})</summary>
                            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Edit3 size={14} className="text-indigo-600" /> Interactive Token Studio ({parsedNodesList.length} tokens)
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                    Edit values, change tag types, set mathvariant attributes, or wrap tokens
                                </span>
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto p-1">
                                {parsedNodesList.length > 0 ? (
                                    parsedNodesList.map((node) => {
                                        const isSelected = selectedCanvasToken?.nodeIndex === node.index;
                                        return (
                                            <div 
                                                key={node.id + node.fullTag}
                                                onClick={() => {
                                                    setSelectedFence(null);
                                                    setSelectedCanvasToken({
                                                        text: node.text,
                                                        tagName: node.tag,
                                                        mathvariant: node.mathvariant,
                        width: node.width,
                                                        nodeIndex: node.index
                                                    });
                                                }}
                                                className={`p-2.5 rounded-2xl transition-all shadow-2xs flex flex-col gap-2 group cursor-pointer border ${
                                                    isSelected 
                                                        ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300' 
                                                        : 'bg-slate-50 hover:bg-purple-50/60 border-slate-200 hover:border-purple-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    {/* Tag & mathvariant Selector Pills */}
                                                    <div className="flex items-center gap-1 flex-wrap">
                                                        <span className="text-[10px] font-mono font-black text-slate-400 bg-slate-200/80 px-1.5 py-0.5 rounded">
                                                            #{node.index + 1}
                                                        </span>
                                                        <select
                                                            value={node.tag}
                                                            onChange={(e) => changeTokenTagType(node.text, node.tag, e.target.value, node.index)}
                                                            className="text-[10px] font-mono font-bold text-purple-700 bg-white border border-purple-200 rounded-lg px-1.5 py-0.5 outline-none cursor-pointer hover:bg-purple-100 transition-colors"
                                                            title="Click to change MathML tag type"
                                                        >
                                                            <option value="mi">&lt;mi&gt; identifier</option>
                                                            <option value="mn">&lt;mn&gt; number</option>
                                                            <option value="mo">&lt;mo&gt; operator</option>
                                                            <option value="mtext">&lt;mtext&gt; text</option>
                                                            <option value="mspace">&lt;mspace&gt; space</option>
                                                        </select>

                                                        {['mi','mn','mo','mtext','mspace'].includes(node.tag) && (
                                                            <select
                                                                value={node.mathvariant || 'none'}
                                                                onChange={(e) => changeTokenMathvariant(node.text, node.tag, e.target.value, node.index)}
                                                                className={`text-[10px] font-mono font-bold rounded-lg px-1.5 py-0.5 outline-none cursor-pointer transition-colors border ${
                                                                    node.mathvariant 
                                                                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold' 
                                                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                                                }`}
                                                                title="Set mathvariant font attribute (italic, normal, bold, etc.)"
                                                            >
                                                                <option value="none">variant: none</option>
                                                                <option value="italic">italic</option>
                                                                <option value="normal">normal</option>
                                                            </select>
                                                        )}
                                                    </div>

                                                    {/* Action utilities */}
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); addTokenAfter(node.text, node.tag, node.index); }}
                                                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                                                            title="Add token after"
                                                        >
                                                            <Plus size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); deleteToken(node.text, node.tag, node.index); }}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                                            title="Delete token"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Value Input Field */}
                                                <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200">
                                                    <textarea
                                                        rows={node.tag === 'mtext' ? 2 : 1}
                                                        disabled={node.tag === 'mspace'}
                                                        defaultValue={node.tag === 'mspace' ? node.width || 'Default spacing' : node.text}
                                                        onBlur={(e) => {
                                                            const val = e.target.value;
                                                            if (val !== node.text) {
                                                                handleInlineContentEdit(node.text, val, node.index);
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && node.tag !== 'mtext') {
                                                                e.currentTarget.blur();
                                                            }
                                                        }}
                                                        className="text-xs font-mono font-black text-slate-900 bg-transparent outline-none w-full px-1"
                                                        placeholder="Token text..."
                                                    />
                                                    {node.tag === 'mspace' && <button className="text-xs font-bold text-purple-700" onClick={() => {setSelectedFence(null);setSelectedCanvasToken({text: node.text, tagName: node.tag, nodeIndex: node.index, width: node.width});}}>Edit spacing</button>}
                                                </div>

                                            {/* Quick Structural Wrap Toolbar */}
                                            <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-200/60">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mr-1">Wrap:</span>
                                                
                                             {/* Multi-point Split Chooser */}
                                             {Array.from(node.text).length >= 2 && (
                                                 <div className="w-full pt-1.5 border-t border-slate-200/60 flex items-center gap-1 flex-wrap">
                                                     <span className="text-[9px] font-bold text-amber-900 uppercase tracking-tight flex items-center gap-0.5 shrink-0">
                                                         <Split size={10} className="text-amber-600" /> Split at:
                                                     </span>
                                                     {Array.from({ length: Array.from(node.text).length - 1 }).map((_, idx) => {
                                                         const pos = idx + 1;
                                                         const base = Array.from(node.text).slice(0, pos).join('');
                                                         const sub = Array.from(node.text).slice(pos).join('');
                                                         return (
                                                             <div key={pos} className="inline-flex rounded border border-slate-300 overflow-hidden shadow-2xs text-[10px]">
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'sub', node.index)}
                                                                     className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-900 font-mono font-bold transition-colors"
                                                                     title={`Split "${node.text}" into Subscript: ${base}_${sub}`}
                                                                 >
                                                                     {base}<sub>{sub}</sub>
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'super', node.index)}
                                                                     className="px-1 py-0.5 bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-900 font-mono font-bold transition-colors border-l border-slate-200"
                                                                     title={`Split into Superscript: ${base}^${sub}`}
                                                                 >
                                                                     {base}<sup>{sub}</sup>
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'frac', node.index)}
                                                                     className="px-1 py-0.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-900 font-mono font-bold transition-colors border-l border-slate-200"
                                                                     title={`Split into Fraction: ${base}/${sub}`}
                                                                 >
                                                                     {base}/{sub}
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'over', node.index)}
                                                                     className="px-1 py-0.5 bg-slate-100 hover:bg-slate-700 hover:text-white text-slate-800 font-mono font-bold transition-colors border-l border-slate-200"
                                                                     title={`Split into Overscript: ${base} with ${sub} over`}
                                                                 >
                                                                     {base}̄{sub}
                                                                 </button>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                             )}

                                                <button
                                                    onClick={() => wrapTokenSubscript(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Subscript <mml:msub>"
                                                >
                                                    x<sub>0</sub>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSuperscript(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Superscript <mml:msup>"
                                                >
                                                    x<sup>2</sup>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSubSuperscript(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Sub/Superscript <mml:msubsup>"
                                                >
                                                    x<sub>0</sub><sup>t</sup>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenFraction(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Fraction <mml:mfrac>"
                                                >
                                                    a/b
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSqrt(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Square Root <mml:msqrt>"
                                                >
                                                    √x
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenUnder(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Underscript <mml:munder>"
                                                >
                                                    Under
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenOver(node.text, node.tag, node.index)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Overscript <mml:mover>"
                                                >
                                                    Over
                                                </button>
                                            </div>
                                        </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-xs text-slate-400 italic col-span-2">No editable MathML text tokens found.</p>
                                )}
                            </div>
                        </details>
                    </div>
                )}

                {/* Panel 2: Raw XML Code Editor */}
                {(viewMode === 'split' || viewMode === 'code') && (
                    <div className="bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-800 flex flex-col min-h-[460px] text-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 flex-wrap gap-2">
                            <span className="text-xs font-black text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                <Code size={16} /> Formula XML
                            </span>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleUndo}
                                        disabled={historyIndex <= 0}
                                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 active:scale-95 ${
                                            historyIndex > 0 
                                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer' 
                                                : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed'
                                        }`}
                                        title="Undo last XML edit (Ctrl+Z / Cmd+Z)"
                                    >
                                        <RotateCcw size={12} />
                                        <span>Undo</span>
                                    </button>

                                    <button
                                        onClick={handleRedo}
                                        disabled={historyIndex >= history.length - 1}
                                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 active:scale-95 ${
                                            historyIndex < history.length - 1 
                                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer' 
                                                : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed'
                                        }`}
                                        title="Redo XML edit (Ctrl+Y / Cmd+Shift+Z)"
                                    >
                                        <RotateCw size={12} />
                                        <span>Redo</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 border-l border-slate-800 pl-3">
                                    <span>{xmlInput.length} chars</span>
                                    <span>•</span>
                                    <span>{xmlInput.split('\n').length} lines</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 relative flex flex-col">
                            <div role="status" aria-live="polite" className="mb-3 text-sm flex items-center gap-2">
                                {xmlError ? <><AlertTriangle size={16} className="text-amber-400" /><span className="text-amber-200">Fix XML syntax to restore the preview.</span></> : xmlInput.trim() ? <><CheckCircle2 size={16} className="text-emerald-400" /><span className="text-emerald-200">XML syntax looks good</span></> : <span className="text-slate-400">Paste a formula to get started.</span>}
                            </div>
                            {xmlError && <details className="mb-3 text-xs text-amber-100"><summary className="cursor-pointer">Show XML error details</summary><pre className="mt-2 whitespace-pre-wrap break-words">{xmlError}</pre></details>}
                            <textarea
                                aria-label="Formula XML"
                                aria-invalid={!!xmlError}
                                data-formula-xml
                                value={xmlInput}
                                onChange={(e) => setXmlInput(e.target.value)}
                                placeholder="Paste or edit XML formula here..."
                                spellCheck={false}
                                className="w-full h-full min-h-[300px] bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed p-4 rounded-2xl border border-slate-800 outline-none focus:border-purple-500/80 resize-none transition-all"
                            />
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-emerald-400" /> Changes appear in the preview automatically
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={formatXml}
                                    className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700 transition-all flex items-center gap-1 active:scale-95"
                                    title="Format XML structure (tag per line)"
                                >
                                    <Wand2 size={12} />
                                    <span>Format XML</span>
                                </button>
                                <button
                                    onClick={linearizeXml}
                                    className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 transition-all flex items-center gap-1 active:scale-95"
                                    title="Remove layout whitespace while preserving formula text"
                                >
                                    <FileCode size={12} />
                                    <span>Compact XML</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setXmlInput(PRESET_SAMPLES[0].xml);
                                        setToast({ msg: "Reset formula to default sample", type: 'info' });
                                    }}
                                    className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1 font-bold ml-1"
                                >
                                    <RotateCcw size={12} /> Reset XML
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Smart Suggestions Footer */}
            <div className="mt-12 pt-8 border-t border-slate-200">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-600" /> Continue with another tool
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {suggestions.map((sug) => (
                        <div 
                            key={sug.id}
                            onClick={() => navigate(sug.path, { state: { transferredXml: xmlInput, sourceTool: 'Formula Studio Pro' } })}
                            className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="p-1.5 rounded-lg bg-slate-50 group-hover:bg-purple-50 transition-colors">
                                        {sug.icon}
                                    </div>
                                    <span className="text-xs font-black text-slate-900 group-hover:text-purple-600 transition-colors">
                                        {sug.toolName}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    {sug.description}
                                </p>
                            </div>
                            <div className="mt-3 flex items-center text-[11px] font-bold text-purple-600 group-hover:translate-x-1 transition-transform gap-1">
                                <span>Transfer Formula XML</span>
                                <ArrowRight size={12} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FormulaEditorExperimental;
