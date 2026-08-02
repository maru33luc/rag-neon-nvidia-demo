import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentMatch } from '../../services/rag.service';

export type MessageRole = 'user' | 'assistant';

export interface ChatMessageData {
  id?: string;
  role: MessageRole;
  content: string;
  thinking?: string | null;
  matches?: DocumentMatch[];
  timestamp?: string;
}

@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-message.component.html',
  styleUrl: './chat-message.component.scss',
})
export class ChatMessageComponent implements OnInit {
  @Input({ required: true }) message!: ChatMessageData;

  parsedThinking: string | null = null;
  parsedAnswer = '';
  showThinking = false;
  showSources = false;
  copied = false;

  ngOnInit(): void {
    this.processContent();
  }

  private processContent(): void {
    if (!this.message || !this.message.content) {
      this.parsedAnswer = '';
      this.parsedThinking = null;
      return;
    }

    const raw = this.message.content.trim();

    if (this.message.thinking) {
      this.parsedThinking = this.message.thinking;
      this.parsedAnswer = raw;
      return;
    }

    // Pattern 1: Fully enclosed <think>...</think>
    const fullThinkRegex = /<think>([\s\S]*?)<\/think>/i;
    const matchFull = raw.match(fullThinkRegex);
    if (matchFull) {
      this.parsedThinking = matchFull[1].trim();
      this.parsedAnswer = raw.replace(fullThinkRegex, '').trim();
      return;
    }

    // Pattern 2: Missing opening <think>, but has closing </think>
    const closingTagIndex = raw.toLowerCase().indexOf('</think>');
    if (closingTagIndex !== -1) {
      const thinkingPart = raw.substring(0, closingTagIndex).replace(/^<think>/i, '').trim();
      const answerPart = raw.substring(closingTagIndex + 8).trim();

      this.parsedThinking = thinkingPart || null;
      this.parsedAnswer = answerPart || raw;
      return;
    }

    // Pattern 3: Starts with <think> but missing closing </think>
    if (raw.toLowerCase().startsWith('<think>')) {
      this.parsedThinking = raw.replace(/^<think>/i, '').trim();
      this.parsedAnswer = '';
      return;
    }

    // Pattern 4: Standard answer without thinking tags
    this.parsedThinking = null;
    this.parsedAnswer = raw;
  }

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  get avatarLabel(): string {
    return this.isUser ? 'Tú' : 'NVIDIA RAG Agent';
  }

  get formattedTime(): string {
    if (this.message.timestamp) return this.message.timestamp;
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  calculateSimilarity(distance?: number): number | null {
    if (distance === undefined || distance === null) return null;
    const similarity = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));
    return similarity;
  }

  copyToClipboard(): void {
    const textToCopy = this.parsedAnswer || this.message.content;
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.copied = true;
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    });
  }

  formatMarkdown(text: string): string {
    if (!text) return '';

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (_match, p1) => {
      return `<pre class="code-block"><code>${p1.trim()}</code></pre>`;
    });

    // Markdown tables
    html = html.replace(/((?:\|.*\|\r?\n)+)/g, (match) => {
      const lines = match.trim().split('\n');
      let tableHtml = '<div class="table-wrapper"><table class="md-table"><thead>';
      let isBody = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('---')) {
          tableHtml += '</thead><tbody>';
          isBody = true;
          continue;
        }

        const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const tag = isBody ? 'td' : 'th';
        tableHtml += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      }

      tableHtml += isBody ? '</tbody></table></div>' : '</table></div>';
      return tableHtml;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Headers
    html = html.replace(/^###\s+(.*)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^##\s+(.*)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^#\s+(.*)$/gm, '<h2 class="md-h2">$1</h2>');

    // Bold & Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr class="md-hr"/>');

    // Bullet points
    html = html.replace(/^[•\-*]\s+(.*)$/gm, '<li>$1</li>');

    // Paragraphs
    const paragraphs = html.split(/\n\n+/);
    return paragraphs.map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
  }
}
