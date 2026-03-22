/**
 * Test Case Manager Component
 * Handles test case CRUD operations and UI
 */
export class TestCaseManager {
  constructor(container) {
    this.container = container;
    this.cases = {};
    this.selectedCase = null;
    this.onCaseChange = null;
    this.onAddCase = null;
    this.onUpdateCase = null;
    this.onDeleteCase = null;
  }

  /**
   * Initialize the component
   * @param {object} options - Configuration options
   */
  init(options = {}) {
    this.onCaseChange = options.onCaseChange;
    this.onAddCase = options.onAddCase;
    this.onUpdateCase = options.onUpdateCase;
    this.onDeleteCase = options.onDeleteCase;
    this.render();
    this.bindEvents();
  }

  /**
   * Set test cases data
   * @param {object} cases - Test case objects
   * @param {string} selectedCase - Currently selected case name
   */
  setCases(cases, selectedCase) {
    this.cases = cases;
    this.selectedCase = selectedCase;
    this.render();
    this.bindEvents();
  }

  /**
   * Render the component
   */
  render() {
    const caseNames = Object.keys(this.cases).sort((a, b) => a.localeCompare(b));

    this.container.innerHTML = `
      <div class="context-header">
        <span class="context-label">Test Case</span>
        <select id="contextSelect">
          ${caseNames.map(name => `<option value="${name}" ${name === this.selectedCase ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      </div>
      <div class="context-toolbar">
        <div class="context-actions">
          <button id="addTestCase" type="button" class="btn-sm">+ Add</button>
          <button id="updateSelectedContext" type="button" class="btn-sm">Update</button>
          <button id="deleteSelectedContext" type="button" class="btn-sm danger">Delete</button>
        </div>
      </div>
    `;
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    const select = this.container.querySelector('#contextSelect');
    const addBtn = this.container.querySelector('#addTestCase');
    const updateBtn = this.container.querySelector('#updateSelectedContext');
    const deleteBtn = this.container.querySelector('#deleteSelectedContext');

    if (select && this.onCaseChange) {
      select.addEventListener('change', (e) => {
        this.onCaseChange(e.target.value);
      });
    }

    if (addBtn && this.onAddCase) {
      addBtn.addEventListener('click', () => {
        this.onAddCase();
      });
    }

    if (updateBtn && this.onUpdateCase) {
      updateBtn.addEventListener('click', () => {
        this.onUpdateCase(this.selectedCase);
      });
    }

    if (deleteBtn && this.onDeleteCase) {
      deleteBtn.addEventListener('click', () => {
        if (this.selectedCase && window.confirm(`Delete test case "${this.selectedCase}"?`)) {
          this.onDeleteCase(this.selectedCase);
        }
      });
    }
  }

  /**
   * Update selected case
   * @param {string} caseName - Case name to select
   */
  setSelectedCase(caseName) {
    this.selectedCase = caseName;
    const select = this.container.querySelector('#contextSelect');
    if (select) {
      select.value = caseName;
    }
  }

  /**
   * Get selected case name
   * @returns {string} Selected case name
   */
  getSelectedCase() {
    return this.selectedCase;
  }
}