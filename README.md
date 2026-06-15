# OctoWP

OctoWP is a desktop WhatsApp operations tool built with Electron and React.
It provides campaign management, contact/list segmentation, automated follow-ups, and local logging in a single application.

Important note:
This project uses an unofficial WhatsApp connection layer. Improper use may violate platform policies and can lead to account restrictions. Use only with consent-based and permissioned contact lists.

## Tech Stack

- Electron
- React + Vite
- TypeScript
- SQLite (better-sqlite3)
- Vitest

## Project Structure

- electron/: main process, database layer, campaign engine, IPC handlers
- src/: renderer UI screens and components
- shared/: shared types between main and renderer
- tests/: unit and integration tests
- docs/: design and manual test documentation

## Requirements

- Node.js 22+
- Windows

## Setup

1. Install dependencies:
	npm install
2. Start development mode:
	npm run dev

## Scripts

- npm run dev: start development mode
- npm test: run test suite
- npm run build: build the project
- npm run package: generate Windows installer package

## Native Module Note

better-sqlite3 is a native module, and Electron and Node use different ABIs.
Project scripts handle the required rebuild flow automatically:

- npm install / npm run dev / npm run package: Electron ABI side
- npm test: Node ABI side

## Testing

Run tests with:

npm test

For manual verification flows:

- docs/MANUAL-TEST.md

## License

MIT

## Author and Purpose

This project was built by Hüseyin Karacif.
It was created to solve real operational needs, not for commercial exploitation.
