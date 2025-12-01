import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, ValidateNested, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ProjectDto } from '../../project/dto/project.dto';

export class CreateAdvancedPhotoDto {
  @ApiProperty({ type: () => ProjectDto })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ProjectDto)
  project: ProjectDto;

  @ApiProperty({ type: [String] })
  @IsNotEmpty()
  @IsString({ each: true })
  labels: string[];

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  isBeforeAfter?: boolean | null;

  @ApiProperty()
  @IsBoolean()
  isVisibleInReport: boolean;
}
