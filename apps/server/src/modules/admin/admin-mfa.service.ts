import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/security/secret.util';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import {
  buildOtpauthUri,
  generateTotpSecret,
  matchTotpStep,
} from '../../common/security/totp.util';
import type { AuthenticatedAdmin } from './admin-session.service';

const RECOVERY_CODE_COUNT = 8;

@Injectable()
export class AdminMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

  async getStatus(admin: AuthenticatedAdmin) {
    const user = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: {
        totpEnabledAt: true,
        totpPendingSecretEncrypted: true,
        _count: {
          select: {
            mfaRecoveryCodes: { where: { consumedAt: null } },
          },
        },
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: {
        totp_enabled: Boolean(user?.totpEnabledAt),
        enrollment_pending: Boolean(user?.totpPendingSecretEncrypted),
        recovery_codes_remaining: user?._count.mfaRecoveryCodes ?? 0,
      },
    };
  }

  async startEnrollment(admin: AuthenticatedAdmin) {
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: admin.id },
      data: { totpPendingSecretEncrypted: encryptSecret(secret) },
    });

    const issuer = this.configService.get<string>('APP_NAME') ?? 'CloudTodo';
    return {
      code: 'OK',
      message: 'success',
      data: {
        secret,
        otpauth_uri: buildOtpauthUri(issuer, admin.email, secret),
      },
    };
  }

  async confirmEnrollment(admin: AuthenticatedAdmin, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: { totpPendingSecretEncrypted: true },
    });
    if (!user?.totpPendingSecretEncrypted) {
      throw new BadRequestException({
        code: 'MFA_ENROLLMENT_NOT_STARTED',
        message: 'no TOTP enrollment is in progress',
      });
    }

    const secret = decryptSecret(user.totpPendingSecretEncrypted);
    const matchedStep = matchTotpStep(secret, code);
    if (matchedStep === null) {
      await this.securityAuditService.record({
        action: 'admin_mfa_failure',
        result: 'failure',
        actorUserId: admin.id,
        targetUserId: admin.id,
        metadata: { reason: 'enrollment_code_invalid' },
      });
      throw new BadRequestException({
        code: 'MFA_CODE_INVALID',
        message: 'the provided TOTP code is invalid',
      });
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      this.generateRecoveryCode(),
    );
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: admin.id } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId: admin.id,
          codeHash: this.hashRecoveryCode(recoveryCode),
        })),
      }),
      this.prisma.user.update({
        where: { id: admin.id },
        data: {
          totpSecretEncrypted: user.totpPendingSecretEncrypted,
          totpPendingSecretEncrypted: null,
          totpEnabledAt: new Date(),
          // The enrollment code counts as used so it cannot also pass login.
          totpLastUsedStep: BigInt(matchedStep),
        },
      }),
    ]);

    await this.securityAuditService.record({
      action: 'admin_mfa_enrolled',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: admin.id,
    });

    // Recovery codes are shown exactly once; only hashes are stored.
    return {
      code: 'OK',
      message: 'success',
      data: { recovery_codes: recoveryCodes },
    };
  }

  async disable(admin: AuthenticatedAdmin, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: admin.id },
      select: { totpSecretEncrypted: true, totpEnabledAt: true },
    });
    if (!user?.totpEnabledAt || !user.totpSecretEncrypted) {
      throw new BadRequestException({
        code: 'MFA_NOT_ENABLED',
        message: 'TOTP is not enabled',
      });
    }

    const verified = await this.verifyCodeOrRecovery(
      admin.id,
      user.totpSecretEncrypted,
      code,
    );
    if (!verified) {
      await this.securityAuditService.record({
        action: 'admin_mfa_failure',
        result: 'failure',
        actorUserId: admin.id,
        targetUserId: admin.id,
        metadata: { reason: 'disable_code_invalid' },
      });
      throw new BadRequestException({
        code: 'MFA_CODE_INVALID',
        message: 'the provided TOTP or recovery code is invalid',
      });
    }

    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: admin.id } }),
      this.prisma.user.update({
        where: { id: admin.id },
        data: {
          totpSecretEncrypted: null,
          totpPendingSecretEncrypted: null,
          totpEnabledAt: null,
        },
      }),
    ]);

    await this.securityAuditService.record({
      action: 'admin_mfa_disabled',
      result: 'success',
      actorUserId: admin.id,
      targetUserId: admin.id,
    });

    return { code: 'OK', message: 'success', data: null };
  }

  /**
   * Login-time verification: accepts a 6-digit TOTP code or a recovery code.
   * Both are consumed atomically so each code works exactly once: the TOTP
   * time step is claimed with a conditional update (rejecting replays inside
   * the drift window), and recovery codes are marked consumed the same way.
   */
  async verifyCodeOrRecovery(
    userId: string,
    totpSecretEncrypted: string,
    code: string,
  ): Promise<boolean> {
    const provided = code.trim();
    if (/^\d{6}$/u.test(provided)) {
      const step = matchTotpStep(decryptSecret(totpSecretEncrypted), provided);
      if (step === null) {
        return false;
      }
      const claimed = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [
            { totpLastUsedStep: null },
            { totpLastUsedStep: { lt: BigInt(step) } },
          ],
        },
        data: { totpLastUsedStep: BigInt(step) },
      });
      return claimed.count === 1;
    }

    const normalized = provided.toUpperCase().replace(/[^A-Z0-9]/gu, '');
    if (normalized.length < 10) {
      return false;
    }
    const consumed = await this.prisma.mfaRecoveryCode.updateMany({
      where: {
        userId,
        codeHash: this.hashRecoveryCode(normalized),
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1;
  }

  async assertLoginMfa(
    user: { id: string; totpEnabledAt: Date | null; totpSecretEncrypted: string | null },
    totpCode: string | undefined,
  ) {
    if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
      return;
    }

    if (!totpCode || totpCode.trim().length === 0) {
      throw new UnauthorizedException({
        code: 'MFA_REQUIRED',
        message: 'a TOTP or recovery code is required',
      });
    }

    const verified = await this.verifyCodeOrRecovery(
      user.id,
      user.totpSecretEncrypted,
      totpCode,
    );
    if (!verified) {
      await this.securityAuditService.record({
        action: 'admin_mfa_failure',
        result: 'failure',
        targetUserId: user.id,
        metadata: { reason: 'login_code_invalid' },
      });
      throw new UnauthorizedException({
        code: 'MFA_CODE_INVALID',
        message: 'the provided TOTP or recovery code is invalid',
      });
    }
  }

  /**
   * Per-action confirmation for high-risk admin operations. Enforced only
   * for admins with MFA enrolled; the code is consumed through the same
   * replay-guarded path as login, so one code authorizes one action.
   */
  async assertActionConfirmation(adminId: string, code: string | undefined) {
    const user = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { totpEnabledAt: true, totpSecretEncrypted: true },
    });
    if (!user?.totpEnabledAt || !user.totpSecretEncrypted) {
      return;
    }

    if (!code || code.trim().length === 0) {
      throw new ForbiddenException({
        code: 'MFA_CONFIRMATION_REQUIRED',
        message: 'this action requires a TOTP or recovery code',
      });
    }

    const verified = await this.verifyCodeOrRecovery(
      adminId,
      user.totpSecretEncrypted,
      code,
    );
    if (!verified) {
      await this.securityAuditService.record({
        action: 'admin_mfa_failure',
        result: 'failure',
        actorUserId: adminId,
        targetUserId: adminId,
        metadata: { reason: 'action_confirmation_code_invalid' },
      });
      throw new ForbiddenException({
        code: 'MFA_CODE_INVALID',
        message: 'the provided TOTP or recovery code is invalid',
      });
    }
  }

  private generateRecoveryCode(): string {
    // 10 bytes -> 16 base32 chars, grouped for readability.
    const raw = randomBytes(10);
    const encoded = raw
      .toString('hex')
      .toUpperCase()
      .slice(0, 16);
    return `${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}`;
  }

  private hashRecoveryCode(code: string): string {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/gu, '');
    return createHash('sha256').update(normalized).digest('hex');
  }
}
