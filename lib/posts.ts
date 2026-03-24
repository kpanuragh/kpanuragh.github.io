import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { format } from 'date-fns';
import readingTime from 'reading-time';

const postsDirectory = path.join(process.cwd(), 'content/posts');

export interface PostMetadata {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  featured?: boolean;
  coverImage?: string;
  readingTime: string;
}

export interface Post extends PostMetadata {
  content: string;
}

export function getAllPostSlugs(): string[] {
  try {
    if (!fs.existsSync(postsDirectory)) {
      return [];
    }
    const fileNames = fs.readdirSync(postsDirectory);
    return fileNames
      .filter(fileName => fileName.endsWith('.md') || fileName.endsWith('.mdx'))
      .map(fileName => fileName.replace(/\.(md|mdx)$/, ''));
  } catch (error) {
    console.error('Error reading posts directory:', error);
    return [];
  }
}

export function getPostBySlug(slug: string): Post {
  const fullPath = path.join(postsDirectory, `${slug}.md`);
  let fileContents: string;

  try {
    fileContents = fs.readFileSync(fullPath, 'utf8');
  } catch {
    // Try .mdx extension
    const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
    fileContents = fs.readFileSync(mdxPath, 'utf8');
  }

  const { data, content } = matter(fileContents);
  const stats = readingTime(content);

  return {
    slug,
    title: data.title || 'Untitled',
    date: data.date || new Date().toISOString(),
    excerpt: data.excerpt || '',
    tags: data.tags || [],
    featured: data.featured || false,
    coverImage: data.coverImage || '',
    readingTime: stats.text,
    content,
  };
}

export function getAllPosts(): PostMetadata[] {
  const slugs = getAllPostSlugs();
  const posts = slugs
    .map(slug => {
      const post = getPostBySlug(slug);
      const { content, ...metadata } = post;
      return metadata;
    })
    .sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  return posts;
}

export function getPostsByTag(tag: string): PostMetadata[] {
  const allPosts = getAllPosts();
  return allPosts.filter(post =>
    post.tags.some(t => t.toLowerCase() === tag.toLowerCase())
  );
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tagsSet = new Set<string>();

  posts.forEach(post => {
    post.tags.forEach(tag => tagsSet.add(tag));
  });

  return Array.from(tagsSet).sort();
}

export function formatDate(dateString: string): string {
  return format(new Date(dateString), 'MMM dd, yyyy');
}
