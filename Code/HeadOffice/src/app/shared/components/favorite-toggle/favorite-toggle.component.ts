import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppIconComponent } from '../../app-icon.component';
import { PopoverModule } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-favorite-toggle',
  standalone: true,
  imports: [CommonModule, AppIconComponent, PopoverModule, ButtonModule],
  template: `
    <span #iconWrapper>
      <app-icon [name]="isFavorite ? 'favorite_filled' : 'favorite'" class="w-6 h-6 cursor-pointer" [ngClass]="getColorClass()" (click)="toggleFavorite($event)" />
      <p-popover #popover>
        <div class="flex flex-col">
          <div class="flex items-center justify-center mb-4">
            <div class="warning-icon flex items-center justify-center mr-2">
              <i class="pi pi-exclamation-triangle text-xl"></i>
            </div>
            <span>Are you sure you want to proceed?</span>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="px-2 py-1 text-sm border border-primary-500 text-primary-500 rounded hover:bg-primary-50" (click)="popover.hide()">Cancel</button>
            <button type="button" class="px-2 py-1 text-sm bg-primary-500 text-white rounded hover:bg-primary-600" (click)="confirmRemove()">Remove</button>
          </div>
        </div>
      </p-popover>
    </span>
  `,
})
export class FavoriteToggleComponent {
  @Input() isFavorite: boolean = false;
  @Input() activeColor: string = 'yellow-400'; // Default is yellow
  @Input() inactiveColor: string = 'primary-500'; // Default is primary-500
  @Output() favoriteChange = new EventEmitter<boolean>();

  @ViewChild('iconWrapper', { static: true }) iconWrapperRef!: ElementRef;
  @ViewChild('popover') popover: any;

  // This method ensures proper class application based on status
  getColorClass(): any {
    // Create an object that will be directly used by ngClass
    const classObj: any = {};

    if (this.isFavorite) {
      // Explicitly set the class to ensure Tailwind doesn't purge it
      classObj[`text-${this.activeColor}`] = true;

      // Safeguard for default yellow in case it's still not applied
      if (this.activeColor === 'yellow-400') {
        classObj['text-yellow-400'] = true;
      }
    } else {
      classObj[`text-${this.inactiveColor}`] = true;

      // Safeguard for primary color
      if (this.inactiveColor === 'primary-500') {
        classObj['text-primary-500'] = true;
      }
    }

    return classObj;
  }

  toggleFavorite(event: Event): void {
    if (this.isFavorite) {
      // Show popover for confirmation when trying to remove a favorite
      this.popover.toggle(event);
    } else {
      // Add to favorites directly without confirmation
      this.isFavorite = true;
      this.favoriteChange.emit(this.isFavorite);
    }
  }

  confirmRemove(): void {
    // Handle the confirmation action
    this.isFavorite = false;
    this.favoriteChange.emit(this.isFavorite);
    this.popover.hide(); // Hide the popover after action
  }
}
