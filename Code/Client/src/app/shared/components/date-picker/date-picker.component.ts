import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from '../../app-icon.component';
import { EuDatePipe } from '../../pipes/eu-date.pipe';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, EuDatePipe],
  templateUrl: './date-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatePickerComponent {
  @Input() selectedDate: Date | null = null;
  @Output() dateSelected = new EventEmitter<Date>();

  currentMonth: Date = new Date();
  showPicker = false;
  years: number[] = [];
  months = [
    { value: 0, name: 'January' },
    { value: 1, name: 'February' },
    { value: 2, name: 'March' },
    { value: 3, name: 'April' },
    { value: 4, name: 'May' },
    { value: 5, name: 'June' },
    { value: 6, name: 'July' },
    { value: 7, name: 'August' },
    { value: 8, name: 'September' },
    { value: 9, name: 'October' },
    { value: 10, name: 'November' },
    { value: 11, name: 'December' },
  ];
  presets = [
    { label: 'Today', date: this.getToday() },
    { label: 'Yesterday', date: this.getYesterday() },
    { label: 'First of Month', date: this.getFirstOfMonth() },
    { label: 'Last Month', date: this.getFirstOfLastMonth() },
  ];

  constructor(private cdr: ChangeDetectorRef) {
    // Initialize years (10 years back and 10 years forward)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      this.years.push(i);
    }
  }

  togglePicker() {
    this.showPicker = !this.showPicker;
  }

  changeCurrentMonth(month: number) {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), month, 1);
  }

  changeCurrentYear(year: number) {
    this.currentMonth = new Date(year, this.currentMonth.getMonth(), 1);
  }

  selectPreset(date: Date | null) {
    if (date) {
      this.selectedDate = new Date(date.getTime());
      this.dateSelected.emit(this.selectedDate);
      this.showPicker = false;
      this.cdr.markForCheck();
    }
  }

  isSelectedDate(date: Date): boolean {
    return this.selectedDate ? this.isSameDay(date, this.selectedDate) : false;
  }

  handleDateClick(date: Date): void {
    const selectedDate = new Date(date.getTime());
    selectedDate.setHours(12, 0, 0, 0);

    this.selectedDate = selectedDate;
    this.dateSelected.emit(this.selectedDate);
    this.showPicker = false;

    this.cdr.markForCheck();
  }

  getDaysInMonth(year: number, month: number): Date[] {
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }

  getWeeksForMonth(year: number, month: number): Date[][] {
    const days = this.getDaysInMonth(year, month);
    const weeks: Date[][] = [];
    let week: Date[] = [];

    // Add nulls for days before the first of the month
    const firstDay = days[0].getDay();
    for (let i = 0; i < firstDay; i++) {
      week.push(null as any);
    }

    days.forEach((day) => {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    });

    // Add nulls for days after the last of the month
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null as any);
      }
      weeks.push(week);
    }

    return weeks;
  }

  clearDate(event: MouseEvent) {
    event.stopPropagation(); // Prevent opening the picker
    this.selectedDate = null;
    this.dateSelected.emit(null as any);
    this.cdr.markForCheck();
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
  }

  private getToday(): Date {
    return new Date();
  }

  private getYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  private getFirstOfMonth(): Date {
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }

  private getFirstOfLastMonth(): Date {
    return new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  }

  isPresetActive(preset: { label: string; date: Date }): boolean {
    if (!preset.date || !this.selectedDate) {
      return false;
    }

    return this.isSameDay(this.selectedDate, preset.date);
  }

  trackByWeekIndex(index: number): number {
    return index;
  }

  trackByDayIndex(index: number): number {
    return index;
  }
}
