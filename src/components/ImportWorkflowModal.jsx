import React, { useEffect, useMemo, useRef } from 'react';

export function ImportWorkflowModal({
  open,
  value,
  onChange,
  onClose,
  onImport,
  parseWorkflow,
  existingActionCount,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const preview = useMemo(() => parseWorkflow(value), [parseWorkflow, value]);
  const actionCount = preview.importedActions.length;
  const importLabel = existingActionCount > 0 ? 'Replace and Import' : 'Import Actions';

  if (!open) return null;

  return (
    <div className="modal active" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-content modal-content-wide">
        <div className="modal-header">
          <h3>Import Logic App Workflow</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <p className="modal-hint">
              Paste a Logic App workflow JSON payload. Inline actions with type
              <code>JavaScriptCode</code> will be detected automatically.
            </p>
            <textarea
              ref={textareaRef}
              className="modal-textarea modal-textarea-large"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={'{\n  "definition": {\n    "actions": {\n      "...": {}\n    }\n  }\n}'}
              spellCheck="false"
            />
          </div>

          <div className="modal-divider"></div>

          <div className="modal-section">
            <div className="import-preview-header">
              <div>
                <div className="panel-title">Preview</div>
                <p className="modal-hint">
                  {preview.error
                    ? 'Fix the JSON to preview detected inline code actions.'
                    : `${actionCount} inline action${actionCount === 1 ? '' : 's'} ready to import.`}
                </p>
              </div>
              {!preview.error && actionCount > 0 ? (
                <span className="context-count">{actionCount}</span>
              ) : null}
            </div>

            {preview.error ? (
              <div className="import-preview-state import-preview-state-error">{preview.error}</div>
            ) : actionCount === 0 ? (
              <div className="import-preview-state">
                No inline JavaScript actions found. Expected actions of type
                <code>JavaScriptCode</code>.
              </div>
            ) : (
              <div className="import-preview-list" role="list" aria-label="Detected inline actions">
                {preview.importedActions.map((action, index) => (
                  <div key={`${action.name}-${index}`} className="import-preview-item" role="listitem">
                    <div className="import-preview-item-name">{action.name}</div>
                    <div className="import-preview-item-meta">
                      {action.code.trim().split('\n')[0].trim() || 'Inline code action'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onImport(preview, value)}
            disabled={Boolean(preview.error) || actionCount === 0}
          >
            {importLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
