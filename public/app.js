const $ = (id) => document.getElementById(id);

const defaultCode = `// Example: extract email addresses from the trigger body
// Tip: reference data via workflowContext, matching Logic Apps Standard.
const text =
  workflowContext?.trigger?.outputs?.body?.Body ??
  workflowContext?.trigger?.outputs?.body?.body ??
  "";

const myRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig;
const matches = (text.match(myRegex) || []);

// Returning an array becomes the action "Result" token.
return matches;`;

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

function setText(id, value) {
  $(id).value = value;
}

function setPre(id, text) {
  $(id).textContent = text;
}

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const name = err.name ? `${err.name}: ` : '';
  const msg = err.message ? err.message : String(err);
  return name + msg + (err.stack ? `\n\n${err.stack}` : '');
}

async function run() {
  const code = $('code').value;
  setPre('result', '');
  setPre('console', '');

  let workflowContext;
  const workflowContextRaw = $('workflowContext').value.trim();
  try {
    workflowContext = workflowContextRaw ? JSON.parse(workflowContextRaw) : {};
  } catch (err) {
    setPre('result', 'Invalid workflowContext JSON:\n' + formatError(err));
    return;
  }

  const timeoutMs = Number($('timeoutMs').value);

  const resp = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, workflowContext, timeoutMs }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    setPre('result', 'Error:\n' + formatError(data?.error));
    if (data?.logs?.length) {
      setPre('console', data.logs.map((l) => `${l.level}: ${l.args.join(' ')}`).join('\n'));
    }
    return;
  }

  const resultText = [
    `Execution time: ${data.executionTimeMs} ms`,
    '---',
    data.resultInspect ?? '',
  ].join('\n');
  setPre('result', resultText);

  if (Array.isArray(data.logs) && data.logs.length > 0) {
    setPre(
      'console',
      data.logs
        .map((l) => `${l.level}: ${l.args.join(' ')}`)
        .join('\n')
    );
  } else {
    setPre('console', '(no console output)');
  }
}

setText('code', defaultCode);
setText('workflowContext', defaultWorkflowContext);

$('run').addEventListener('click', () => {
  run().catch((err) => setPre('result', 'Error:\n' + formatError(err)));
});

