import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteEditor } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

async function uploadMedia(file) {
  try {
    const rawRes = await fetch('/api/upload-raw?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file
    });
    if (rawRes.ok) {
      const payload2 = await rawRes.json().catch(() => ({}));
      if (payload2.url) return payload2.url;
    }
  } catch (rawErr) {
    console.warn('Direct upload fallback', rawErr);
  }

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
  
  let isReady = false;
  root = createRoot(container);
  root.render(
    <BlockNotePOC 
      initialMarkdown={initialMarkdown} 
      onChange={(ed) => { 
        currentEditor = ed; 
        if (isReady) {
          if (typeof window.markDirty === 'function') window.markDirty(); 
        } else {
          isReady = true;
        }
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

export async function insertMarkdownAtCursor(markdown) {
  if (!currentEditor) return false;
  try {
    const blocks = await currentEditor.tryParseMarkdownToBlocks(markdown);
    if (!blocks || blocks.length === 0) return false;
    const currentBlock = currentEditor.getTextCursorPosition()?.block;
    if (currentBlock) {
      const isEmpty = Array.isArray(currentBlock.content) && (currentBlock.content.length === 0 || (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && (!currentBlock.content[0].text || !currentBlock.content[0].text.trim())));
      if (isEmpty) {
        currentEditor.replaceBlocks([currentBlock], blocks);
      } else {
        currentEditor.insertBlocks(blocks, currentBlock, 'after');
      }
    } else {
      const lastBlock = currentEditor.document[currentEditor.document.length - 1];
      if (lastBlock) {
        currentEditor.insertBlocks(blocks, lastBlock, 'after');
      } else {
        currentEditor.replaceBlocks(currentEditor.document, blocks);
      }
    }
    const lastInserted = blocks[blocks.length - 1];
    if (lastInserted) {
      try {
        currentEditor.setTextCursorPosition(lastInserted, 'end');
      } catch (e) {}
    }
    return true;
  } catch (err) {
    console.error('Failed to insert markdown blocks', err);
    return false;
  }
}


