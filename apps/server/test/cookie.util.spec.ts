import { parseCookies, serializeCookie } from '../src/common/http/cookie.util';

describe('cookie util', () => {
  it('serializes cookie with options', () => {
    const cookie = serializeCookie('session', 'token', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 3600,
    });

    expect(cookie).toContain('session=token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('parses multiple cookies', () => {
    const cookies = parseCookies('a=1; b=hello%20world; c=test');

    expect(cookies).toEqual({
      a: '1',
      b: 'hello world',
      c: 'test',
    });
  });
});
