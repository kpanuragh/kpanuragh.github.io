import { ImageResponse } from '@vercel/og';
import { getAllPosts } from '../lib/posts';
import fs from 'fs';
import path from 'path';
import React from 'react';

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
          backgroundColor: '#0a0e27',
          color: '#00ff00',
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
            opacity: 0.6,
          },
        },
        '> 0x55aa'
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
                    color: '#00ff00',
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
    for (const post of posts) {
      console.log(`Generating OG image for: ${post.title}`);
      await generateOGImage(post.title, post.slug, post.tags);
    }

    // Generate default OG images
    console.log('\nGenerating default OG images...');
    await generateOGImage(
      'Personal Blog - Laravel, Cybersecurity, Open Source',
      'og-default',
      ['Laravel', 'Security', 'Open Source']
    );
    await generateOGImage(
      'Blog - Articles & Tutorials',
      'og-blog',
      ['Web Dev', 'Security', 'Tech']
    );

    console.log(`\n✨ All OG images generated successfully!`);
    console.log(`Total images: ${posts.length + 2}`);
  } catch (error) {
    console.error('Error generating OG images:', error);
    process.exit(1);
  }
}

generateAllOGImages();
