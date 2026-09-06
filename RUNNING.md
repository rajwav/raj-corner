# Raj’s Corner — How to Run

## Quick Start

For website:
```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner" && npm run dev
```

For Capture:
```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner" && npm run capture
```

For build:
```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner" && ASTRO_TELEMETRY_DISABLED=1 npm run build
```

---

## 1. Project Location

The absolute project path is:

`/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner`

This is the project root and commands should normally be run from there.

## 2. If Terminal Is Anywhere

If you open Terminal from anywhere else, give the exact command:

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
```

This works regardless of the user's current Terminal directory because it provides the exact absolute path.

To confirm you are in the right place, you can run:

```bash
pwd
```

It should print the project root path shown above.

## 13. Important Rule

Do not run npm commands from a random directory. First cd into the Raj’s Corner project root.

## 3. Run the Public Website

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
npm run dev
```

- This starts the Astro development server.
- Normally, open [http://localhost:4321/](http://localhost:4321/) in your browser.
- Stop it with `Ctrl+C` in your Terminal.

## 4. Run Capture

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
npm run capture
```

- Capture is the local content-management interface.
- Normally, open [http://127.0.0.1:4322/](http://127.0.0.1:4322/) in your browser.
- Stop it with `Ctrl+C` in your Terminal.

## 5. Run Both

The public site and Capture are separate processes. You can run them concurrently by opening two Terminal tabs/windows:

**Terminal 1:**
```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
npm run dev
```

**Terminal 2:**
```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
npm run capture
```

## 6. Production Build

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
ASTRO_TELEMETRY_DISABLED=1 npm run build
```

Success means the command completes with 0 errors and 0 warnings. The static build output is generated safely in the `dist/` directory.

## 7. Preview Production Build

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
npm run preview
```

This previews the built production site locally.

## 8. Open the Project in VS Code

```bash
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
code .
```

If `code` is unavailable, you can open the folder manually in VS Code via File > Open Folder.

## 9. Open the Project in Finder

```bash
open "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
```

## 10. Git / Stable Checkpoint

The current stable checkpoint is:

**Commit:** f0bc9d9
**Message:** Raj’s Corner — stable universe checkpoint

Useful commands:
```bash
git status
git log -1 --oneline
```
A clean status means there are no uncommitted changes. 

To return to the stable checkpoint if necessary, you can use `git reset --hard HEAD` and `git clean -fd`. **DANGER:** These are destructive reset commands that will permanently wipe out uncommitted changes.

## 12. Common Terminal Situations

- I am in my home directory: `~`
- I am on the Desktop
- I am inside another project
- I reopened Terminal later
- I don't know where I am

The absolute `cd` command is the reliable solution for all these situations. You can safely run:
```bash
cd ~
cd "/Users/raj/Documents/Codex/2026-09-06/referenced-chatgpt-conversation-this-is-an/outputs/raj-corner"
```

## 14. Troubleshooting

- **`npm: command not found`**: Node.js is missing. Install Node.js.
- **`npm run dev` fails**: Ensure you are in the correct project root folder first.
- **port 4321 already in use**: Kill the existing Astro server terminal or stop the process on that port.
- **port 4322 already in use**: Kill the existing Capture server terminal.
- **dependencies missing**: Run `npm install` inside the project root to fetch dependencies.
- **build fails**: Run the build command and inspect the first actual error shown.

## 15. Project Structure

- **src/**: Core source code.
- **src/pages/**: Astro routing; each file here maps to a URL.
- **src/content/**: Content collections (markdown entries).
- **src/components/**: Reusable UI elements.
- **src/layouts/**: Wrapper templates.
- **src/styles/**: CSS and design logic.
- **capture/**: The local writing app server and UI.
- **public/**: Static assets.
- **dist/**: The final production build output.

## 16. Daily Workflow

1. Open Terminal.
2. `cd` into the project root.
3. Start Capture if adding/editing content.
4. Start Astro dev server to view the public site.
5. Make changes through Capture or the appropriate source files.
6. Run the production build before considering a change stable.
7. Check git status.
