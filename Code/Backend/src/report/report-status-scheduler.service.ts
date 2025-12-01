import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportEntity } from './infrastructure/persistence/relational/entities/report.entity';
import { ReportStatusEnum } from '../report-status/dto/status.enum';
import { ReportService } from './report.service';

@Injectable()
export class ReportStatusSchedulerService {
  private readonly logger = new Logger(ReportStatusSchedulerService.name);

  constructor(
    @InjectRepository(ReportEntity)
    private readonly reportRepository: Repository<ReportEntity>,
    private readonly reportService: ReportService,
  ) {}

  /**
   * Daily cron job that runs at 1 AM to update report statuses based on dates
   */
  @Cron('0 1 * * *', {
    name: 'update-report-statuses',
    timeZone: 'Europe/Berlin', // Adjust to your timezone
  })

  async updateReportStatuses(): Promise<void> {
    this.logger.log('🔄 Starting daily report status update job for visit dates...');
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      this.logger.log(`📅 Processing status updates for visit dates before: ${today}`);

      // Get reports that need status updates (visit date is at least one day in the past)
      const reportsToUpdate = await this.getReportsNeedingStatusUpdate(today);
      
      if (reportsToUpdate.length === 0) {
        this.logger.log('✅ No reports need status updates today');
        return;
      }

      this.logger.log(`📊 Found ${reportsToUpdate.length} reports needing status updates`);

      let updatedCount = 0;
      let errorCount = 0;

      // Process each report
      for (const report of reportsToUpdate) {
        try {
          const newStatus = this.determineNewStatus(report, today);
          
          if (newStatus && newStatus !== report.status?.id) {
            await this.updateReportStatus(report.id, newStatus);
            updatedCount++;
            
            this.logger.log(`✅ Updated report ${report.id} status to ${newStatus}`);
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`❌ Failed to update report ${report.id}:`, error.message);
        }
      }

      this.logger.log(`🎯 Status update job completed: ${updatedCount} updated, ${errorCount} errors`);
      
    } catch (error) {
      this.logger.error('❌ Daily status update job failed:', error);
    }
  }

  /**
   * Get reports that need status updates based on their visitDate
   * Returns reports where visitDate is at least one day in the past (visitDate < today)
   */
  private async getReportsNeedingStatusUpdate(today: string): Promise<ReportEntity[]> {
    const closedStatuses = [
      ReportStatusEnum.IN_PROGRESS,    // 5 - In progress
      ReportStatusEnum.DUE,            // 6 - Due
      ReportStatusEnum.FINISHED,        // 7 - Akzente closed
      ReportStatusEnum.OPENED_BY_CLIENT, // 8 - Merchandiser closed  
      ReportStatusEnum.VALID            // 9 - Client closed
    ];

    return this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.status', 'status')
      .where('report.visit_date < :today', {
        today: today,
      })
      .andWhere('report.status_id NOT IN (:...closedStatuses)', {
        closedStatuses: closedStatuses
      })
      .getMany();
  }

  /**
   * Determine what the new status should be based on visitDate
   * If visit date is at least one day in the past, change status to IN_PROGRESS
   */
  private determineNewStatus(report: ReportEntity, today: string): number | null {
    if (!report.visitDate) {
      return null;
    }

    // Handle both Date object and string formats
    // TypeORM query builder may return date as string instead of Date object
    let visitDate: string;
    const visitDateValue = report.visitDate as Date | string;
    
    if (visitDateValue instanceof Date) {
      visitDate = visitDateValue.toISOString().split('T')[0];
    } else {
      // If it's a string, extract just the date part (YYYY-MM-DD)
      // Handle both ISO format (with T) and plain date format
      visitDate = String(visitDateValue).split('T')[0].split(' ')[0];
    }

    // Rule: If visit date is at least one day in the past (visitDate < today) → IN_PROGRESS
    if (visitDate < today) {
      return ReportStatusEnum.IN_PROGRESS; // 5
    }

    return null; // No status change needed
  }

  /**
   * Update a report's status
   */
  private async updateReportStatus(reportId: number, newStatusId: number): Promise<void> {
    await this.reportRepository.update(reportId, {
      status: { id: newStatusId }
    });
  }

  /**
   * Manual trigger for testing (can be called via API if needed)
   */
  async triggerStatusUpdate(): Promise<{ message: string; updatedCount: number }> {
    this.logger.log('🔄 Manual status update triggered');
    
    const today = new Date().toISOString().split('T')[0];
    
    const reportsToUpdate = await this.getReportsNeedingStatusUpdate(today);
    let updatedCount = 0;

    for (const report of reportsToUpdate) {
      const newStatus = this.determineNewStatus(report, today);
      
      if (newStatus && newStatus !== report.status?.id) {
        await this.updateReportStatus(report.id, newStatus);
        updatedCount++;
      }
    }

    return {
      message: `Status update completed. ${updatedCount} reports updated.`,
      updatedCount
    };
  }
}
