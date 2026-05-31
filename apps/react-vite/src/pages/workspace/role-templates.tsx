import type { RoleTemplate } from '../../types';
import { Card } from '@egose/shadcn-theme/components/ui/card';

const mutedClass = 'app-text-muted';

const roleGridClass = 'grid gap-4 lg:grid-cols-2';

export function RoleTemplates({ roleTemplates }: { roleTemplates: RoleTemplate[] }) {
  return (
    <div className={roleGridClass}>
      {roleTemplates.map((roleTemplate) => (
        <Card className="app-surface-soft rounded-xl p-4 shadow-none" key={roleTemplate.key}>
          <div className={mutedClass}>
            {roleTemplate.track} · L{roleTemplate.level}
          </div>
          <h3 className="app-text-strong m-0 text-lg font-semibold">{roleTemplate.title}</h3>
          <p className={mutedClass}>{roleTemplate.summary}</p>
        </Card>
      ))}
    </div>
  );
}
