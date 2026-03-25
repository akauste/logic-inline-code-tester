import React from 'react';

const HELP_SECTIONS = [
  {
    title: 'What This Tool Does',
    body:
      'Use this app to test Logic Apps Standard inline JavaScript actions locally. You can import a workflow JSON file, edit each inline code action separately, run test cases against mocked workflowContext data, and export both updated workflow JSON and reusable test files.',
  },
  {
    title: 'Recommended Flow',
    points: [
      'Import a Logic App workflow from the header if you already have one.',
      'Select the inline code action you want to work on from the left panel.',
      'Create one or more test cases for that action.',
      'Use the `Mocked Inputs` tab to fill only the upstream action outputs your code actually reads.',
      'Use the `JSON Context` tab only when you need full manual control.',
      'Run a single test case with `Run`, or the full suite for the selected action with `Run All Test Cases`.',
    ],
  },
  {
    title: 'Workflow Import And Export',
    points: [
      '`Import Workflow` accepts Logic App workflow JSON and detects `ExecuteJavaScriptCode` actions automatically.',
      'Each detected inline action gets its own separate code editor and test suite.',
      '`Export Workflow` keeps the original workflow structure and writes your edited JavaScript back into the matching inline actions.',
      '`Export Workflow` is available only after you imported a workflow, because the original JSON structure must be preserved.',
    ],
  },
  {
    title: 'Mocked Inputs And JSON Context',
    points: [
      'The `Workflow` tab visualizes the imported workflow and highlights the currently selected inline action.',
      'The `Mocked Inputs` tab shows the trigger or action payloads that the selected code references through `workflowContext`.',
      'Each mocked input editor writes back into the full `workflowContext` structure for the active test case.',
      'The `JSON Context` tab is the advanced editor for any data that is not covered by the guided mock editors.',
    ],
  },
  {
    title: 'Assertions',
    points: [
      '`Boolean Expression`: write an expression that must evaluate to `true`.',
      '`Chai Assert`: write assertion statements using `assert`.',
      '`Chai Expect`: write assertion statements using `expect`.',
      'Available variables in assertions are `result` and `workflowContext`.',
      'Use the assertion `Help` button beside the selector for syntax examples for each style.',
    ],
  },
  {
    title: 'Exported Tests',
    points: [
      '`Export Tests` creates a Vitest-ready test file for the current inline actions and their test cases.',
      'The exported file uses Chai for `assert` and `expect` styles.',
      'This makes it easier to move the same tests into CI pipelines or other local automation.',
    ],
  },
];

export function HelpModal({ open, onClose }) {
  return (
    <div className={`modal ${open ? 'active' : ''}`} onClick={onClose}>
      <div className="modal-content modal-content-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Help</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="help-modal-list">
            {HELP_SECTIONS.map((section) => (
              <section key={section.title} className="help-card">
                <div className="help-card-title">{section.title}</div>
                {section.body ? <p className="help-card-body">{section.body}</p> : null}
                {section.points ? (
                  <ul className="help-card-points">
                    {section.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
