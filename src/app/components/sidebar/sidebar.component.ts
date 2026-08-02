import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface ConversationItem {
  id: string;
  title: string;
  active?: boolean;
}

@Component({
  selector: 'app-sidebar',
  imports: [],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input({ required: true }) open = true;
  @Output() toggle = new EventEmitter<void>();

  conversations: ConversationItem[] = [
    { id: '1', title: 'Consulta sobre RAG', active: true },
    { id: '2', title: 'Embeddings y vectores' },
    { id: '3', title: 'Configuración de InsForge' },
    { id: '4', title: 'Pipeline de documentos' },
    { id: '5', title: 'Optimización de búsqueda' },
  ];

  onToggle(): void {
    this.toggle.emit();
  }
}
