import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 pb-4 border-b border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
