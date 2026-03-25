import React from 'react';

export function TestCaseManager({
  itemNames,
  selectedItem,
  onSelectItem,
  onCreateItem,
  onDeleteItem,
  title = 'Test Cases',
  caption = 'Choose, add, or remove saved scenarios.',
  selectLabel = 'Select item',
  createLabel = 'New',
  deleteLabel = 'Remove',
  allowCreate = true,
  allowDelete = true,
  badge = '',
}) {
  return (
    <div className="context-manager">
      <div className="context-meta">
        <div>
          <div className="context-heading-row">
            <div className="context-label">{title}</div>
            {badge ? <div className="context-mode-badge">{badge}</div> : null}
          </div>
          <div className="context-caption">{caption}</div>
        </div>
        <div className="context-count">{itemNames.length}</div>
      </div>
      <div className="context-controls">
        <label className="context-select-wrap">
          <span className="sr-only">{selectLabel}</span>
          <select value={selectedItem} onChange={(event) => onSelectItem(event.target.value)}>
            {itemNames.map((itemName) => (
              <option key={itemName} value={itemName}>
                {itemName}
              </option>
            ))}
          </select>
        </label>
        {allowCreate || allowDelete ? (
          <div className="context-actions">
            {allowCreate ? (
              <button type="button" className="btn-sm context-action" onClick={onCreateItem}>
                {createLabel}
              </button>
            ) : null}
            {allowDelete ? (
              <button type="button" className="btn-sm context-action danger" onClick={onDeleteItem}>
                {deleteLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
