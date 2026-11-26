import { IsIn } from 'class-validator';
import { ASSIGNABLE_ROLES, type AssignableRole } from './add-member.dto';

// 修改成员角色入参
export class UpdateMemberDto {
  @IsIn(ASSIGNABLE_ROLES, { message: '角色只能是 ADMIN / MEMBER / VIEWER' })
  role!: AssignableRole;
}
