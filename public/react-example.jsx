import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Custom hooks for business logic
function useTestCases() {
  const [cases, setCases] = useState({});
  const [selectedCase, setSelectedCase] = useState('default');

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('logicInlineCodeTester.workflowContexts.v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      setCases(parsed.workflowContextCases || {});
      setSelectedCase(parsed.selectedWorkflowContextName || 'default');
    }
  }, []);

  const saveCases = (newCases, newSelected) => {
    setCases(newCases);
    setSelectedCase(newSelected);
    localStorage.setItem('logicInlineCodeTester.workflowContexts.v1',
      JSON.stringify({ workflowContextCases: newCases, selectedWorkflowContextName: newSelected })
    );
  };

  return { cases, selectedCase, setSelectedCase, saveCases };
}

function useCodeExecution() {
  const execute = async (code, workflowContext, assertion, timeoutMs = 1000) => {
    // Web Worker execution logic
    return { success: true, result: 'execution result' };
  };

  return { execute };
}

// Components
function TestCaseManager({ cases, selectedCase, onCaseChange, onAddCase }) {
  return (
    <div className="context-manager">
      <div className="context-header">
        <span className="context-label">Test Case</span>
        <select value={selectedCase} onChange={e => onCaseChange(e.target.value)}>
          {Object.keys(cases).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="context-toolbar">
        <div className="context-actions">
          <button className="btn-sm" onClick={onAddCase}>+ Add</button>
          <button className="btn-sm">Update</button>
          <button className="btn-sm danger">Delete</button>
        </div>
      </div>
    </div>
  );
}

function CodeEditor({ value, onChange, mode = 'javascript', height = 320 }) {
  const textareaRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current && !editorRef.current) {
      editorRef.current = CodeMirror.fromTextArea(textareaRef.current, {
        mode,
        theme: 'material-darker',
        lineNumbers: true,
        tabSize: 2,
      });
      editorRef.current.on('change', (cm) => {
        onChange(cm.getValue());
      });
    }

    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value);
    }
  }, [value, onChange, mode]);

  return <textarea ref={textareaRef} defaultValue={value} style={{ height }} />;
}

function ResultDisplay({ lines }) {
  return (
    <pre id="result" className="pre">
      {lines.map((line, i) => (
        <span key={i} className={`result-line ${line.kind ? `result-${line.kind}` : ''}`}>
          {line.text}
        </span>
      ))}
    </pre>
  );
}

function AddTestCaseModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('generate');

  const handleCreate = () => {
    onCreate({ name, mode });
    setName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Create New Test Case</h3>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <label className="field">Test Case Name</label>
            <input
              className="modal-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Extract Emails, Invalid Input"
            />
          </div>
          <div className="modal-divider"></div>
          <div className="modal-section">
            <div className="modal-tabs">
              <button
                className={`modal-tab ${mode === 'generate' ? 'active' : ''}`}
                onClick={() => setMode('generate')}
              >
                Generate New
              </button>
              <button
                className={`modal-tab ${mode === 'duplicate' ? 'active' : ''}`}
                onClick={() => setMode('duplicate')}
              >
                Duplicate
              </button>
            </div>
            {mode === 'generate' ? (
              <div className="modal-panel active">
                <p className="modal-hint">Generate workflowContext skeleton from the inline code.</p>
                <button className="btn-primary">Generate from Code</button>
              </div>
            ) : (
              <div className="modal-panel active">
                <p className="modal-hint">Copy an existing test case and rename it.</p>
                <select className="modal-select">
                  <option>-- Select test case to duplicate --</option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} className="btn-primary">Create Test Case</button>
        </div>
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const { cases, selectedCase, setSelectedCase, saveCases } = useTestCases();
  const { execute } = useCodeExecution();

  const [code, setCode] = useState(`// Example code`);
  const [workflowContext, setWorkflowContext] = useState(`{}`);
  const [assertion, setAssertion] = useState(`true`);
  const [result, setResult] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const handleRun = async () => {
    try {
      const executionResult = await execute(code, workflowContext, assertion);
      setResult([{ text: 'Execution completed', kind: 'pass' }]);
    } catch (error) {
      setResult([{ text: `Error: ${error.message}`, kind: 'error' }]);
    }
  };

  const handleAddCase = () => {
    setModalOpen(true);
  };

  const handleCreateCase = ({ name, mode }) => {
    // Create new test case logic
    const newCases = { ...cases, [name]: { workflowContext, assertion } };
    saveCases(newCases, name);
  };

  return (
    <div className="container">
      <header>
        <h1>Logic Apps Standard Inline Code Tester</h1>
      </header>

      <section className="grid">
        <div className="panel">
          <div className="panel-title">Inline Code</div>
          <CodeEditor value={code} onChange={setCode} />
        </div>

        <div className="panel">
          <TestCaseManager
            cases={cases}
            selectedCase={selectedCase}
            onCaseChange={setSelectedCase}
            onAddCase={handleAddCase}
          />

          <div className="panel-title">workflowContext JSON</div>
          <CodeEditor value={workflowContext} onChange={setWorkflowContext} mode="json" />

          <div className="panel-title section-title">Assertion</div>
          <CodeEditor value={assertion} onChange={setAssertion} height={110} />
        </div>
      </section>

      <section className="actions">
        <button onClick={handleRun}>Run</button>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-title">Result</div>
          <ResultDisplay lines={result} />
        </div>
        <div className="panel">
          <div className="panel-title">Console</div>
          <pre className="pre">(no console output)</pre>
        </div>
      </section>

      <AddTestCaseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateCase}
      />
    </div>
  );
}

// Bootstrap
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);