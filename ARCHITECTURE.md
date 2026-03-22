# Architecture Decision: Component Refactoring

## Current State Analysis
- **File size**: 945 lines in single `app.js`
- **Concerns**: Mixed UI logic, business logic, data persistence
- **Build**: Simple file copy (no bundling/transpilation)
- **Dependencies**: Zero runtime dependencies

## Recommendation: **Stay with Vanilla JS Components**

### Why Not React?
1. **Bundle Size**: React + ReactDOM = ~100KB minified (gzipped: ~35KB)
2. **Build Complexity**: Need bundler (Vite/Webpack), JSX transpilation
3. **Learning Curve**: New team members need React knowledge
4. **Overkill**: Current app is simple enough for vanilla JS

### Why Componentize?
1. **Maintainability**: Split 945-line file into focused modules
2. **Testability**: Isolated business logic easier to test
3. **Reusability**: Components can be reused/modified independently
4. **Developer Experience**: Better code organization and navigation

## Proposed Architecture

```
public/
├── components/
│   ├── CodeEditor.js       # CodeMirror wrapper
│   ├── TestCaseManager.js  # Test case CRUD operations
│   ├── ResultDisplay.js    # Result formatting/display
│   ├── ModalDialog.js      # Reusable modal component
│   └── services/
│       ├── ExecutionService.js    # Web Worker logic
│       ├── StorageService.js      # localStorage operations
│       └── ValidationService.js   # Code validation
├── app.js                 # Main orchestrator
└── index.html
```

## Implementation Benefits

### **Separation of Concerns**
- **UI Components**: Handle DOM manipulation and user interactions
- **Services**: Pure business logic, easily testable
- **State Management**: Centralized in main app

### **Easier Testing**
```javascript
// Can test business logic without DOM
import { ExecutionService } from './services/ExecutionService.js';
const result = await ExecutionService.execute(code, context, assertion);
```

### **Incremental Migration**
- Start with service extraction
- Gradually componentize UI
- Keep working app throughout process

## Migration Strategy

### Phase 1: Extract Services (Week 1)
- Move pure functions to service modules
- Update imports in main app.js
- No UI changes

### Phase 2: Componentize UI (Week 2)
- Create component classes
- Migrate DOM manipulation
- Maintain same functionality

### Phase 3: Modernize Build (Optional)
- Add ES6 modules
- Consider simple bundler if needed

## Code Example

```javascript
// services/ExecutionService.js
export class ExecutionService {
  static async execute(code, workflowContext, assertion, timeoutMs) {
    // Web Worker logic
  }
}

// components/TestCaseManager.js
export class TestCaseManager {
  constructor(container) {
    this.container = container;
    this.cases = {};
  }

  render() {
    // Render logic
  }
}
```

## Conclusion

**Do componentize** - your codebase has grown large enough that modularization will improve maintainability significantly.

**Don't use React** - the added complexity and bundle size aren't justified for this use case. Vanilla JS components with modern ES6 classes provide the same benefits with less overhead.