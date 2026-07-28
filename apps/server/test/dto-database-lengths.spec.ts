import { validate } from 'class-validator';
import { AdminCreateUserDto } from '../src/modules/admin/dto/admin-create-user.dto';
import { AdminResetPasswordDto } from '../src/modules/admin/dto/admin-reset-password.dto';
import { AdminUpdateUserDto } from '../src/modules/admin/dto/admin-update-user.dto';
import { AdminUserActionDto } from '../src/modules/admin/dto/admin-user-action.dto';
import { RegisterDto } from '../src/modules/auth/dto/register.dto';
import { CreateReminderDto } from '../src/modules/reminders/dto/create-reminder.dto';
import { UpdateReminderDto } from '../src/modules/reminders/dto/update-reminder.dto';
import { UpdateMeDto } from '../src/modules/users/dto/update-me.dto';

type DtoFactory = (value: string) => object;

const cases: Array<[string, string, number, DtoFactory]> = [
  ['registration username', 'username', 64, (value) => dto(RegisterDto, { username: value })],
  ['registration nickname', 'nickname', 64, (value) => dto(RegisterDto, { nickname: value })],
  ['registration timezone', 'timezone', 64, (value) => dto(RegisterDto, { timezone: value })],
  ['admin-created username', 'username', 64, (value) => dto(AdminCreateUserDto, { username: value })],
  ['admin-created nickname', 'nickname', 64, (value) => dto(AdminCreateUserDto, { nickname: value })],
  ['admin-created timezone', 'timezone', 64, (value) => dto(AdminCreateUserDto, { timezone: value })],
  ['admin create reason', 'reason', 255, (value) => dto(AdminCreateUserDto, { reason: value })],
  ['admin-updated username', 'username', 64, (value) => dto(AdminUpdateUserDto, { username: value })],
  ['admin-updated nickname', 'nickname', 64, (value) => dto(AdminUpdateUserDto, { nickname: value })],
  ['admin-updated timezone', 'timezone', 64, (value) => dto(AdminUpdateUserDto, { timezone: value })],
  ['admin update reason', 'reason', 255, (value) => dto(AdminUpdateUserDto, { reason: value })],
  ['profile nickname', 'nickname', 64, (value) => dto(UpdateMeDto, { nickname: value })],
  ['profile timezone', 'timezone', 64, (value) => dto(UpdateMeDto, { timezone: value })],
  ['reminder timezone', 'timezone', 64, (value) => dto(CreateReminderDto, { timezone: value })],
  ['updated reminder timezone', 'timezone', 64, (value) => dto(UpdateReminderDto, { timezone: value })],
  ['password reset reason', 'reason', 255, (value) => dto(AdminResetPasswordDto, { reason: value })],
  ['admin action reason', 'reason', 255, (value) => dto(AdminUserActionDto, { reason: value })],
];

describe.each(cases)('%s matches its database column', (_, property, max, build) => {
  it(`accepts ${max} characters`, async () => {
    const errors = await validate(build('x'.repeat(max)));
    expect(errors.find((error) => error.property === property)?.constraints?.maxLength).toBeUndefined();
  });

  it(`rejects ${max + 1} characters`, async () => {
    const errors = await validate(build('x'.repeat(max + 1)));
    expect(errors.find((error) => error.property === property)?.constraints?.maxLength).toBeDefined();
  });
});

function dto<T extends object>(type: new () => T, values: Partial<T>): T {
  return Object.assign(new type(), values);
}
