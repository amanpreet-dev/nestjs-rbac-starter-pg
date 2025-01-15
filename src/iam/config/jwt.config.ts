// jwt.config.ts
import { registerAs, ConfigService } from '@nestjs/config';

export default registerAs('jwt', () => {
  const configService = new ConfigService();
  const secret = configService.get('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return {
    secret,
    audience: configService.get('JWT_TOKEN_AUDIENCE'),
    issuer: configService.get('JWT_TOKEN_ISSUER'),
    accessTokenTtl: parseInt(
      configService.get('JWT_ACCESS_TOKEN_TTL') ?? '3600',
      10,
    ),
    refreshTokenTtl: parseInt(
      configService.get('JWT_REFRESH_TOKEN_TTL') ?? '86400',
      10,
    ),
  };
});
