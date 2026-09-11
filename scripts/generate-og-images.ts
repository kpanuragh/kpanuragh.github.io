import { ImageResponse } from '@vercel/og';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { getAllPosts } from '../lib/posts';


async function generateOGImage(title: string, slug: string, tags?: string[]) {
  const imageResponse = new ImageResponse(
    React.createElement(
      'div',
      {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0b0d12',
          color: '#d6dae2',
          fontFamily: 'monospace',
          padding: '80px',
          position: 'relative',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            position: 'absolute',
            top: '40px',
            left: '40px',
            fontSize: 24,
            color: '#c8965a',
            opacity: 1,
          },
        },
        'Anuragh KP'
      ),
      React.createElement(
        'div',
        {
          style: {
            fontSize: title.length > 50 ? 56 : 68,
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: '1000px',
          },
        },
        title
      ),
      tags && tags.length > 0
        ? React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                gap: '16px',
                marginTop: '40px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              },
            },
            ...tags.slice(0, 4).map((tag, index) =>
              React.createElement(
                'div',
                {
                  key: index,
                  style: {
                    backgroundColor: '#1a2332',
                    color: '#d6dae2',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: 20,
                  },
                },
                `#${tag}`
              )
            )
          )
        : null,
      React.createElement(
        'div',
        {
          style: {
            position: 'absolute',
            bottom: '40px',
            right: '40px',
            fontSize: 28,
            opacity: 0.8,
          },
        },
        'iamanuragh.in'
      )
    ),
    {
      width: 1200,
      height: 630,
    }
  );

  const buffer = await imageResponse.arrayBuffer();
  const outputDir = path.join(process.cwd(), 'public', 'og');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, `${slug}.png`), Buffer.from(buffer));
}

async function generateAllOGImages() {
  console.log('Starting OG image generation...\n');

  try {
    const posts = getAllPosts();

    // Generate OG image for each post
    if (posts.length > 0) {
      for (const post of posts) {
        console.log(`Generating OG image for: ${post.title}`);
        await generateOGImage(post.title, post.slug, post.tags);
      }
    }

    // Generate default OG image
    console.log('\nGenerating default OG images...');
    await generateOGImage(
      'Anuragh KP — Technical Lead, Backend & Security Engineer',
      'og-default'
    );

    console.log(`\n✨ All OG images generated successfully!`);
    console.log(`Total images: ${posts.length + 1}`);
  } catch (error) {
    console.error('Error generating OG images:', error);
    process.exit(1);
  }
}

generateAllOGImages();
