import { IsString, Length } from 'class-validator';

export class StartPlanDto {
  @IsString()
  @Length(1, 10000)
  requirement!: string;
}
