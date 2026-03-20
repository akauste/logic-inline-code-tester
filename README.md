# Logic Apps Standard Inline Code Tester

Local web UI for testing the **Execute JavaScript Code** action used in Logic Apps Standard.

## What it does

- Lets you paste your inline code snippet.
- Lets you paste a mocked `workflowContext` JSON object (with `trigger`, `actions`, `workflow`).
- Runs the snippet locally using Node.js with a sandboxed `vm` context.
- Shows:
  - returned `Result` (via `return ...`)
  - captured `console.log/info/warn/error`

## Run locally

```powershell
cd "logic-inline-code-tester"
npm start
```

Open: `http://localhost:3000`

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

