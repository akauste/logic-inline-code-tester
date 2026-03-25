import React from 'react';

export function HeaderBar({
  statusSummary,
  onExportWorkflow,
  onExportTests,
  onOpenHelp,
  onImportWorkflow,
  onRunAll,
  canExportWorkflow,
}) {
  return (
    <header>
      <h1>Inline JS Code Tester for Logic Apps Standard</h1>
      <div className="header-actions">
        <button type="button" className="btn-sm" onClick={onImportWorkflow}>
          Import Workflow
        </button>
        <button type="button" className="btn-sm" onClick={onExportWorkflow} disabled={!canExportWorkflow}>
          Export Workflow
        </button>
        <button type="button" className="btn-sm" onClick={onExportTests}>
          Export Tests
        </button>
        <button type="button" className="btn-sm" onClick={onOpenHelp}>
          Help
        </button>
        <button type="button" className="btn-sm primary" onClick={onRunAll}>
          Run Tests
        </button>
        {statusSummary ? (
          <div className={`test-status ${statusSummary.allPassed ? 'pass' : 'fail'}`}>
            <span className="test-status-icon">{statusSummary.allPassed ? 'PASS' : 'FAIL'}</span>
            <span className="test-status-text">
              {statusSummary.passCount}/{statusSummary.total} passed
              {statusSummary.failCount > 0 ? `, ${statusSummary.failCount} failed` : ''}
              {statusSummary.errorCount > 0 ? `, ${statusSummary.errorCount} errors` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
