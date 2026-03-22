import React, { useEffect, useRef, useState } from 'react';

export function TestCaseModal({
  open,
  mode,
  onModeChange,
  onClose,
  onGenerate,
  onCreate,
  caseNames,
  generatedTemplateReady,
}) {
  const [name, setName] = useState('');
  const [sourceCase, setSourceCase] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setSourceCase('');
      return;
    }

    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

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
      <div className="modal-content">
        <div className="modal-header">
          <h3>Create New Test Case</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <label className="field" htmlFor="new-test-case-name">
              Test Case Name
            </label>
            <input
              id="new-test-case-name"
              ref={inputRef}
              type="text"
              placeholder="e.g., Extract Emails, Invalid Input"
              autoComplete="off"
              className="modal-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="modal-divider"></div>

          <div className="modal-section">
            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${mode === 'generate' ? 'active' : ''}`}
                onClick={() => onModeChange('generate')}
              >
                Generate New
              </button>
              <button
                type="button"
                className={`modal-tab ${mode === 'duplicate' ? 'active' : ''}`}
                onClick={() => onModeChange('duplicate')}
              >
                Duplicate
              </button>
            </div>

            <div className={`modal-panel ${mode === 'generate' ? 'active' : ''}`}>
              <p className="modal-hint">Generate workflowContext skeleton from the inline code.</p>
              <button type="button" className="btn-primary" onClick={onGenerate}>
                {generatedTemplateReady ? 'Regenerate from Code' : 'Generate from Code'}
              </button>
            </div>

            <div className={`modal-panel ${mode === 'duplicate' ? 'active' : ''}`}>
              <p className="modal-hint">Copy an existing test case and rename it.</p>
              <select
                className="modal-select"
                value={sourceCase}
                onChange={(event) => setSourceCase(event.target.value)}
              >
                <option value="">-- Select test case to duplicate --</option>
                {caseNames.map((caseName) => (
                  <option key={caseName} value={caseName}>
                    {caseName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCreate({ name: name.trim(), sourceCase })}
          >
            Create Test Case
          </button>
        </div>
      </div>
    </div>
  );
}
