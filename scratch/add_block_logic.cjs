const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

const blockLogic = `
// ==========================================
// BLOCK PARSER
// ==========================================
function parseMarkdownToBlocks(markdown) {
  if (!markdown) return [];
  // Split by double newline to form basic paragraphs/blocks
  const chunks = markdown.split(/\\n\\n+/);
  return chunks.map(chunk => ({
    id: Math.random().toString(36).slice(2),
    raw: chunk.trim()
  })).filter(b => b.raw.length > 0);
}

function updateStoryFromBlocks() {
  if (typeof storyBlocks !== 'undefined' && entryForm.elements.story) {
    entryForm.elements.story.value = storyBlocks.map(b => b.raw).join('\\n\\n').trim();
    // Fire a subtle input event if needed, but since we have full control over sync, we don't need to.
  }
}

window.parseMarkdownToBlocks = parseMarkdownToBlocks;
window.updateStoryFromBlocks = updateStoryFromBlocks;
`;

app += '\n' + blockLogic;
fs.writeFileSync('capture/app.js', app);
console.log("Added block parsing logic");
