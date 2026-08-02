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

  private async loadFile(file: File): Promise<void> {
    this.sourceError = '';
    this.selectedFileName = file.name;
    this.fileText = '';

    if (file.size > this.maxFileSize) {
      this.sourceError = 'El archivo es demasiado grande. Usa un archivo menor a 5 MB.';
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      if (ext === 'pdf') {
        this.fileText = await this.readPdfFile(file);
      } else if (ext === 'doc' || ext === 'docx') {
        this.fileText = await this.readWordFile(file, ext);
      } else {
        this.fileText = await this.readTextFile(file);
      }

      this.fileText = this.fileText.trim();
      if (!this.fileText) {
        this.sourceError = 'No se pudo extraer texto legible del archivo seleccionado.';
      }
    } catch (error: any) {
      console.error('Error al procesar archivo:', error);
      this.sourceError = error?.message || 'Error al leer el archivo. Intenta con otro documento.';
      this.fileText = '';
    }
  }

  private readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ''));
        } else {
          reject(new Error('Formato de archivo no válido.'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo de texto.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  private readArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Error al leer los datos del archivo.'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo binario.'));
      reader.readAsArrayBuffer(file);
    });
  }

  private async readWordFile(file: File, ext: string): Promise<string> {
    const arrayBuffer = await this.readArrayBuffer(file);
    try {
      const mammothModule = await import('mammoth');
      const result = await mammothModule.extractRawText({ arrayBuffer });
      if (result.value && result.value.trim()) {
        return result.value.trim();
      }
    } catch (e) {
      console.warn('Mammoth parsing error, trying binary text extraction fallback:', e);
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decoded = decoder.decode(arrayBuffer);
    const textMatches = decoded.match(/[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,;:!?()'""\-]{4,}/g);
    if (textMatches && textMatches.length > 0) {
      return textMatches.map((s) => s.trim()).filter((s) => s.length > 3).join(' ');
    }

    throw new Error('No se pudo extraer texto del archivo Word (.doc / .docx).');
  }

  private async readPdfFile(file: File): Promise<string> {
    const arrayBuffer = await this.readArrayBuffer(file);
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.10.38'}/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tokenContent = await page.getTextContent();
      const pageStr = tokenContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      if (pageStr) {
        pageTexts.push(pageStr);
      }
    }

    return pageTexts.join('\n\n');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSubmit();
    }
  }
}
