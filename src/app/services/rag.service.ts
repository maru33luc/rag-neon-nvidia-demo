import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface DocumentMatch {
  id?: string;
  content?: string;
  distance?: number;
  similarity?: number;
}

export interface AskResponse {
  answer: string;
  matches?: DocumentMatch[];
  error?: string;
}

export interface IngestResponse {
  inserted?: number;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class RagService {
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private readonly http: HttpClient) {}

  ask(question: string, topK = 6) {
    return this.http.post<AskResponse>(`${this.apiBaseUrl}/ask`, {
      question,
      top_k: topK,
    });
  }

  ingest(text: string, owner?: string | null) {
    return this.http.post<IngestResponse>(`${this.apiBaseUrl}/ingest`, {
      text,
      owner,
    });
  }

  ingestUrl(url: string) {
    return this.http.post<IngestResponse>(`${this.apiBaseUrl}/ingest`, {
      url,
    });
  }
}
