/** Whole-inventory review obligations; count-only questions do not imply text review. */
export function keeperOptReviewKinds(text:string) {
  const result=new Set<string>();
  const unit='(?:[`<]\\s*)?(opt[_ -]?(?:\\*|tags?|comments?|ins|del)|comments?|insertions?|deletions?|edits?|changes?)(?![\\w])(?:[`>]\\s*)?';
  const whole='(?:all|each|every)\\s+(?:\\d+\\s+)?(?:of\\s+)?(?:the\\s+)?';
  const patterns=[
    new RegExp('\\b(?:review|check|inspect|analy[sz]e|list|show|cover)\\s+(?:me\\s+)?'+whole+unit,'gi'),
    new RegExp('\\b'+whole+unit+'\\s*(?:(?:have\\s+been|were|are|was)\\s+)?(?:reviewed|checked|inspected|analy[sz]ed|listed|covered)\\b','gi'),
  ];
  for(const pattern of patterns)for(const match of text.matchAll(pattern)){
    const name=match[1].toLowerCase();
    result.add(/comment/.test(name)?'opt_comment':/insertion|(?:^opt[_ -]?ins$)/.test(name)?'opt_ins':/deletion|(?:^opt[_ -]?del$)/.test(name)?'opt_del':'opt_*');
  }
  return [...result];
}
export function keeperRecordInOptReview(kind:string,required:string[]) {
  return required.includes(kind)||(required.includes('opt_*')&&kind.startsWith('opt_'));
}
