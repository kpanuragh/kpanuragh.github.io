// Client-safe type definitions - no server imports
// These can be imported from client components

import { format } from 'date-fns';

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

export function formatDate(dateString: string): string {
  return format(new Date(dateString), 'MMM dd, yyyy');
}
