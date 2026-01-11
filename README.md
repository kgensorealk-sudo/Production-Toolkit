# Production Toolkit Pro

An enterprise-grade editorial suite designed for high-volume XML production environments. This toolkit provides a specialized set of utilities for XML normalization, citation management, and authorship tagging, deployable as a standalone Windows executable (.exe) or a secure web application.

## 🚀 Key Features

### 🛠️ XML & Reference Management
*   **XML Reference Normalizer**: Automated resequencing of bibliography citations with intelligent cross-reference updates.
*   **Uncited Ref Cleaner**: Surgical audit and removal of bibliography items that lack body citations.
*   **Other-Ref Scanner**: Isolation of unstructured `<ce:other-ref>` items for external re-tagging, with automatic Name-Date label suppression.
*   **Reference Updater**: Merge proofreading corrections into existing lists while maintaining original ID integrity.
*   **Duplicate Ref Remover**: Fuzzy-matching engine to detect and merge similar references, including automatic citation re-linking.

### ✍️ Editorial Workflow
*   **CRediT Author Tagging**: Smart-detects contributor roles from raw text, auto-corrects typos, and generates NISO-standard XML.
*   **Article Highlights Gen**: Converts rich-text bullet points into structured `author-highlights` XML.
*   **View Synchronizer**: Mirror content between Compact and Extended paragraph views with automatic ID remapping.
*   **Quick Text Diff**: Technical side-by-side comparison with character-level highlighting optimized for XML tags.

### 📊 Table Utilities
*   **XML Table Fixer**: Manage the lifecycle of table footnotes, detaching them to legends or re-attaching them to cells with correct IDs.
*   **Table Converter**: Multi-format conversion between HTML, Markdown, CSV, JSON, and XML.

## 🖥️ Desktop Deployment (.exe)

This application is built with **Electron** and can be compiled into a portable Windows installer.

### Prerequisites
- Node.js (v18+)
- NPM

### Build Steps
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Build Web Assets**:
   ```bash
   npm run build
   ```
3. **Generate Executable**:
   ```bash
   # Generates a portable .exe in the /release folder
   npm run electron:build
   ```

## 🔐 Security & Architecture

- **Local-First Processing**: 100% of XML parsing and processing happens on the client machine. No sensitive editorial data is sent to external servers.
- **Supabase Integration**: Centralized user provisioning and system-wide announcements.
- **State Persistence**: Sessions and preferences are handled via local storage and session storage.

## 👑 Admin Console

Administrators can access the `/admin` route (requires `admin` role in Supabase `profiles` table) to:
- **Provision Users**: Manually grant/revoke access or manage trial durations.
- **Workflow Banners**: Create and push "Live Insights" or "Status Banners" that appear across all tools in the suite.
- **Database Repair**: Access SQL scripts to initialize or repair table schemas.

## 🛠️ Tech Stack

- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS
- **Database/Auth**: Supabase
- **Desktop Wrapper**: Electron
- **Diff Engine**: JsDiff

---
*Crafted for Editorial Excellence by the Production Systems Team.*
