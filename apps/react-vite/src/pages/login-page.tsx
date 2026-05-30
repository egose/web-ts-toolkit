import { type FormEvent, useState } from 'react';
import { Alert, AlertDescription } from '@egose/shadcn-theme/components/ui/alert';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import { useNavigate } from 'react-router';
import type { SessionData } from '../types';

const pageClass =
  'mx-auto grid min-h-screen w-full max-w-[1240px] items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px]';
const introClass = 'grid gap-8';
const badgeClass =
  'app-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.16em]';
const heroTitleClass =
  'app-text-strong m-0 max-w-4xl text-[clamp(2.2rem,4.8vw,4.4rem)] font-semibold leading-[0.96] tracking-[-0.05em]';
const mutedClass = 'app-text-muted';
const infoGridClass = 'grid gap-4 lg:grid-cols-2';
const surfaceCardClass = 'app-surface-raised rounded-2xl shadow-none';
const loginCardClass = `${surfaceCardClass} self-center`;
const headingClass = 'app-text-strong m-0 text-xl font-semibold tracking-tight';
const formGridClass = 'grid gap-4';
const errorBannerClass = 'rounded-2xl border border-red-400/35 bg-red-950/25 px-4 py-3 text-red-200';
const labelClass = 'app-text-soft text-sm';
const monoClass = 'font-mono';

interface LoginPageProps {
  error: string | null;
  isSubmitting: boolean;
  onLogin(email: string): Promise<SessionData>;
}

export function LoginPage({ error, isSubmitting, onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    try {
      const session = await onLogin(email);
      const nextOrganizationId = session.organizations[0]?.organizationId;
      navigate(nextOrganizationId ? `/organizations/${nextOrganizationId}` : '/organizations', { replace: true });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Unable to log in.');
    }
  };

  return (
    <div className={pageClass}>
      <section className={introClass}>
        <span className={badgeClass}>Organization workspace</span>
        <h1 className={heroTitleClass}>Manage organizations, roles, and reporting lines from one workspace.</h1>
        <p className={mutedClass}>
          Sign in with an email address to open the seeded org demo or start a new organization. The app is built for
          editing memberships, titles, and hierarchy without leaving the workspace.
        </p>

        <div className={infoGridClass}>
          <Card className={surfaceCardClass}>
            <CardHeader>
              <CardTitle className="app-text-strong text-lg">What this demo covers</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="app-text-soft grid gap-3 text-sm">
                <div>One user can belong to multiple organizations.</div>
                <div>Members can be added by email and edited in place.</div>
                <div>Reporting lines are stored as organization memberships.</div>
              </div>
            </CardContent>
          </Card>
          <Card className={surfaceCardClass}>
            <CardHeader>
              <CardTitle className="app-text-strong text-lg">Seeded demo users</CardTitle>
              <CardDescription className={mutedClass}>
                Use any of these to open an existing workspace immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 pt-0 text-sm">
              <span className={`${monoClass} app-text-soft`}>owner@example.com</span>
              <span className={`${monoClass} app-text-soft`}>ada@example.com</span>
              <span className={`${monoClass} app-text-soft`}>sam@example.com</span>
            </CardContent>
          </Card>
        </div>

        <Card className={surfaceCardClass}>
          <CardHeader>
            <CardTitle className="app-text-strong text-lg">How sign-in works</CardTitle>
          </CardHeader>
          <CardContent className="app-text-soft grid gap-3 pt-0 text-sm">
            <div>No password is required in this example.</div>
            <div>If the email already belongs to a member, their organizations appear after sign-in.</div>
            <div>If the email is new, the workspace will let you create an organization and start adding people.</div>
          </CardContent>
        </Card>
      </section>

      <Card className={loginCardClass}>
        <CardHeader>
          <span className={badgeClass}>Quick sign in</span>
          <CardTitle className={headingClass}>Start with your email</CardTitle>
          <CardDescription className={mutedClass}>
            No password for this example. Try one of the seeded demo emails or any new email to create a fresh user.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-0">
          <form className={formGridClass} onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label className={labelClass} htmlFor="email">
                Email address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@organization.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            {(localError || error) && (
              <Alert variant="danger" className={errorBannerClass}>
                <AlertDescription>{localError || error}</AlertDescription>
              </Alert>
            )}

            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in with email'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
