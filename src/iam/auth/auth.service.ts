import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { HashingService } from '../hashing/hashing.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import jwtConfig from '../config/jwt.config';
import { ActiveUserData } from '../interfaces/active-user.data.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokenIdsStorage } from '../storage/refresh-token-ids.storage/refresh-token-ids.storage';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly refreshTokenIdsStorage: RefreshTokenIdsStorage,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<User> {
    try {
      const check = await this.userRepository.findOne({
        where: { email: signUpDto.email },
      });
      if (!check) {
        const user = { ...signUpDto };
        user.password = await this.hashingService.hash(user.password);
        return await this.userRepository.save(user);
      } else {
        throw new ConflictException('User already exists');
      }
    } catch (error) {
      console.log(error);
      return error;
    }
  }

  async signIn(signInDto: SignInDto) {
    try {
      const user = await this.userRepository.findOne({
        where: { email: signInDto.email },
      });
      if (!user) {
        throw new UnauthorizedException('User does not exists');
      }
      const isEqual = await this.hashingService.compare(
        signInDto.password,
        user.password,
      );
      if (!isEqual) {
        throw new UnauthorizedException('Password does not match');
      }
      // Access Token & Refresh Token
      const { accessToken, refreshToken } = await this.generateTokens(user);
      return { accessToken, refreshToken };
    } catch (error) {
      throw new InternalServerErrorException(
        'An error occurred during sign-in',
      );
    }
  }

  // auth.service.ts
  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    try {
      const { sub, refreshTokenId } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'> & { refreshTokenId: string }
      >(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });

      const user = await this.userRepository.findOneBy({ id: sub });
      const isValid = await this.refreshTokenIdsStorage.validate(
        user.id,
        refreshTokenId,
      );
      if (isValid) {
        await this.refreshTokenIdsStorage.invalidate(user.id);
      } else {
        throw new Error('Invalid refresh token');
      }
      return await this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  public async generateTokens(user: User) {
    const refreshTokenId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        { email: user.email, role: user.role },
      ),
      this.signToken(user.id, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
      }),
    ]);
    // insert the newly generated `refreshTokenId` in our Redis Database.
    this.refreshTokenIdsStorage.insert(user.id, refreshTokenId);
    return { accessToken, refreshToken };
  }

  private async signToken<T>(userId: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn,
      },
    );
  }
}
