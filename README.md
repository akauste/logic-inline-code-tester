# Logic Apps Standard Inline Code Tester

Local web UI for testing the **Execute JavaScript Code** action used in Logic Apps Standard.

## What it does

- Lets you paste your inline code snippet.
- Lets you paste a mocked `workflowContext` JSON object (with `trigger`, `actions`, `workflow`).
- Runs the snippet locally in either:
  - Node.js (sandboxed `vm` on the server), or
  - the browser (Web Worker).
- In the UI, you can generate a `workflowContext` JSON skeleton from your inline code (button: `Generate from Inline Code`).
- Shows:
  - returned `Result` (via `return ...`)
  - captured `console.log/info/warn/error`

## Run locally

```powershell
cd "logic-inline-code-tester"
npm start
```

Open: `http://localhost:3000`

To stop the server:

```powershell
npm run stop
```

## Request format (for `/api/run`)

```json
{
  "code": "/* your JS snippet */",
  "workflowContext": { "trigger": {}, "actions": {}, "workflow": {} },
  "timeoutMs": 1000
}
```

## Notes / limitations

- The runner is designed for local prototyping; it is not a perfect emulation of the Azure Logic Apps execution environment.
- Node packages, `require()`, `process`, and timer globals are intentionally blocked in the sandbox.
- In-browser mode runs in a Web Worker, so it can still be terminated on timeout, but it won't perfectly match Node.js/Logic Apps runtime quirks.

