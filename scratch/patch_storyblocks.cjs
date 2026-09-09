const fs = require('fs');
let app = fs.readFileSync('capture/app.js', 'utf8');

// In updatePreview(), we should ensure storyBlocks is in sync with form.elements.story.value
// Let's add a sync at the beginning of updatePreview()!
app = app.replace(
  /function updatePreview\(\) \{/,
  `function updatePreview() {
  if (entryForm.elements.story && typeof parseMarkdownToBlocks !== 'undefined') {
    // Only re-parse if storyBlocks is fundamentally mismatched or we just loaded a new entry
    // Actually, it's safer to just always sync when updatePreview is called from an external load.
    // We can just parse it directly.
    const currentText = storyBlocks.map(b => b.raw).join('\\n\\n').trim();
    const formText = (entryForm.elements.story.value || '').trim();
    if (currentText !== formText) {
      storyBlocks = parseMarkdownToBlocks(entryForm.elements.story.value || '');
    }
  }
`
);

fs.writeFileSync('capture/app.js', app);
console.log("Patched storyBlocks sync");
