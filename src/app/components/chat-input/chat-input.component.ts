import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type ChatInputMode = 'ask' | 'ingest';
export type IngestSource = 'text' | 'file' | 'url';

export interface ChatInputSubmitEvent {
  type: ChatInputMode;
  text: string;
  source?: IngestSource;
  displayText?: string;
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
  source: IngestSource = 'text';
  draft = '';
  urlInput = '';
  fileText = '';
  selectedFileName = '';
  sourceError = '';
  isDragging = false;
  maxFileSize = 5 * 1024 * 1024;

  get canSubmit(): boolean {
    if (this.isBusy) {
      return false;
    }

    if (this.mode === 'ask') {
      return !!this.draft.trim();
    }

    if (this.source === 'file') {
      return !!this.fileText;
    }

    if (this.source === 'url') {
      return !!this.urlInput.trim();
    }

    return !!this.draft.trim();
  }

  onSubmit(): void {
    if (!this.canSubmit) {
      return;
    }

    let payload = this.draft.trim();
    let source: IngestSource | undefined;

    let displayText = payload;

    if (this.mode === 'ingest') {
      source = this.source;

      if (this.source === 'file') {
        if (!this.fileText) {
          this.sourceError = 'Selecciona un archivo de texto válido para indexar.';
          return;
        }
        payload = this.fileText;
        displayText = this.selectedFileName ? `Archivo: ${this.selectedFileName}` : 'Archivo cargado';
      }

      if (this.source === 'url') {
        const url = this.urlInput.trim();
        if (!url) {
          this.sourceError = 'Ingresa una URL válida.';
          return;
        }
        payload = url;
        displayText = url;
      }
    }

    this.submitMessage.emit({ type: this.mode, text: payload, source, displayText });

    if (this.mode === 'ask' || this.source === 'text') {
      this.draft = '';
    }

    if (this.source === 'url') {
      this.urlInput = '';
    }
  }

  setMode(mode: ChatInputMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.resetSource();
    }
  }

  private resetSource(): void {
    this.source = 'text';
    this.draft = '';
    this.urlInput = '';
    this.fileText = '';
    this.selectedFileName = '';
    this.sourceError = '';
    this.isDragging = false;
  }

  setSource(source: IngestSource): void {
    this.source = source;
    this.sourceError = '';
    if (source !== 'file') {
      this.fileText = '';
      this.selectedFileName = '';
    }

    if (source !== 'url') {
      this.urlInput = '';
    }
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.loadFile(file);
    }

    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.loadFile(file);
    }
  }

  private loadFile(file: File): void {
    this.sourceError = '';
    this.selectedFileName = file.name;

    if (file.size > this.maxFileSize) {
      this.sourceError = 'El archivo es demasiado grande. Usa un archivo menor a 5 MB.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        this.fileText = result.trim();
        if (!this.fileText) {
          this.sourceError = 'El archivo seleccionado no contiene texto legible.';
        }
      } else {
        this.sourceError = 'No se pudo leer el archivo. Usa un archivo de texto compatible.';
      }
    };
    reader.onerror = () => {
      this.sourceError = 'Error al leer el archivo. Intenta con otro documento.';
    };
    reader.readAsText(file, 'UTF-8');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSubmit();
    }
  }
}
