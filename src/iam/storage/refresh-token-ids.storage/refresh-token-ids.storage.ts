import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RefreshTokenIdsStorage
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private redisClient: Redis;
  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap() {
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: parseInt(this.configService.get('REDIS_PORT'), 10),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onApplicationShutdown(signal?: string) {
    this.redisClient.quit();
  }

  async insert(userId: string, tokenId: string): Promise<void> {
    await this.redisClient.set(this.getKey(userId), tokenId);
  }

  async validate(userId: string, tokenId: string): Promise<boolean> {
    const storedTokenId = await this.redisClient.get(this.getKey(userId));
    if (storedTokenId !== tokenId) {
      throw new Error('Invalid refresh token');
    }
    return storedTokenId === tokenId;
  }

  async invalidate(userId: string): Promise<void> {
    await this.redisClient.del(this.getKey(userId));
  }

  private getKey(userId: string): string {
    return `user-${userId}`;
  }
}
