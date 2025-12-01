import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, interval } from 'rxjs';
import { NavMenuItem } from '@core/interfaces';
import { ClientService, Client } from './client.service';
import { webSidebarMenuItems } from '@core/constants/nav-menu-items';
import { Router, NavigationEnd } from '@angular/router';
import { filter, debounceTime, startWith, switchMap, catchError } from 'rxjs/operators';
import { NotificationsService } from '@app/core/services/notifications.service';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  private menuItemsSubject = new BehaviorSubject<NavMenuItem[]>([]);
  private notificationCountSubject = new BehaviorSubject<number>(0);

  constructor(
    private clientService: ClientService,
    private router: Router,
    private notificationsService: NotificationsService,
  ) {
    this.initializeMenu();
    this.setupRouteListener();
    this.startNotificationPolling();
  }

  private setupRouteListener(): void {
    // Listen for route changes to detect client selection
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        debounceTime(100), // Small debounce to avoid rapid updates
      )
      .subscribe((event: NavigationEnd) => {
        const url = event.urlAfterRedirects;
        const clientMatch = url.match(/\/clients\/([^\/]+)/);

        if (clientMatch && clientMatch[1] && clientMatch[1] !== 'list' && clientMatch[1] !== 'add') {
          const clientId = clientMatch[1];
          console.log('🔍 NavigationService: Detected client route:', clientId);

          // Try to get the client by ID, this will also set it as selected
          const client = this.clientService.getClientById(clientId);
          if (!client) {
            console.log('⚠️ NavigationService: Client not found, refreshing from store');
            // If client not found, try refreshing from store
            this.clientService.refreshFromStore();
          }
        } else if (!url.includes('/clients/') || url === '/clients/list' || url === '/clients/add') {
          this.clientService.clearSelectedClient();
        }
      });
  }

  private startNotificationPolling(): void {
    // Initial load to get the unseen count
    this.notificationsService.getMyUnseen().pipe(
      catchError((error) => {
        console.error('Error fetching initial notifications:', error);
        return of([]);
      })
    ).subscribe((notifications) => {
      const count = notifications.length;
      this.notificationCountSubject.next(count);
      this.updateMenuItems();
    });
  }

  private updateMenuItems(): void {
    // Trigger menu update when notification count changes
    const currentItems = this.menuItemsSubject.value;
    if (currentItems.length > 0) {
      this.menuItemsSubject.next([...currentItems]);
    }
  }

  private initializeMenu(): void {
    combineLatest([
      this.clientService.getClients(),
      this.clientService.getSelectedClient(),
      this.notificationCountSubject
    ]).subscribe(([clients, selectedClient, notificationCount]) => {
      console.log('🔄 NavigationService: Updating menu with clients:', {
        clientsCount: clients.length,
        selectedClient: selectedClient?.name || 'none',
        notificationCount: notificationCount,
      });

      // Create deep copy of static menu items
      const menuItems = JSON.parse(JSON.stringify(webSidebarMenuItems));

      // Find the clients menu item
      const clientsMenuItem = menuItems.find((item) => item.href === '/clients');

      if (clientsMenuItem && clients.length > 0) {
        // Update the subItems using IDs instead of slugs
        clientsMenuItem.subItems = clients.map((client) => ({
          href: `/clients/${client.id}`,
          title: client.name,
          active: false,
        }));

        // Check if we're currently on a client route and update active state
        if (selectedClient) {
          const clientSubItem = clientsMenuItem.subItems.find((subItem) => subItem.href === `/clients/${selectedClient.id}`);
          if (clientSubItem) {
            clientSubItem.active = true;
          }
        }
      }

      // Similar for projects menu
      if (selectedClient) {
        let projectsMenuItem = menuItems.find((item) => item.href?.includes('/projects'));

        if (!projectsMenuItem) {
          const clientIndex = menuItems.findIndex((item) => item.href === '/clients');
          projectsMenuItem = {
            href: `/clients/${selectedClient.id}`,
            title: `Projekte`,
            active: false,
            icon: 'projects',
            subItems: [],
          };

          menuItems.splice(clientIndex + 1, 0, projectsMenuItem);
        }

        // Update projects submenu using IDs
        if (selectedClient.projects && selectedClient.projects.length > 0) {
          projectsMenuItem.subItems = selectedClient.projects.map((project) => ({
            href: `/clients/${selectedClient.id}/projects/${project.id}`,
            title: project.name,
            active: false,
          }));
        }
      } else {
        const projectMenuIndex = menuItems.findIndex((item) => item.href?.includes('/projects'));
        if (projectMenuIndex !== -1) {
          menuItems.splice(projectMenuIndex, 1);
        }
      }

      // Update notification count tag
      const notificationsMenuItem = menuItems.find((item) => item.href === '/notifications');
      if (notificationsMenuItem) {
        notificationsMenuItem.tag = notificationCount > 0 ? notificationCount : false;
      }

      this.menuItemsSubject.next(menuItems);
    });
  }

  getMenuItems(): Observable<NavMenuItem[]> {
    return this.menuItemsSubject.asObservable();
  }

  // Method to update notification count directly without backend call
  updateNotificationCount(count: number): void {
    this.notificationCountSubject.next(count);
    this.updateMenuItems();
  }
}
