/**
 * Fix YAML escaping in blog post frontmatter
 * Ensures proper YAML escaping by reconstructing the frontmatter
 */

import fs from 'fs';
import path from 'path';

const postsDir = path.join(process.cwd(), 'content/posts');

function fixYamlEscaping() {
  try {
    const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

    let fixedCount = 0;

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      const originalContent = content;

      // Split frontmatter from content
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        continue;  // No frontmatter found
      }

      const [, rawFrontmatter, markdownContent] = frontmatterMatch;

      // Parse YAML manually by extracting key-value pairs
      // We do this to handle broken YAML by reconstructing it properly
      const lines = rawFrontmatter.split('\n').filter(l => l.trim());
      const yamlObj: any = {};

      for (const line of lines) {
        // Match key: value (both quoted and unquoted)
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const [, key, valueStr] = match;
          let value: any = valueStr;

          if (value.startsWith('[')) {
            // Parse array format
            const arrayContent = value.slice(1, -1); // Remove [ ]
            const items = arrayContent.split(',').map((v: string) => {
              return v.trim()
                .replace(/^["']|["']$/g, '')      // Remove surrounding quotes
                .replace(/\\\\"/g, '"')            // Unescape \"
                .replace(/\\\\/g, '\\');           // Unescape \\
            });
            yamlObj[key] = items;
          } else if (value.startsWith('"') && value.endsWith('"')) {
            // Quoted string
            value = value.slice(1, -1);
            // Unescape YAML escape sequences
            value = value.replace(/\\\\"/g, '"')  // Replace \\" with "
                         .replace(/\\\\/g, '\\');  // Replace \\\\ with \\
            yamlObj[key] = value;
          } else {
            // Unquoted value (boolean, number, etc.)
            yamlObj[key] = value;
          }
        }
      }

      // Reconstruct YAML with proper escaping
      let newFrontmatter = '';
      for (const [key, value] of Object.entries(yamlObj)) {
        if (Array.isArray(value)) {
          // Write as YAML array
          const items = (value as string[]).map(v => {
            const escaped = v
              .replace(/\\/g, '\\\\')
              .replace(/"/g, '\\"');
            return `"${escaped}"`;
          }).join(', ');
          newFrontmatter += `${key}: [${items}]\n`;
        } else if (typeof value === 'string') {
          // Check if this looks like a stringified array (contains commas and quotes)
          // If so, try to split it back into an array
          if ((key === 'tags' || key === 'keywords') && value.includes(',')) {
            const items = value
              .split(',')
              .map(v => v.trim())
              .filter(v => v.length > 0)
              .map(v => {
                const escaped = v
                  .replace(/\\/g, '\\\\')
                  .replace(/"/g, '\\"');
                return `"${escaped}"`;
              });
            newFrontmatter += `${key}: [${items.join(', ')}]\n`;
          } else {
            // Properly escape for YAML: escape backslashes first, then quotes
            const escaped = value
              .replace(/\\/g, '\\\\')  // \\ becomes \\\\
              .replace(/"/g, '\\"');    // " becomes \\"
            newFrontmatter += `${key}: "${escaped}"\n`;
          }
        } else {
          newFrontmatter += `${key}: ${value}\n`;
        }
      }

      // Reconstruct the file
      const newContent = `---\n${newFrontmatter}---\n${markdownContent}`;

      if (newContent !== originalContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedCount++;
        console.log(`✅ Fixed ${file}`);
      }
    }

    console.log(`\n📝 Fixed YAML escaping in ${fixedCount} file(s)`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing YAML escaping:', error);
    process.exit(1);
  }
}

fixYamlEscaping();
