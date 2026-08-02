import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type ChatInputMode = 'ask' | 'ingest';

export interface ChatInputSubmitEvent {
  type: ChatInputMode;
  text: string;
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss',
})
export class ChatInputComponent {
  @Input() isBusy = false;
  @Output() submitMessage = new EventEmitter<ChatInputSubmitEvent>();

  mode: ChatInputMode = 'ask';
  draft = '';

  onSubmit(): void {
    const text = this.draft.trim();

    if (!text || this.isBusy) {
      return;
    }

    this.submitMessage.emit({ type: this.mode, text });
    this.draft = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSubmit();
    }
  }
}
