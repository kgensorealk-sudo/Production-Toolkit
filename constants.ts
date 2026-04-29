import { CreditRole } from './types';

export const APP_ID = 'prod-toolkit-v1';

// Inactivity Security Protocol (Milliseconds)
export const INACTIVITY_WARNING = 15 * 60 * 1000; // 15 Minutes
export const INACTIVITY_LIMIT = 20 * 60 * 1000;   // 20 Minutes

export const CREDIT_DB: CreditRole[] = [
    { 
        name: "Conceptualization", 
        url: "http://credit.niso.org/contributor-roles/conceptualization", 
        aliases: ["conceptualization", "concept", "idea", "conception"],
        definition: "Ideas; formulation or evolution of overarching research goals and aims.",
        shortName: "Conc."
    },
    { 
        name: "Data curation", 
        url: "http://credit.niso.org/contributor-roles/data-curation", 
        aliases: ["data curation", "data", "curation", "data management"],
        definition: "Management activities to annotate (produce metadata), scrub data and maintain research data (including software code, where it is necessary for interpreting the data itself) for initial use and later re-use.",
        shortName: "Data"
    },
    { 
        name: "Formal analysis", 
        url: "http://credit.niso.org/contributor-roles/formal-analysis", 
        aliases: ["formal analysis", "analysis", "statistical analysis", "statistics"],
        definition: "Application of statistical, mathematical, computational, or other formal techniques to analyze or synthesize study data.",
        shortName: "Analys."
    },
    { 
        name: "Funding acquisition", 
        url: "http://credit.niso.org/contributor-roles/funding-acquisition", 
        aliases: ["funding acquisition", "funding", "acquisition of funding", "grant"],
        definition: "Acquisition of the financial support for the project leading to this publication.",
        shortName: "Fund."
    },
    { 
        name: "Investigation", 
        url: "http://credit.niso.org/contributor-roles/investigation", 
        aliases: ["investigation", "experiments", "experimentation"],
        definition: "Conducting a research and investigation process, specifically performing the experiments, or data/evidence collection.",
        shortName: "Invest."
    },
    { 
        name: "Methodology", 
        url: "http://credit.niso.org/contributor-roles/methodology", 
        aliases: ["methodology", "methods", "design"],
        definition: "Development or design of methodology; creation of models.",
        shortName: "Meth."
    },
    { 
        name: "Project administration", 
        url: "http://credit.niso.org/contributor-roles/project-administration", 
        aliases: ["project administration", "administration", "project management", "admin"],
        definition: "Management and coordination responsibility for the research activity planning and execution.",
        shortName: "Admin."
    },
    { 
        name: "Resources", 
        url: "http://credit.niso.org/contributor-roles/resources", 
        aliases: ["resources", "materials", "computing resources"],
        definition: "Provision of study materials, reagents, materials, patients, laboratory samples, animals, instrumentation, computing resources, or other analysis tools.",
        shortName: "Res."
    },
    { 
        name: "Software", 
        url: "http://credit.niso.org/contributor-roles/software", 
        aliases: ["software", "programming", "code"],
        definition: "Programming, software development; designing computer programs; implementation of the computer code and supporting algorithms; testing of existing code components.",
        shortName: "Soft."
    },
    { 
        name: "Supervision", 
        url: "http://credit.niso.org/contributor-roles/supervision", 
        aliases: ["supervision", "supervisor", "oversight"],
        definition: "Oversight and leadership responsibility for the research activity planning and execution, including mentorship external to the core team.",
        shortName: "Superv."
    },
    { 
        name: "Validation", 
        url: "http://credit.niso.org/contributor-roles/validation", 
        aliases: ["validation", "verification"],
        definition: "Verification, whether as a part of the activity or separate, of the overall replication/reproducibility of results/experiments and other research outputs.",
        shortName: "Valid."
    },
    { 
        name: "Visualization", 
        url: "http://credit.niso.org/contributor-roles/visualization", 
        aliases: ["visualization", "figures", "visuals"],
        definition: "Preparation, creation and/or presentation of the published work, specifically visualization/data presentation.",
        shortName: "Vis."
    },
    { 
        name: "Writing – original draft", 
        url: "http://credit.niso.org/contributor-roles/writing-original-draft", 
        aliases: ["writing – original draft", "writing - original draft", "writing original draft", "writting – original draft", "writting - original draft", "writting original draft", "writting orginal draft", "drafting", "draft", "writing draft", "manuscript preparation", "original draft"],
        definition: "Preparation, creation and/or presentation of the published work, specifically writing the initial draft (including substantive translation).",
        shortName: "Draft"
    },
    { 
        name: "Writing – review & editing", 
        url: "http://credit.niso.org/contributor-roles/writing-review-editing", 
        aliases: ["writing – review & editing", "writing - review & editing", "writing review & editing", "writing review and editing", "review & editing", "review and editing", "review", "editing", "revision", "manuscript revision"],
        definition: "Preparation, creation and/or presentation of the published work by those from the original research group, specifically critical review, commentary or revision – including pre- or post-publication stages.",
        shortName: "Edit"
    }
];

export const AUTH_PREFIX = "xtool_auth_";