# Logic Apps Standard Inline Code Tester

**Browser-only static web app** for testing the **Execute JavaScript Code** action used in Logic Apps Standard. Code runs in a **Web Worker** in your browser—no backend required.

## What it does

- Paste your inline code snippet and a mocked `workflowContext` JSON (`trigger`, `actions`, `workflow`).
- Generate a `workflowContext` skeleton from your code (**Generate from Inline Code**).
- Save multiple **named test cases** (context + paired **assertion**).
- **Run** or **Run All Test Cases** with pass/fail in the UI.
- Assertions use `result` and `workflowContext`; must evaluate to `true`.

## Develop locally

Edit files under `public/`, then:

```powershell
cd "logic-inline-code-tester"
npm run build
npm run preview
```

Open the URL printed by `serve` (default `http://localhost:3000`).

## Build for production (Azure Static Web Apps)

1. Produce the static site:

```powershell
npm run build
```

Output folder: **`dist/`** (copy of `public/` plus `staticwebapp.config.json`).

2. In the [Azure Portal](https://portal.azure.com), create a **Static Web App** (Free tier).

3. Connect your Git repo **or** deploy manually:
   - **App location**: `dist` (if the repo root is this project), or path to `dist` in a monorepo.
   - **API**: none.
   - For a **prebuilt** static site, point the SWA app at the folder that contains `index.html` and `staticwebapp.config.json`.

4. `staticwebapp.config.json` includes a `navigationFallback` so client routes fall back to `index.html` (single-page app).

### GitHub Actions

This repo includes `.github/workflows/azure-static-web-apps.yml` as a starting point:

1. In Azure Portal → your Static Web App → **Manage deployment token** → add it as repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
2. Push to `main` to deploy.

The workflow runs `npm ci && npm run build` at the repository root and deploys the **`dist/`** folder (`skip_app_build: true`, `app_location: dist`).

If this project lives in a **subfolder** of your Git repo, add `defaults.run.working-directory` to that folder for the install/build steps, or move the workflow accordingly.

## Tests

```powershell
npm test
```

Runs Node tests that mirror the browser worker execution model (no HTTP server).

## Notes / limitations

- This is for **local prototyping**; behavior may differ slightly from Azure Logic Apps’ hosted runtime.
- Code runs in the browser; `require`, Node APIs, and file system are not available (same idea as inline code in the portal).
