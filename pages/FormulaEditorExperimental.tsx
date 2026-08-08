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
import { SmartSuggestion } from '../types';

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
        xml: `<ce:display><ce:formula id="fo0040"><mml:math altimg="si6.svg"><mml:msubsup><mml:mo>∫</mml:mo><mml:mn>0</mml:mn><mml:mo>∞</</mml:mo></mml:msubsup><mml:msup><mml:mi>e</mml:mi><mml:mrow><mml:mo>−</mml:mo><mml:mi>x</mml:mi></mml:mrow></mml:msup><mml:mi>d</mml:mi><mml:mi>x</mml:mi><mml:mo>=</mml:mo><mml:mn>1</mml:mn></mml:math></ce:formula></ce:display>`
    }
];

const FormulaEditorExperimental: React.FC = () => {
    const navigate = useNavigate();

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
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            setXmlInputState(history[prevIndex]);
            setToast({ msg: 'Undo XML edit', type: 'info' });
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            setXmlInputState(history[nextIndex]);
            setToast({ msg: 'Redo XML edit', type: 'info' });
        }
    };

    // Keyboard Shortcuts for Undo & Redo (Ctrl+Z / Cmd+Z / Ctrl+Y / Cmd+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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
        if (!texInput.trim()) return;
        let clean = texInput.trim();

        // Convert TeX font macros for mathvariant: \mathit{x}, \mathrm{x}
        clean = clean.replace(/\\mathit\{([^}]+)\}/g, '<mml:mi mathvariant="italic">$1</mml:mi>');
        clean = clean.replace(/\\mathrm\{([^}]+)\}/g, '<mml:mi mathvariant="normal">$1</mml:mi>');

        // Convert TeX fractions: \frac{num}{den} -> <mml:mfrac><mml:mi>num</mml:mi><mml:mi>den</mml:mi></mml:mfrac>
        clean = clean.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_, num, den) => {
            return `<mml:mfrac><mml:msub><mml:mi>${num.trim().charAt(0)}</mml:mi><mml:mn>${num.trim().slice(1) || '0'}</mml:mn></mml:msub><mml:msub><mml:mi>${den.trim().charAt(0)}</mml:mi><mml:mn>${den.trim().slice(1) || 't'}</mml:mn></mml:msub></mml:mfrac>`;
        });

        // Convert TeX square roots: \sqrt{x}
        clean = clean.replace(/\\sqrt\{([^}]+)\}/g, '<mml:msqrt><mml:mi>$1</mml:mi></mml:msqrt>');

        // Convert subscripts: X_{Y} or X_Y
        clean = clean.replace(/([a-zA-Z0-9]+)_\{([^}]+)\}/g, '<mml:msub><mml:mi>$1</mml:mi><mml:mn>$2</mml:mn></mml:msub>');
        clean = clean.replace(/([a-zA-Z0-9]+)_([a-zA-Z0-9]+)/g, '<mml:msub><mml:mi>$1</mml:mi><mml:mn>$2</mml:mn></mml:msub>');

        // Convert superscripts: X^{Y} or X^Y
        clean = clean.replace(/([a-zA-Z0-9]+)\^\{([^}]+)\}/g, '<mml:msup><mml:mi>$1</mml:mi><mml:mn>$2</mml:mn></mml:msup>');
        clean = clean.replace(/([a-zA-Z0-9]+)\^([a-zA-Z0-9]+)/g, '<mml:msup><mml:mi>$1</mml:mi><mml:mn>$2</mml:mn></mml:msup>');

        // Greek symbols & commands
        const cmdMap: Record<string, string> = {
            '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
            '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ',
            '\\omega': 'ω', '\\Delta': 'Δ', '\\ln': 'ln', '\\log': 'log', '\\sin': 'sin',
            '\\cos': 'cos', '\\tan': 'tan', '\\lim': 'lim', '\\int': '∫', '\\sum': '∑',
            '\\infty': '∞', '\\pm': '±', '\\approx': '≈', '\\neq': '≠', '\\le': '≤', '\\ge': '≥'
        };

        Object.entries(cmdMap).forEach(([cmd, sym]) => {
            const esc = cmd.replace('\\', '\\\\');
            clean = clean.replace(new RegExp(esc, 'g'), `<mml:mi>${sym}</mml:mi>`);
        });

        const generatedXml = `<ce:display><ce:formula id="fo${Math.floor(Math.random() * 8999 + 1000)}"><mml:math altimg="si1.svg">${clean}</mml:math></ce:formula></ce:display>`;
        setXmlInput(generatedXml);
        setToast({ msg: 'Converted TeX to MathML XML with mathvariant attributes!', type: 'success' });
        setShowTexImporter(false);
    };

    const [viewMode, setViewMode] = useState<'split' | 'rendered' | 'code'>('split');
    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'error' | 'info' } | null>(null);
    const [showInfo, setShowInfo] = useState(true);

    // Node selection for visual inspector
    const [selectedNodePath, setSelectedNodePath] = useState<number[] | null>(null);
    const [editingNodeValue, setEditingNodeValue] = useState<string>('');

    // Canvas Selection & Direct WYSIWYG Editing
    const [selectedCanvasToken, setSelectedCanvasToken] = useState<{
        text: string;
        tagName: string;
        mathvariant?: string;
        nodeIndex?: number;
    } | null>(null);
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
        let clean = rawXml.trim();
        if (clean.includes('</mml:close>')) {
            clean = clean.replace(/<\/mml:close>/gi, '</mml:msub>');
        }
        return `<root xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:mml="http://www.w3.org/1998/Math/MathML" xmlns:sb="http://www.elsevier.com/xml/common/struct-bib/dtd" xmlns:sa="http://www.elsevier.com/xml/common/struct-aff/dtd" xmlns:xlink="http://www.w3.org/1999/xlink">${clean}</root>`;
    };

    // Insert snippet into MathML body
    const insertMathSnippet = (snippet: string, label: string) => {
        let updated = xmlInput;
        if (updated.includes('</mml:math>')) {
            updated = updated.replace('</mml:math>', `${snippet}</mml:math>`);
        } else if (updated.includes('</math>')) {
            updated = updated.replace('</math>', `${snippet}</math>`);
        } else {
            updated = updated + snippet;
        }
        setXmlInput(updated);
        setToast({ msg: `Inserted ${label} into formula!`, type: 'success' });
    };

    // Token Structural Transformations
    const wrapTokenSubscript = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:msub><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mn>0</mml:mn></mml:msub>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" as Subscript (<mml:msub>)`, type: 'success' });
        }
    };

    const wrapTokenSuperscript = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:msup><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mn>2</mml:mn></mml:msup>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" as Superscript (<mml:msup>)`, type: 'success' });
        }
    };

    const wrapTokenSubSuperscript = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:msubsup><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mn>0</mml:mn><mml:mi>t</mml:mi></mml:msubsup>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" as Sub/Superscript (<mml:msubsup>)`, type: 'success' });
        }
    };

    const wrapTokenFraction = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:mfrac><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mi>1</mml:mi></mml:mfrac>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" as Fraction (<mml:mfrac>)`, type: 'success' });
        }
    };

    const wrapTokenSqrt = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:msqrt><mml:${tag}$1>${tokenText}</mml:${tag}></mml:msqrt>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" as Square Root (<mml:msqrt>)`, type: 'success' });
        }
    };

    const wrapTokenUnder = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:munder><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mo>&#x2200;</mml:mo></mml:munder>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" in Underscript (<mml:munder>)`, type: 'success' });
        }
    };

    const wrapTokenOver = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        const replacement = `<mml:mover><mml:${tag}$1>${tokenText}</mml:${tag}><mml:mo>&#x203E;</mml:mo></mml:mover>`;
        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Wrapped "${tokenText}" in Overscript (<mml:mover>)`, type: 'success' });
        }
    };

    const splitTokenAtPosition = (
        tokenText: string, 
        tag: string, 
        splitIdx: number, 
        structType: 'sub' | 'super' | 'frac' | 'over' | 'under' = splitTargetType
    ) => {
        if (!tokenText || tokenText.length < 2) {
            setToast({ msg: 'Identifier must have at least 2 characters to split', type: 'warn' });
            return;
        }

        const validIndex = Math.max(1, Math.min(splitIdx, tokenText.length - 1));
        const base = tokenText.slice(0, validIndex);
        const attach = tokenText.slice(validIndex);

        const baseTag = tag;
        const attachTag = /^\d+$/.test(attach) ? 'mn' : 'mi';

        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`<mml:${tag}([^>]*)>${escText}</mml:${tag}>`, 'g');
        
        let replacement = '';
        let label = '';

        if (structType === 'sub') {
            replacement = `<mml:msub><mml:${baseTag}$1>${base}</mml:${baseTag}><mml:${attachTag}>${attach}</mml:${attachTag}></mml:msub>`;
            label = `Subscript (${base}_${attach})`;
        } else if (structType === 'super') {
            replacement = `<mml:msup><mml:${baseTag}$1>${base}</mml:${baseTag}><mml:${attachTag}>${attach}</mml:${attachTag}></mml:msup>`;
            label = `Superscript (${base}^${attach})`;
        } else if (structType === 'frac') {
            replacement = `<mml:mfrac><mml:${baseTag}$1>${base}</mml:${baseTag}><mml:${attachTag}>${attach}</mml:${attachTag}></mml:mfrac>`;
            label = `Fraction (${base}/${attach})`;
        } else if (structType === 'over') {
            replacement = `<mml:mover><mml:${baseTag}$1>${base}</mml:${baseTag}><mml:${attachTag}>${attach}</mml:${attachTag}></mml:mover>`;
            label = `Overscript (${base} with ${attach} over)`;
        } else if (structType === 'under') {
            replacement = `<mml:munder><mml:${baseTag}$1>${base}</mml:${baseTag}><mml:${attachTag}>${attach}</mml:${attachTag}></mml:munder>`;
            label = `Underscript (${base} with ${attach} under)`;
        }

        const updated = xmlInput.replace(pattern, replacement);
        if (updated !== xmlInput) {
            setXmlInput(updated);
            setToast({ msg: `Split "${tokenText}" at pos ${validIndex} ➔ ${label}`, type: 'success' });
            if (selectedCanvasToken && selectedCanvasToken.text === tokenText) {
                setSelectedCanvasToken({ text: base, tagName: tag });
            }
        }
    };

    const splitTokenSubscript = (tokenText: string, tag: string) => {
        splitTokenAtPosition(tokenText, tag, 1, 'sub');
    };

    const deleteToken = (tokenText: string, tag: string, targetIndex?: number) => {
        const indexToUse = targetIndex ?? selectedCanvasToken?.nodeIndex;
        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error();

            const allTokens = doc.querySelectorAll('mi, mn, mo, mtext, mspace, mml\\:mi, mml\\:mn, mml\\:mo, mml\\:mtext, mml\\:mspace');
            let targetEl: Element | null = null;

            if (typeof indexToUse === 'number' && indexToUse >= 0 && indexToUse < allTokens.length) {
                targetEl = allTokens[indexToUse];
            } else {
                allTokens.forEach(el => {
                    if (!targetEl && el.textContent?.trim() === tokenText) {
                        targetEl = el;
                    }
                });
            }

            if (targetEl) {
                (targetEl as Element).remove();
                const serializer = new XMLSerializer();
                let fullSerialized = serializer.serializeToString(doc);
                fullSerialized = fullSerialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
                if (fullSerialized) {
                    setXmlInput(fullSerialized);
                    setToast({ msg: `Deleted token "${tokenText}"`, type: 'info' });
                    setSelectedCanvasToken(null);
                    return;
                }
            }
        } catch (e) {
            const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`<mml:${tag}[^>]*>${escText}</mml:${tag}>`, 'g');
            const updated = xmlInput.replace(pattern, '');
            setXmlInput(updated);
            setToast({ msg: `Deleted token "${tokenText}"`, type: 'info' });
        }
    };

    const addTokenAfter = (tokenText: string, tag: string) => {
        const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(<mml:${tag}[^>]*>${escText}</mml:${tag}>)`, 'g');
        const replacement = `$1<mml:mi>x</mml:mi>`;
        const updated = xmlInput.replace(pattern, replacement);
        setXmlInput(updated);
        setToast({ msg: `Inserted new token after "${tokenText}"`, type: 'success' });
    };

    const changeTokenTagType = (tokenText: string, oldTag: string, newTag: string, targetIndex?: number) => {
        const indexToUse = targetIndex ?? selectedCanvasToken?.nodeIndex;

        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error();

            const allTokens = doc.querySelectorAll('mi, mn, mo, mtext, mspace, mml\\:mi, mml\\:mn, mml\\:mo, mml\\:mtext, mml\\:mspace');
            let targetEl: Element | null = null;

            if (typeof indexToUse === 'number' && indexToUse >= 0 && indexToUse < allTokens.length) {
                targetEl = allTokens[indexToUse];
            } else {
                allTokens.forEach(el => {
                    if (!targetEl && el.textContent?.trim() === tokenText && el.tagName.replace(/^.*:/, '') === oldTag) {
                        targetEl = el;
                    }
                });
            }

            if (targetEl) {
                const prefix = (targetEl as Element).tagName.includes(':') ? (targetEl as Element).tagName.split(':')[0] + ':' : 'mml:';
                const newEl = doc.createElementNS((targetEl as Element).namespaceURI || 'http://www.w3.org/1998/Math/MathML', `${prefix}${newTag}`);
                Array.from((targetEl as Element).attributes).forEach(attr => newEl.setAttribute(attr.name, attr.value));
                newEl.textContent = (targetEl as Element).textContent;

                // Only <mi> can have the mathvariant attribute
                if (newTag !== 'mi') {
                    newEl.removeAttribute('mathvariant');
                }

                (targetEl as Element).replaceWith(newEl);

                const serializer = new XMLSerializer();
                let fullSerialized = serializer.serializeToString(doc);
                fullSerialized = fullSerialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
                
                if (fullSerialized) {
                    setXmlInput(fullSerialized);
                    setToast({ msg: `Converted tag <${oldTag}> ➔ <${newTag}>`, type: 'info' });
                    if (selectedCanvasToken && (selectedCanvasToken.nodeIndex === indexToUse || selectedCanvasToken.text === tokenText)) {
                        setSelectedCanvasToken({
                            ...selectedCanvasToken,
                            tagName: newTag,
                            mathvariant: newTag === 'mi' ? selectedCanvasToken.mathvariant : undefined
                        });
                    }
                    return;
                }
            }
        } catch (e) {
            const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`<mml:${oldTag}([^>]*)>${escText}</mml:${oldTag}>`, 'g');
            let replacement = `<mml:${newTag}$1>${tokenText}</mml:${newTag}>`;
            if (newTag !== 'mi') {
                replacement = replacement.replace(/\s*mathvariant="[^"]*"/gi, '');
            }
            const updated = xmlInput.replace(pattern, replacement);
            setXmlInput(updated);
            setToast({ msg: `Converted tag <${oldTag}> ➔ <${newTag}>`, type: 'info' });
        }
    };

    const changeTokenMathvariant = (tokenText: string, tag: string, mathvariantVal: string, targetIndex?: number) => {
        const cleanTag = tag.replace(/^.*:/, '').toLowerCase();
        if (cleanTag !== 'mi') {
            setToast({ msg: 'Only <mi> (or <mml:mi>) tags can have the mathvariant attribute.', type: 'warn' });
            return;
        }

        const indexToUse = targetIndex ?? selectedCanvasToken?.nodeIndex;

        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error();

            const allTokens = doc.querySelectorAll('mi, mn, mo, mtext, mspace, mml\\:mi, mml\\:mn, mml\\:mo, mml\\:mtext, mml\\:mspace');
            let targetEl: Element | null = null;

            if (typeof indexToUse === 'number' && indexToUse >= 0 && indexToUse < allTokens.length) {
                targetEl = allTokens[indexToUse];
            } else {
                allTokens.forEach(el => {
                    if (!targetEl && el.textContent?.trim() === tokenText) {
                        targetEl = el;
                    }
                });
            }

            if (targetEl) {
                if (mathvariantVal && mathvariantVal !== 'none') {
                    (targetEl as Element).setAttribute('mathvariant', mathvariantVal);
                } else {
                    (targetEl as Element).removeAttribute('mathvariant');
                }

                const serializer = new XMLSerializer();
                let fullSerialized = serializer.serializeToString(doc);
                fullSerialized = fullSerialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');

                if (fullSerialized) {
                    setXmlInput(fullSerialized);
                    setToast({
                        msg: mathvariantVal === 'none' 
                            ? `Removed mathvariant from <${tag}>"${tokenText}"` 
                            : `Set mathvariant="${mathvariantVal}" on <${tag}>"${tokenText}"`,
                        type: 'info'
                    });
                    if (selectedCanvasToken && (selectedCanvasToken.nodeIndex === indexToUse || selectedCanvasToken.text === tokenText)) {
                        setSelectedCanvasToken({
                            ...selectedCanvasToken,
                            mathvariant: mathvariantVal === 'none' ? undefined : mathvariantVal
                        });
                    }
                    return;
                }
            }
        } catch (e) {
            const escText = tokenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tagPattern = new RegExp(`(<(?:mml:)?${tag}\\b)([^>]*)>${escText}(</(?:mml:)?${tag}>)`, 'g');
            
            const updated = xmlInput.replace(tagPattern, (_, openTag, existingAttrs, closeTag) => {
                let newAttrs = existingAttrs.replace(/\s*mathvariant="[^"]*"/gi, '');
                if (mathvariantVal && mathvariantVal !== 'none') {
                    newAttrs = ` mathvariant="${mathvariantVal}"` + newAttrs;
                }
                return `${openTag}${newAttrs}>${tokenText}${closeTag}`;
            });

            if (updated !== xmlInput) {
                setXmlInput(updated);
                setToast({
                    msg: mathvariantVal === 'none' 
                        ? `Removed mathvariant from <${tag}>"${tokenText}"` 
                        : `Set mathvariant="${mathvariantVal}" on <${tag}>"${tokenText}"`,
                    type: 'info'
                });
                if (selectedCanvasToken && selectedCanvasToken.text === tokenText) {
                    setSelectedCanvasToken({
                        ...selectedCanvasToken,
                        mathvariant: mathvariantVal === 'none' ? undefined : mathvariantVal
                    });
                }
            }
        }
    };

    // Strip mathvariant attribute from non-mi tags helper
    const stripMathvariantFromNonMi = (xml: string): string => {
        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xml);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error();

            let changed = false;
            const allElements = doc.querySelectorAll('*');
            allElements.forEach(el => {
                const tag = el.tagName.replace(/^.*:/, '').toLowerCase();
                if (tag !== 'mi' && el.hasAttribute('mathvariant')) {
                    el.removeAttribute('mathvariant');
                    changed = true;
                }
            });

            if (changed) {
                const serializer = new XMLSerializer();
                let fullSerialized = serializer.serializeToString(doc);
                return fullSerialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
            }
            return xml;
        } catch (e) {
            return xml.replace(/(<(?:mml:)?(?!mi\b)[a-zA-Z0-9_:]+)(\s+[^>]*?)?\s+mathvariant="[^"]*"/gi, '$1$2');
        }
    };

    // Auto-fix mismatched tag helper
    const autoFixXml = (input: string): string => {
        let fixed = stripMathvariantFromNonMi(input);
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
                // Sync metadata fields if formula found
                const formulaEl = doc.querySelector('formula, ce\\:formula') || doc.querySelector('[id^="fo"]');
                if (formulaEl) {
                    const idAttr = formulaEl.getAttribute('id');
                    if (idAttr) setFormulaId(idAttr);
                }
                const mathEl = doc.querySelector('math, mml\\:math');
                if (mathEl) {
                    const altAttr = mathEl.getAttribute('altimg');
                    if (altAttr) setAltImg(altAttr);
                }
                setIsDisplay(xmlInput.includes('ce:display'));
            }
        } catch (e: any) {
            setXmlError(e.message || 'Failed to parse XML');
        }
    }, [xmlInput]);

    // Handle attribute change from controls bar
    const handleUpdateMetadata = (newId: string, newAltImg: string, newIsDisplay: boolean) => {
        setFormulaId(newId);
        setAltImg(newAltImg);
        setIsDisplay(newIsDisplay);

        let updated = xmlInput;
        // Update display vs inline
        if (newIsDisplay && !updated.includes('<ce:display>')) {
            updated = `<ce:display>${updated}</ce:display>`;
        } else if (!newIsDisplay && updated.includes('<ce:display>')) {
            updated = updated.replace(/<ce:display>(.*?)<\/ce:display>/gs, '$1');
        }

        // Update ID attribute
        updated = updated.replace(/id="[^"]*"/g, `id="${newId}"`);

        // Update altimg attribute
        if (updated.includes('altimg=')) {
            updated = updated.replace(/altimg="[^"]*"/g, `altimg="${newAltImg}"`);
        } else {
            updated = updated.replace(/<mml:math/g, `<mml:math altimg="${newAltImg}"`);
        }

        setXmlInput(updated);
    };

    // Format / Unlinearize XML (tag per line)
    const formatXml = () => {
        try {
            let formatted = xmlInput
                .trim()
                .replace(/>\s*</g, '><')
                .replace(/></g, '>\n');
            setXmlInput(formatted);
            setToast({ msg: "Unlinearized XML structure!", type: 'success' });
        } catch (e) {
            setToast({ msg: "Could not format XML.", type: 'warn' });
        }
    };

    // Linearize XML (single line)
    const linearizeXml = () => {
        try {
            let compressed = xmlInput
                .replace(/\r?\n\s*/g, '')
                .trim();
            setXmlInput(compressed);
            setToast({ msg: "Linearized XML into single line!", type: 'info' });
        } catch (e) {
            setToast({ msg: "Could not linearize XML.", type: 'warn' });
        }
    };

    // Copy to clipboard
    const handleCopy = () => {
        navigator.clipboard.writeText(xmlInput);
        setCopied(true);
        setToast({ msg: "Formula XML copied to clipboard!", type: 'success' });
        setTimeout(() => setCopied(false), 2000);
    };

    // Transform MathML XML for native HTML5 <math> browser rendering
    const renderableHtmlMathML = useMemo(() => {
        try {
            let src = xmlInput.trim();
            if (src.includes('</mml:close>')) {
                src = src.replace(/<\/mml:close>/gi, '</mml:msub>');
            }

            // Extract the math element or whole block
            const mathMatch = src.match(/<mml:math[\s\S]*?<\/mml:math>/i) || src.match(/<math[\s\S]*?<\/math>/i);
            let mathBody = mathMatch ? mathMatch[0] : src;

            // Strip ce: wrappers if any left
            mathBody = mathBody.replace(/<\/?ce:[^>]+>/gi, '');

            // Normalize mml: tags to standard HTML5 MathML tags
            mathBody = mathBody
                .replace(/<mml:/gi, '<')
                .replace(/<\/mml:/gi, '</');

            // Ensure proper <math> root tag with HTML5 MathML namespace & display mode
            if (!mathBody.startsWith('<math')) {
                mathBody = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${mathBody}</math>`;
            } else {
                mathBody = mathBody.replace(/<math/i, '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"');
            }

            // Parse as DOM to accurately apply CSS font-style and dataset attributes for every token
            const parser = new DOMParser();
            const doc = parser.parseFromString(mathBody, 'text/html');
            const mathEl = doc.querySelector('math');

            if (mathEl) {
                let tokenIdx = 0;
                const allNodes = mathEl.querySelectorAll('*');
                allNodes.forEach(el => {
                    const tagName = el.tagName.toLowerCase().replace(/^.*:/, '');

                    // Ensure non-mi tags never carry mathvariant attribute
                    if (tagName !== 'mi' && el.hasAttribute('mathvariant')) {
                        el.removeAttribute('mathvariant');
                    }

                    const mathvariant = tagName === 'mi' ? el.getAttribute('mathvariant')?.toLowerCase() : null;

                    if (mathvariant === 'italic') {
                        el.setAttribute('style', `${el.getAttribute('style') || ''}; font-style: italic !important; font-variant: normal !important;`.replace(/^;\s*/, ''));
                    } else if (mathvariant === 'normal') {
                        el.setAttribute('style', `${el.getAttribute('style') || ''}; font-style: normal !important; font-variant: normal !important;`.replace(/^;\s*/, ''));
                    } else if (tagName === 'mi') {
                        // <mi> without mathvariant renders as italic by default
                        el.setAttribute('style', `${el.getAttribute('style') || ''}; font-style: italic !important; font-variant: normal !important;`.replace(/^;\s*/, ''));
                    }

                    if (['mi', 'mn', 'mo', 'mtext', 'mspace'].includes(tagName)) {
                        const txt = (el.textContent || '').trim();
                        if (txt || tagName === 'mspace') {
                            el.setAttribute('data-token-index', String(tokenIdx));
                            el.setAttribute('data-token-tag', tagName);
                            el.setAttribute('data-token-text', txt);

                            // Highlight currently selected canvas token
                            if (selectedCanvasToken && selectedCanvasToken.nodeIndex === tokenIdx) {
                                el.setAttribute('data-selected', 'true');
                                el.setAttribute('style', `${el.getAttribute('style') || ''}; background-color: #fef08a !important; color: #581c87 !important; border-radius: 6px; outline: 2px solid #eab308 !important; padding: 2px 4px; box-shadow: 0 0 8px rgba(234, 179, 8, 0.4);`.replace(/^;\s*/, ''));
                            }

                            tokenIdx++;
                        }
                    }
                });

                return mathEl.outerHTML;
            }

            return mathBody;
        } catch (e) {
            return null;
        }
    }, [xmlInput, selectedCanvasToken]);

    // Handle Direct Inline Edit in Rendered Canvas
    const handleInlineContentEdit = (oldText: string, newText: string, targetIndex?: number) => {
        if (oldText === newText || !oldText) return;
        const indexToUse = targetIndex ?? selectedCanvasToken?.nodeIndex;

        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) throw new Error();

            const allTokens = doc.querySelectorAll('mi, mn, mo, mtext, mspace, mml\\:mi, mml\\:mn, mml\\:mo, mml\\:mtext, mml\\:mspace');
            
            let targetEl: Element | null = null;
            if (typeof indexToUse === 'number' && indexToUse >= 0 && indexToUse < allTokens.length) {
                targetEl = allTokens[indexToUse];
            } else {
                allTokens.forEach(el => {
                    if (!targetEl && el.textContent?.trim() === oldText) {
                        targetEl = el;
                    }
                });
            }

            if (targetEl) {
                (targetEl as Element).textContent = newText;
                const serializer = new XMLSerializer();
                let fullSerialized = serializer.serializeToString(doc);
                fullSerialized = fullSerialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
                if (fullSerialized) {
                    setXmlInput(fullSerialized);
                    setToast({ msg: `Updated symbol: "${oldText}" ➔ "${newText}"`, type: 'info' });
                    if (selectedCanvasToken && (selectedCanvasToken.nodeIndex === indexToUse || selectedCanvasToken.text === oldText)) {
                        setSelectedCanvasToken({ ...selectedCanvasToken, text: newText });
                    }
                    return;
                }
            }
        } catch (e) {
            const escOld = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(>)${escOld}(</)`, 'g');
            const updated = xmlInput.replace(regex, `$1${newText}$2`);
            if (updated !== xmlInput) {
                setXmlInput(updated);
                setToast({ msg: `Updated formula text: "${oldText}" ➔ "${newText}"`, type: 'info' });
            }
        }
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
                    setSelectedCanvasToken({
                        text: node.text,
                        tagName: node.tag,
                        mathvariant: node.mathvariant,
                        nodeIndex: idx
                    });
                    setToast({
                        msg: `Selected symbol #${idx + 1} "${node.text}" (<${node.tag}>${node.mathvariant ? ` mathvariant="${node.mathvariant}"` : ''})`,
                        type: 'info'
                    });
                    return;
                }
            }
        }

        // Fallback: search for closest MathML leaf element
        const closestLeaf = target.closest('mi, mn, mo, mtext, mspace') as HTMLElement | null;
        if (closestLeaf) {
            const leafText = (closestLeaf.textContent || '').trim();
            const tag = closestLeaf.tagName.toLowerCase().replace(/^.*:/, '');
            if (leafText || tag === 'mspace') {
                const matchIndex = parsedNodesList.findIndex(n => n.text === leafText && n.tag === tag);
                if (matchIndex !== -1) {
                    const node = parsedNodesList[matchIndex];
                    setSelectedCanvasToken({
                        text: node.text,
                        tagName: node.tag,
                        mathvariant: node.mathvariant,
                        nodeIndex: matchIndex
                    });
                    setToast({ msg: `Selected "${node.text}" (<${node.tag}>) on Canvas`, type: 'info' });
                    return;
                }
            }
        }
    };

    // Extract interactive nodes from XML for visual node editor
    const parsedNodesList = useMemo(() => {
        try {
            const parser = new DOMParser();
            const wrapped = wrapWithNamespaces(xmlInput);
            const doc = parser.parseFromString(wrapped, 'text/xml');
            if (doc.querySelector('parsererror')) return [];

            const nodes: { id: string; index: number; tag: string; text: string; fullTag: string; mathvariant?: string }[] = [];
            const allTokens = doc.querySelectorAll('mi, mn, mo, mtext, mspace, mml\\:mi, mml\\:mn, mml\\:mo, mml\\:mtext, mml\\:mspace');
            
            let idx = 0;
            allTokens.forEach((el) => {
                const text = el.textContent?.trim() || '';
                const tag = el.tagName.replace(/^.*:/, '').toLowerCase();
                // Only mi tags can have mathvariant
                const mathvariant = tag === 'mi' ? (el.getAttribute('mathvariant') || undefined) : undefined;
                if (text || tag === 'mspace') {
                    nodes.push({
                        id: `node-${idx}`,
                        index: idx,
                        tag,
                        text,
                        mathvariant,
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
            toolName: 'MS Word to XML Converter',
            description: 'Convert MS Word formula structures into standardized XML.',
            path: '/wordToXml',
            icon: <FileCode size={15} className="text-purple-600" />,
            condition: 'Always available'
        }
    ];

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
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
                                Formula Studio Pro <span className="text-purple-600">(Experimental)</span>
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700">
                                MAX Two-Way Sync
                            </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                            Interactive MathML & formula editor with live two-way XML sync, formula attribute control, and tag auto-repair.
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
                        onClick={() => setShowTexImporter(!showTexImporter)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 ${
                            showTexImporter 
                                ? 'bg-purple-100 text-purple-800 border-purple-300' 
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                        }`}
                        title="Convert TeX / LaTeX to MathML XML"
                    >
                        <Calculator size={14} className="text-purple-600" />
                        <span>TeX ➔ MathML</span>
                    </button>

                    <button
                        onClick={formatXml}
                        className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                        title="Unlinearize XML structure (tag per line)"
                    >
                        <Wand2 size={14} className="text-purple-600" />
                        <span>Unlinearize XML</span>
                    </button>

                    <button
                        onClick={linearizeXml}
                        className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                        title="Linearize XML into single line"
                    >
                        <FileCode size={14} className="text-purple-600" />
                        <span>Linearize XML</span>
                    </button>

                    <button
                        onClick={handleCopy}
                        className="text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copied ? 'Copied!' : 'Copy XML'}</span>
                    </button>
                </div>
            </div>

            {/* TeX / LaTeX Quick Importer Drawer */}
            {showTexImporter && (
                <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 mb-6 border border-purple-700 shadow-lg animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-purple-800">
                        <div className="flex items-center gap-2">
                            <Calculator size={18} className="text-purple-300" />
                            <span className="text-xs font-black uppercase tracking-wider text-purple-100">
                                LaTeX / TeX Math Converter
                            </span>
                        </div>
                        <button
                            onClick={() => setShowTexImporter(false)}
                            className="text-purple-300 hover:text-white p-1 rounded-lg hover:bg-purple-800 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <p className="text-xs text-purple-200 mb-3">
                        Paste any LaTeX expression (e.g. <code className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded font-mono">\ln \frac&#123;C_0&#125;&#123;C_t&#125; = K_&#123;app&#125; t</code> or <code className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded font-mono">x = \frac&#123;-b \pm \sqrt&#123;b^2 - 4ac&#125;&#125;&#123;2a&#125;</code>) to auto-generate Elsevier-compliant MathML XML.
                    </p>

                    <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                            type="text"
                            value={texInput}
                            onChange={(e) => setTexInput(e.target.value)}
                            className="flex-1 bg-purple-950 border border-purple-700 rounded-xl px-4 py-2.5 text-xs font-mono text-purple-100 outline-none focus:border-purple-400 placeholder-purple-400/60"
                            placeholder="Type or paste LaTeX..."
                        />
                        <button
                            onClick={handleConvertTex}
                            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shrink-0 flex items-center justify-center gap-1.5 active:scale-95"
                        >
                            <Sparkles size={14} />
                            <span>Convert to MathML</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Info Collapsible Banner */}
            <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-slate-50 border border-purple-200/80 rounded-2xl p-4 mb-6 transition-all">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowInfo(!showInfo)}>
                    <div className="flex items-center gap-2 text-xs font-black text-purple-900 uppercase tracking-wider">
                        <HelpCircle size={15} className="text-purple-600" />
                        <span>What does Formula Studio Pro MAX do?</span>
                    </div>
                    <span className="text-xs font-bold text-purple-600 hover:text-purple-800">
                        {showInfo ? 'Hide Details' : 'View Details'}
                    </span>
                </div>

                {showInfo && (
                    <div className="mt-3 text-xs text-slate-700 leading-relaxed grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-purple-200/50">
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
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                        <Sparkles size={14} className="text-amber-500" /> Presets:
                    </span>
                    {PRESET_SAMPLES.map(sample => (
                        <button
                            key={sample.id}
                            onClick={() => {
                                setXmlInput(sample.xml);
                                setToast({ msg: `Loaded ${sample.name}`, type: 'info' });
                            }}
                            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 text-slate-700 transition-all flex items-center gap-1.5 active:scale-95"
                            title={sample.desc}
                        >
                            <Box size={13} className="text-slate-400" />
                            <span>{sample.name}</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setViewMode('split')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'split' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Split size={14} />
                        <span>Split View</span>
                    </button>
                    <button
                        onClick={() => setViewMode('rendered')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'rendered' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Eye size={14} />
                        <span>Rendered View</span>
                    </button>
                    <button
                        onClick={() => setViewMode('code')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            viewMode === 'code' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Code size={14} />
                        <span>XML Code</span>
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
                            {isDisplay ? '<ce:display>' : '<ce:inline>'}
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

            {/* Main Interactive Editor Grid */}
            <div className={`grid gap-6 ${
                viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}>
                
                {/* Panel 1: Rendered View & Interactive Canvas */}
                {(viewMode === 'split' || viewMode === 'rendered') && (
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 flex flex-col min-h-[460px]">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <Eye size={16} className="text-purple-600" /> Interactive Rendered Canvas
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Click any symbol on formula to edit live
                                </span>
                            </div>
                        </div>

                        {/* Quick Greek & Special Symbol Insertion Palette */}
                        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                                <Tag size={12} className="text-purple-600" /> Quick Symbols:
                            </span>
                            {['α', 'β', 'γ', 'δ', 'θ', 'λ', 'μ', 'π', 'σ', 'ω', 'Δ', '±', '≤', '≥', '≠', '≈', '∞', '∂', '∫', '∑', '→'].map(sym => (
                                <button
                                    key={sym}
                                    onClick={() => {
                                        if (selectedCanvasToken) {
                                            const updatedText = selectedCanvasToken.text + sym;
                                            handleInlineContentEdit(selectedCanvasToken.text, updatedText);
                                            setSelectedCanvasToken({ ...selectedCanvasToken, text: updatedText });
                                        } else {
                                            insertMathSnippet(`<mml:mi>${sym}</mml:mi>`, `Symbol ${sym}`);
                                        }
                                    }}
                                    className="w-7 h-7 text-xs font-serif font-bold text-slate-800 bg-white hover:bg-purple-600 hover:text-white border border-slate-200 hover:border-purple-600 rounded-lg shadow-2xs transition-all flex items-center justify-center active:scale-95"
                                    title={`Insert symbol ${sym}`}
                                >
                                    {sym}
                                </button>
                            ))}
                        </div>

                        {/* MathML Display Container with Direct Canvas Click Listener & Hover Highlighting */}
                        <div className="flex-1 bg-slate-50/80 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[240px] overflow-x-auto relative group">
                            
                            {/* In-Canvas Floating Quick Editor Overlay (When a symbol on canvas is clicked) */}
                            {selectedCanvasToken && (
                                <div className="w-full mb-4 p-3 bg-purple-900 text-white rounded-xl shadow-lg border border-purple-700 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-purple-800/80">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={14} className="text-purple-300" />
                                            <span className="text-xs font-bold text-purple-100">
                                                Editing Canvas Symbol:
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
                                            <input
                                                type="text"
                                                value={selectedCanvasToken.text}
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    handleInlineContentEdit(selectedCanvasToken.text, newVal);
                                                    setSelectedCanvasToken({ ...selectedCanvasToken, text: newVal });
                                                }}
                                                className="w-full text-xs font-mono font-black text-white bg-transparent outline-none"
                                                placeholder="Symbol value..."
                                                autoFocus
                                            />
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
                                        {selectedCanvasToken.text.length >= 2 && (
                                            <div className="sm:col-span-12 mt-2 pt-2 border-t border-purple-800/80 flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 shrink-0">
                                                    <Split size={13} className="text-amber-400" /> Choose Split & Structure:
                                                </span>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {Array.from({ length: selectedCanvasToken.text.length - 1 }).map((_, idx) => {
                                                        const pos = idx + 1;
                                                        const base = selectedCanvasToken.text.slice(0, pos);
                                                        const sub = selectedCanvasToken.text.slice(pos);
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
                                            {selectedCanvasToken.tagName.replace(/^.*:/, '').toLowerCase() === 'mi' ? (
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
                                                    mathvariant is only allowed on &lt;mi&gt; tags
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
                                        className="text-2xl sm:text-3xl font-serif text-slate-900 select-none p-6 rounded-2xl hover:bg-purple-50/80 transition-all inline-block max-w-full overflow-x-auto cursor-pointer border-2 border-dashed border-purple-200/60 hover:border-purple-400 [&_*]:transition-all [&_mi]:hover:bg-purple-200/90 [&_mi]:hover:text-purple-950 [&_mi]:rounded-md [&_mi]:px-1 [&_mi]:py-0.5 [&_mi]:outline [&_mi]:outline-1 [&_mi]:outline-purple-400 [&_mn]:hover:bg-purple-200/90 [&_mn]:hover:text-purple-950 [&_mn]:rounded-md [&_mn]:px-1 [&_mn]:py-0.5 [&_mn]:outline [&_mn]:outline-1 [&_mn]:outline-purple-400 [&_mo]:hover:bg-purple-200/90 [&_mo]:hover:text-purple-950 [&_mo]:rounded-md [&_mo]:px-1 [&_mo]:py-0.5 [&_mo]:outline [&_mo]:outline-1 [&_mo]:outline-purple-400 [&_mtext]:hover:bg-purple-200/90 [&_mtext]:hover:text-purple-950 [&_mtext]:rounded-md [&_mtext]:px-1 [&_mtext]:py-0.5 [&_mtext]:outline [&_mtext]:outline-1 [&_mtext]:outline-purple-400"
                                        dangerouslySetInnerHTML={{ __html: renderableHtmlMathML }}
                                        title="Click any formula symbol to edit directly on canvas!"
                                    />
                                    <p className="text-[11px] font-semibold text-slate-400 mt-4 flex items-center justify-center gap-1.5">
                                        <Sparkles size={12} className="text-purple-500" />
                                        Native MathML Rendering Engine • Direct Canvas Click-to-Edit Enabled
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-8">
                                    <AlertTriangle size={32} className="mx-auto mb-2 text-amber-500" />
                                    <p className="text-xs font-bold text-slate-600">Could not render MathML preview</p>
                                    <p className="text-[11px] text-slate-400 mt-1">Please check XML syntax or click Auto-Fix XML above.</p>
                                </div>
                            )}
                        </div>

                        {/* MathML Structural Elements Quick Palette */}
                        <div className="mt-4 p-4 bg-purple-50/60 border border-purple-100 rounded-2xl">
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
                            </div>

                            {/* mathvariant Identifier Quick Snippets */}
                            <div className="mt-3 pt-2.5 border-t border-purple-200/60 flex items-center gap-1.5 flex-wrap">
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
                        </div>

                        {/* Interactive Node Token List with Full Structural Controls */}
                        <div className="mt-6 pt-4 border-t border-slate-100">
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
                                                key={node.id}
                                                onClick={() => {
                                                    setSelectedCanvasToken({
                                                        text: node.text,
                                                        tagName: node.tag,
                                                        mathvariant: node.mathvariant,
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

                                                        {node.tag === 'mi' && (
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
                                                            onClick={(e) => { e.stopPropagation(); addTokenAfter(node.text, node.tag); }}
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
                                                    <input
                                                        type="text"
                                                        defaultValue={node.text}
                                                        onBlur={(e) => {
                                                            const val = e.target.value;
                                                            if (val !== node.text) {
                                                                handleInlineContentEdit(node.text, val, node.index);
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.currentTarget.blur();
                                                            }
                                                        }}
                                                        className="text-xs font-mono font-black text-slate-900 bg-transparent outline-none w-full px-1"
                                                        placeholder="Token text..."
                                                    />
                                                </div>

                                            {/* Quick Structural Wrap Toolbar */}
                                            <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-200/60">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mr-1">Wrap:</span>
                                                
                                             {/* Multi-point Split Chooser */}
                                             {node.text.length >= 2 && (
                                                 <div className="w-full pt-1.5 border-t border-slate-200/60 flex items-center gap-1 flex-wrap">
                                                     <span className="text-[9px] font-bold text-amber-900 uppercase tracking-tight flex items-center gap-0.5 shrink-0">
                                                         <Split size={10} className="text-amber-600" /> Split at:
                                                     </span>
                                                     {Array.from({ length: node.text.length - 1 }).map((_, idx) => {
                                                         const pos = idx + 1;
                                                         const base = node.text.slice(0, pos);
                                                         const sub = node.text.slice(pos);
                                                         return (
                                                             <div key={pos} className="inline-flex rounded border border-slate-300 overflow-hidden shadow-2xs text-[10px]">
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'sub')}
                                                                     className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-900 font-mono font-bold transition-colors"
                                                                     title={`Split "${node.text}" into Subscript: ${base}_${sub}`}
                                                                 >
                                                                     {base}<sub>{sub}</sub>
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'super')}
                                                                     className="px-1 py-0.5 bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-900 font-mono font-bold transition-colors border-l border-slate-200"
                                                                     title={`Split into Superscript: ${base}^${sub}`}
                                                                 >
                                                                     {base}<sup>{sub}</sup>
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'frac')}
                                                                     className="px-1 py-0.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-900 font-mono font-bold transition-colors border-l border-slate-200"
                                                                     title={`Split into Fraction: ${base}/${sub}`}
                                                                 >
                                                                     {base}/{sub}
                                                                 </button>
                                                                 <button
                                                                     onClick={() => splitTokenAtPosition(node.text, node.tag, pos, 'over')}
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
                                                    onClick={() => wrapTokenSubscript(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Subscript <mml:msub>"
                                                >
                                                    x<sub>0</sub>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSuperscript(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Superscript <mml:msup>"
                                                >
                                                    x<sup>2</sup>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSubSuperscript(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Sub/Superscript <mml:msubsup>"
                                                >
                                                    x<sub>0</sub><sup>t</sup>
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenFraction(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Fraction <mml:mfrac>"
                                                >
                                                    a/b
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenSqrt(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Square Root <mml:msqrt>"
                                                >
                                                    √x
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenUnder(node.text, node.tag)}
                                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white hover:bg-purple-600 hover:text-white text-purple-800 rounded border border-slate-200 transition-colors"
                                                    title="Wrap in Underscript <mml:munder>"
                                                >
                                                    Under
                                                </button>

                                                <button
                                                    onClick={() => wrapTokenOver(node.text, node.tag)}
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
                        </div>
                    </div>
                )}

                {/* Panel 2: Raw XML Code Editor */}
                {(viewMode === 'split' || viewMode === 'code') && (
                    <div className="bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-800 flex flex-col min-h-[460px] text-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 flex-wrap gap-2">
                            <span className="text-xs font-black text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                <Code size={16} /> XML Source Editor
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
                            <textarea
                                value={xmlInput}
                                onChange={(e) => setXmlInput(e.target.value)}
                                placeholder="Paste or edit XML formula here..."
                                spellCheck={false}
                                className="w-full h-full min-h-[300px] bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed p-4 rounded-2xl border border-slate-800 outline-none focus:border-purple-500/80 resize-none transition-all"
                            />
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 size={13} className="text-emerald-400" /> Direct XML Edit Sync Enabled
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleUndo}
                                    disabled={historyIndex <= 0}
                                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 active:scale-95 ${
                                        historyIndex > 0 
                                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer' 
                                            : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed'
                                    }`}
                                    title="Undo last XML edit (Ctrl+Z)"
                                >
                                    <RotateCcw size={12} />
                                    <span>Undo</span>
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 active:scale-95 ${
                                        historyIndex < history.length - 1 
                                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer' 
                                            : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed'
                                    }`}
                                    title="Redo XML edit (Ctrl+Y)"
                                >
                                    <RotateCw size={12} />
                                    <span>Redo</span>
                                </button>
                                <button
                                    onClick={formatXml}
                                    className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700 transition-all flex items-center gap-1 active:scale-95"
                                    title="Unlinearize XML structure (tag per line)"
                                >
                                    <Wand2 size={12} />
                                    <span>Unlinearize XML</span>
                                </button>
                                <button
                                    onClick={linearizeXml}
                                    className="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 transition-all flex items-center gap-1 active:scale-95"
                                    title="Linearize XML into single line"
                                >
                                    <FileCode size={12} />
                                    <span>Linearize XML</span>
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
                    <Sparkles size={14} className="text-purple-600" /> Next Protocol Suggestions
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
