/**
 * Fix YAML escaping in blog post frontmatter
 * Ensures backslashes in double-quoted strings are properly escaped
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsDir = path.join(process.cwd(), 'content/posts');

async function fixYamlEscaping() {
  try {
    const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

    let fixedCount = 0;

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Parse with gray-matter
      const { data, content: markdownContent } = matter(content);

      // Fix backslashes in all string fields (title, excerpt, etc.)
      const fixedData = fixBackslashes(data);

      // Reconstruct the file with fixed frontmatter
      let yaml = '---\n';
      for (const [key, value] of Object.entries(fixedData)) {
        if (typeof value === 'string') {
          // Escape double quotes and backslashes in YAML strings
          const escapedValue = value
            .replace(/\\/g, '\\\\')  // Escape backslashes
            .replace(/"/g, '\\"');    // Escape double quotes
          yaml += `${key}: "${escapedValue}"\n`;
        } else if (Array.isArray(value)) {
          yaml += `${key}: [${value.map((v: any) => `"${String(v).replace(/"/g, '\\"')}"`).join(', ')}]\n`;
        } else {
          yaml += `${key}: ${value}\n`;
        }
      }
      yaml += '---\n\n';

      const newContent = yaml + markdownContent;

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedCount++;
        console.log(`✅ Fixed ${file}`);
      }
    }

    console.log(`\n📝 Fixed YAML escaping in ${fixedCount} file(s)`);
    process.exit(fixedCount > 0 ? 0 : 0);
  } catch (error) {
    console.error('❌ Error fixing YAML escaping:', error);
    process.exit(1);
  }
}

function fixBackslashes(obj: any): any {
  if (typeof obj === 'string') {
    return obj;  // Already handled during YAML reconstruction
  }
  if (Array.isArray(obj)) {
    return obj;
  }
  if (typeof obj === 'object' && obj !== null) {
    const fixed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      fixed[key] = value;
    }
    return fixed;
  }
  return obj;
}

fixYamlEscaping();
