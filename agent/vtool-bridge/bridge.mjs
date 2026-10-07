import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const decode = text => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(?:amp|lt|gt|quot|apos);/g, e => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[e]);
export function parseReport(report) {
    if (!/<LogReport\b/.test(report) || !/<results>/.test(report) || !/<total-errors>\d+<\/total-errors>/.test(report)) throw new Error('VTool did not produce a complete validation report.');
    const messages = [...report.matchAll(/<message\b([^>]*)>([\s\S]*?)<\/message>/g)].map(match => {
        const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]));
        return { code: attributes.id || 'unknown', severity: attributes.type || 'info', position: attributes.position || '', message: decode(match[2]) };
    });
    return { messages, errors: Number(/<total-errors>(\d+)/.exec(report)[1]), warnings: Number(/<total-warnings>(\d+)/.exec(report)?.[1] || 0), skipped: Number(/<total-skipped-checks>(\d+)/.exec(report)?.[1] || 0) };
}

export function checkInput(xml) {
    if (typeof xml !== 'string' || !xml.trim() || Buffer.byteLength(xml) > 8 * 1024 * 1024) throw new Error('Provide a complete article XML, up to 8 MB.');
    const visible = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    if (!/<!DOCTYPE\s+article\s+PUBLIC\s+["']-\/\/ES\/\/DTD journal article DTD version [\d.]+\/\/EN\/\/XML["']\s+["']art\d+\.dtd["']/.test(visible)) throw new Error('A complete Elsevier article with its standard PUBLIC DOCTYPE is required. Reference fragments cannot establish full VTool validity.');
    // Unparsed local asset declarations are allowed; parsed external entities
    // could read files or fetch URLs from the validation computer.
    for (const entity of visible.matchAll(/<!ENTITY\b[\s\S]*?>/g)) {
        if (!/^<!ENTITY\s+[\w.-]+\s+SYSTEM\s+["'][\w.-]+["']\s+NDATA\s+\w+\s*>$/.test(entity[0])) throw new Error('Custom or parsed entity declarations are unsupported by the bridge. Validate these documents directly in VTool.');
    }
}

async function findVtool() {
    const candidates = [process.env.VTOOL_DIR];
    for (const root of [path.join(os.homedir(), 'Desktop', 'FL-Xtools'), path.join(os.homedir(), 'Desktop'), 'C:\\Vtool', 'C:\\Tools']) {
        try {
            for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isDirectory() && /vtool/i.test(entry.name)) candidates.push(path.join(root, entry.name));
        } catch {}
    }
    for (const candidate of candidates.filter(Boolean)) {
        try { await fs.access(path.join(candidate, 'vtool.jar')); return candidate; } catch {}
    }
    return '';
}

export async function startBridge({ port = Number(process.env.VTOOL_BRIDGE_PORT || 43127), token = randomBytes(24).toString('hex'), origin = process.env.TOOLKIT_ORIGIN || 'http://localhost:3001', configFile = path.join(os.homedir(), '.production-toolkit', 'vtool-bridge.json') } = {}) {
    let folder = await findVtool(), java = process.env.JAVA_BIN || 'java', busy = false;
    try { const saved = JSON.parse(await fs.readFile(configFile, 'utf8')); folder = saved.folder || folder; java = saved.java || java; } catch {}
    const runVersion = async (selectedFolder, selectedJava) => {
        const jar = path.join(selectedFolder, 'vtool.jar');
        await fs.access(jar);
        const result = await exec(selectedJava, ['-jar', jar, '-version'], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
        const version = /Elsevier Vtool version[^\r\n]*/i.exec(result.stdout)?.[0];
        if (!version) throw new Error('Selected folder did not run a recognized VTool installation.');
        return version;
    };
    const server = http.createServer(async (req, res) => {
        const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
        if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return send(403, { error: 'Invalid bridge host.' });
        if (req.headers.origin !== origin) return send(403, { error: 'This website is not paired with the bridge. Restart it with TOOLKIT_ORIGIN set to your website origin.' });
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        const supplied = Buffer.from(String(req.headers['x-bridge-token'] || ''));
        const expected = Buffer.from(token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: 'Enter the pairing code displayed by the local bridge.' });
        try {
            if (req.method === 'GET' && req.url === '/status') {
                let version = '', setupError = '';
                try { version = await runVersion(folder, java); } catch { setupError = 'Select the VTool installation folder and verify Java is installed.'; }
                return send(200, { folder, java, version, setupError, busy });
            }
            if (req.method !== 'POST' || !['/configure', '/validate'].includes(req.url)) return send(404, { error: 'Unknown bridge operation.' });
            if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, { error: 'JSON required.' });
            let bytes = 0, chunks = [];
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 10 * 1024 * 1024) return send(413, { error: 'Request too large.' }); chunks.push(chunk); }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (busy) return send(409, { error: 'Validation is already running. Wait for it to finish.' });
            if (req.url === '/configure') {
                if (typeof body.folder !== 'string' || !path.isAbsolute(body.folder)) throw new Error('Enter an absolute VTool folder path.');
                // Java can be configured locally via JAVA_BIN, never executed from web input.
                const version = await runVersion(body.folder, java);
                folder = body.folder;
                await fs.mkdir(path.dirname(configFile), { recursive: true });
                await fs.writeFile(configFile, JSON.stringify({ folder, java }), { mode: 0o600 });
                return send(200, { folder, java, version });
            }
            checkInput(body.xml);
            const version = await runVersion(folder, java);
            if (busy) return send(409, { error: 'Validation is already running. Wait for it to finish.' });
            busy = true;
            let temporary;
            try {
                temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'toolkit-vtool-'));
                const inputFile = path.join(temporary, 'main.xml');
                await fs.writeFile(inputFile, body.xml, 'utf8');
                try {
                    await exec(java, ['-Xmx512m', '-Djavax.xml.accessExternalDTD=', '-Djavax.xml.accessExternalSchema=', '-jar', path.join(folder, 'vtool.jar'), '-forcecheck', '-nofp', '-log', 'report', '-file', inputFile], { cwd: temporary, windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
                } catch (error) { if (error.killed || error.code === 'ENOENT') throw new Error('VTool timed out or could not start; validation is incomplete.'); }
                const report = parseReport(await fs.readFile(path.join(temporary, 'report.xml'), 'utf8'));
                return send(200, { ...report, version, scope: 'Complete supplied XML; associated graphics and other production assets were not supplied.', checkedAt: new Date().toISOString() });
            } finally { try { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); } finally { busy = false; } }
        } catch (error) { send(400, { error: error.message || 'Validation failed.' }); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { server, token, origin, port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const bridge = await startBridge();
        console.log(`VTool bridge ready at http://127.0.0.1:${bridge.port}\nPaired website: ${bridge.origin}\nPairing code: ${bridge.token}\nKeep this process running while validating. No VTool binaries are bundled.`);
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.error('A service is already using the VTool bridge port. If your bridge is already running, use its console pairing code. Otherwise close that service before starting this bridge. Do not launch two copies.');
        } else console.error(`Cannot start VTool bridge: ${error.message}`);
        process.exitCode = 1;
    }
}
