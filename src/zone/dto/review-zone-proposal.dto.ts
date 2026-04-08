import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewZoneProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
