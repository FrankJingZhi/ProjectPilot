import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService, type CurrentUserShape, type SafeUser } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // 登录：唯一无需鉴权的业务接口
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // 当前用户信息：前端恢复登录态
  @Get('me')
  me(@CurrentUser() user: CurrentUserShape): Promise<SafeUser> {
    return this.auth.me(user.id);
  }

  // 换取 SSE 短期票据（60 秒、一次性）
  @Post('sse-ticket')
  sseTicket(@CurrentUser() user: CurrentUserShape) {
    return this.auth.createSseTicket(user.id);
  }
}
