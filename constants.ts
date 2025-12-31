
import { CreditRole } from './types';

export const CREDIT_DB: CreditRole[] = [
    { name: "Conceptualization", url: "http://credit.niso.org/contributor-roles/conceptualization", aliases: ["conceptualization", "concept", "idea", "conception"] },
    { name: "Data curation", url: "http://credit.niso.org/contributor-roles/data-curation", aliases: ["data curation", "data", "curation", "data management"] },
    { name: "Formal analysis", url: "http://credit.niso.org/contributor-roles/formal-analysis", aliases: ["formal analysis", "analysis", "statistical analysis", "statistics"] },
    { name: "Funding acquisition", url: "http://credit.niso.org/contributor-roles/funding-acquisition", aliases: ["funding acquisition", "funding", "acquisition of funding", "grant"] },
    { name: "Investigation", url: "http://credit.niso.org/contributor-roles/investigation", aliases: ["investigation", "experiments", "experimentation"] },
    { name: "Methodology", url: "http://credit.niso.org/contributor-roles/methodology", aliases: ["methodology", "methods", "design"] },
    { name: "Project administration", url: "http://credit.niso.org/contributor-roles/project-administration", aliases: ["project administration", "administration", "project management", "admin"] },
    { name: "Resources", url: "http://credit.niso.org/contributor-roles/resources", aliases: ["resources", "materials", "computing resources"] },
    { name: "Software", url: "http://credit.niso.org/contributor-roles/software", aliases: ["software", "programming", "code"] },
    { name: "Supervision", url: "http://credit.niso.org/contributor-roles/supervision", aliases: ["supervision", "supervisor", "oversight"] },
    { name: "Validation", url: "http://credit.niso.org/contributor-roles/validation", aliases: ["validation", "verification"] },
    { name: "Visualization", url: "http://credit.niso.org/contributor-roles/visualization", aliases: ["visualization", "figures", "visuals"] },
    { name: "Writing – original draft", url: "http://credit.niso.org/contributor-roles/writing-original-draft", aliases: ["writing – original draft", "writing - original draft", "writing original draft", "writting – original draft", "writting - original draft", "writting original draft", "writting orginal draft", "drafting", "draft", "writing draft", "manuscript preparation", "original draft"] },
    { name: "Writing – review & editing", url: "http://credit.niso.org/contributor-roles/writing-review-editing", aliases: ["writing – review & editing", "writing - review & editing", "writing review & editing", "writing review and editing", "review & editing", "review and editing", "review", "editing", "revision", "manuscript revision"] }
];

export const AUTH_PREFIX = "xtool_auth_";
