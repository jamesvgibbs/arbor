import { createRoot } from "react-dom/client";
import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";

function ConfirmDialog({
  title,
  description,
  onResolve,
}: {
  title: string;
  description: string | null;
  onResolve: (confirmed: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setOpen(false);
        onResolve(false);
      }
    },
    [onResolve],
  );

  const handleConfirm = useCallback(() => {
    setOpen(false);
    onResolve(true);
  }, [onResolve]);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirm
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/**
 * Shows a styled in-app confirm dialog (web fallback for desktop's native dialog).
 * Parses the message string: first line becomes the title, remaining lines become the description.
 */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const lines = message.split("\n").filter((line) => line.length > 0);
    const title = lines[0] ?? "Confirm";
    const description = lines.length > 1 ? lines.slice(1).join("\n") : null;

    const onResolve = (confirmed: boolean) => {
      resolve(confirmed);
      // Allow the closing animation to finish before unmounting
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 300);
    };

    root.render(
      <ConfirmDialog title={title} description={description} onResolve={onResolve} />,
    );
  });
}
