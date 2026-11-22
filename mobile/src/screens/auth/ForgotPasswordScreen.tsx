import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AuthAPI } from '../../api/endpoints';
import { Button, Field, FormScreen, Notice, PageHeading } from '../../components/UI';
import { BorderRadius, Colors, Shadow } from '../../theme/colors';
import { parseResetIdentifier, passwordProblem } from '../../utils/passwordRules';

type Step = 'request' | 'reset' | 'done';
type Channel = 'email' | 'sms';

/** Forgot password in two steps: ask for a code (email or SMS), then enter the code and a new password. */
export const ForgotPasswordScreen = ({ navigation }: any) => {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parsed = parseResetIdentifier(identifier);
  // The pilot server can return the code itself when no SMS or email account is connected (never in production).
  const [pilotCode, setPilotCode] = useState<string | null>(null);

  const sendCode = async () => {
    setSubmitted(true);
    setError(null);
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await AuthAPI.forgotPassword({
        identifier: parsed.value,
        channel: parsed.kind === 'email' ? 'email' : 'sms'
      });
      setChannel(parsed.kind === 'email' ? 'email' : 'sms');
      setNotice(res.data?.message ?? null);
      setPilotCode(res.data?.devCode ?? null);
      setSubmitted(false);
      setStep('reset');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send a code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setSubmitted(true);
    setError(null);
    if (!parsed || code.trim().length !== 6 || passwordProblem(password)) return;
    setBusy(true);
    try {
      await AuthAPI.resetPassword({ identifier: parsed.value, code: code.trim(), newPassword: password });
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not change the password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const goToLogin = () => navigation.navigate('Login');

  if (step === 'done') {
    return (
      <FormScreen>
        <View style={[styles.card, Shadow.card]}>
          <Text accessibilityRole="header" style={styles.title}>Password changed</Text>
          <Text style={styles.subtitle}>You have been signed out everywhere else. Sign in with your new password.</Text>
          <Button label="Go to sign in" icon="arrow-forward" onPress={goToLogin} />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <PageHeading
        title="Reset your password"
        subtitle={step === 'request' ? 'We will send a 6-digit code to the email address or mobile number on your account.' : 'Enter the code we sent and choose a new password.'}
        onBack={step === 'reset' ? () => { setStep('request'); setError(null); } : goToLogin}
        backLabel={step === 'reset' ? 'Change email or number' : 'Back to sign in'}
      />
      <View style={[styles.card, Shadow.card]}>
        {error && <Notice title="Something went wrong" tone="error">{error}</Notice>}

        {step === 'request' ? (
          <>
            <Field
              label="Email address or mobile number"
              placeholder="you@example.com or 98765 43210"
              value={identifier}
              onChangeText={(v) => { setIdentifier(v); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="go"
              onSubmitEditing={sendCode}
              error={submitted && !parsed ? 'Enter a valid email address or a 10-digit mobile number.' : undefined}
            />
            <Button label="Send code" icon="send-outline" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            {notice && <Notice title={channel === 'email' ? 'Check your email' : 'Check your messages'}>{notice}</Notice>}
            {pilotCode && (
              <Notice title="Pilot build" tone="warning">
                No email or SMS service is connected to this server, so your code is {pilotCode}.
              </Notice>
            )}
            <Field
              label="6-digit code"
              placeholder="123456"
              value={code}
              onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              error={submitted && code.trim().length !== 6 ? 'Enter the 6-digit code.' : undefined}
            />
            <Field
              label="New password"
              placeholder="At least 8 characters, with a letter and a number"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={changePassword}
              error={submitted ? passwordProblem(password) ?? undefined : undefined}
            />
            <Button label="Change password" icon="checkmark" onPress={changePassword} loading={busy} />
            <TouchableOpacity accessibilityRole="button" onPress={sendCode} style={styles.resend} disabled={busy}>
              <Text style={styles.resendText}>Did not get it? Send a new code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: 20, gap: 14, borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, lineHeight: 20 },
  resend: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  resendText: { color: Colors.primary, fontWeight: '600', fontSize: 13 }
});
