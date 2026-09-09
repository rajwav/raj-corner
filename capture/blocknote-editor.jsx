import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteEditor } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

function BlockNotePOC({ initialMarkdown, onChange }) {
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    async function init() {
      const e = BlockNoteEditor.create();
      if (initialMarkdown) {
        const blocks = await e.tryParseMarkdownToBlocks(initialMarkdown);
        e.replaceBlocks(e.document, blocks);
      }
      setEditor(e);
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
  }
  
  root = createRoot(container);
  root.render(
    <BlockNotePOC 
      initialMarkdown={initialMarkdown} 
      onChange={(ed) => { currentEditor = ed; }} 
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
  if (!currentEditor) return '';
  return await currentEditor.blocksToMarkdownLossy(currentEditor.document);
}
