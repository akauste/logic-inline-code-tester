import React, { useEffect, useMemo, useState } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor.jsx';

function getNestedValue(source, path) {
  let current = source;
  for (const segment of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return current;
}

function toPrettyJson(value) {
  if (value === undefined) return '{}';
  return JSON.stringify(value, null, 2);
}

export function MockDataEditor({
  requirements,
  workflowContext,
  parseError,
  selectedActionName,
  selectedCaseName,
  onUpdateRequirement,
}) {
  const [drafts, setDrafts] = useState({});

  const seed = useMemo(
    () =>
      JSON.stringify({
        selectedActionName,
        selectedCaseName,
        requirements: requirements.map((requirement) => ({
          key: requirement.key,
          value: getNestedValue(workflowContext, requirement.path),
        })),
      }),
    [requirements, selectedActionName, selectedCaseName, workflowContext]
  );

  useEffect(() => {
    const nextDrafts = {};
    for (const requirement of requirements) {
      nextDrafts[requirement.key] = toPrettyJson(getNestedValue(workflowContext, requirement.path));
    }
    setDrafts(nextDrafts);
  }, [requirements, seed, workflowContext]);

  return (
    <section className="mock-editor">
      <div className="mock-editor-header">
        <div>
          <div className="panel-title">Mocked Inputs For Selected Action</div>
          <div className="mock-editor-caption">
            {requirements.length > 0
              ? (
                <>
                  Edit the upstream trigger and action payloads referenced by <code>{selectedActionName}</code> in
                  test case <code>{selectedCaseName}</code>.
                </>
              )
              : 'No upstream trigger or action payload references were detected in the selected inline code.'}
          </div>
        </div>
        {requirements.length > 0 ? <div className="context-count">{requirements.length}</div> : null}
      </div>

      {parseError ? (
        <div className="mock-editor-empty mock-editor-empty-error">
          Fix the full <code>workflowContext</code> JSON first before editing structured mocks here.
        </div>
      ) : requirements.length === 0 ? null : (
        <div className="mock-editor-grid">
          {requirements.map((requirement) => {
            const currentValue = getNestedValue(workflowContext, requirement.path);
            const isMissing = currentValue === undefined;
            const value = drafts[requirement.key] ?? toPrettyJson(currentValue);

            return (
              <article key={requirement.key} className={`mock-card ${isMissing ? 'missing' : ''}`}>
                <div className="mock-card-header">
                  <div>
                    <div className="mock-card-title">{requirement.title}</div>
                    <div className="mock-card-caption">{requirement.caption}</div>
                  </div>
                  <div className="mock-card-badges">
                    <span className="mock-badge">{requirement.category}</span>
                    {isMissing ? <span className="mock-badge mock-badge-warning">Missing</span> : null}
                  </div>
                </div>

                {requirement.accesses.length > 0 ? (
                  <div className="mock-access-list">
                    {requirement.accesses.map((access) => (
                      <code key={access} className="mock-access-pill">
                        {access}
                      </code>
                    ))}
                  </div>
                ) : null}

                <CodeMirrorEditor
                  editorId={`mock-${requirement.key}`}
                  value={value}
                  onChange={(nextValue) => {
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [requirement.key]: nextValue,
                    }));

                    try {
                      const parsedValue = JSON.parse(nextValue);
                      onUpdateRequirement(requirement.path, parsedValue);
                    } catch {
                      // Keep local draft while JSON is temporarily invalid.
                    }
                  }}
                  mode="json"
                  height={150}
                  lineNumbers={false}
                />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
