import type { HierarchyNode } from '../../hierarchy';
import { Card } from '@egose/shadcn-theme/components/ui/card';

const mutedClass = 'app-text-muted';

const hierarchyTreeClass = 'grid gap-4';
const hierarchyNodeClass = 'grid gap-4 border-l border-white/8 pl-4';
const hierarchyChildrenClass = 'grid gap-4';
export function HierarchyTree({ nodes }: { nodes: HierarchyNode[] }) {
  if (nodes.length === 0) {
    return <div className={mutedClass}>No matching people for the current filter.</div>;
  }

  return (
    <div className={hierarchyTreeClass}>
      {nodes.map((node) => (
        <div className={hierarchyNodeClass} key={node.member._id ?? `${node.member.email}-${node.member.title}`}>
          <Card className="app-surface-soft rounded-xl p-4 shadow-none">
            <h4 className="app-text-strong m-0 text-base font-semibold">{node.member.fullName}</h4>
            <div className="app-text">{node.member.title}</div>
            <div className={mutedClass}>{[node.member.department, node.member.email].filter(Boolean).join(' · ')}</div>
          </Card>
          {node.children.length > 0 && (
            <div className={hierarchyChildrenClass}>
              <HierarchyTree nodes={node.children} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
