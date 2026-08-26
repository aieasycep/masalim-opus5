import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SocialVerifierService } from './social-verifier.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SocialVerifierService],
  exports: [AuthService],
})
export class AuthModule {}
