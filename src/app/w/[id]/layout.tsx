import { loadWedding } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";
import { WeddingTabs } from "./WeddingTabs";
import styles from "./shell.module.css";

export default async function WeddingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me } = await loadWedding(id);
  const rights = can(me.role);
  return (
    <div className={styles.shell}>
      <div className={styles.content}>{children}</div>
      <div className={styles.tabs}>
        <WeddingTabs weddingId={id} showBudget={rights.seeBudget} showNotes={rights.seeNotes} />
      </div>
    </div>
  );
}
