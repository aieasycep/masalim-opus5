import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  refreshTokenSchema,
  signInSchema,
  signUpSchema,
  socialSignInSchema,
  type RefreshTokenInput,
  type SignInInput,
  type SignUpInput,
  type SocialSignInInput,
} from '@masalim/validation';
import type { AuthSession, AuthTokens } from '@masalim/types';
import { zodBody } from '../../core/http/zod-validation.pipe';
import { Public } from '../../core/auth/auth.decorators';
import { CurrentUserId } from '../../core/auth/auth.decorators';
import { AuthService, type AuthRequestContext } from './auth.service';

function contextFrom(request: Request): AuthRequestContext {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('sign-up')
  @ApiOperation({ summary: 'Create an account with email and password' })
  async signUp(
    @Body(zodBody(signUpSchema)) body: SignUpInput,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.auth.signUp(body, contextFrom(request));
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async signIn(
    @Body(zodBody(signInSchema)) body: SignInInput,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.auth.signIn(body, contextFrom(request));
  }

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an Apple identity token' })
  async apple(
    @Body(zodBody(socialSignInSchema)) body: SocialSignInInput,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.auth.signInWithApple(body, contextFrom(request));
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a Google identity token' })
  async google(
    @Body(zodBody(socialSignInSchema)) body: SocialSignInInput,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.auth.signInWithGoogle(body, contextFrom(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  async refresh(
    @Body(zodBody(refreshTokenSchema)) body: RefreshTokenInput,
    @Req() request: Request,
  ): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken, contextFrom(request));
  }

  @Public()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token family for this device' })
  async signOut(@Body(zodBody(refreshTokenSchema)) body: RefreshTokenInput): Promise<void> {
    await this.auth.signOut(body.refreshToken);
  }

  @Post('sign-out-everywhere')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the signed-in account' })
  async signOutEverywhere(@CurrentUserId() userId: string): Promise<void> {
    await this.auth.signOutEverywhere(userId);
  }
}
