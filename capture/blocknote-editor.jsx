import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteEditor } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

async function uploadMedia(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: file.type, dataUrl }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status}).`);
  return payload.url;
}

function BlockNotePOC({ initialMarkdown, onChange }) {
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    async function init() {
      const e = BlockNoteEditor.create({ uploadFile: uploadMedia });
      if (initialMarkdown) {
        const blocks = await e.tryParseMarkdownToBlocks(initialMarkdown);
        e.replaceBlocks(e.document, blocks);
      }
      setEditor(e);
      if (onChange) onChange(e);
    }
    init();
  }, [initialMarkdown]);

  if (!editor) {
    return <div style={{ padding: '20px', fontFamily: 'var(--mono)', color: 'var(--text-light)' }}>Loading BlockNote...</div>;
  }

  return (
    <div className="blocknote-poc-wrapper" style={{ padding: '20px 0', minHeight: '300px' }}>
      <BlockNoteView
        editor={editor}
        onChange={() => {
          if (onChange) onChange(editor);
        }}
      />
    </div>
  );
}

let root = null;
let currentEditor = null;

export function mountBlockNotePOC(containerId, initialMarkdown) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (root) {
    root.unmount();
    currentEditor = null;
  }
  
  root = createRoot(container);
  root.render(
    <BlockNotePOC 
      initialMarkdown={initialMarkdown} 
      onChange={(ed) => { 
        currentEditor = ed; 
        if (typeof window.markDirty === 'function') window.markDirty(); 
      }} 
    />
  );
}

export function unmountBlockNotePOC() {
  if (root) {
    root.unmount();
    root = null;
    currentEditor = null;
  }
}

export async function getBlockNoteMarkdown() {
  if (!currentEditor) throw new Error('Editor is still loading.');
  return await currentEditor.blocksToMarkdownLossy(currentEditor.document);
}

export function isBlockNoteReady() {
  return Boolean(currentEditor);
}

export function undoStory() {
  if (!currentEditor) return false;
  try {
    return currentEditor.undo();
  } catch (e) {
    return false;
  }
}

export function redoStory() {
  if (!currentEditor) return false;
  try {
    return currentEditor.redo();
  } catch (e) {
    return false;
  }
}

