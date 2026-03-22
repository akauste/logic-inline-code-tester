/**
 * Modal Dialog Component
 * Reusable modal for various dialogs
 */
export class Modal {
  constructor(container) {
    this.container = container;
    this.isVisible = false;
    this.onClose = null;
    this.onConfirm = null;
  }

  /**
   * Show the modal
   * @param {object} options - Modal options
   */
  show(options = {}) {
    this.onClose = options.onClose;
    this.onConfirm = options.onConfirm;

    // Update content if provided
    if (options.title) {
      const titleEl = this.container.querySelector('.modal-header h3');
      if (titleEl) titleEl.textContent = options.title;
    }

    if (options.content) {
      const bodyEl = this.container.querySelector('.modal-body');
      if (bodyEl) bodyEl.innerHTML = options.content;
    }

    if (options.footer) {
      const footerEl = this.container.querySelector('.modal-footer');
      if (footerEl) footerEl.innerHTML = options.footer;
    }

    this.container.classList.add('active');
    this.isVisible = true;

    // Bind events
    this.bindEvents();

    // Focus first input
    const firstInput = this.container.querySelector('input, select, textarea');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }

  /**
   * Hide the modal
   */
  hide() {
    this.container.classList.remove('active');
    this.isVisible = false;

    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Close button
    const closeBtn = this.container.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.onclick = () => this.hide();
    }

    // Cancel button
    const cancelBtn = this.container.querySelector('.btn-secondary, #cancelButton');
    if (cancelBtn) {
      cancelBtn.onclick = () => this.hide();
    }

    // Confirm button
    const confirmBtn = this.container.querySelector('.btn-primary, #createButton');
    if (confirmBtn && this.onConfirm) {
      confirmBtn.onclick = () => {
        if (this.onConfirm()) {
          this.hide();
        }
      };
    }

    // Click outside to close
    this.container.onclick = (e) => {
      if (e.target === this.container) {
        this.hide();
      }
    };

    // ESC key to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Get form data from modal
   * @returns {object} Form data
   */
  getFormData() {
    const data = {};
    const inputs = this.container.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      if (input.name) {
        if (input.type === 'checkbox') {
          data[input.name] = input.checked;
        } else {
          data[input.name] = input.value;
        }
      }
    });

    return data;
  }

  /**
   * Set form data in modal
   * @param {object} data - Form data to set
   */
  setFormData(data) {
    Object.keys(data).forEach(key => {
      const input = this.container.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = data[key];
        } else {
          input.value = data[key];
        }
      }
    });
  }

  /**
   * Show loading state
   * @param {boolean} loading - Whether to show loading state
   */
  setLoading(loading) {
    const confirmBtn = this.container.querySelector('.btn-primary, #createButton');
    if (confirmBtn) {
      confirmBtn.disabled = loading;
      confirmBtn.textContent = loading ? 'Creating...' : 'Create Test Case';
    }
  }

  /**
   * Check if modal is visible
   * @returns {boolean} True if modal is visible
   */
  isVisible() {
    return this.isVisible;
  }
}