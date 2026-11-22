import { TwilioSmsProvider, SmtpEmailProvider } from '../providers/messaging';

afterEach(() => jest.restoreAllMocks());

describe('TwilioSmsProvider', () => {
  const settings = { accountSid: 'ACtest', authToken: 'secret-token', from: '+15005550006' };

  test('posts the template text to Twilio with basic auth', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const ok = await new TwilioSmsProvider(settings).send('+919876543210', 'password_reset', { code: '123456', minutes: '15' });
    expect(ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('ACtest:secret-token').toString('base64')}`);
    const form = new URLSearchParams(String(init.body));
    expect(form.get('To')).toBe('+919876543210');
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toContain('123456');
  });

  test('reports failure without throwing, and never logs the code or number', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await new TwilioSmsProvider(settings).send('+919876543210', 'password_reset', { code: '654321', minutes: '15' })).toBe(false);
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/654321|9876543210|secret-token/);
  });

  test('an unknown template or a network error is a plain false', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new TwilioSmsProvider(settings);
    expect(await provider.send('+919876543210', 'no_such_template', {})).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await provider.send('+919876543210', 'password_reset', { code: '1', minutes: '15' })).toBe(false);
  });
});

describe('SmtpEmailProvider', () => {
  test('an unreachable server is a plain false, not an exception', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new SmtpEmailProvider({ host: '127.0.0.1', port: 1, user: '', pass: '', from: 'DriveDock <no-reply@example.test>' });
    expect(await provider.send('someone@example.test', 'Subject', 'Body')).toBe(false);
  });
});
