import React from 'react';

export function IntroBanner({ onDismiss }) {
  return (
    <div className="intro">
      <div className="intro-copy">
        <div className="intro-title">Browser-only and private</div>
        <p className="sub intro-text">
          Runs in your browser with a Web Worker, so no data leaves your machine. Use it to iterate on
          inline code and try different contexts without deploying your Logic App.
        </p>
      </div>
      <button type="button" className="intro-close" onClick={onDismiss} aria-label="Dismiss intro">
        x
      </button>
    </div>
  );
}
