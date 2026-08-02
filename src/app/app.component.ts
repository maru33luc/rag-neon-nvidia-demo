import { Component } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ChatMainComponent } from './components/chat-main/chat-main.component';

@Component({
  selector: 'app-root',
  imports: [SidebarComponent, ChatMainComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  sidebarOpen = true;

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
