export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  type: 'major' | 'minor' | 'patch';
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.8.0',
    date: '2026-03-19',
    title: 'Experimental Protocols & Toolkit Reorganization',
    type: 'minor',
    changes: [
      { type: 'feature', description: 'New "Experimental Protocols" tab for sandbox modules and non-official tools.' },
      { type: 'improvement', description: 'Relocated Comment Replacer, Section Auditor, and Ref Dupe Checker to Experimental section.' },
      { type: 'improvement', description: 'Updated application versioning to v1.8.0.' }
    ]
  },
  {
    version: '1.7.0',
    date: '2026-03-10',
    title: 'Table Beautifier Evolution & Toolkit Refinement',
    type: 'minor',
    changes: [
      { type: 'feature', description: 'Multiple target colnames support in Table Beautifier (comma-separated).' },
      { type: 'feature', description: 'Smart colname suggestions extracted directly from input XML.' },
      { type: 'feature', description: 'New "Strip" alignment protocol and "Show Formatting in Diff" toggle.' },
      { type: 'improvement', description: 'Streamlined toolkit by removing legacy JM Query Generator.' },
      { type: 'improvement', description: 'Updated application versioning to v1.7.0.' }
    ]
  },
  {
    version: '1.6.1',
    date: '2026-03-10',
    title: 'Vercel Deployment & Build Optimization',
    type: 'patch',
    changes: [
      { type: 'improvement', description: 'Optimized Vite build with functional manual chunking for better performance.' },
      { type: 'fix', description: 'Resolved Vercel parsing errors in package-lock.json.' },
      { type: 'improvement', description: 'Updated application versioning across all modules.' }
    ]
  },
  {
    version: '1.6.0',
    date: '2026-02-20',
    title: 'Editorial Workflow Suite Hardening',
    type: 'minor',
    changes: [
      { type: 'feature', description: 'New Release Notes module for version transparency.' },
      { type: 'improvement', description: 'Hardened security protocols across all XML processing nodes.' },
      { type: 'improvement', description: 'Enhanced Toast notification system with motion physics.' },
      { type: 'fix', description: 'Resolved duplicate export issues in Landing page logic.' },
      { type: 'fix', description: 'Fixed type mismatch in AuthContext resiliency protocol.' }
    ]
  },
  {
    version: '1.5.0',
    date: '2026-02-10',
    title: 'XML Processing Optimization',
    type: 'minor',
    changes: [
      { type: 'feature', description: 'Added Table XML Beautifier for structured multi-line formatting.' },
      { type: 'improvement', description: 'Optimized bibliography extraction speed by 40%.' },
      { type: 'fix', description: 'Fixed ID prefix auditor collision in large documents.' }
    ]
  },
  {
    version: '1.0.0',
    date: '2025-12-01',
    title: 'Initial Production Release',
    type: 'major',
    changes: [
      { type: 'feature', description: 'Core XML processing toolkit deployment.' },
      { type: 'feature', description: 'Supabase integration for secure profile management.' },
      { type: 'feature', description: 'Multi-module dashboard architecture.' }
    ]
  }
];
