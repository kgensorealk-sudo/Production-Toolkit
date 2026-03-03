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
