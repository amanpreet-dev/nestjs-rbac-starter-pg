import {
  ConflictException,
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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly hashingService: HashingService,
  ) {}

  async signUp(signUpDto: SignUpDto): Promise<User> {
    try {
      const check = await this.userRepository.findOne({
        where: { email: signUpDto.email },
      });
      console.log('check', check);
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
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(
        'An error occurred during sign-in',
      );
    }
  }
}
