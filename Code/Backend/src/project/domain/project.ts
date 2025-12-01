import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientCompany } from '../../client-company/domain/client-company';
import { Question } from '../../question/domain/question';
import { Photo } from '../../photo/domain/photo';
import { AdvancedPhoto } from '../../advanced-photo/domain/advanced-photo';

export class Project {
  @ApiProperty({
    type: Number,
  })
  id: number;

  @ApiProperty({
    type: String,
  })
  name: string;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  startDate?: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
  })
  endDate?: Date | null;

  @ApiProperty({
    type: () => ClientCompany,
  })
  clientCompany: ClientCompany;

  @ApiPropertyOptional({
    type: () => [Question],
  })
  questions?: Question[];

  @ApiPropertyOptional({
    type: () => [Photo],
  })
  photos?: Photo[];

  @ApiPropertyOptional({
    type: () => [AdvancedPhoto],
  })
  advancedPhotos?: AdvancedPhoto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
