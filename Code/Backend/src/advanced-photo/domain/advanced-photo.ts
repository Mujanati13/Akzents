import { ApiProperty } from '@nestjs/swagger';
import { Project } from '../../project/domain/project';

export class AdvancedPhoto {
  @ApiProperty({
    type: Number,
  })
  id: number;

  @ApiProperty({
    type: () => Project,
  })
  project: Project;

  @ApiProperty({
    type: [String],
  })
  labels: string[];

  @ApiProperty({
    type: Boolean,
    nullable: true,
  })
  isBeforeAfter?: boolean | null;

  @ApiProperty({
    type: Boolean,
  })
  isVisibleInReport: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
