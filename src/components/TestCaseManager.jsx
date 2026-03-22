import React from 'react';

export function TestCaseManager({ caseNames, selectedCase, onSelectCase, onCreateCase, onDeleteCase }) {
  return (
    <div className="context-manager">
      <div className="context-meta">
        <div>
          <div className="context-label">Test Cases</div>
          <div className="context-caption">Choose, add, or remove saved scenarios.</div>
        </div>
        <div className="context-count">{caseNames.length}</div>
      </div>
      <div className="context-controls">
        <label className="context-select-wrap">
          <span className="sr-only">Select test case</span>
          <select value={selectedCase} onChange={(event) => onSelectCase(event.target.value)}>
            {caseNames.map((caseName) => (
              <option key={caseName} value={caseName}>
                {caseName}
              </option>
            ))}
          </select>
        </label>
        <div className="context-actions">
          <button type="button" className="btn-sm context-action" onClick={onCreateCase}>
            New
          </button>
          <button type="button" className="btn-sm context-action danger" onClick={onDeleteCase}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
