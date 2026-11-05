import type { ReactNode } from "react";

export function SectionHeader({ title, description, step }: { title: string; description?: ReactNode; step?: string }) {
  return (
    <div className="mb-4">
      {step && <p className="caption-4 text-muted-foreground">{step}</p>}
      <h2 className="heading-6">{title}</h2>
      {description && <p className="mt-1 body-6 text-muted-foreground">{description}</p>}
    </div>
  );
}
