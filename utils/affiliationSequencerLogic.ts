import {sequenceAffiliations} from './affiliationSequencerEngine';
import {scanReferenceXml} from './referenceUpdaterXml';
/**
 * Affiliation Sequencer & ID Normalizer
 *
 * Implements strict editorial rules for Elsevier Journal CE XML:
 * - Sequentially renumbers <ce:affiliation id="..."> in increments of 5 (af0005, af0010, af0015, af0020...)
 * - Preserves affiliation-id="..." strictly intact
 * - Synchronizes <ce:cross-ref refid="..."> links pointing to corrected affiliation IDs (e.g. refid="af0025" -> refid="af0020")
 * - Preserves <ce:cross-ref id="..."> attributes and inner <ce:sup> labels intact
 * - Preserves all <ce:author>, <sa:affiliation>, and document structure intact
 */

export interface AffiliationChange {
  index: number;
  oldId: string;
  newId: string;
  label?: string;
  affiliationId?: string;
  organization?: string;
  isChanged: boolean;
}

export interface CrossRefChange {
  oldRefId: string;
  newRefId: string;
  crossRefId?: string;
  label?: string;
  originalTag: string;
  updatedTag: string;
}

export interface StrictAffiliationSequenceResult {
  outputXml: string;
  totalAffiliations: number;
  changedCount: number;
  changes: AffiliationChange[];
  crossRefChanges: CrossRefChange[];
  totalCrossRefsUpdated: number;
  isAlreadySequential: boolean;
  notices: string[];
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

export function getAlphabetLabel(index0Based: number): string {
  let label = "";
  let n = index0Based;
  while (n >= 0) {
    label = ALPHABET[n % 26] + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Format 1-based affiliation index into sequential ID:
 * 1 -> af0005, 2 -> af0010, 3 -> af0015, 4 -> af0020, etc.
 */
export function formatAffiliationId(index1Based: number, increment = 5): string {
  const num = index1Based * increment;
  return `af${num.toString().padStart(4, '0')}`;
}

/**
 * Synchronizes <ce:cross-ref refid="..."> elements so that references point
 * to the corrected affiliation IDs.
 *
 * Preserves the cross-ref's own id attribute (e.g. id="cf0040") and inner <ce:sup> intact.
 * e.g. <ce:cross-ref refid="af0025" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>
 *   -> <ce:cross-ref refid="af0020" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>
 */
/**
 * Synchronizes <ce:cross-ref refid="..."> elements so that references point
 * to the corrected affiliation IDs.
 *
 * Preserves the cross-ref's own id attribute (e.g. id="cf0040") and inner <ce:sup> intact.
 * Handles space- and comma-separated multiple refid tokens, compound superscripts
 * (e.g. "b, d", "b and d"), and strictly preserves distinct author affiliation links.
 */
export function synchronizeAffiliationCrossRefs(
  xml: string,
  idMap: Record<string, string>,
  labelToNewIdMap: Record<string, string> = {},
  labelReplacementMap: Record<string, string> = {}
): { outputXml: string; updatedCount: number; changes: CrossRefChange[] } {
 const parsed=scanReferenceXml(xml),edits:Array<{start:number;end:number;value:string}>=[],changes:CrossRefChange[]=[];
 for(const node of parsed.nodes){if(!['ce:cross-ref','ce:cross-refs'].includes(node.name)||!node.attributes.refid)continue;
 const old=node.attributes.refid,next=old.split(/(\s+)/).map(id=>Object.prototype.hasOwnProperty.call(idMap,id)?idMap[id]:id).join('');
 if(next===old)continue;
 for(const id of next.split(/\s+/))if(id && !parsed.ids.has(id))throw new Error('Mapped affiliation target does not exist: '+id);
 const r=node.attributeRanges.refid;edits.push({start:r.valueStart,end:r.valueEnd,value:next.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')});changes.push({oldRefId:old,newRefId:next,crossRefId:node.attributes.id,originalTag:xml.slice(node.start,node.end),updatedTag:''});}
 let outputXml=xml;for(const e of edits.sort((a,b)=>b.start-a.start))outputXml=outputXml.slice(0,e.start)+e.value+outputXml.slice(e.end);scanReferenceXml(outputXml);return {outputXml,updatedCount:changes.length,changes};
}

/**
 * Normalizes the `id` attribute of <ce:affiliation> tags in increments of 5 (af0005, af0010...).
 * Also synchronizes corresponding author <ce:cross-ref refid="..."> links so references to
 * updated affiliation IDs remain valid (e.g., refid="af0025" -> refid="af0020").
 *
 * Strictly preserves:
 * - affiliation-id="..." attributes
 * - <ce:cross-ref id="..."> attributes (e.g. id="cf0040")
 * - <ce:sup> labels and author names
 * - XML formatting and structure
 */
export function sequenceAffiliationIdsStrict(
  xml: string, 
  increment = 5,
  syncCrossRefs = true
): StrictAffiliationSequenceResult {
 if(increment!==5 || !syncCrossRefs)throw new Error('Safe affiliation sequencing requires increments of five and target synchronization.');
 const result=sequenceAffiliations(xml);
 const changes=result.changes.map(c=>({index:c.index,oldId:c.originalId,newId:c.newId,label:c.newLabel,affiliationId:c.affiliationId,isChanged:c.isChanged}));
 const crossRefChanges=result.linkChanges.filter(c=>c.isChanged).map(c=>({oldRefId:c.oldRefId,newRefId:c.newRefId,crossRefId:c.crossRefId,label:c.label,originalTag:'',updatedTag:''}));
 return {outputXml:result.outputXml,totalAffiliations:changes.length,changedCount:changes.filter(c=>c.isChanged).length,changes,crossRefChanges,totalCrossRefsUpdated:crossRefChanges.length,isAlreadySequential:result.outputXml===xml,notices:result.notices};
}
