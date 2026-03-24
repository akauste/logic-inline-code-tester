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
}) {
  return (
    <div className="context-manager">
      <div className="context-meta">
        <div>
          <div className="context-label">{title}</div>
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
        <div className="context-actions">
          <button type="button" className="btn-sm context-action" onClick={onCreateItem}>
            {createLabel}
          </button>
          <button type="button" className="btn-sm context-action danger" onClick={onDeleteItem}>
            {deleteLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
