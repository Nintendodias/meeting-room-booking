import type { Toast } from "./useToasts";
import styles from "./ToastRegion.module.css";

const ICONS: Record<Toast["variant"], string> = { success: "✓", error: "⚠", info: "ℹ" };
const LABELS: Record<Toast["variant"], string> = { success: "Готово", error: "Ошибка", info: "Внимание" };

type ToastRegionProps = {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
};

/** Fixed overlay so notifications never shift the page layout. Always rendered so live regions are announced. */
export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  return (
    <div className={styles.region} aria-live="polite" aria-relevant="additions" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.variant]}`}>
          <span className={styles.icon} aria-hidden="true">
            {ICONS[toast.variant]}
          </span>
          <p className={styles.message}>
            <span className="visually-hidden">{LABELS[toast.variant]}: </span>
            {toast.message}
          </p>
          <button
            type="button"
            className={styles.close}
            onClick={() => onDismiss(toast.id)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
