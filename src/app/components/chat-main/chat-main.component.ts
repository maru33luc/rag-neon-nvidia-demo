import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessageComponent, ChatMessageData } from '../chat-message/chat-message.component';
import { ChatInputComponent, ChatInputSubmitEvent } from '../chat-input/chat-input.component';
import { RagService } from '../../services/rag.service';

export interface PromptSuggestion {
  icon: string;
  title: string;
  query: string;
  type: 'ask' | 'ingest';
}

@Component({
  selector: 'app-chat-main',
  standalone: true,
  imports: [CommonModule, ChatMessageComponent, ChatInputComponent],
  templateUrl: './chat-main.component.html',
  styleUrl: './chat-main.component.scss',
})
export class ChatMainComponent {
  @Output() toggleSidebar = new EventEmitter<void>();

  messages: ChatMessageData[] = [
    {
      role: 'user',
      content: '¿Qué es un RAG y cómo funciona este demo?',
      timestamp: '14:30',
    },
    {
      role: 'assistant',
      content:
        '<think>El usuario pregunta sobre el concepto de RAG (Retrieval-Augmented Generation) y la arquitectura de esta aplicación demo. Debo explicar con claridad los 3 componentes principales: Ingesta de Embeddings (NVIDIA Nemotron 2048d), Almacenamiento Vectorial (Supabase pgvector) y Respuesta Fundamentada con LLM (NVIDIA Laguna).</think>Un **RAG (Retrieval-Augmented Generation)** es un patrón de arquitectura de IA que combina la búsqueda de información precisa en una base de conocimiento personalizada con la capacidad narrativa de un Modelo de Lenguaje (LLM).\n\nEn este demo:\n1. **Ingesta**: Tus documentos se dividen en fragmentos y se convierten en vectores densos de **2048 dimensiones** utilizando el modelo **NVIDIA Nemotron-3-Embed-1B**.\n2. **Almacenamiento & Búsqueda**: Los vectores se guardan en **Supabase PostgreSQL** con la extensión `pgvector`. Al hacer una pregunta, buscamos los fragmentos más similares por distancia coseno.\n3. **Generación Grounded**: Enviamos solo los fragmentos relevantes al modelo **NVIDIA (poolside/laguna-xs-2.1)** para que responda estrictamente con base en tus documentos.',
      timestamp: '14:30',
      matches: [
        {
          id: 'b4a8e9f1-7c2d-4e9a-8f12-3a5b7c9d0e1f',
          content: 'Un RAG combina búsqueda semántica en vectores con generación de respuesta para evitar alucinaciones y grounding en documentos reales.',
          distance: 0.08,
        },
        {
          id: 'c5b9f0a2-8d3e-5f0b-9a23-4b6c8d0e1f2a',
          content: 'Los embeddings se generan usando NVIDIA Nemotron con dimensión 2048 e insertados en la tabla documents.',
          distance: 0.14,
        },
      ],
    },
  ];

  isProcessing = false;
  currentStepIndex = 0;
  processingSteps = [
    { icon: '⚡', label: 'Paso 1: Vectorizando consulta con NVIDIA Nemotron (2048d)...' },
    { icon: '🗄️', label: 'Paso 2: Consultando Supabase PostgreSQL mediante pgvector...' },
    { icon: '🧠', label: 'Paso 3: Sintetizando respuesta fundamentada con NVIDIA LLM...' },
  ];

  suggestions: PromptSuggestion[] = [
    {
      icon: '💡',
      title: '¿Qué es un RAG?',
      query: 'Explicame en detalle qué es un RAG y cuáles son sus ventajas frente a un LLM estándar',
      type: 'ask',
    },
    {
      icon: '📁',
      title: 'Indexar Conocimiento',
      query: 'El sistema RAG utiliza Supabase pgvector y modelos NVIDIA NIM para ingestar texto y responder consultas con contexto en tiempo real.',
      type: 'ingest',
    },
    {
      icon: '🔬',
      title: 'Proceso de Vectors',
      query: '¿Cómo funciona la búsqueda semántica por distancia coseno en Supabase pgvector?',
      type: 'ask',
    },
  ];

  constructor(private readonly ragService: RagService) {}

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  useSuggestion(suggestion: PromptSuggestion): void {
    this.onInputSubmit({
      text: suggestion.query,
      type: suggestion.type,
    });
  }

  onInputSubmit(event: ChatInputSubmitEvent): void {
    const text = event.text.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    this.messages = [
      ...this.messages,
      { role: 'user', content: text, timestamp: timeStr },
    ];

    this.isProcessing = true;
    this.currentStepIndex = 0;

    const stepInterval = setInterval(() => {
      if (this.currentStepIndex < this.processingSteps.length - 1) {
        this.currentStepIndex++;
      }
    }, 900);

    if (event.type === 'ask') {
      this.ragService.ask(text).subscribe({
        next: (response) => {
          clearInterval(stepInterval);
          this.messages = [
            ...this.messages,
            {
              role: 'assistant',
              content: response.answer,
              matches: response.matches || [],
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
          this.isProcessing = false;
        },
        error: (err) => {
          clearInterval(stepInterval);
          const errorMessage = err?.error?.error || 'Error al conectar con la Edge Function de Supabase.';
          this.messages = [
            ...this.messages,
            {
              role: 'assistant',
              content: `⚠️ **Ocurrió un error en la consulta:** ${errorMessage}`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
          this.isProcessing = false;
        },
      });
      return;
    }

    // Ingest mode
    this.ragService.ingest(text, null).subscribe({
      next: (response) => {
        clearInterval(stepInterval);
        const inserted = response.inserted ?? 0;
        this.messages = [
          ...this.messages,
          {
            role: 'assistant',
            content: `✅ **Documento indexado con éxito.** Se dividió el contenido en **${inserted} fragmento${inserted === 1 ? '' : 's'}**, se generaron los vectores de 2048 dimensiones con NVIDIA Nemotron y se almacenaron en la base de datos Supabase.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
        this.isProcessing = false;
      },
      error: (err) => {
        clearInterval(stepInterval);
        const errorMessage = err?.error?.error || 'Error al procesar la ingesta en Supabase.';
        this.messages = [
          ...this.messages,
          {
            role: 'assistant',
            content: `⚠️ **Error en la ingesta del documento:** ${errorMessage}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
        this.isProcessing = false;
      },
    });
  }
}
