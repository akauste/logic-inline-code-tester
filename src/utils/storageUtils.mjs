export const DEFAULT_ACTION_NAME = 'Inline Code';
export const DEFAULT_CASE_NAME = 'default';
export const DEFAULT_ASSERTION_LIBRARY = 'expression';

export function normalizeCaseEntry(entry, defaultAssertion = 'true', defaultAssertionLibrary = DEFAULT_ASSERTION_LIBRARY) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return {
      workflowContext: {},
      assertion: defaultAssertion,
      assertionLibrary: defaultAssertionLibrary,
    };
  }

  if (Object.prototype.hasOwnProperty.call(entry, 'workflowContext')) {
    const workflowContext =
      entry.workflowContext && typeof entry.workflowContext === 'object' && !Array.isArray(entry.workflowContext)
        ? entry.workflowContext
        : {};
    const assertion = typeof entry.assertion === 'string' ? entry.assertion : defaultAssertion;
    const assertionLibrary =
      typeof entry.assertionLibrary === 'string' && entry.assertionLibrary
        ? entry.assertionLibrary
        : defaultAssertionLibrary;
    return { workflowContext, assertion, assertionLibrary };
  }

  return {
    workflowContext: entry,
    assertion: defaultAssertion,
    assertionLibrary: defaultAssertionLibrary,
  };
}

export function createDefaultCases(
  defaultAssertion = 'true',
  defaultAssertionLibrary = DEFAULT_ASSERTION_LIBRARY
) {
  const defaultWorkflowContext = `{
  "actions": {},
  "trigger": {
    "name": "When_a_new_email_arrives",
    "outputs": {
      "headers": {},
      "body": {
        "Body": "Hello World. Contact me at test@example.com and user2@domain.org"
      }
    }
  },
  "workflow": {
    "name": "My_logic_app"
  }
}`;

  try {
    return {
      [DEFAULT_CASE_NAME]: {
        workflowContext: JSON.parse(defaultWorkflowContext),
        assertion: defaultAssertion,
        assertionLibrary: defaultAssertionLibrary,
      },
    };
  } catch {
    return {
      [DEFAULT_CASE_NAME]: {
        workflowContext: {},
        assertion: defaultAssertion,
        assertionLibrary: defaultAssertionLibrary,
      },
    };
  }
}

export function normalizeActionEntry(
  entry,
  defaultCode = '',
  defaultAssertion = 'true',
  defaultAssertionLibrary = DEFAULT_ASSERTION_LIBRARY
) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return {
      code: defaultCode,
      selectedCaseName: DEFAULT_CASE_NAME,
      workflowContextCases: createDefaultCases(defaultAssertion, defaultAssertionLibrary),
      workflowPath: null,
    };
  }

  const workflowContextCasesRaw =
    entry.workflowContextCases && typeof entry.workflowContextCases === 'object'
      ? entry.workflowContextCases
      : createDefaultCases(defaultAssertion, defaultAssertionLibrary);
  const workflowContextCases = {};
  for (const [caseName, caseEntry] of Object.entries(workflowContextCasesRaw)) {
    workflowContextCases[caseName] = normalizeCaseEntry(
      caseEntry,
      defaultAssertion,
      defaultAssertionLibrary
    );
  }

  const caseNames = Object.keys(workflowContextCases);
  const selectedCaseName =
    typeof entry.selectedCaseName === 'string' && caseNames.includes(entry.selectedCaseName)
      ? entry.selectedCaseName
      : caseNames[0] || DEFAULT_CASE_NAME;

  return {
    code: typeof entry.code === 'string' && entry.code ? entry.code : defaultCode,
    selectedCaseName,
    workflowContextCases,
    workflowPath: Array.isArray(entry.workflowPath) ? entry.workflowPath.filter((part) => typeof part === 'string') : null,
  };
}
