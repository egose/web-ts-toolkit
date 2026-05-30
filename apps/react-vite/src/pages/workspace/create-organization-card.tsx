import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';

const mutedClass = 'app-text-muted';
const formGridClass = 'grid gap-4';
const labelClass = 'app-text-soft text-sm';

interface CreateOrganizationCardProps {
  isCreating: boolean;
  newOrganizationName: string;
  onCreate(): void;
  onNewOrganizationNameChange(value: string): void;
}

export function CreateOrganizationCard({
  isCreating,
  newOrganizationName,
  onCreate,
  onNewOrganizationNameChange,
}: CreateOrganizationCardProps) {
  return (
    <Card className="app-surface rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="app-text-strong m-0 text-lg font-semibold">Create organization</CardTitle>
        <CardDescription className={mutedClass}>
          Creating an organization also adds you as its initial lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <form
          className={formGridClass}
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <Label className={labelClass} htmlFor="organization-name">
            Organization name
          </Label>
          <Input
            id="organization-name"
            placeholder="Northwind Labs"
            value={newOrganizationName}
            onChange={(event) => onNewOrganizationNameChange(event.target.value)}
            required
          />
          <Button variant="primary" type="submit" disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create organization'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
