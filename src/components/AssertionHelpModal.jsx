import React, { useEffect } from 'react';

const ASSERTION_STYLE_DOCS = [
  {
    id: 'expression',
    title: 'Boolean Expression',
    description:
      'Use a single JavaScript expression that evaluates to true. This is the fastest style for simple checks.',
    bullets: [
      'Available variables: result, workflowContext',
      'Best for quick comparisons and structural checks',
      'Exports to Vitest as assert.equal(passed, true)',
    ],
    example: `Array.isArray(result) && result.length === 2`,
  },
  {
    id: 'assert',
    title: 'Chai Assert',
    description:
      'Write one or more statements with the full Chai assert API, so you can use the same style in exported tests.',
    bullets: [
      'Available variables: result, workflowContext, assert',
      'Use the full Chai assert library and its broader assertion surface',
      'Exports to Vitest with import { assert } from "chai"',
    ],
    example: `assert.equal(result.count, 2);
assert.deepEqual(result.items, ['first', 'second']);`,
  },
  {
    id: 'expect',
    title: 'Chai Expect',
    description:
      'Write expectation-style statements with the full Chai expect API and export the same syntax into your pipeline tests.',
    bullets: [
      'Available variables: result, workflowContext, expect',
      'Use Chai chainable matchers instead of the limited built-in helper set',
      'Exports directly into a Vitest-ready test file with chai imports',
    ],
    example: `expect(result).to.have.lengthOf(2);
expect(result[0]).to.equal('first');`,
  },
];

export function AssertionHelpModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="modal active" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-content modal-content-wide">
        <div className="modal-header">
          <h3>Assertion Styles Help</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-hint">
            Each test case can use a different assertion style. Pick the one that best matches how you want to
            author tests now and export them later into CI pipelines.
          </p>

          <div className="assertion-help-list">
            {ASSERTION_STYLE_DOCS.map((item) => (
              <section key={item.id} className="assertion-help-card">
                <div className="assertion-help-title">{item.title}</div>
                <p className="assertion-help-description">{item.description}</p>
                <ul className="assertion-help-points">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <div className="assertion-help-example-label">Example</div>
                <pre className="assertion-help-code">{item.example}</pre>
              </section>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
