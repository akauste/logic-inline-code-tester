import React, { useEffect, useRef } from 'react';

export function CodeMirrorEditor({
  editorId,
  value,
  onChange,
  mode = 'javascript',
  height = 320,
  lineNumbers = true,
}) {
  const textareaRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || editorRef.current || typeof window.CodeMirror === 'undefined') return undefined;

    const editorMode = mode === 'json' ? { name: 'javascript', json: true } : mode;
    const editor = window.CodeMirror.fromTextArea(textarea, {
      mode: editorMode,
      theme: 'material-darker',
      lineNumbers,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      autoCloseBrackets: true,
      matchBrackets: true,
    });

    editor.setSize(null, height);
    editor.setValue(value);
    editor.on('change', (instance) => {
      onChangeRef.current(instance.getValue());
    });

    editorRef.current = editor;
    setTimeout(() => editor.refresh(), 0);

    return () => {
      editor.toTextArea();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const nextMode = mode === 'json' ? { name: 'javascript', json: true } : mode;
    editor.setOption('mode', nextMode);
    editor.setOption('lineNumbers', lineNumbers);
    editor.setSize(null, height);
    editor.refresh();
  }, [height, lineNumbers, mode]);

  if (typeof window.CodeMirror === 'undefined') {
    return (
      <textarea
        id={editorId}
        ref={textareaRef}
        spellCheck="false"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ minHeight: `${height}px` }}
      />
    );
  }

  return <textarea id={editorId} ref={textareaRef} spellCheck="false" defaultValue={value} />;
}
