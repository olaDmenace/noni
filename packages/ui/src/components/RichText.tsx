// Lightweight markdown renderer for AI-authored chat text.
// Claude's replies leak markdown (**bold**, *italic*, lists, headings, `code`);
// this renders the cases that actually occur in conversational replies instead
// of showing raw asterisks. Deliberately NOT a full markdown engine — links,
// images, tables and blockquotes render as plain text, which is the safe
// behavior in an anonymous-support chat.
import React from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'bolditalic'; value: string }
  | { kind: 'code'; value: string };

// Order matters: longest markers first so ** is not eaten by *.
const INLINE_PATTERN = /(\*\*\*[^*\n]+\*\*\*|___[^_\n]+___|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const raw = match[0];
    if (match.index > last) tokens.push({ kind: 'text', value: text.slice(last, match.index) });
    if (raw.startsWith('***') || raw.startsWith('___')) {
      tokens.push({ kind: 'bolditalic', value: raw.slice(3, -3) });
    } else if (raw.startsWith('**') || raw.startsWith('__')) {
      tokens.push({ kind: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('`')) {
      tokens.push({ kind: 'code', value: raw.slice(1, -1) });
    } else {
      tokens.push({ kind: 'italic', value: raw.slice(1, -1) });
    }
    last = match.index + raw.length;
  }
  if (last < text.length) tokens.push({ kind: 'text', value: text.slice(last) });
  return tokens;
}

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'numbered'; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Windows newlines + collapse 3+ blank lines.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      blocks.push({ kind: 'heading', text: line.replace(/^#{1,4}\s+/, '') });
      i += 1;
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'bullet', items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'numbered', items });
      continue;
    }
    // Paragraph: consume until a blank line or a structural line.
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') });
  }
  return blocks;
}

function InlineText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return (
    <Text style={style}>
      {parseInline(text).map((t, idx) => {
        switch (t.kind) {
          case 'bold':
            return (
              <Text key={idx} style={{ fontFamily: fonts.bodyStrong }}>
                {t.value}
              </Text>
            );
          case 'italic':
            return (
              <Text key={idx} style={{ fontStyle: 'italic' }}>
                {t.value}
              </Text>
            );
          case 'bolditalic':
            return (
              <Text key={idx} style={{ fontFamily: fonts.bodyStrong, fontStyle: 'italic' }}>
                {t.value}
              </Text>
            );
          case 'code':
            return (
              <Text
                key={idx}
                style={{
                  fontFamily: fonts.mono,
                  backgroundColor: colors.surfaceElev,
                  borderRadius: radius.sm,
                }}
              >
                {` ${t.value} `}
              </Text>
            );
          default:
            return <Text key={idx}>{t.value}</Text>;
        }
      })}
    </Text>
  );
}

export interface RichTextProps {
  text: string;
  /** Base text style (font, size, color) applied to every block. */
  style: StyleProp<TextStyle>;
}

export function RichText({ text, style }: RichTextProps) {
  const blocks = parseBlocks(text);
  // Fast path: plain single paragraph renders exactly like a Text node did.
  if (blocks.length === 1 && blocks[0].kind === 'paragraph') {
    return <InlineText text={blocks[0].text} style={style} />;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {blocks.map((block, bi) => {
        switch (block.kind) {
          case 'heading':
            return <InlineText key={bi} text={block.text} style={[style, { fontFamily: fonts.bodyStrong }]} />;
          case 'bullet':
          case 'numbered':
            return (
              <View key={bi} style={{ gap: spacing.xs }}>
                {block.items.map((item, ii) => (
                  <View key={ii} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Text style={style}>{block.kind === 'bullet' ? '•' : `${ii + 1}.`}</Text>
                    <View style={{ flex: 1 }}>
                      <InlineText text={item} style={style} />
                    </View>
                  </View>
                ))}
              </View>
            );
          default:
            return <InlineText key={bi} text={block.text} style={style} />;
        }
      })}
    </View>
  );
}
