import React from 'react';

export function ResultDisplay({ lines }) {
  return (
    <pre className="pre">
      {(lines || []).map((line, index) => {
        if (typeof line === 'string') {
          return (
            <span key={index} className="result-line">
              {line}
            </span>
          );
        }

        return (
          <span
            key={index}
            className={line?.kind ? `result-line result-${line.kind}` : 'result-line'}
          >
            {line?.text ?? ''}
          </span>
        );
      })}
    </pre>
  );
}
